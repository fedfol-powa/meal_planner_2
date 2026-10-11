import { op, versionedInput, versionedOutput } from '@app/contract';
import { z } from 'zod';
import { createImplementer, fresh } from '../../src/pipeline.ts';

const empty = z.object({});
const family = z.object({ familyId: z.uuid() });
const ok = z.object({ ok: z.literal(true) });

/** Operations that exercise the request path; never part of the published contract. */
export const testContract = {
	test: {
		member: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember' })
			.route({ method: 'POST', path: '/test/member', summary: 'Member only' }).input(family).output(ok),
		admin: op({ mcp: { readOnly: true }, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/admin', summary: 'Family admin only' }).input(family).output(ok),
		curator: op({ mcp: { readOnly: true }, offline: false, role: 'curator' })
			.route({ method: 'POST', path: '/test/curator', summary: 'Curator only' }).input(empty).output(ok),
		appAdmin: op({ mcp: { readOnly: true }, offline: false, role: 'appAdmin' })
			.route({ method: 'POST', path: '/test/app-admin', summary: 'App admin only' }).input(empty).output(ok),
		removeFamily: op({ mcp: { readOnly: false }, webOnly: { path: '/family/:familyId/delete' }, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/remove-family', summary: 'Web only' }).input(family).output(ok),
		familyView: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
			.route({ method: 'POST', path: '/test/family-view', summary: 'Versioned read' })
			.input(versionedInput(family))
			.output(versionedOutput(z.object({ calls: z.number() }))),
		webAppOnly: op({ mcp: false, offline: false, role: 'user' })
			.route({ method: 'POST', path: '/test/web-app-only', summary: 'Not an MCP tool' }).input(empty).output(ok),
	},
};

export const testHandlerCalls = { familyView: 0 };

const os = createImplementer(testContract);
const done = () => ({ ok: true as const });

export const testRouter = os.router({
	test: {
		member: os.test.member.handler(done),
		admin: os.test.admin.handler(done),
		curator: os.test.curator.handler(done),
		appAdmin: os.test.appAdmin.handler(done),
		removeFamily: os.test.removeFamily.handler(done),
		familyView: os.test.familyView.handler(({ context }) => fresh(context, { calls: ++testHandlerCalls.familyView })),
		webAppOnly: os.test.webAppOnly.handler(done),
	},
});
