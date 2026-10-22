import { json } from '@sveltejs/kit';
import { getOfficerReport, ReportServiceError } from '../../../../../lib/server/reports';
import { requireStaffApi } from '../../../../../lib/server/staff-api';

export async function GET({ cookies, params }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		return json({
			report: await getOfficerReport(staff, params.id)
		});
	} catch (error) {
		if (error instanceof ReportServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Laporan tidak dapat dimuat.' }, { status: 503 });
	}
}
