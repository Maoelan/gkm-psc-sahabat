import { json } from '@sveltejs/kit';
import { getRecapReports } from '../../../../lib/server/reports';
import { requireStaffApi } from '../../../../lib/server/staff-api';

export async function GET({ cookies }) {
	const staff = await requireStaffApi(cookies, ['admin']);
	if (staff instanceof Response) return staff;
	try {
		return json({ reports: await getRecapReports(staff) });
	} catch {
		return json({ error: 'Rekap tidak dapat dimuat.' }, { status: 503 });
	}
}
