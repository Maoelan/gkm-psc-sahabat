import { dev } from '$app/env';
import { getServiceModeAt } from '../../lib/server/service-mode';
import { isAiEnabled } from '../../lib/server/env';
import type { ServiceMode } from '../../lib/service-mode';

export async function load({ url }) {
	let serviceMode = await getServiceModeAt();
	if (dev) {
		const override = url.searchParams.get('mode');
		if (override === 'operator' || override === 'ai' || override === 'unavailable') {
			serviceMode = override satisfies ServiceMode;
		}
	}
	return { serviceMode, aiEnabled: isAiEnabled() };
}
