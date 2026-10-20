import { json } from '@sveltejs/kit';
import { getReportTranscript, ReportServiceError } from '../../../../../../lib/server/reports';
import { requireStaffApi } from '../../../../../../lib/server/staff-api';

export async function GET({ cookies, params, locals }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		return json(await getReportTranscript(staff, params.id, locals.requestId));
	} catch (error) {
		if (error instanceof ReportServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Riwayat percakapan tidak dapat dimuat.' }, { status: 503 });
	}
}
