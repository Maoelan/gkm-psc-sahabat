import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db, transaction } from './db';
import { decrypt, encrypt } from './crypto';
import { recordAudit } from './audit';
import { getServiceModeAt } from './service-mode';
import { maskSensitiveText, type TranscriptMessage } from '../reports';
import type {
	HandoffCloseReason,
	HandoffQueueItem,
	HandoffStatus,
	HandoffThreadMessage,
	ReporterHandoff,
	StaffHandoff
} from '../handoff';
import type { ReporterSession } from './session';
import type { StaffSession } from './staff-auth';

type Queryable = Pick<PoolClient, 'query'>;

type HandoffRow = {
	id: string;
	session_id: string;
	status: HandoffStatus;
	requested_at: Date;
	claimed_by: string | null;
	claimed_at: Date | null;
	closed_by: string | null;
	closed_at: Date | null;
	close_reason: HandoffCloseReason | null;
};

type StaffHandoffRow = HandoffRow & {
	session_status: string;
	session_expires_at: Date;
	claimed_by_name: string | null;
};

type QueueRow = HandoffRow & {
	claimed_by_name: string | null;
	claimed_by_me: boolean;
	message_count: number;
	last_message_at: Date | null;
};

type MessageRow = {
	id: string;
	sender_type: TranscriptMessage['sender'];
	source: TranscriptMessage['source'];
	body_enc: Buffer;
	body_iv: Buffer;
	body_tag: Buffer;
	created_at: Date;
};


export class HandoffServiceError extends Error {
	status: number;
	code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

function mapHandoff(row: HandoffRow): ReporterHandoff {
	return {
		id: row.id,
		status: row.status,
		requestedAt: row.requested_at.toISOString(),
		claimedAt: row.claimed_at?.toISOString() ?? null,
		closedAt: row.closed_at?.toISOString() ?? null,
		closeReason: row.close_reason
	};
}

function mapStaffHandoff(row: StaffHandoffRow, staff: StaffSession): StaffHandoff {
	return {
		...mapHandoff(row),
		claimedByMe: row.claimed_by === staff.staffId,
		claimedByName: row.claimed_by_name
	};
}

function mapMessage(row: MessageRow): HandoffThreadMessage | null {
	try {
		return {
			id: row.id,
			sender: row.sender_type,
			source: row.source,
			body: maskSensitiveText(decrypt(row.body_enc, row.body_iv, row.body_tag, 'chat_message')),
			createdAt: row.created_at.toISOString()
		};
	} catch {
		return null;
	}
}

function mapMessages(rows: MessageRow[]) {
	return rows
		.map(mapMessage)
		.filter((message): message is HandoffThreadMessage => Boolean(message));
}

async function insertHandoffMessage(
	client: Queryable,
	input: {
		sessionId: string;
		handoffId: string;
		sender: 'user' | 'staff' | 'service';
		source: 'user' | 'staff' | 'handoff';
		body: string;
		staffId?: string | null;
	}
) {
	const messageId = randomUUID();
	const encrypted = encrypt(input.body.trim(), 'chat_message');
	const result = await client.query<{ created_at: Date }>(
		`INSERT INTO chat_messages
		 (id, session_id, sender_type, source, body_enc, body_iv, body_tag, staff_id, handoff_id, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
		 RETURNING created_at`,
		[
			messageId,
			input.sessionId,
			input.sender,
			input.source,
			encrypted.encrypted,
			encrypted.iv,
			encrypted.tag,
			input.staffId ?? null,
			input.handoffId
		]
	);
	return {
		id: messageId,
		sender: input.sender,
		source: input.source,
		body: maskSensitiveText(input.body.trim()),
		createdAt: result.rows[0].created_at.toISOString()
	} satisfies HandoffThreadMessage;
}

async function latestHandoffMessageId(client: Queryable, handoffId: string) {
	const result = await client.query<{ id: string }>(
		`SELECT id FROM chat_messages
		 WHERE handoff_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT 1`,
		[handoffId]
	);
	return result.rows[0]?.id ?? null;
}

export async function acquireChatLock(client: Queryable, sessionId: string) {
	await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [sessionId]);
}

async function lockSession(client: PoolClient, sessionId: string) {
	await acquireChatLock(client, sessionId);
	const result = await client.query<{ status: string; expires_at: Date }>(
		`SELECT status, expires_at FROM chat_sessions WHERE id = $1 FOR UPDATE`,
		[sessionId]
	);
	const session = result.rows[0];
	if (!session || session.status !== 'active' || session.expires_at.getTime() <= Date.now()) {
		throw new HandoffServiceError(401, 'session_expired', 'Sesi sudah berakhir. Muat ulang halaman.');
	}
	return session;
}

async function lockOpenHandoff(client: Queryable, sessionId: string) {
	const result = await client.query<HandoffRow>(
		`SELECT * FROM chat_handoffs
		 WHERE session_id = $1 AND status IN ('waiting', 'active')
		 LIMIT 1
		 FOR UPDATE`,
		[sessionId]
	);
	return result.rows[0] ?? null;
}

async function loadStaffHandoff(
	client: Queryable,
	handoffId: string,
	lock = false
): Promise<StaffHandoffRow> {
	if (lock) {
		const sessionResult = await client.query<{ session_id: string }>(
			'SELECT session_id FROM chat_handoffs WHERE id = $1 LIMIT 1',
			[handoffId]
		);
		const sessionId = sessionResult.rows[0]?.session_id;
		if (!sessionId) {
			throw new HandoffServiceError(404, 'handoff_not_found', 'Percakapan tidak ditemukan.');
		}
		await acquireChatLock(client, sessionId);
	}
	const result = await client.query<StaffHandoffRow>(
		`SELECT ch.*, cs.status AS session_status, cs.expires_at AS session_expires_at,
		        su.display_name AS claimed_by_name
		 FROM chat_handoffs ch
		 JOIN chat_sessions cs ON cs.id = ch.session_id
		 LEFT JOIN staff_users su ON su.id = ch.claimed_by
		 WHERE ch.id = $1
		 LIMIT 1
		 ${lock ? 'FOR UPDATE OF ch, cs' : ''}`,
		[handoffId]
	);
	const row = result.rows[0];
	if (!row) throw new HandoffServiceError(404, 'handoff_not_found', 'Percakapan tidak ditemukan.');
	if (row.session_status !== 'active' || row.session_expires_at.getTime() <= Date.now()) {
		throw new HandoffServiceError(409, 'session_expired', 'Sesi pelapor sudah berakhir.');
	}
	return row;
}

function assertStaffCanAccess(staff: StaffSession, row: StaffHandoffRow) {
	const isAdmin = staff.roles.includes('admin');
	if (!isAdmin && row.claimed_by !== staff.staffId) {
		throw new HandoffServiceError(
			403,
			'handoff_forbidden',
			'Percakapan ini sedang ditangani petugas lain.'
		);
	}
}

function assertThreadAvailable(row: StaffHandoffRow) {
	if (row.status === 'waiting') {
		throw new HandoffServiceError(
			409,
			'handoff_not_claimed',
			'Ambil percakapan ini sebelum membuka transkrip.'
		);
	}
}

async function sessionMessages(sessionId: string, after?: string | null) {
	const result = await db.query<MessageRow>(
		`SELECT m.id, m.sender_type, m.source, m.body_enc, m.body_iv, m.body_tag, m.created_at
		 FROM chat_messages m
		 WHERE m.session_id = $1
		   ${
				after
					? `AND (
						NOT EXISTS (
							SELECT 1 FROM chat_messages c
							WHERE c.id = $2 AND c.session_id = $1
						)
						OR (m.created_at, m.id) > (
							SELECT c.created_at, c.id FROM chat_messages c
							WHERE c.id = $2 AND c.session_id = $1
						)
					)`
					: ''
			}
		 ORDER BY m.created_at ASC, m.id ASC`,
		after ? [sessionId, after] : [sessionId]
	);
	return mapMessages(result.rows);
}

async function handoffMessages(sessionId: string, handoffId: string, after?: string | null) {
	const result = await db.query<MessageRow>(
		`SELECT m.id, m.sender_type, m.source, m.body_enc, m.body_iv, m.body_tag, m.created_at
		 FROM chat_messages m
		 WHERE m.session_id = $1 AND m.handoff_id = $2
		   ${
				after
					? `AND (
						NOT EXISTS (
							SELECT 1 FROM chat_messages c
							WHERE c.id = $3 AND c.session_id = $1 AND c.handoff_id = $2
						)
						OR (m.created_at, m.id) > (
							SELECT c.created_at, c.id FROM chat_messages c
							WHERE c.id = $3 AND c.session_id = $1 AND c.handoff_id = $2
						)
					)`
					: ''
			}
		 ORDER BY m.created_at ASC, m.id ASC`,
		after ? [sessionId, handoffId, after] : [sessionId, handoffId]
	);
	return mapMessages(result.rows);
}

export async function hasOpenHandoff(sessionId: string) {
	const result = await db.query(
		`SELECT 1 FROM chat_handoffs
		 WHERE session_id = $1 AND status IN ('waiting', 'active')
		 LIMIT 1`,
		[sessionId]
	);
	return Boolean(result.rowCount);
}

export async function createHandoff(session: ReporterSession, requestId?: string | null) {
	const scheduledMode = await getServiceModeAt();
	// Mode sesi hanya dapat dipaksa lewat ?mode=operator pada server pengembangan.
	const devOverride =
		process.env.NODE_ENV === 'development' && session.mode === 'operator';
	if (scheduledMode !== 'operator' && !devOverride) {
		throw new HandoffServiceError(
			409,
			'outside_operator_hours',
			'Bantuan petugas hanya tersedia selama jam layanan. Anda tetap dapat melanjutkan dengan panduan.'
		);
	}

	return transaction(async (client) => {
		await lockSession(client, session.id);
		const report = await client.query(
			'SELECT 1 FROM reports WHERE source_session_id = $1 LIMIT 1',
			[session.id]
		);
		if (report.rowCount) {
			throw new HandoffServiceError(
				409,
				'report_already_submitted',
				'Laporan sudah dikirim. Bantuan percakapan langsung tidak tersedia setelah pengiriman.'
			);
		}

		const existing = await lockOpenHandoff(client, session.id);
		if (existing) {
			return {
				handoff: mapHandoff(existing),
				message: null,
				latestMessageId: await latestHandoffMessageId(client, existing.id)
			};
		}

		const handoffId = randomUUID();
		const inserted = await client.query<HandoffRow>(
			`INSERT INTO chat_handoffs (id, session_id, status)
			 VALUES ($1, $2, 'waiting')
			 RETURNING *`,
			[handoffId, session.id]
		);
		const row = inserted.rows[0];
		const message = await insertHandoffMessage(client, {
			sessionId: session.id,
			handoffId,
			sender: 'service',
			source: 'handoff',
			body: 'Permintaan bantuan petugas sudah dikirim. Anda tetap dapat menulis; pesan akan dibaca petugas saat bergabung.'
		});
		await recordAudit(
			{
				actorType: 'anonymous',
				action: 'chat.handoff.requested',
				objectType: 'chat_handoff',
				objectId: handoffId,
				requestId
			},
			client
		);
		return {
			handoff: mapHandoff(row),
			message,
			latestMessageId: message.id
		};
	});
}

export async function getReporterHandoff(sessionId: string, after?: string | null) {
	const result = await db.query<HandoffRow>(
		`SELECT * FROM chat_handoffs
		 WHERE session_id = $1
		 ORDER BY requested_at DESC, id DESC
		 LIMIT 1`,
		[sessionId]
	);
	const row = result.rows[0];
	if (!row) {
		return { handoff: null, messages: [], latestMessageId: null };
	}
	const messages = await handoffMessages(sessionId, row.id, after);
	return {
		handoff: mapHandoff(row),
		messages,
		latestMessageId: messages.at(-1)?.id ?? after ?? null
	};
}

export async function sendReporterHandoffMessage(
	session: ReporterSession,
	body: string
) {
	return transaction(async (client) => {
		await lockSession(client, session.id);
		const handoff = await lockOpenHandoff(client, session.id);
		if (!handoff) {
			throw new HandoffServiceError(
				409,
				'handoff_not_open',
				'Bantuan petugas sudah tidak aktif. Pesan ini belum terkirim.'
			);
		}
		const message = await insertHandoffMessage(client, {
			sessionId: session.id,
			handoffId: handoff.id,
			sender: 'user',
			source: 'user',
			body
		});
		return {
			handoff: mapHandoff(handoff),
			message,
			latestMessageId: message.id
		};
	});
}

export async function cancelReporterHandoff(session: ReporterSession, requestId?: string | null) {
	return transaction(async (client) => {
		await lockSession(client, session.id);
		const handoff = await lockOpenHandoff(client, session.id);
		if (!handoff) {
			throw new HandoffServiceError(409, 'handoff_not_open', 'Tidak ada bantuan petugas yang aktif.');
		}
		const updated = await client.query<HandoffRow>(
			`UPDATE chat_handoffs
			 SET status = 'cancelled', closed_at = now(), close_reason = 'reporter_cancelled'
			 WHERE id = $1
			 RETURNING *`,
			[handoff.id]
		);
		const message = await insertHandoffMessage(client, {
			sessionId: session.id,
			handoffId: handoff.id,
			sender: 'service',
			source: 'handoff',
			body: 'Bantuan petugas diakhiri oleh pelapor. Anda bisa melanjutkan dengan panduan atau meminta bantuan lagi.'
		});
		await recordAudit(
			{
				actorType: 'anonymous',
				action: 'chat.handoff.cancelled',
				objectType: 'chat_handoff',
				objectId: handoff.id,
				requestId
			},
			client
		);
		return {
			handoff: mapHandoff(updated.rows[0]),
			message,
			latestMessageId: message.id
		};
	});
}

export async function releaseStaffHandoffs(staffId: string, requestId?: string | null) {
	return transaction(async (client) => {
		const rows = await client.query<{ id: string; session_id: string }>(
			`SELECT id, session_id FROM chat_handoffs
			 WHERE claimed_by = $1 AND status = 'active'
			 FOR UPDATE`,
			[staffId]
		);
		for (const row of rows.rows) {
			await client.query(
				`UPDATE chat_handoffs
				 SET status = 'waiting', claimed_by = NULL, claimed_at = NULL
				 WHERE id = $1 AND status = 'active'`,
				[row.id]
			);
			await insertHandoffMessage(client, {
				sessionId: row.session_id,
				handoffId: row.id,
				sender: 'service',
				source: 'handoff',
				body: 'Petugas sebelumnya keluar dari sesi. Permintaan Anda menunggu petugas lain.'
			});
			await recordAudit(
				{
					actorType: 'staff',
					actorId: staffId,
					action: 'chat.handoff.released',
					objectType: 'chat_handoff',
					objectId: row.id,
					requestId
				},
				client
			);
		}
		return rows.rowCount ?? 0;
	});
}

export async function getStaffChatQueue(staff: StaffSession): Promise<HandoffQueueItem[]> {
	const result = await db.query<QueueRow>(
		`SELECT ch.*, su.display_name AS claimed_by_name,
		        (ch.claimed_by = $1) AS claimed_by_me,
		        count(cm.id)::int AS message_count,
		        max(cm.created_at) AS last_message_at
		 FROM chat_handoffs ch
		 JOIN chat_sessions cs ON cs.id = ch.session_id
		 LEFT JOIN staff_users su ON su.id = ch.claimed_by
		 LEFT JOIN chat_messages cm ON cm.handoff_id = ch.id
		 WHERE ch.status IN ('waiting', 'active')
		   AND cs.status = 'active'
		   AND cs.expires_at > now()
		   AND ($2::boolean OR ch.status = 'waiting' OR ch.claimed_by = $1)
		 GROUP BY ch.id, su.display_name
		 ORDER BY CASE ch.status WHEN 'waiting' THEN 0 ELSE 1 END, ch.requested_at ASC`,
		[staff.staffId, staff.roles.includes('admin')]
	);
	return result.rows.map((row) => ({
		id: row.id,
		status: row.status as 'waiting' | 'active',
		requestedAt: row.requested_at.toISOString(),
		claimedAt: row.claimed_at?.toISOString() ?? null,
		claimedByMe: row.claimed_by_me,
		claimedByName: row.claimed_by_name,
		messageCount: Number(row.message_count),
		lastMessageAt: row.last_message_at?.toISOString() ?? null
	}));
}

export async function claimStaffChat(
	staff: StaffSession,
	handoffId: string,
	requestId?: string | null
) {
	return transaction(async (client) => {
		const row = await loadStaffHandoff(client, handoffId, true);
		if (row.status === 'active' && row.claimed_by === staff.staffId) {
			return {
				handoff: mapStaffHandoff(row, staff),
				message: null,
				latestMessageId: await latestHandoffMessageId(client, handoffId)
			};
		}
		if (row.status !== 'waiting') {
			throw new HandoffServiceError(
				409,
				'handoff_already_claimed',
				'Percakapan ini sudah diambil petugas lain atau sudah ditutup.'
			);
		}
		const updated = await client.query<HandoffRow>(
			`UPDATE chat_handoffs
			 SET status = 'active', claimed_by = $2, claimed_at = now()
			 WHERE id = $1 AND status = 'waiting'
			 RETURNING *`,
			[handoffId, staff.staffId]
		);
		await client.query(
			`UPDATE chat_sessions
			 SET expires_at = GREATEST(expires_at, now() + interval '2 hours')
			 WHERE id = $1`,
			[row.session_id]
		);
		const message = await insertHandoffMessage(client, {
			sessionId: row.session_id,
			handoffId,
			sender: 'service',
			source: 'handoff',
			body: 'Petugas sudah bergabung. AI dijeda sampai percakapan dengan petugas selesai.'
		});
		await recordAudit(
			{
				actorType: 'staff',
				actorId: staff.staffId,
				action: 'chat.handoff.claimed',
				objectType: 'chat_handoff',
				objectId: handoffId,
				requestId
			},
			client
		);
		return {
			handoff: mapStaffHandoff({ ...row, ...updated.rows[0] }, staff),
			message,
			latestMessageId: message.id
		};
	});
}

export async function getStaffChatThread(
	staff: StaffSession,
	handoffId: string,
	requestId?: string | null
) {
	const row = await loadStaffHandoff(db, handoffId);
	assertThreadAvailable(row);
	assertStaffCanAccess(staff, row);
	const messages = await sessionMessages(row.session_id);
	await recordAudit({
		actorType: 'staff',
		actorId: staff.staffId,
		action: 'staff.chat.viewed',
		objectType: 'chat_handoff',
		objectId: handoffId,
		requestId,
		metadata: { messageCount: messages.length, status: row.status }
	});
	return {
		handoff: mapStaffHandoff(row, staff),
		messages,
		latestMessageId: messages.at(-1)?.id ?? null
	};
}

export async function getStaffChatMessages(
	staff: StaffSession,
	handoffId: string,
	after?: string | null
) {
	const row = await loadStaffHandoff(db, handoffId);
	assertThreadAvailable(row);
	assertStaffCanAccess(staff, row);
	const messages = await sessionMessages(row.session_id, after);
	return {
		handoff: mapStaffHandoff(row, staff),
		messages,
		latestMessageId: messages.at(-1)?.id ?? after ?? null
	};
}

export async function sendStaffChatMessage(
	staff: StaffSession,
	handoffId: string,
	body: string,
	requestId?: string | null
) {
	return transaction(async (client) => {
		const row = await loadStaffHandoff(client, handoffId, true);
		assertStaffCanAccess(staff, row);
		if (row.status !== 'active') {
			throw new HandoffServiceError(409, 'handoff_not_active', 'Percakapan ini tidak aktif.');
		}
		const message = await insertHandoffMessage(client, {
			sessionId: row.session_id,
			handoffId,
			sender: 'staff',
			source: 'staff',
			body,
			staffId: staff.staffId
		});
		await recordAudit(
			{
				actorType: 'staff',
				actorId: staff.staffId,
				action: 'staff.chat.replied',
				objectType: 'chat_handoff',
				objectId: handoffId,
				requestId
			},
			client
		);
		return { message };
	});
}

export async function closeStaffChat(
	staff: StaffSession,
	handoffId: string,
	requestId?: string | null
) {
	return transaction(async (client) => {
		const row = await loadStaffHandoff(client, handoffId, true);
		assertStaffCanAccess(staff, row);
		if (row.status !== 'active') {
			throw new HandoffServiceError(409, 'handoff_not_active', 'Percakapan ini tidak aktif.');
		}
		const updated = await client.query<HandoffRow>(
			`UPDATE chat_handoffs
			 SET status = 'closed', closed_by = $2, closed_at = now(), close_reason = 'staff_closed'
			 WHERE id = $1 AND status = 'active'
			 RETURNING *`,
			[handoffId, staff.staffId]
		);
		const message = await insertHandoffMessage(client, {
			sessionId: row.session_id,
			handoffId,
			sender: 'service',
			source: 'handoff',
			body: 'Percakapan dengan petugas sudah ditutup. Anda bisa melanjutkan dengan panduan atau memeriksa draf.'
		});
		await recordAudit(
			{
				actorType: 'staff',
				actorId: staff.staffId,
				action: 'staff.chat.closed',
				objectType: 'chat_handoff',
				objectId: handoffId,
				requestId
			},
			client
		);
		return {
			handoff: mapStaffHandoff({ ...row, ...updated.rows[0] }, staff),
			message,
			latestMessageId: message.id
		};
	});
}
