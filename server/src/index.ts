import { contract } from '@app/contract';
import { createApp } from './app.ts';
import type { Env } from './env.ts';
import { router } from './router.ts';

const app = createApp({ contract, router, resourceName: 'Cosa si mangia' });

export default {
	fetch: (request, env) => app.fetch(request, env),
} satisfies ExportedHandler<Env>;
