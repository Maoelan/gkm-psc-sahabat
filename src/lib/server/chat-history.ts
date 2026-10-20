import { decrypt } from './crypto';
import { db } from './db';
import type { ChatHistoryMessage } from './ai';

type ChatHistoryRow = {
	sender_type: string;
	body_enc: Buffer;
	body_iv: Buffer;
	body_tag: Buffer;
};

/**
 * Mengambil beberapa pesan terakhir untuk konteks AI. Isi didekripsi hanya di server,
 * lalu dipotong sebelum dikirim ke penyedia AI. Baris yang tidak terbaca dilewati
 * agar satu data rusak tidak menggagalkan seluruh percakapan.
 */
export async function recentChatHistory(
	sessionId: string,
	limit = 8
): Promise<ChatHistoryMessage[]> {
	const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 12);
	const result = await db.query<ChatHistoryRow>(
		`SELECT sender_type, body_enc, body_iv, body_tag
		 FROM chat_messages
		 WHERE session_id = $1
		 ORDER BY created_at DESC, id DESC
		 LIMIT $2`,
		[sessionId, safeLimit]
	);

	const messages: ChatHistoryMessage[] = [];
	for (const row of result.rows.reverse()) {
		try {
			const body = decrypt(row.body_enc, row.body_iv, row.body_tag, 'chat_message').trim();
			if (!body) continue;
			messages.push({
				role: row.sender_type === 'user' ? 'user' : 'assistant',
				body
			});
		} catch {
			// Riwayat yang tidak dapat didekripsi tidak dikirim ke AI.
		}
	}
	return messages;
}
