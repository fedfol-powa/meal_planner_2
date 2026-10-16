import { op, versionedInput, versionedOutput } from '@app/contract';
import { z } from 'zod';
import { appError } from '../../src/errors.ts';
import { AccountServiceError } from '../../src/accounts/index.ts';
import { afterCommit, createImplementer, fresh, publicContext } from '../../src/pipeline.ts';

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
		preparedView: op({ mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] })
			.route({ method: 'POST', path: '/test/prepared-view', summary: 'Versioned read with a prepare hook' })
			.input(versionedInput(family.extend({ fail: z.boolean().optional() })))
			.output(versionedOutput(z.object({ calls: z.number() }))),
		afterCommit: op({ mcp: false, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/after-commit', summary: 'Work after the commit' })
			.input(family.extend({ fail: z.boolean().optional(), malformed: z.boolean().optional() }))
			.output(z.object({ seen: z.number() })),
		deadlock: op({ mcp: false, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/deadlock', summary: 'Repeated once on 40P01' })
			.input(family)
			.output(z.object({ attempt: z.number() })),
		deadlockUnlisted: op({ mcp: false, offline: false, role: 'familyAdmin' })
			.route({ method: 'POST', path: '/test/deadlock-unlisted', summary: 'Never repeated' })
			.input(family)
			.output(z.object({ attempt: z.number() })),
		webAppOnly: op({ mcp: false, offline: false, role: 'user' })
			.route({ method: 'POST', path: '/test/web-app-only', summary: 'Not an MCP tool' }).input(empty).output(ok),
		open: op({ mcp: false, offline: false, role: 'public', rateLimit: 'read' })
			.route({ method: 'POST', path: '/test/open', summary: 'Public' })
			.input(z.object({ echo: z.string(), nested: z.boolean().optional() }))
			.output(z.object({ echo: z.string(), role: z.string(), openAtProbe: z.number() })),
	},
};

export const testHandlerCalls = { familyView: 0 };

/**
 * Set by the pipeline test to a read of pg_stat_activity on an admin connection: `anon` cannot
 * see the columns of app_server's sessions, so the count must not be read through anonDb.
 */
export let publicProbe: () => Promise<number> = async () => 0;
export function setPublicProbe(probe: () => Promise<number>): void {
	publicProbe = probe;
}

/** Set by the pipeline test: counts, on an admin connection, the weeks of the family on that Monday. */
export let commitProbe: (familyId: string, monday: string) => Promise<number> = async () => 0;
export function setCommitProbe(probe: typeof commitProbe): void {
	commitProbe = probe;
}

/** Drives test.deadlock: how many attempts fail with 40P01, and what happens in between. */
export const deadlockProbe = {
	attempts: 0,
	failures: 0,
	continuations: 0,
	failContinuation: false,
	betweenAttempts: async () => {},
	reset() {
		Object.assign(this, { attempts: 0, failures: 0, continuations: 0, failContinuation: false, betweenAttempts: async () => {} });
	},
};

export const preparedCalls: string[] = [];
let testMondays = 0;
/** A different Monday at each call, far from the menu tests' weeks. */
const nextTestMonday = () => new Date(Date.UTC(2030, 0, 7 + 7 * testMondays++)).toISOString().slice(0, 10);

const os = createImplementer(testContract, {
	retryOnDeadlock: ['test.deadlock'],
	prepare: {
		'test.preparedView': async (context, input) => {
			const { familyId, fail } = input as { familyId: string; fail?: boolean };
			if (fail) throw appError('invalid', { issues: [{ path: ['fail'], code: 'refused' }] });
			preparedCalls.push(context.userId);
			// A write in the user's transaction, before the version: it bumps the family counter.
			await context.tx`insert into app.weeks (family_id, starts_on) values (${familyId}, ${nextTestMonday()})`;
			return { versionPart: `t${context.now.toISOString().slice(0, 10)}` };
		},
	},
});
const done = () => ({ ok: true as const });

/** Writes a week, then fails with a real 40P01 while attempts are left to fail; the continuation counts itself. */
async function deadlockHandler({ context, input }: { context: Parameters<typeof fresh>[0]; input: { familyId: string } }) {
	const attempt = ++deadlockProbe.attempts;
	await context.tx`insert into app.weeks (family_id, starts_on) values (${input.familyId}, ${nextTestMonday()})`;
	if (attempt <= deadlockProbe.failures) {
		await deadlockProbe.betweenAttempts();
		await context.tx`do $$ begin raise exception 'deadlock detected' using errcode = '40P01'; end $$`;
	}
	return afterCommit(async () => {
		deadlockProbe.continuations++;
		if (deadlockProbe.failContinuation) throw Object.assign(new Error('deadlock detected'), { code: '40P01' });
		return { attempt };
	});
}

export const testRouter = os.router({
	test: {
		member: os.test.member.handler(done),
		admin: os.test.admin.handler(done),
		curator: os.test.curator.handler(done),
		appAdmin: os.test.appAdmin.handler(done),
		removeFamily: os.test.removeFamily.handler(done),
		familyView: os.test.familyView.handler(({ context }) => fresh(context, { calls: ++testHandlerCalls.familyView })),
		preparedView: os.test.preparedView.handler(({ context }) => fresh(context, { calls: ++testHandlerCalls.familyView })),
		afterCommit: os.test.afterCommit.handler(async ({ context, input }) => {
			const monday = nextTestMonday();
			await context.tx`insert into app.weeks (family_id, starts_on) values (${input.familyId}, ${monday})`;
			return afterCommit(async () => {
				if (input.fail) throw new AccountServiceError('auth_admin_failed', 503);
				const seen = await commitProbe(input.familyId, monday);
				return (input.malformed ? { seen: 'many' } : { seen }) as { seen: number };
			});
		}),
		deadlock: os.test.deadlock.handler(deadlockHandler),
		deadlockUnlisted: os.test.deadlockUnlisted.handler(deadlockHandler),
		webAppOnly: os.test.webAppOnly.handler(done),
		open: os.test.open.handler(async ({ context, input }) => {
			const ctx = publicContext(context);
			const [{ role }] = await ctx.anonDb((tx) => tx<{ role: string }[]>`select current_user as role`);
			// The probe runs where Auth would be called: outside any transaction, unless `nested`
			// deliberately holds one (the counter-check that the probe can see it).
			const openAtProbe = input.nested ? await ctx.anonDb(() => publicProbe()) : await publicProbe();
			return { echo: input.echo, role, openAtProbe };
		}),
	},
});
