import type { Handle } from '@sveltejs/kit/hooks';
import { randomUUID } from 'node:crypto';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.requestId = randomUUID();
	const response = await resolve(event);

	response.headers.set('Cache-Control', 'no-store, max-age=0');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	response.headers.set(
		'Permissions-Policy',
		'browsing-topics=(), camera=(), geolocation=(), microphone=(), payment=(), usb=()'
	);
	response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

	return response;
};
