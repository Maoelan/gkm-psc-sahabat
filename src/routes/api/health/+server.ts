import { json } from '@sveltejs/kit';
import { isAiEnabled, env } from '../../../lib/server/env';
import { api, query } from '../../../lib/server/convex';

export async function GET() {
	try {
		await query(api.sessions.health, {});
		if (env.NODE_ENV === 'production') return json({ status: 'ok' });
		return json({
			status: 'ok',
			database: 'connected',
			aiConfigured: isAiEnabled(),
			aiProvider: 'nvidia',
			aiModel:
				env.NVIDIA_MODEL === 'nvidia/nemotron-3-ultra-550b-a55b'
					? 'nemotron-3-ultra'
					: 'configured',
			notificationProvider: env.WHATSAPP_PROVIDER || 'outbox'
		});
	} catch {
		if (env.NODE_ENV === 'production') return json({ status: 'degraded' }, { status: 503 });
		return json(
			{
				status: 'degraded',
				database: 'unavailable',
				aiConfigured: isAiEnabled(),
				notificationProvider: env.WHATSAPP_PROVIDER || 'outbox'
			},
			{ status: 503 }
		);
	}
}
