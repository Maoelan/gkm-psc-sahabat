import { json } from '@sveltejs/kit';
import { getOfficerReports } from '../../../../lib/server/reports';
import { requireStaffApi } from '../../../../lib/server/staff-api';

export async function GET({ cookies }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		return json({ reports: await getOfficerReports(staff.staffId) });
	} catch {
		return json({ error: 'Daftar laporan tidak dapat dimuat.' }, { status: 503 });
	}
}
