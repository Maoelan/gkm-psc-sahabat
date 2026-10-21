import { json } from '@sveltejs/kit';
import {
	cancelReporterHandoff,
	HandoffServiceError
} from '../../../../../lib/server/handoffs';
import { allowAttempt } from '../../../../../lib/server/rate-limit';
import {
	hasValidCsrf,
	requestOriginAllowed,
	requireSession
} from '../../../../../lib/server/session';

export async function POST({ cookies, request, locals }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	const session = await requireSession(cookies);
	if (!session) return json({ error: 'Sesi tidak tersedia atau sudah berakhir.' }, { status: 401 });
	if (!hasValidCsrf(request, session)) {
		return json({ error: 'Token keamanan sesi tidak cocok.' }, { status: 403 });
	}
	if (!allowAttempt(`handoff-cancel:${session.id}`, 10, 10 * 60 * 1000)) {
		return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, { status: 429 });
	}

	try {
		return json(await cancelReporterHandoff(session, locals.requestId));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Bantuan petugas belum dapat diakhiri.' }, { status: 503 });
	}
}
