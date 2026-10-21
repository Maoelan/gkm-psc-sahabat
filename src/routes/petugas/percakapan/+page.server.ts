import { redirect } from '@sveltejs/kit';
import { getActiveChatSessions, getStaffChatQueue } from '../../../lib/server/handoffs';
import { getServiceModeAt } from '../../../lib/server/service-mode';
import { getStaffSession, hasStaffRole } from '../../../lib/server/staff-auth';

export async function load({ cookies }) {
	const staff = await getStaffSession(cookies);
	if (!staff) redirect(303, '/masuk?next=/petugas/percakapan');
	if (!hasStaffRole(staff, ['petugas', 'admin'])) redirect(303, '/rekap');
	const serviceMode = await getServiceModeAt();

	try {
		const [chats, activeChats] = await Promise.all([
			getStaffChatQueue(staff),
			getActiveChatSessions(staff)
		]);
		return {
			chats,
			activeChats,
			csrfToken: staff.csrfToken,
			isAdmin: staff.roles.includes('admin'),
			serviceMode,
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: false
		};
	} catch {
		return {
			chats: [],
			activeChats: [],
			csrfToken: staff.csrfToken,
			isAdmin: staff.roles.includes('admin'),
			serviceMode,
			staff: { displayName: staff.displayName, roles: staff.roles },
			loadError: true
		};
	}
}
