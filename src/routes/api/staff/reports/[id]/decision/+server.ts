import { json } from '@sveltejs/kit';
import { recordDecision, ReportServiceError } from '../../../../../../lib/server/reports';
import { requireCsrf, requireStaffApi } from '../../../../../../lib/server/staff-api';
import { decisionSchema, validationMessage } from '../../../../../../lib/server/validation';

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
	const parsed = decisionSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	try {
		return json(
			await recordDecision(
				staff,
				params.id,
				parsed.data.decision,
				parsed.data.reason,
				locals.requestId
			)
		);
	} catch (error) {
		if (error instanceof ReportServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Keputusan belum dapat disimpan.' }, { status: 503 });
	}
}
