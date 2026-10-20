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
import { db } from '../../../../lib/server/db';
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

	if (userMessage) {
		const userEncrypted = encrypt(userMessage, 'chat_message');
		await db.query(
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
		await db.query(
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
