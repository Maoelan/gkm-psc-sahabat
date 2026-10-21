import { requestOriginAllowed } from './request-security';
import { json } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import {
	getStaffSession,
	hasStaffCsrf,
	hasStaffRole,
	type StaffRole,
	type StaffSession
} from './staff-auth';

export function apiError(status: number, code: string, message: string) {
	return json({ error: message, code }, { status });
}

export async function requireStaffApi(
	cookies: Cookies,
	roles: StaffRole[]
): Promise<StaffSession | Response> {
	const staff = await getStaffSession(cookies);
	if (!staff) return apiError(401, 'staff_unauthorized', 'Masuk sebagai petugas diperlukan.');
	if (!hasStaffRole(staff, roles)) {
		return apiError(403, 'staff_forbidden', 'Peran akun tidak memiliki akses ke data ini.');
	}
	return staff;
}

export function requireCsrf(request: Request, staff: StaffSession) {
	if (!requestOriginAllowed(request) || !hasStaffCsrf(request, staff)) {
		return apiError(403, 'csrf_invalid', 'Token keamanan sesi tidak cocok. Muat ulang halaman.');
	}
	return null;
}
