import { contract } from '@app/contract';
import { createApp } from './app.ts';
import type { Env } from './env.ts';
import { runWeeklyJob } from './menu/job.ts';
import { router } from './router.ts';

const app = createApp({ contract, router, resourceName: 'Cosa si mangia' });

export default {
	fetch: (request, env) => app.fetch(request, env),
	// Hourly Cron Trigger: the weekly job (spec section 4).
	scheduled: async (controller, env) => {
		await runWeeklyJob(env.HYPERDRIVE.connectionString, new Date(controller.scheduledTime));
	},
} satisfies ExportedHandler<Env>;
