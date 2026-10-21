import { json } from '@sveltejs/kit';
import { recordAudit } from '../../../../lib/server/audit';
import { createDraft, ReportServiceError } from '../../../../lib/server/reports';
import {
	hasValidCsrf,
	requestOriginAllowed,
	requireSession
} from '../../../../lib/server/session';
import { draftSchema, validationMessage } from '../../../../lib/server/validation';

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
	const parsed = draftSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	try {
		const draft = await createDraft(session.id, parsed.data);
		await recordAudit({
			actorType: 'anonymous',
			action: 'draft.saved',
			objectType: 'chat_session',
			objectId: session.id,
			requestId: locals.requestId,
			metadata: { version: draft.version }
		});
		return json(draft, { status: 201 });
	} catch (error) {
		if (error instanceof ReportServiceError) return json({ error: error.message, code: error.code }, { status: error.status });
		return json({ error: 'Draf belum dapat disimpan. Coba lagi.' }, { status: 503 });
	}
}
