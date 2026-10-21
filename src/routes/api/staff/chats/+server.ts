import { json } from '@sveltejs/kit';
import { getStaffChatQueue } from '../../../../lib/server/handoffs';
import { requireStaffApi } from '../../../../lib/server/staff-api';

export async function GET({ cookies }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	try {
		return json({ chats: await getStaffChatQueue(staff) });
	} catch {
		return json({ error: 'Antrean percakapan belum dapat dimuat.' }, { status: 503 });
	}
}
