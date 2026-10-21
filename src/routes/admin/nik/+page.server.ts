import { redirect } from '@sveltejs/kit';
import { getNikDirectory } from '../../../lib/server/reports';
import { getStaffSession, hasStaffRole } from '../../../lib/server/staff-auth';

export async function load({ cookies, locals }) {
	const staff = await getStaffSession(cookies);
	if (!staff) redirect(303, '/masuk?next=/admin/nik');
	if (!hasStaffRole(staff, ['admin'])) redirect(303, '/rekap');

	try {
		return {
			entries: await getNikDirectory(staff, locals.requestId),
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: false
		};
	} catch {
		return {
			entries: [],
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: true
		};
	}
}
