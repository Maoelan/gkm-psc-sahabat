import { json } from '@sveltejs/kit';
import { saveReviewNote, ReportServiceError } from '../../../../../../lib/server/reports';
import { requireCsrf, requireStaffApi } from '../../../../../../lib/server/staff-api';
import { reviewSchema, validationMessage } from '../../../../../../lib/server/validation';

export async function POST({ cookies, request, params, locals }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	const csrfError = requireCsrf(request, staff);
	if (csrfError) return csrfError;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}
	const parsed = reviewSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	try {
		return json(await saveReviewNote(staff, params.id, parsed.data.notes, locals.requestId));
	} catch (error) {
		if (error instanceof ReportServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Catatan belum dapat disimpan.' }, { status: 503 });
	}
}
