import { json } from '@sveltejs/kit';
import { getOutboxSummary } from '../../../../lib/server/reports';
import { requireStaffApi } from '../../../../lib/server/staff-api';

export async function GET({ cookies }) {
	const staff = await requireStaffApi(cookies, ['admin']);
	if (staff instanceof Response) return staff;
	try {
		return json(await getOutboxSummary());
	} catch {
		return json({ error: 'Status notifikasi tidak dapat dimuat.' }, { status: 503 });
	}
}
