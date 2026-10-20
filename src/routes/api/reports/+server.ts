import { json } from '@sveltejs/kit';
import { submitReport, ReportServiceError } from '../../../lib/server/reports';
import {
	hasValidCsrf,
	requestOriginAllowed,
	requireSession
} from '../../../lib/server/session';
import { submitSchema, validationMessage } from '../../../lib/server/validation';

export async function POST({ cookies, request, locals }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	const session = await requireSession(cookies);
	if (!session) return json({ error: 'Sesi tidak tersedia atau sudah berakhir.' }, { status: 401 });
	if (!hasValidCsrf(request, session)) {
		return json({ error: 'Token keamanan sesi tidak cocok.' }, { status: 403 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}
	const parsed = submitSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	try {
		const result = await submitReport(session, parsed.data, locals.requestId);
		return json(result, { status: 201 });
	} catch (error) {
		if (error instanceof ReportServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Laporan belum tersimpan. Draf tetap tersedia di halaman ini.' }, { status: 503 });
	}
}
