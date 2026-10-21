import { fail, redirect } from '@sveltejs/kit';
import {
	authenticateStaff,
	createStaffSession,
	defaultStaffRoute,
	destroyStaffSession,
	getStaffSession,
	hasStaffCsrfValue,
	type StaffRole
} from '../../lib/server/staff-auth';
import { loginSchema, validationMessage } from '../../lib/server/validation';

function safeNext(value: string | null, fallback: string) {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	if (!['/petugas', '/petugas/percakapan', '/rekap', '/admin/nik'].includes(value)) return fallback;
	return value;
}

function canAccessNext(roles: StaffRole[], next: string) {
	if (next === '/petugas' || next === '/petugas/percakapan') {
		return roles.includes('petugas') || roles.includes('admin');
	}
	if (next === '/rekap') return roles.includes('bidan_pic') || roles.includes('admin');
	if (next === '/admin/nik') return roles.includes('admin');
	return false;
}

export async function load({ cookies, url }) {
	const staff = await getStaffSession(cookies);
	const next = safeNext(url.searchParams.get('next'), '');

	if (staff) {
		if (next === '/rekap' && !canAccessNext(staff.roles, next)) {
			redirect(303, '/petugas/ganti-akun');
		}
		redirect(303, next && canAccessNext(staff.roles, next) ? next : defaultStaffRoute(staff));
	}

	return {
		next,
		switched: url.searchParams.get('switch') === '1',
		staff: null
	};
}

export const actions = {
	login: async ({ request, cookies, locals, getClientAddress }) => {
		const form = await request.formData();
		const username = String(form.get('username') ?? '');
		const parsed = loginSchema.safeParse({
			username,
			password: String(form.get('password') ?? '')
		});
		if (!parsed.success) {
			return fail(422, { username, message: validationMessage(parsed.error) });
		}

		let clientKey = 'local';
		try {
			clientKey = getClientAddress();
		} catch {
			// Alamat klien tidak selalu tersedia di lingkungan pengujian.
		}

		let destination = '/petugas';
		let roles: StaffRole[] = [];
		try {
			const result = await authenticateStaff(parsed.data.username, parsed.data.password, {
				requestId: locals.requestId,
				clientKey
			});
			if (!result.ok) return fail(result.status, { username, message: result.message });
			await createStaffSession(cookies, result.staff.id, { requestId: locals.requestId });
			roles = result.staff.roles ?? [];
			destination = defaultStaffRoute({
				sessionId: '',
				staffId: result.staff.id,
				username: result.staff.username,
				displayName: result.staff.display_name,
				roles,
				csrfToken: ''
			});
		} catch {
			return fail(503, { username, message: 'Login belum dapat diproses. Coba lagi.' });
		}

		const requested = safeNext(String(form.get('next') ?? ''), '');
		if (requested === '/rekap' && !canAccessNext(roles, requested)) {
			redirect(303, '/petugas/ganti-akun');
		}
		redirect(303, requested && canAccessNext(roles, requested) ? requested : destination);
	},
	logout: async ({ request, cookies, locals }) => {
		const staff = await getStaffSession(cookies);
		if (staff) {
			const form = await request.formData();
			if (!hasStaffCsrfValue(staff, String(form.get('csrfToken') ?? ''))) {
				return fail(403, { message: 'Token keamanan sesi tidak cocok. Muat ulang halaman.' });
			}
		}
		await destroyStaffSession(cookies, locals.requestId);
		redirect(303, '/');
	}
};
