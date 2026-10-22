import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { getStaffChatAssistance, HandoffServiceError } from '../../../../../../lib/server/handoffs';
import { requireCsrf, requireStaffApi } from '../../../../../../lib/server/staff-api';
import { allowAttempt } from '../../../../../../lib/server/rate-limit';

export async function POST({ cookies, params, request, locals }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	const csrfError = requireCsrf(request, staff);
	if (csrfError) return csrfError;
	if (!z.uuid().safeParse(params.id).success) return json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
	let body: unknown;
	try { body = await request.json(); } catch { return json({ error: 'Payload tidak valid.' }, { status: 400 }); }
	const parsed = z.object({ refresh: z.boolean().optional() }).strict().safeParse(body);
	if (!parsed.success) return json({ error: 'Permintaan panduan tidak valid.' }, { status: 422 });
	if (!allowAttempt(`staff-assistance:${staff.staffId}`, 60, 10 * 60 * 1000) ||
		(parsed.data.refresh && !allowAttempt(`staff-assistance-refresh:${staff.staffId}:${params.id}`, 2, 60_000))) {
		return json({ error: 'Panduan terlalu sering diminta. Tunggu sebentar.' }, { status: 429 });
	}
	try {
		const assistance = await getStaffChatAssistance(staff, params.id, locals.requestId, parsed.data.refresh);
		const currentStaff = await requireStaffApi(cookies, ['petugas', 'admin']);
		if (currentStaff instanceof Response) return currentStaff;
		return json({ assistance });
	}
	catch (error) {
		if (error instanceof HandoffServiceError) return json({ error: error.message, code: error.code }, { status: error.status });
		return json({ error: 'Panduan belum dapat dimuat. Percakapan tetap dapat digunakan.' }, { status: 503 });
	}
}
