import { json } from '@sveltejs/kit';
import { getActiveChatSessions, getStaffChatQueue } from '../../../../lib/server/handoffs';
import { requireStaffApi } from '../../../../lib/server/staff-api';

export async function GET({ cookies }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		const [chats, active] = await Promise.all([
			getStaffChatQueue(staff),
			getActiveChatSessions(staff)
		]);
		return json({ chats, active });
	} catch {
		return json({ error: 'Antrean percakapan belum dapat dimuat.' }, { status: 503 });
	}
}
