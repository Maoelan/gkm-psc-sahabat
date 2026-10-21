import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	createHandoff,
	getReporterHandoff,
	HandoffServiceError
} from '../../../../lib/server/handoffs';
import { allowAttempt } from '../../../../lib/server/rate-limit';
import {
	hasValidCsrf,
	requestOriginAllowed,
	requireSession
} from '../../../../lib/server/session';

const cursorSchema = z.uuid();

export async function GET({ cookies, url }) {
	const session = await requireSession(cookies);
	if (!session) return json({ error: 'Sesi tidak tersedia atau sudah berakhir.' }, { status: 401 });

	const afterParam = url.searchParams.get('after');
	const parsedAfter = afterParam ? cursorSchema.safeParse(afterParam) : null;
	const after = parsedAfter?.success ? parsedAfter.data : null;

	try {
		return json(await getReporterHandoff(session.id, after));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Status bantuan petugas belum dapat dimuat.' }, { status: 503 });
	}
}

export async function POST({ cookies, request, locals }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	const session = await requireSession(cookies);
	if (!session) return json({ error: 'Sesi tidak tersedia atau sudah berakhir.' }, { status: 401 });
	if (!hasValidCsrf(request, session)) {
		return json({ error: 'Token keamanan sesi tidak cocok.' }, { status: 403 });
	}
	if (!allowAttempt(`handoff-request:${session.id}`, 5, 10 * 60 * 1000)) {
		return json(
			{ error: 'Terlalu banyak permintaan bantuan. Coba lagi beberapa menit lagi.' },
			{ status: 429 }
		);
	}

	try {
		return json(await createHandoff(session, locals.requestId));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Bantuan petugas belum dapat diminta.' }, { status: 503 });
	}
}
