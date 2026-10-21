import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { closeStaffChat, HandoffServiceError } from '../../../../../../lib/server/handoffs';
import { allowAttempt } from '../../../../../../lib/server/rate-limit';
import { requireCsrf, requireStaffApi } from '../../../../../../lib/server/staff-api';

export async function POST({ cookies, request, params, locals }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	const csrfError = requireCsrf(request, staff);
	if (csrfError) return csrfError;
	if (!z.uuid().safeParse(params.id).success) {
		return json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
	}
	if (!allowAttempt(`staff-close:${staff.staffId}`, 30, 10 * 60 * 1000)) {
		return json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, { status: 429 });
	}

	try {
		return json(await closeStaffChat(staff, params.id, locals.requestId));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Percakapan belum dapat ditutup.' }, { status: 503 });
	}
}
