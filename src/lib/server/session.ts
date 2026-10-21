import type { Cookies } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { db, transaction } from './db';
import { secureCookies } from './env';
import { hashSecret, randomToken } from './crypto';
import { getServiceModeAt } from './service-mode';
import type { ServiceMode } from '../service-mode';

export const SESSION_COOKIE = 'lapor_aman_session';
const SESSION_SECONDS = 2 * 60 * 60;

export type ReporterSession = {
	id: string;
	mode: ServiceMode;
	csrfToken: string;
	expiresAt: Date;
};

export async function createSession(cookies: Cookies, modeOverride?: ServiceMode) {
	const id = randomUUID();
	const secret = randomToken(32);
	const csrfToken = randomToken(24);
	const secretHash = hashSecret(secret);
	const mode = modeOverride ?? (await getServiceModeAt());
	const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);

	await db.query(
		`INSERT INTO chat_sessions (id, session_secret_hash, mode, csrf_token, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		[id, secretHash, mode, csrfToken, expiresAt]
	);
	cookies.set(SESSION_COOKIE, secret, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: secureCookies(),
		maxAge: SESSION_SECONDS
	});
	return { id, mode, csrfToken, expiresAt };
}

export async function requireSession(cookies: Cookies): Promise<ReporterSession | null> {
	const secret = cookies.get(SESSION_COOKIE);
	if (!secret) return null;
	const result = await db.query<{
		id: string;
		mode: ServiceMode;
		csrf_token: string;
		expires_at: Date;
	}>(
		`SELECT id, mode, csrf_token, expires_at FROM chat_sessions
		 WHERE session_secret_hash = $1 AND status = 'active' AND expires_at > now()`,
		[hashSecret(secret)]
	);
	const row = result.rows[0];
	if (!row) return null;
	return { id: row.id, mode: row.mode, csrfToken: row.csrf_token, expiresAt: row.expires_at };
}

export async function endSession(cookies: Cookies) {
	const secret = cookies.get(SESSION_COOKIE);
	if (secret) {
		await transaction(async (client) => {
			const found = await client.query<{ id: string }>('SELECT id FROM chat_sessions WHERE session_secret_hash = $1', [hashSecret(secret)]);
			const sessionId = found.rows[0]?.id;
			if (!sessionId) return;
			await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [sessionId]);
			await client.query("UPDATE chat_sessions SET status = 'ended', ended_at = now() WHERE id = $1 AND status = 'active'", [sessionId]);
			await client.query(
				`UPDATE chat_handoffs SET status = 'cancelled', closed_at = now(), close_reason = 'session_ended'
				 WHERE session_id = $1 AND status IN ('waiting', 'active')`, [sessionId]
			);
		});
	}
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export function hasValidCsrf(request: Request, session: ReporterSession) {
	const token = request.headers.get('x-csrf-token');
	return Boolean(token) && token === session.csrfToken;
}

export { requestOriginAllowed } from './request-security';
