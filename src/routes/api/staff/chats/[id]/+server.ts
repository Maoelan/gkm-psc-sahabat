import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getStaffChatThread,
	HandoffServiceError
} from '../../../../../lib/server/handoffs';
import { requireStaffApi } from '../../../../../lib/server/staff-api';

export async function GET({ cookies, params, locals }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	if (!z.uuid().safeParse(params.id).success) {
		return json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
	}
	try {
		return json(await getStaffChatThread(staff, params.id, locals.requestId));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Percakapan tidak dapat dimuat.' }, { status: 503 });
	}
}
