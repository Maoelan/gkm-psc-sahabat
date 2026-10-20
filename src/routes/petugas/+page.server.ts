import { redirect } from '@sveltejs/kit';
import { getOfficerReports } from '../../lib/server/reports';
import { getStaffSession, hasStaffRole } from '../../lib/server/staff-auth';

export async function load({ cookies }) {
	const staff = await getStaffSession(cookies);
	if (!staff) redirect(303, '/masuk?next=/petugas');
	if (!hasStaffRole(staff, ['petugas', 'admin'])) redirect(303, '/rekap');

	try {
		return {
			reports: await getOfficerReports(staff.staffId, staff.roles.includes('admin')),
			csrfToken: staff.csrfToken,
			isAdmin: staff.roles.includes('admin'),
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: false
		};
	} catch {
		return {
			reports: [],
			csrfToken: staff.csrfToken,
			isAdmin: staff.roles.includes('admin'),
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: true
		};
	}
}
