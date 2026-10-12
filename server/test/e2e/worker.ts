// Worker for the agents end-to-end check only (scripts/oauth/agents-e2e.sh): the production app,
// same createApp, contract, router and pipeline, plus the test operations, among them a webOnly
// one, so real OAuth tokens meet the web_only check on MCP, RPC and REST. Never deployed.
import { contract } from '@app/contract';
import { createApp } from '../../src/app.ts';
import type { Env } from '../../src/env.ts';
import { router } from '../../src/router.ts';
import { testContract, testRouter } from '../support/test-contract.ts';

const app = createApp({ contract: { ...contract, ...testContract }, router: { ...router, ...testRouter }, resourceName: 'Cosa si mangia (e2e)' });

export default { fetch: (request, env) => app.fetch(request, env) } satisfies ExportedHandler<Env>;
