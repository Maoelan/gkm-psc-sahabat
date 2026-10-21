import { redirect } from '@sveltejs/kit';
import { getRecapReports, getOutboxSummary } from '../../lib/server/reports';
import { getStaffSession, hasStaffRole } from '../../lib/server/staff-auth';

export async function load({ cookies }) {
	const staff = await getStaffSession(cookies);
	if (!staff) {
		return { authenticated: false, reports: [], csrfToken: null, outbox: null, loadError: false };
	}
	if (!hasStaffRole(staff, ['admin'])) redirect(303, '/petugas/ganti-akun');

	try {
		const [reports, outbox] = await Promise.all([getRecapReports(), getOutboxSummary()]);
		return {
			authenticated: true,
			reports,
			csrfToken: staff.csrfToken,
			outbox,
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: false
		};
	} catch {
		return {
			authenticated: true,
			reports: [],
			csrfToken: staff.csrfToken,
			outbox: null,
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: true
		};
	}
}
