import { json } from '@sveltejs/kit';
import {
	HandoffServiceError,
	sendReporterHandoffMessage
} from '../../../../../lib/server/handoffs';
import { allowAttempt } from '../../../../../lib/server/rate-limit';
import {
	hasValidCsrf,
	requestOriginAllowed,
	requireSession
} from '../../../../../lib/server/session';
import { handoffMessageSchema, validationMessage } from '../../../../../lib/server/validation';

export async function POST({ cookies, request }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	const session = await requireSession(cookies);
	if (!session) return json({ error: 'Sesi tidak tersedia atau sudah berakhir.' }, { status: 401 });
	if (!hasValidCsrf(request, session)) {
		return json({ error: 'Token keamanan sesi tidak cocok.' }, { status: 403 });
	}
	if (!allowAttempt(`handoff-message:${session.id}`, 60, 10 * 60 * 1000)) {
		return json(
			{ error: 'Terlalu banyak pesan. Tunggu sebentar lalu coba lagi.' },
			{ status: 429 }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}
	const parsed = handoffMessageSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	try {
		return json(await sendReporterHandoffMessage(session, parsed.data.body));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Pesan belum dapat dikirim.' }, { status: 503 });
	}
}
