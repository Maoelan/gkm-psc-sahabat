import type { Cookies } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { secureCookies } from './env';
import { hashSecret, randomToken, verifyPassword } from './crypto';
import { recordAudit } from './audit';
import { allowAttempt, resetAttempts } from './rate-limit';

export const STAFF_COOKIE = 'lapor_aman_staff';
const STAFF_SESSION_SECONDS = 8 * 60 * 60;

export type StaffRole = 'petugas' | 'bidan_pic' | 'admin' | 'auditor';

export type StaffSession = {
	sessionId: string;
	staffId: string;
	username: string;
	displayName: string;
	roles: StaffRole[];
	csrfToken: string;
};

type StaffRow = {
	session_id: string;
	staff_id: string;
	username: string;
	display_name: string;
	roles: StaffRole[] | null;
	csrf_token: string;
};

function mapStaff(row: StaffRow): StaffSession {
	return {
		sessionId: row.session_id,
		staffId: row.staff_id,
		username: row.username,
		displayName: row.display_name,
		roles: row.roles ?? [],
		csrfToken: row.csrf_token
	};
}

export async function getStaffSession(cookies: Cookies): Promise<StaffSession | null> {
	const secret = cookies.get(STAFF_COOKIE);
	if (!secret) return null;
	try {
		const result = await db.query<StaffRow>(
			`SELECT ss.id AS session_id, su.id AS staff_id, su.username, su.display_name,
			        ss.csrf_token,
			        array_agg(sr.role ORDER BY sr.role) FILTER (WHERE sr.role IS NOT NULL) AS roles
			 FROM staff_sessions ss
			 JOIN staff_users su ON su.id = ss.staff_id
			 LEFT JOIN staff_roles sr ON sr.staff_id = su.id
			 WHERE ss.session_secret_hash = $1
			   AND ss.revoked_at IS NULL
			   AND ss.expires_at > now()
			   AND su.active = true
			 GROUP BY ss.id, su.id, su.username, su.display_name, ss.csrf_token
			 LIMIT 1`,
			[hashSecret(secret)]
		);
		const row = result.rows[0];
		return row ? mapStaff(row) : null;
	} catch {
		return null;
	}
}

export async function authenticateStaff(
	usernameValue: string,
	password: string,
	context: { requestId?: string | null; clientKey?: string | null } = {}
) {
	const username = usernameValue.trim().toLowerCase();
	if (!username || !password) {
		return { ok: false as const, status: 422, message: 'Nama pengguna dan kata sandi wajib diisi.' };
	}
	const bucketKey = `staff-login:${context.clientKey ?? 'unknown'}:${username}`;
	if (!allowAttempt(bucketKey, 8, 10 * 60 * 1000)) {
		await recordAudit({
			actorType: 'anonymous',
			action: 'staff.login.rate_limited',
			objectType: 'staff_user',
			requestId: context.requestId
		});
		return {
			ok: false as const,
			status: 429,
			message: 'Terlalu banyak percobaan. Coba lagi dalam beberapa menit.'
		};
	}

	const result = await db.query<{
		id: string;
		username: string;
		display_name: string;
		password_hash: string;
		active: boolean;
		failed_login_attempts: number;
		locked_until: Date | null;
		roles: StaffRole[] | null;
	}>(
		`SELECT su.id, su.username, su.display_name, su.password_hash, su.active,
		        su.failed_login_attempts, su.locked_until,
		        array_agg(sr.role ORDER BY sr.role) FILTER (WHERE sr.role IS NOT NULL) AS roles
		 FROM staff_users su
		 LEFT JOIN staff_roles sr ON sr.staff_id = su.id
		 WHERE lower(su.username) = $1
		 GROUP BY su.id
		 LIMIT 1`,
		[username]
	);
	const staff = result.rows[0];
	const genericError = {
		ok: false as const,
		status: 401,
		message: 'Nama pengguna atau kata sandi tidak cocok.'
	};

	if (!staff || !staff.active) {
		await recordAudit({
			actorType: 'anonymous',
			action: 'staff.login.failed',
			objectType: 'staff_user',
			requestId: context.requestId
		});
		return genericError;
	}
	if (staff.locked_until && staff.locked_until.getTime() > Date.now()) {
		await recordAudit({
			actorType: 'anonymous',
			action: 'staff.login.locked',
			objectType: 'staff_user',
			objectId: staff.id,
			requestId: context.requestId
		});
		return {
			ok: false as const,
			status: 423,
			message: 'Akun terkunci sementara. Hubungi admin layanan atau coba lagi nanti.'
		};
	}

	if (!verifyPassword(password, staff.password_hash)) {
		const failed = staff.failed_login_attempts + 1;
		const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
		await db.query(
			`UPDATE staff_users
			 SET failed_login_attempts = $2, locked_until = $3
			 WHERE id = $1`,
			[staff.id, failed, lockedUntil]
		);
		await recordAudit({
			actorType: 'anonymous',
			action: 'staff.login.failed',
			objectType: 'staff_user',
			objectId: staff.id,
			requestId: context.requestId,
			metadata: { attempt: failed, locked: Boolean(lockedUntil) }
		});
		return genericError;
	}

	await db.query(
		`UPDATE staff_users
		 SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
		 WHERE id = $1`,
		[staff.id]
	);
	resetAttempts(bucketKey);
	await recordAudit({
		actorType: 'staff',
		actorId: staff.id,
		action: 'staff.login.succeeded',
		objectType: 'staff_user',
		objectId: staff.id,
		requestId: context.requestId
	});
	return { ok: true as const, staff };
}

export async function createStaffSession(
	cookies: Cookies,
	staffId: string,
	context: { requestId?: string | null } = {}
) {
	const id = randomUUID();
	const secret = randomToken(32);
	const csrfToken = randomToken(24);
	const expiresAt = new Date(Date.now() + STAFF_SESSION_SECONDS * 1000);
	await db.query(
		`INSERT INTO staff_sessions (id, staff_id, session_secret_hash, csrf_token, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		[id, staffId, hashSecret(secret), csrfToken, expiresAt]
	);
	cookies.set(STAFF_COOKIE, secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: secureCookies(),
		maxAge: STAFF_SESSION_SECONDS
	});
	await recordAudit({
		actorType: 'staff',
		actorId: staffId,
		action: 'staff.session.created',
		objectType: 'staff_session',
		objectId: id,
		requestId: context.requestId
	});
	return { id, csrfToken, expiresAt };
}

export async function destroyStaffSession(cookies: Cookies, requestId?: string | null) {
	const secret = cookies.get(STAFF_COOKIE);
	if (secret) {
		const result = await db.query<{ id: string; staff_id: string }>(
			`UPDATE staff_sessions SET revoked_at = now()
			 WHERE session_secret_hash = $1 AND revoked_at IS NULL
			 RETURNING id, staff_id`,
			[hashSecret(secret)]
		);
		const row = result.rows[0];
		if (row) {
			await recordAudit({
				actorType: 'staff',
				actorId: row.staff_id,
				action: 'staff.logout',
				objectType: 'staff_session',
				objectId: row.id,
				requestId
			});
		}
	}
	cookies.delete(STAFF_COOKIE, { path: '/' });
}

export function hasStaffRole(staff: StaffSession, roles: StaffRole[]) {
	return staff.roles.some((role) => roles.includes(role));
}

export function hasStaffCsrfValue(staff: StaffSession, token: string | null | undefined) {
	return Boolean(token) && token === staff.csrfToken;
}

export function hasStaffCsrf(request: Request, staff: StaffSession) {
	return hasStaffCsrfValue(staff, request.headers.get('x-csrf-token'));
}

export function defaultStaffRoute(staff: StaffSession) {
	if (hasStaffRole(staff, ['bidan_pic', 'admin'])) return '/rekap';
	if (hasStaffRole(staff, ['petugas'])) return '/petugas';
	return '/masuk';
}
