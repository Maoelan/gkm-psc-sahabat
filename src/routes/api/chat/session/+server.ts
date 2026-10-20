import { json } from '@sveltejs/kit';
import { dev } from '$app/env';
import { modeCopy, type ServiceMode } from '../../../../lib/service-mode';
import { isAiEnabled } from '../../../../lib/server/env';
import {
	createSession,
	endSession,
	requestOriginAllowed,
	type ReporterSession
} from '../../../../lib/server/session';

function demoMode(url: URL): ServiceMode | undefined {
	if (!dev) return undefined;
	const value = url.searchParams.get('mode');
	return value === 'operator' || value === 'ai' || value === 'unavailable' ? value : undefined;
}

export async function POST({ cookies, request, url }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	try {
		await endSession(cookies);
		const session: ReporterSession = await createSession(cookies, demoMode(url));
		return json(
			{
				mode: session.mode,
				modeLabel: modeCopy(session.mode, isAiEnabled()).label,
				assistantLabel: modeCopy(session.mode, isAiEnabled()).assistantLabel,
				aiEnabled: isAiEnabled(),
				csrfToken: session.csrfToken,
				expiresAt: session.expiresAt.toISOString()
			},
			{ status: 201 }
		);
	} catch {
		return json({ error: 'Sesi tidak dapat dibuat. Coba lagi.' }, { status: 503 });
	}
}

export async function DELETE({ cookies, request }) {
	if (!requestOriginAllowed(request)) {
		return json({ error: 'Permintaan lintas situs ditolak.' }, { status: 403 });
	}
	try {
		await endSession(cookies);
		return new Response(null, { status: 204 });
	} catch {
		return json({ error: 'Sesi tidak dapat diakhiri.' }, { status: 503 });
	}
}
