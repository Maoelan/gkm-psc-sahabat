import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getStaffChatMessages,
	HandoffServiceError,
	sendStaffChatMessage
} from '../../../../../../lib/server/handoffs';
import { allowAttempt } from '../../../../../../lib/server/rate-limit';
import { requireCsrf, requireStaffApi } from '../../../../../../lib/server/staff-api';
import { handoffMessageSchema, validationMessage } from '../../../../../../lib/server/validation';

const cursorSchema = z.uuid();

export async function GET({ cookies, params, url }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	if (!z.uuid().safeParse(params.id).success) {
		return json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
	}
	const afterParam = url.searchParams.get('after');
	const parsedAfter = afterParam ? cursorSchema.safeParse(afterParam) : null;
	const after = parsedAfter?.success ? parsedAfter.data : null;
	try {
		return json(await getStaffChatMessages(staff, params.id, after));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Pesan baru belum dapat dimuat.' }, { status: 503 });
	}
}

export async function POST({ cookies, request, params, locals }) {
	const staff = await requireStaffApi(cookies, ['petugas', 'admin']);
	if (staff instanceof Response) return staff;
	const csrfError = requireCsrf(request, staff);
	if (csrfError) return csrfError;
	if (!z.uuid().safeParse(params.id).success) {
		return json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
	}
	if (!await allowAttempt(`staff-chat-message:${staff.staffId}`, 120, 10 * 60 * 1000)) {
		return json({ error: 'Terlalu banyak pesan. Tunggu sebentar.' }, { status: 429 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Payload tidak valid.' }, { status: 400 });
	}
	const parsed = handoffMessageSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: validationMessage(parsed.error) }, { status: 422 });
	}

	try {
		return json(await sendStaffChatMessage(staff, params.id, parsed.data.body, locals.requestId));
	} catch (error) {
		if (error instanceof HandoffServiceError) {
			return json({ error: error.message, code: error.code }, { status: error.status });
		}
		return json({ error: 'Pesan belum dapat dikirim.' }, { status: 503 });
	}
}
