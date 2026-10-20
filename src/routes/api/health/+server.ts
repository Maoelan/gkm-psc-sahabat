import { json } from '@sveltejs/kit';
import { isAiEnabled, env } from '../../../lib/server/env';
import { db } from '../../../lib/server/db';

export async function GET() {
	try {
		await db.query('SELECT 1');
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
