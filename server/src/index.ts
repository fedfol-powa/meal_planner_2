import { contract } from '@app/contract';
import { createApp } from './app.ts';
import type { Env } from './env.ts';
import { router } from './router.ts';
import { dispatchScheduled } from './scheduled.ts';

const app = createApp({ contract, router, resourceName: 'Cosa si mangia' });

export default {
	fetch: (request, env) => app.fetch(request, env),
	// Cron Triggers: hourly weekly job (spec section 4) and nightly export (section 8).
	scheduled: (controller, env) => dispatchScheduled(controller.cron, env, new Date(controller.scheduledTime)),
} satisfies ExportedHandler<Env>;
