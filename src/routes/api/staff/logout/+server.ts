import { json } from '@sveltejs/kit';
import { destroyStaffSession, getStaffSession } from '../../../../lib/server/staff-auth';
import { requireCsrf } from '../../../../lib/server/staff-api';

export async function POST({ cookies, request, locals }) {
	const staff = await getStaffSession(cookies);
	if (!staff) return json({ error: 'Sesi petugas tidak ditemukan.' }, { status: 401 });
	const csrfError = requireCsrf(request, staff);
	if (csrfError) return csrfError;
	await destroyStaffSession(cookies, locals.requestId);
	return new Response(null, { status: 204 });
}
