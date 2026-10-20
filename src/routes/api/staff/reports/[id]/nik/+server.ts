import { json } from '@sveltejs/kit';
import { getNikForBidan, ReportServiceError } from '../../../../../../lib/server/reports';
import { requireStaffApi } from '../../../../../../lib/server/staff-api';

export async function GET({ cookies, params, locals }) {
	const staff = await requireStaffApi(cookies, ['bidan_pic', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		return json(await getNikForBidan(staff, params.id, locals.requestId));
	} catch (error) {
		if (error instanceof ReportServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'NIK tidak dapat dibuka.' }, { status: 503 });
	}
}
