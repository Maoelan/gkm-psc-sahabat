import { fail, redirect } from '@sveltejs/kit';
import {
	destroyStaffSession,
	getStaffSession,
	hasStaffCsrfValue,
	hasStaffRole
} from '../../../lib/server/staff-auth';

export async function load({ cookies }) {
	const staff = await getStaffSession(cookies);
	if (!staff) redirect(303, '/masuk?next=/rekap');
	if (hasStaffRole(staff, ['admin'])) redirect(303, '/rekap');

	return {
		csrfToken: staff.csrfToken,
		staff: { displayName: staff.displayName, roles: staff.roles }
	};
}

export const actions = {
	switchAccount: async ({ request, cookies, locals }) => {
		const staff = await getStaffSession(cookies);
		if (!staff) redirect(303, '/masuk?next=/rekap');

		const form = await request.formData();
		if (!hasStaffCsrfValue(staff, String(form.get('csrfToken') ?? ''))) {
			return fail(403, { message: 'Token keamanan sesi tidak cocok. Muat ulang halaman.' });
		}

		await destroyStaffSession(cookies, locals.requestId);
		redirect(303, '/masuk?next=/rekap&switch=1');
	}
};
