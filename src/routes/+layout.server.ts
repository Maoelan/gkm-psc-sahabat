import { getStaffSession } from '../lib/server/staff-auth';

export async function load({ cookies }) {
	try {
		const staff = await getStaffSession(cookies);
		return {
			staff: staff
				? {
						displayName: staff.displayName,
						username: staff.username,
						roles: staff.roles,
						csrfToken: staff.csrfToken
					}
				: null
		};
	} catch {
		return { staff: null };
	}
}
