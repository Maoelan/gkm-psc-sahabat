import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';
import { hashSecret } from './lib/server/crypto';
import { allowAttempt } from './lib/server/rate-limit';
import { boundedRequest, RequestBodyError, requestOriginAllowed } from './lib/server/request-security';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();
	let resolvedEvent = event;
	let rejected: Response | undefined;
	const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method);
	if (mutation) {
		if (!requestOriginAllowed(event.request)) {
			rejected = Response.json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
		} else {
			let address = 'unavailable';
			try { address = event.getClientAddress(); } catch { /* Unsupported adapters share a conservative bucket. */ }
			const clientKey = hashSecret(address);
			const path = event.url.pathname;
			const limit = path === '/api/chat/session' ? 12 : path === '/masuk' ? 20 : path === '/api/chat/draft' ? 60 : 180;
			if (!allowAttempt(`write:${clientKey}`, 240, 10 * 60_000) ||
				!allowAttempt(`route:${clientKey}:${path}`, limit, 10 * 60_000)) {
				rejected = Response.json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' }, { status: 429, headers: { 'Retry-After': '600' } });
			} else {
				try { resolvedEvent = { ...event, request: await boundedRequest(event.request) }; }
				catch (error) {
					if (!(error instanceof RequestBodyError)) throw error;
					rejected = Response.json({ error: error.message }, { status: error.status });
				}
			}
		}
	}
	const response = rejected ?? await resolve(resolvedEvent);

	response.headers.set('Cache-Control', 'no-store, max-age=0');
	// Keep the Origin on same-origin native form POSTs; external sites receive no referrer.
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	response.headers.set(
		'Permissions-Policy',
		'browsing-topics=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()'
	);
	response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
	if (event.url.protocol === 'https:') response.headers.set('Strict-Transport-Security', 'max-age=31536000');

	return response;
};

export const handleError: HandleServerError = ({ event, kind }) => {
	if (kind !== 'unknown') return;
	console.error('Permintaan gagal.', { requestId: event.locals.requestId });
	return { message: 'Terjadi gangguan layanan. Coba lagi nanti.' };
};
