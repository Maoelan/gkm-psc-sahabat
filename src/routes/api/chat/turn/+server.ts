import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import {
	fallbackChatTurn,
	makeChatTurn,
	remainingChatFields,
	type ChatFields
} from '../../../../lib/server/ai';
import { recentChatHistory } from '../../../../lib/server/chat-history';
import { encrypt } from '../../../../lib/server/crypto';
import { transaction } from '../../../../lib/server/db';
import { acquireChatLock, hasOpenHandoff } from '../../../../lib/server/handoffs';
import { recordAudit } from '../../../../lib/server/audit';
import { allowAttempt } from '../../../../lib/server/rate-limit';
import {
	hasValidCsrf,
	requestOriginAllowed,
	requireSession
} from '../../../../lib/server/session';
import { chatTurnSchema, validationMessage } from '../../../../lib/server/validation';

export async function POST({ cookies, request, locals }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	const session = await requireSession(cookies);
	if (!session) return json({ error: 'Sesi tidak tersedia atau sudah berakhir.' }, { status: 401 });
	if (!hasValidCsrf(request, session)) {
		return json({ error: 'Token keamanan sesi tidak cocok.' }, { status: 403 });
	}
	if (!allowAttempt(`chat-turn:${session.id}`, 30, 10 * 60 * 1000)) {
		return json({ error: 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.' }, { status: 429 });
	}
	if (await hasOpenHandoff(session.id)) {
		return json(
			{
				error: 'Bantuan petugas sedang aktif. AI dijeda sampai percakapan dengan petugas selesai.',
				code: 'handoff_open'
			},
			{ status: 409 }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}
	const parsed = chatTurnSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	const userMessage = parsed.data.userMessage?.trim() || '';
	const fields: ChatFields = {
		incidentTime: parsed.data.incidentTime,
		incidentLocation: parsed.data.incidentLocation,
		need: parsed.data.need
	};
	const remainingFields = remainingChatFields(fields);
	const history = session.mode === 'ai' ? await recentChatHistory(session.id) : [];
	const result =
		session.mode === 'ai'
			? await makeChatTurn({
					fields,
					remainingFields,
					story: parsed.data.story,
					lastAnswer: userMessage,
					history
				})
			: fallbackChatTurn(remainingFields);

	const assistantSource = result.source === 'nvidia' ? 'ai' : 'fallback';
	const assistantSender = result.source === 'nvidia' ? 'assistant' : 'service';
	const assistantEncrypted = encrypt(result.message, 'chat_message');
	const userEncrypted = userMessage ? encrypt(userMessage, 'chat_message') : null;

	/**
	 * Pemeriksaan kedua setelah panggilan AI: handoff bisa dibuka saat model masih
	 * bekerja. Kunci sesi agar pesan AI tidak masuk setelah petugas mengambil alih.
	 */
	const saved = await transaction(async (client) => {
		await acquireChatLock(client, session.id);
		await client.query('SELECT id FROM chat_sessions WHERE id = $1 FOR UPDATE', [session.id]);
		const open = await client.query<{ id: string }>(
			`SELECT id FROM chat_handoffs
			 WHERE session_id = $1 AND status IN ('waiting', 'active')
			 LIMIT 1
			 FOR UPDATE`,
			[session.id]
		);
		if (open.rows[0]) {
			if (userEncrypted) {
				await client.query(
					`INSERT INTO chat_messages
					 (id, session_id, sender_type, source, body_enc, body_iv, body_tag, handoff_id, created_at)
					 VALUES ($1, $2, 'user', 'user', $3, $4, $5, $6, now())`,
					[
						randomUUID(),
						session.id,
						userEncrypted.encrypted,
						userEncrypted.iv,
						userEncrypted.tag,
						open.rows[0].id
					]
				);
			}
			return { blocked: true as const };
		}

		if (userEncrypted) {
			await client.query(
				`INSERT INTO chat_messages
				 (id, session_id, sender_type, source, body_enc, body_iv, body_tag, created_at)
				 VALUES
				 ($1, $2, 'user', 'user', $3, $4, $5, now()),
				 ($6, $2, $7, $8, $9, $10, $11, now() + interval '1 millisecond')`,
				[
					randomUUID(),
					session.id,
					userEncrypted.encrypted,
					userEncrypted.iv,
					userEncrypted.tag,
					randomUUID(),
					assistantSender,
					assistantSource,
					assistantEncrypted.encrypted,
					assistantEncrypted.iv,
					assistantEncrypted.tag
				]
			);
		} else {
			await client.query(
				`INSERT INTO chat_messages
				 (id, session_id, sender_type, source, body_enc, body_iv, body_tag, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
				[
					randomUUID(),
					session.id,
					assistantSender,
					assistantSource,
					assistantEncrypted.encrypted,
					assistantEncrypted.iv,
					assistantEncrypted.tag
				]
			);
		}
		return { blocked: false as const };
	});

	if (saved.blocked) {
		await recordAudit({
			actorType: 'anonymous',
			action: 'chat.turn.handoff_paused',
			objectType: 'chat_session',
			objectId: session.id,
			requestId: locals.requestId,
			metadata: { userMessage: Boolean(userMessage) }
		});
		return json(
			{
				error: 'Bantuan petugas baru saja aktif. AI dijeda; pesan Anda diteruskan ke petugas.',
				code: 'handoff_open'
			},
			{ status: 409 }
		);
	}

	await recordAudit({
		actorType: 'anonymous',
		action: 'chat.turn',
		objectType: 'chat_session',
		objectId: session.id,
		requestId: locals.requestId,
		metadata: {
			source: result.source,
			missingField: result.missingField,
			flowComplete: result.flowComplete,
			userMessage: Boolean(userMessage)
		}
	});
	return json({
		flowComplete: result.flowComplete,
		message: result.message,
		question: result.question,
		source: result.source,
		missingField: result.missingField
	});
}
