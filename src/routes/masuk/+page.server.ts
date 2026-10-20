import { fail, redirect } from '@sveltejs/kit';
import {
	authenticateStaff,
	createStaffSession,
	defaultStaffRoute,
	destroyStaffSession,
	getStaffSession,
	hasStaffCsrfValue
} from '../../lib/server/staff-auth';
import { loginSchema, validationMessage } from '../../lib/server/validation';

function safeNext(value: string | null, fallback: string) {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	if (!['/petugas', '/rekap'].includes(value)) return fallback;
	return value;
}

export async function load({ cookies, url }) {
	const staff = await getStaffSession(cookies);
	if (staff) redirect(303, defaultStaffRoute(staff));
	return {
		next: safeNext(url.searchParams.get('next'), ''),
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
		try {
			const result = await authenticateStaff(parsed.data.username, parsed.data.password, {
				requestId: locals.requestId,
				clientKey
			});
			if (!result.ok) return fail(result.status, { username, message: result.message });
			await createStaffSession(cookies, result.staff.id, { requestId: locals.requestId });
			destination = defaultStaffRoute({
				sessionId: '',
				staffId: result.staff.id,
				username: result.staff.username,
				displayName: result.staff.display_name,
				roles: result.staff.roles ?? [],
				csrfToken: ''
			});
		} catch {
			return fail(503, { username, message: 'Login belum dapat diproses. Coba lagi.' });
		}
		redirect(303, safeNext(String(form.get('next') ?? ''), destination));
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
