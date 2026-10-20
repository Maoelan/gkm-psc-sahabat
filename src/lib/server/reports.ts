import { randomInt, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { db, transaction } from './db';
import { decrypt, decryptJson, encrypt } from './crypto';
import { isAiEnabled } from './env';
import { recordAudit } from './audit';
import { modeCopy, type ServiceMode } from '../service-mode';
import { maskSensitiveText, type TranscriptMessage } from '../reports';
import { PRIVACY_NOTICE_VERSION, PRIVACY_PURPOSE } from '../privacy';
import type { ReporterSession } from './session';
import type { StaffSession } from './staff-auth';

export type ReportStatus = 'submitted' | 'under_review' | 'decision_recorded';
export type Decision = 'follow_up_required' | 'follow_up_not_required';

export type DraftInput = {
	victimName: string;
	victimNik: string;
	relation: string;
	story: string;
	incidentTime: string;
	incidentLocation: string;
	need: string;
	safeContact: 'yes' | 'no';
	contactDetails: string;
};

type StoredDraft = DraftInput;

type ReportContent = {
	story: string;
	incidentTime: string;
	incidentLocation: string;
	need: string;
	contactPreference: 'yes' | 'no';
};

type EncryptedColumns = {
	enc: Buffer;
	iv: Buffer;
	tag: Buffer;
};

export type OfficerReport = {
	id: string;
	victimName: string;
	relation: string;
	received: string;
	receivedAt: string;
	status: ReportStatus;
	statusLabel: string;
	mode: ServiceMode;
	modeLabel: string;
	need: string;
	story: string;
	time: string;
	location: string;
	contact: string;
	decision?: Decision;
	reason?: string;
	decidedAt?: string;
};

export type RecapReport = {
	id: string;
	victimName: string;
	nikLast4: string | null;
	relation: string;
	need: string;
	time: string;
	location: string;
	contact: string;
	receivedAt: string;
	status: ReportStatus;
	statusLabel: string;
	decision?: Decision;
	reason?: string;
	decidedAt?: string;
};

export type RecapExportRow = {
	id: string;
	receivedAt: string;
	victimName: string;
	nik: string;
	relation: string;
	need: string;
	statusLabel: string;
	decisionLabel: string;
	reason: string;
};

type OfficerRow = {
	reference_code: string;
	status: ReportStatus;
	submitted_at: Date;
	mode: ServiceMode;
	content_enc: Buffer;
	content_iv: Buffer;
	content_tag: Buffer;
	name_enc: Buffer;
	name_iv: Buffer;
	name_tag: Buffer;
	relationship_enc: Buffer;
	relationship_iv: Buffer;
	relationship_tag: Buffer;
	safe_contact_allowed: boolean;
	decision: Decision | null;
	reason_enc: Buffer | null;
	reason_iv: Buffer | null;
	reason_tag: Buffer | null;
	decided_at: Date | null;
};

type RecapRow = OfficerRow & { nik_last4: string | null };

type TranscriptRow = {
	id: string;
	sender_type: TranscriptMessage['sender'];
	source: TranscriptMessage['source'];
	body_enc: Buffer;
	body_iv: Buffer;
	body_tag: Buffer;
	created_at: Date;
};

export class ReportServiceError extends Error {
	status: number;
	code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export function statusLabel(status: ReportStatus) {
	if (status === 'under_review') return 'Sedang diperiksa';
	if (status === 'decision_recorded') return 'Keputusan tercatat';
	return 'Perlu diperiksa';
}

export function decisionLabel(decision?: Decision | null) {
	if (decision === 'follow_up_required') return 'Perlu tindak lanjut';
	if (decision === 'follow_up_not_required') return 'Tidak perlu tindak lanjut';
	return 'Belum ada keputusan';
}

function relativeReceived(value: Date) {
	const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));
	if (minutes < 1) return 'Baru saja';
	if (minutes < 60) return `${minutes} menit lalu`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} jam lalu`;
	const days = Math.floor(hours / 24);
	if (days === 1) return 'Kemarin';
	return `${days} hari lalu`;
}

function decryptText(enc: Buffer, iv: Buffer, tag: Buffer, purpose: Parameters<typeof decrypt>[3]) {
	return decrypt(enc, iv, tag, purpose);
}

function encrypted(value: unknown, purpose: Parameters<typeof encrypt>[1]): EncryptedColumns {
	const item = encrypt(value, purpose);
	return { enc: item.encrypted, iv: item.iv, tag: item.tag };
}

function optionalEncrypted(value: string, purpose: Parameters<typeof encrypt>[1]) {
	return value.trim() ? encrypted(value.trim(), purpose) : null;
}

function contentOf(row: OfficerRow) {
	return decryptJson<ReportContent>(
		row.content_enc,
		row.content_iv,
		row.content_tag,
		'report_content'
	);
}

function mapOfficer(row: OfficerRow): OfficerReport {
	const content = contentOf(row);
	const relation = decryptText(
		row.relationship_enc,
		row.relationship_iv,
		row.relationship_tag,
		'relationship'
	);
	const reason =
		row.reason_enc && row.reason_iv && row.reason_tag
			? decryptText(row.reason_enc, row.reason_iv, row.reason_tag, 'decision_reason')
			: undefined;
	return {
		id: row.reference_code,
		victimName: decryptText(row.name_enc, row.name_iv, row.name_tag, 'victim_name'),
		relation,
		received: relativeReceived(row.submitted_at),
		receivedAt: row.submitted_at.toISOString(),
		status: row.status,
		statusLabel: statusLabel(row.status),
		mode: row.mode,
		modeLabel: modeCopy(row.mode, isAiEnabled()).label,
		need: maskSensitiveText(content.need || 'Belum diketahui'),
		story: maskSensitiveText(content.story),
		time: maskSensitiveText(content.incidentTime || 'Belum diketahui'),
		location: maskSensitiveText(content.incidentLocation || 'Belum diketahui'),
		contact: row.safe_contact_allowed ? 'Aman dihubungi' : 'Tidak aman dihubungi',
		decision: row.decision ?? undefined,
		reason: reason ? maskSensitiveText(reason) : undefined,
		decidedAt: row.decided_at?.toISOString()
	};
}

function mapRecap(row: RecapRow): RecapReport {
	const content = contentOf(row);
	const reason =
		row.reason_enc && row.reason_iv && row.reason_tag
			? decryptText(row.reason_enc, row.reason_iv, row.reason_tag, 'decision_reason')
			: undefined;
	return {
		id: row.reference_code,
		victimName: decryptText(row.name_enc, row.name_iv, row.name_tag, 'victim_name'),
		nikLast4: row.nik_last4,
		relation: decryptText(
			row.relationship_enc,
			row.relationship_iv,
			row.relationship_tag,
			'relationship'
		),
		need: maskSensitiveText(content.need || 'Belum diketahui'),
		time: content.incidentTime || 'Belum diketahui',
		location: content.incidentLocation || 'Belum diketahui',
		contact: row.safe_contact_allowed ? 'Aman dihubungi' : 'Tidak aman dihubungi',
		receivedAt: row.submitted_at.toISOString(),
		status: row.status,
		statusLabel: statusLabel(row.status),
		decision: row.decision ?? undefined,
		reason,
		decidedAt: row.decided_at?.toISOString()
	};
}

const officerSelect = `
	SELECT r.reference_code, r.status, r.submitted_at, cs.mode,
	       r.content_enc, r.content_iv, r.content_tag,
	       v.name_enc, v.name_iv, v.name_tag,
	       rep.relationship_enc, rep.relationship_iv, rep.relationship_tag,
	       rep.safe_contact_allowed,
	       d.decision, d.reason_enc, d.reason_iv, d.reason_tag, d.decided_at
	FROM reports r
	JOIN victim_details v ON v.id = r.victim_id
	JOIN reporter_details rep ON rep.id = r.reporter_id
	JOIN chat_sessions cs ON cs.id = r.source_session_id
	LEFT JOIN report_decisions d ON d.report_id = r.id AND d.superseded_at IS NULL
`;

async function assertAssigned(staffId: string, referenceCode: string) {
	const result = await db.query(
		`SELECT 1
		 FROM report_assignments a
		 JOIN reports r ON r.id = a.report_id
		 WHERE a.staff_id = $1 AND a.revoked_at IS NULL AND r.reference_code = $2
		 LIMIT 1`,
		[staffId, referenceCode]
	);
	if (!result.rowCount) {
		throw new ReportServiceError(404, 'report_not_found', 'Laporan tidak ditemukan dalam penugasan Anda.');
	}
}

export async function getOfficerReports(staffId: string, includeAll = false) {
	const result = includeAll
		? await db.query<OfficerRow>(
				`${officerSelect}
				 ORDER BY r.submitted_at DESC`
			)
		: await db.query<OfficerRow>(
				`${officerSelect}
				 JOIN report_assignments a ON a.report_id = r.id AND a.staff_id = $1 AND a.revoked_at IS NULL
				 ORDER BY r.submitted_at DESC`,
				[staffId]
			);
	return result.rows.map(mapOfficer);
}

export async function getOfficerReport(staffId: string, referenceCode: string, includeAll = false) {
	if (!includeAll) await assertAssigned(staffId, referenceCode);
	const result = includeAll
		? await db.query<OfficerRow>(
				`${officerSelect}
				 WHERE r.reference_code = $1
				 LIMIT 1`,
				[referenceCode]
			)
		: await db.query<OfficerRow>(
				`${officerSelect}
				 JOIN report_assignments a ON a.report_id = r.id AND a.staff_id = $1 AND a.revoked_at IS NULL
				 WHERE r.reference_code = $2
				 LIMIT 1`,
				[staffId, referenceCode]
			);
	const row = result.rows[0];
	if (!row) {
		throw new ReportServiceError(404, 'report_not_found', 'Laporan tidak ditemukan.');
	}
	return mapOfficer(row);
}

async function assertCanViewReport(staff: StaffSession, referenceCode: string) {
	if (staff.roles.includes('admin')) {
		const result = await db.query('SELECT 1 FROM reports WHERE reference_code = $1 LIMIT 1', [
			referenceCode
		]);
		if (!result.rowCount) {
			throw new ReportServiceError(404, 'report_not_found', 'Laporan tidak ditemukan.');
		}
		return;
	}
	await assertAssigned(staff.staffId, referenceCode);
}

export async function getReportTranscript(
	staff: StaffSession,
	referenceCode: string,
	requestId?: string | null
) {
	await assertCanViewReport(staff, referenceCode);
	const result = await db.query<TranscriptRow>(
		`SELECT cm.id, cm.sender_type, cm.source, cm.body_enc, cm.body_iv, cm.body_tag,
		        cm.created_at
		 FROM reports r
		 JOIN chat_messages cm ON cm.session_id = r.source_session_id
		 WHERE r.reference_code = $1
		 ORDER BY cm.created_at ASC, cm.id ASC`,
		[referenceCode]
	);
	const messages = result.rows.map((row): TranscriptMessage => ({
		id: row.id,
		sender: row.sender_type,
		source: row.source,
		body: maskSensitiveText(
			decryptText(row.body_enc, row.body_iv, row.body_tag, 'chat_message')
		),
		createdAt: row.created_at.toISOString()
	}));
	await recordAudit({
		actorType: 'staff',
		actorId: staff.staffId,
		action: 'report.chat_transcript.viewed',
		objectType: 'report',
		objectId: referenceCode,
		requestId,
		metadata: { messageCount: messages.length }
	});
	return { messages };
}

export async function getRecapReports() {
	const result = await db.query<RecapRow>(
		`${officerSelect.replace('rep.safe_contact_allowed,', 'rep.safe_contact_allowed, v.nik_last4,')}
		 ORDER BY r.submitted_at DESC`
	);
	return result.rows.map(mapRecap);
}

export async function createDraft(sessionId: string, content: StoredDraft) {
	const versionResult = await db.query<{ version: number }>(
		`SELECT coalesce(max(version), 0) + 1 AS version
		 FROM report_drafts WHERE session_id = $1`,
		[sessionId]
	);
	const version = versionResult.rows[0]?.version ?? 1;
	const draft = encrypted(content, 'draft_content');
	const id = randomUUID();
	await db.query(
		`INSERT INTO report_drafts
		 (id, session_id, version, content_enc, content_iv, content_tag, status, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'ready_for_confirmation', now() + interval '30 days')`,
		[id, sessionId, version, draft.enc, draft.iv, draft.tag]
	);
	return { draftId: id, version };
}

function makeReferenceCode() {
	const datePart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' })
		.format(new Date())
		.replaceAll('-', '');
	return `LA-${datePart}-${randomInt(1000, 10000)}`;
}

async function firstPetugas(client: PoolClient) {
	const result = await client.query<{ id: string }>(
		`SELECT su.id
		 FROM staff_users su
		 JOIN staff_roles sr ON sr.staff_id = su.id AND sr.role = 'petugas'
		 WHERE su.active = true
		 ORDER BY su.created_at ASC
		 LIMIT 1`
	);
	return result.rows[0]?.id ?? null;
}

export async function submitReport(
	session: ReporterSession,
	input: { draftId: string; version: number; idempotencyKey: string },
	requestId?: string | null
) {
	if (session.mode === 'unavailable') {
		throw new ReportServiceError(
			409,
			'service_unavailable',
			'Layanan sedang tidak tersedia. Draf tetap tersimpan, tetapi belum dapat dikirim.'
		);
	}

	const existing = await db.query<{ reference_code: string; submitted_at: Date; source_session_id: string }>(
		'SELECT reference_code, submitted_at, source_session_id FROM reports WHERE idempotency_key = $1',
		[input.idempotencyKey]
	);
	if (existing.rows[0]) {
		if (existing.rows[0].source_session_id !== session.id) {
			throw new ReportServiceError(409, 'idempotency_conflict', 'Kunci pengiriman sudah digunakan.');
		}
		return {
			referenceCode: existing.rows[0].reference_code,
			submittedAt: existing.rows[0].submitted_at.toISOString()
		};
	}

	return transaction(async (client) => {
		const draftResult = await client.query<{
			id: string;
			content_enc: Buffer;
			content_iv: Buffer;
			content_tag: Buffer;
			status: string;
		}>(
			`SELECT id, content_enc, content_iv, content_tag, status
			 FROM report_drafts
			 WHERE id = $1 AND session_id = $2 AND version = $3
			 FOR UPDATE`,
			[input.draftId, session.id, input.version]
		);
		const draft = draftResult.rows[0];
		if (!draft) {
			throw new ReportServiceError(422, 'draft_not_found', 'Draf tidak ditemukan. Simpan ulang draf Anda.');
		}
		if (draft.status === 'confirmed') {
			const prior = await client.query<{ reference_code: string; submitted_at: Date }>(
				`SELECT reference_code, submitted_at FROM reports
				 WHERE draft_id = $1 AND source_session_id = $2`,
				[draft.id, session.id]
			);
			if (prior.rows[0]) {
				return {
					referenceCode: prior.rows[0].reference_code,
					submittedAt: prior.rows[0].submitted_at.toISOString()
				};
			}
		}
		const content = decryptJson<StoredDraft>(
			draft.content_enc,
			draft.content_iv,
			draft.content_tag,
			'draft_content'
		);

		const reportId = randomUUID();
		const victimId = randomUUID();
		const reporterId = randomUUID();
		const referenceCode = makeReferenceCode();
		const name = encrypted(content.victimName, 'victim_name');
		const nik = content.victimNik ? encrypted(content.victimNik, 'nik') : null;
		const nikLast4 = content.victimNik ? content.victimNik.slice(-4) : null;
		const relation = encrypted(content.relation, 'relationship');
		const contact =
			content.safeContact === 'yes'
				? optionalEncrypted(content.contactDetails, 'contact_details')
				: null;
		const reportContent: ReportContent = {
			story: content.story,
			incidentTime: content.incidentTime || 'Belum diketahui',
			incidentLocation: content.incidentLocation || 'Belum diketahui',
			need: content.need || 'Belum diketahui',
			contactPreference: content.safeContact
		};
		const reportEncrypted = encrypted(reportContent, 'report_content');

		await client.query(
			`INSERT INTO victim_details
			 (id, name_enc, name_iv, name_tag, nik_enc, nik_iv, nik_tag, nik_last4)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[
				victimId,
				name.enc,
				name.iv,
				name.tag,
				nik?.enc ?? null,
				nik?.iv ?? null,
				nik?.tag ?? null,
				nikLast4
			]
		);
		await client.query(
			`INSERT INTO reporter_details
			 (id, relationship_enc, relationship_iv, relationship_tag, safe_contact_allowed,
			  contact_enc, contact_iv, contact_tag)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[
				reporterId,
				relation.enc,
				relation.iv,
				relation.tag,
				content.safeContact === 'yes',
				contact?.enc ?? null,
				contact?.iv ?? null,
				contact?.tag ?? null
			]
		);
		const inserted = await client.query<{ submitted_at: Date }>(
			`INSERT INTO reports
			 (id, reference_code, victim_id, reporter_id, source_session_id, draft_id,
			  confirmed_draft_version, content_enc, content_iv, content_tag, idempotency_key)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			 RETURNING submitted_at`,
			[
				reportId,
				referenceCode,
				victimId,
				reporterId,
				session.id,
				draft.id,
				input.version,
				reportEncrypted.enc,
				reportEncrypted.iv,
				reportEncrypted.tag,
				input.idempotencyKey
			]
		);
		await client.query(
			`UPDATE report_drafts SET status = 'confirmed', updated_at = now() WHERE id = $1`,
			[draft.id]
		);
		await client.query(
			`INSERT INTO privacy_acknowledgements
			 (id, session_id, report_id, notice_version, purpose)
			 VALUES ($1, $2, $3, $4, $5)`,
			[randomUUID(), session.id, reportId, PRIVACY_NOTICE_VERSION, PRIVACY_PURPOSE]
		);

		const petugasId = await firstPetugas(client);
		if (petugasId) {
			await client.query(
				`INSERT INTO report_assignments (id, report_id, staff_id, assigned_by)
				 VALUES ($1, $2, $3, NULL)`,
				[randomUUID(), reportId, petugasId]
			);
		}
		await client.query(
			`INSERT INTO notification_outbox (id, report_id, recipient_staff_id, event_type, payload)
			 VALUES ($1, $2, $3, 'report.submitted', $4::jsonb)`,
			[randomUUID(), reportId, petugasId, JSON.stringify({ purpose: 'report_submitted' })]
		);
		await recordAudit(
			{
				actorType: 'anonymous',
				action: 'report.submitted',
				objectType: 'report',
				objectId: referenceCode,
				requestId,
				metadata: { mode: session.mode }
			},
			client
		);

		return {
			referenceCode,
			submittedAt: inserted.rows[0].submitted_at.toISOString()
		};
	});
}

export async function saveReviewNote(
	staff: StaffSession,
	referenceCode: string,
	notes: string,
	requestId?: string | null
) {
	await assertCanViewReport(staff, referenceCode);
	return transaction(async (client) => {
		const report = await client.query<{ id: string; status: ReportStatus }>(
			`SELECT id, status FROM reports WHERE reference_code = $1 FOR UPDATE`,
			[referenceCode]
		);
		const row = report.rows[0];
		if (!row) throw new ReportServiceError(404, 'report_not_found', 'Laporan tidak ditemukan.');
		if (row.status === 'decision_recorded') {
			throw new ReportServiceError(409, 'already_decided', 'Keputusan sudah tercatat.');
		}
		const item = encrypted(notes, 'review_notes');
		await client.query(
			`INSERT INTO report_reviews
			 (id, report_id, reviewer_id, notes_enc, notes_iv, notes_tag)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			[randomUUID(), row.id, staff.staffId, item.enc, item.iv, item.tag]
		);
		await client.query(
			`UPDATE reports SET status = 'under_review', updated_at = now() WHERE id = $1`,
			[row.id]
		);
		await recordAudit(
			{
				actorType: 'staff',
				actorId: staff.staffId,
				action: 'report.review.saved',
				objectType: 'report',
				objectId: referenceCode,
				requestId
			},
			client
		);
		return { status: 'under_review' as const };
	});
}

export async function recordDecision(
	staff: StaffSession,
	referenceCode: string,
	decision: Decision,
	reason: string,
	requestId?: string | null
) {
	await assertCanViewReport(staff, referenceCode);
	return transaction(async (client) => {
		const report = await client.query<{ id: string; status: ReportStatus }>(
			`SELECT id, status FROM reports WHERE reference_code = $1 FOR UPDATE`,
			[referenceCode]
		);
		const row = report.rows[0];
		if (!row) throw new ReportServiceError(404, 'report_not_found', 'Laporan tidak ditemukan.');
		const current = await client.query(
			`SELECT 1 FROM report_decisions WHERE report_id = $1 AND superseded_at IS NULL`,
			[row.id]
		);
		if (current.rowCount) {
			throw new ReportServiceError(
				409,
				'already_decided',
				'Keputusan sudah tercatat. Perubahan keputusan memerlukan alur koreksi terpisah.'
			);
		}
		const reasonEncrypted = encrypted(reason, 'decision_reason');
		const decidedAt = new Date();
		await client.query(
			`INSERT INTO report_decisions
			 (id, report_id, decision, reason_enc, reason_iv, reason_tag, decided_by, decided_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			[
				randomUUID(),
				row.id,
				decision,
				reasonEncrypted.enc,
				reasonEncrypted.iv,
				reasonEncrypted.tag,
				staff.staffId,
				decidedAt
			]
		);
		await client.query(
			`UPDATE reports SET status = 'decision_recorded', updated_at = now() WHERE id = $1`,
			[row.id]
		);
		await recordAudit(
			{
				actorType: 'staff',
				actorId: staff.staffId,
				action: 'report.decision.recorded',
				objectType: 'report',
				objectId: referenceCode,
				requestId,
				metadata: { decision }
			},
			client
		);
		return { decision, reason, decidedAt: decidedAt.toISOString() };
	});
}

export async function getNikForBidan(staff: StaffSession, referenceCode: string, requestId?: string | null) {
	const result = await db.query<{
		id: string;
		nik_enc: Buffer | null;
		nik_iv: Buffer | null;
		nik_tag: Buffer | null;
	}>(
		`SELECT v.id, nik_enc, nik_iv, nik_tag FROM victim_details v
		 JOIN reports r ON r.victim_id = v.id
		 WHERE r.reference_code = $1`,
		[referenceCode]
	);
	const row = result.rows[0];
	if (!row) throw new ReportServiceError(404, 'report_not_found', 'Laporan tidak ditemukan.');
	const nik =
		row.nik_enc && row.nik_iv && row.nik_tag
			? decrypt(row.nik_enc, row.nik_iv, row.nik_tag, 'nik')
			: null;
	await recordAudit({
		actorType: 'staff',
		actorId: staff.staffId,
		action: 'nik.view',
		objectType: 'report',
		objectId: referenceCode,
		requestId
	});
	return { nik };
}

export async function getRecapExportRows(staff: StaffSession, requestId?: string | null) {
	const result = await db.query<RecapRow & { nik_enc: Buffer | null; nik_iv: Buffer | null; nik_tag: Buffer | null }>(
		`${officerSelect.replace('rep.safe_contact_allowed,', 'rep.safe_contact_allowed, v.nik_last4, v.nik_enc, v.nik_iv, v.nik_tag,')}
		 ORDER BY r.submitted_at DESC`
	);
	await recordAudit({
		actorType: 'staff',
		actorId: staff.staffId,
		action: 'recap.export',
		objectType: 'recap',
		objectId: null,
		requestId
	});
	return result.rows.map<RecapExportRow>((row) => {
		const mapped = mapRecap(row);
		return {
			id: mapped.id,
			receivedAt: mapped.receivedAt,
			victimName: mapped.victimName,
			nik:
				row.nik_enc && row.nik_iv && row.nik_tag
					? decrypt(row.nik_enc, row.nik_iv, row.nik_tag, 'nik')
					: '',
			relation: mapped.relation,
			need: mapped.need,
			statusLabel: mapped.statusLabel,
			decisionLabel: decisionLabel(mapped.decision),
			reason: mapped.reason ?? ''
		};
	});
}

export async function getOutboxSummary() {
	const result = await db.query<{ status: string; count: string }>(
		`SELECT status, count(*)::text AS count FROM notification_outbox GROUP BY status`
	);
	const counts = Object.fromEntries(result.rows.map((row) => [row.status, Number(row.count)]));
	return {
		pending: counts.pending ?? 0,
		sent: counts.sent ?? 0,
		failed: counts.failed ?? 0,
		provider: process.env.WHATSAPP_PROVIDER || 'outbox'
	};
}
