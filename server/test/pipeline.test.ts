import { checkContract } from '@app/contract';
import { call, ORPCError } from '@orpc/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KeySourceError } from '../src/auth.ts';
import { mapErrors } from '../src/errors.ts';
import type { RequestContext } from '../src/pipeline.ts';
import { router } from '../src/router.ts';
import { contextFor } from './support/context.ts';
import { hasDatabase, setupDatabase, type TestDatabase } from './support/db.ts';
import { createTestKeys, type TestKeys } from './support/keys.ts';
import { preparedCalls, testContract, testHandlerCalls, testRouter } from './support/test-contract.ts';

let keys: TestKeys;
beforeAll(async () => {
	keys = await createTestKeys();
});

const options = (context: RequestContext) => ({ context, interceptors: [mapErrors] });

async function errorOf(promise: Promise<unknown>): Promise<ORPCError<string, unknown>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error('expected an error');
}

const familyId = '22222222-2222-4222-8222-222222222222';
const userId = '11111111-1111-4111-8111-111111111111';

describe('conventions', () => {
	it('the test contract follows them too', () => {
		expect(checkContract(testContract)).toEqual([]);
	});

	it('validates input and output around the whole request path', () => {
		// Index 0 means before the first middleware runs and after it returns, so even an
		// answer given without the handler (the `unchanged` short-circuit) is validated.
		const procedures = [router.session.whoami, ...Object.values(router.shopping), ...Object.values(testRouter.test)];
		for (const procedure of procedures) {
			expect(procedure['~orpc'].inputValidationIndex).toBeLessThanOrEqual(0);
			expect(procedure['~orpc'].outputValidationIndex).toBeLessThanOrEqual(0);
		}
	});
});

describe('request path without database', () => {
	// Every case below would fail with `internal` if it reached the (unreachable) database.
	it('rejects a missing or malformed token with unauthorized', async () => {
		for (const token of [undefined, 'not-a-jwt']) {
			const error = await errorOf(call(router.session.whoami, {}, options(contextFor(keys, token))));
			expect(error.code).toBe('unauthorized');
			expect(error.status).toBe(401);
		}
	});

	it('rejects tokens with invalid claims before the database', async () => {
		const tokens = [
			await keys.sign({ sub: userId }, { noExpiry: true }),
			await keys.sign({ sub: userId, session_id: 'not-a-uuid' }),
			await keys.sign({ sub: userId, session_id: undefined }),
			await keys.sign({ sub: userId, client_id: '' }),
			await keys.sign({ sub: userId, client_id: false }),
		];
		for (const token of tokens) {
			expect((await errorOf(call(router.session.whoami, {}, options(contextFor(keys, token))))).code).toBe('unauthorized');
		}
	});

	it('turns a key source outage into internal, not unauthorized', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const context = contextFor(keys, await keys.sign({ sub: userId }));
			context.verify = async () => {
				throw new KeySourceError('JWKS unavailable: 503');
			};
			const error = await errorOf(call(router.session.whoami, {}, options(context)));
			expect(error.code).toBe('internal');
			expect(error.status).toBe(500);
			expect(JSON.stringify(log.mock.calls)).toContain('KeySourceError');
		} finally {
			log.mockRestore();
		}
	});

	it('validates the input before anything else', async () => {
		const token = await keys.sign({ sub: userId });
		const error = await errorOf(call(testRouter.test.member, { familyId: 'nope' }, options(contextFor(keys, token))));
		expect(error.code).toBe('invalid');
		expect(error.data).toMatchObject({ issues: [{ path: ['familyId'] }] });
	});

	it('turns an unreachable database into internal without leaking the connection string', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const token = await keys.sign({ sub: userId });
		const context = contextFor(keys, token);
		const error = await errorOf(call(router.session.whoami, {}, options(context)));
		expect(error.code).toBe('internal');
		expect(error.data).toEqual({ requestId: context.requestId });
		expect(JSON.stringify(error.toJSON())).not.toContain('secret');
		expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
		log.mockRestore();
	});
});

describe.skipIf(!hasDatabase)('request path with database', () => {
	let db: TestDatabase;
	const asUser = async (user: { userId: string; sessionId: string }, extra: Record<string, unknown> = {}) =>
		contextFor(keys, await keys.sign({ sub: user.userId, session_id: user.sessionId, ...extra }), db.appServerUrl);

	beforeAll(async () => {
		db = await setupDatabase();
	});
	afterAll(() => db?.close());

	it('answers whoami with the profile language', async () => {
		const user = await db.createUser({ locale: 'en-GB' });
		const result = await call(router.session.whoami, {}, options(await asUser(user)));
		expect(result).toEqual({ userId: user.userId, channel: 'web', clientId: null, locale: 'en-GB' });
	});

	it('rejects an ended session or a deleted account', async () => {
		const ended = await db.createUser();
		await db.endSession(ended.sessionId);
		expect((await errorOf(call(router.session.whoami, {}, options(await asUser(ended))))).code).toBe('unauthorized');
		const deleted = await db.createUser();
		const context = await asUser(deleted);
		await db.deleteUser(deleted.userId);
		expect((await errorOf(call(router.session.whoami, {}, options(context)))).code).toBe('unauthorized');
	});

	it('checks the session before answering web_only', async () => {
		const admin = await db.createUser({ locale: 'en-GB' });
		const id = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
		const agent = await asUser(admin, { client_id: 'codex' });
		const error = await errorOf(call(testRouter.test.removeFamily, { familyId: id }, options(agent)));
		expect(error.code).toBe('web_only');
		expect(error.data).toEqual({ url: `https://app.test/family/${id}/delete` });
		expect(agent.state.locale).toBe('en-GB');

		const revoked = await db.createUser();
		const revokedAgent = await asUser(revoked, { client_id: 'codex' });
		await db.endSession(revoked.sessionId);
		expect((await errorOf(call(testRouter.test.removeFamily, { familyId: id }, options(revokedAgent)))).code).toBe('unauthorized');
	});

	it('checks family membership and family administration', async () => {
		const admin = await db.createUser();
		const member = await db.createUser();
		const stranger = await db.createUser();
		const id = await db.createFamily([{ userId: admin.userId, role: 'family_admin' }, { userId: member.userId, role: 'member' }]);
		await expect(call(testRouter.test.member, { familyId: id }, options(await asUser(member)))).resolves.toEqual({ ok: true });
		await expect(call(testRouter.test.admin, { familyId: id }, options(await asUser(admin)))).resolves.toEqual({ ok: true });
		expect((await errorOf(call(testRouter.test.admin, { familyId: id }, options(await asUser(member))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.member, { familyId: id }, options(await asUser(stranger))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.member, { familyId }, options(await asUser(member))))).code).toBe('forbidden');
	});

	it('checks global roles', async () => {
		const curator = await db.createUser();
		const appAdmin = await db.createUser();
		await db.grantGlobalRole(curator.userId, 'recipe_curator');
		await db.grantGlobalRole(appAdmin.userId, 'app_admin');
		await expect(call(testRouter.test.curator, {}, options(await asUser(curator)))).resolves.toEqual({ ok: true });
		await expect(call(testRouter.test.appAdmin, {}, options(await asUser(appAdmin)))).resolves.toEqual({ ok: true });
		expect((await errorOf(call(testRouter.test.appAdmin, {}, options(await asUser(curator))))).code).toBe('forbidden');
		expect((await errorOf(call(testRouter.test.curator, {}, options(await asUser(appAdmin))))).code).toBe('forbidden');
	});

	it('runs prepare in the user transaction before the version, with its version part', async () => {
		const member = await db.createUser();
		const id = await db.createFamily([{ userId: member.userId, role: 'member' }]);
		const clock = () => new Date('2026-10-14T10:00:00Z');
		const context = contextFor(keys, await keys.sign({ sub: member.userId, session_id: member.sessionId }), db.appServerUrl, clock);
		const first = await call(testRouter.test.preparedView, { familyId: id }, { context, path: ['test', 'preparedView'] });
		const [{ v }] = await db.admin<{ v: string }[]>`select data_version::text as v from app.families where id = ${id}`;
		expect(first.version).toContain(`f${id}:${v}`); // read after prepare's write
		expect(first.version.endsWith('.t2026-10-14')).toBe(true);
		expect(preparedCalls).toContain(member.userId);
	});

	it('answers an error of prepare even with a known version, and skips prepare when the role fails', async () => {
		const member = await db.createUser();
		const id = await db.createFamily([{ userId: member.userId, role: 'member' }]);
		const ctx = async (user: { userId: string; sessionId: string }) => ({ context: await asUser(user), path: ['test', 'preparedView'], interceptors: [mapErrors] });
		const { version } = await call(testRouter.test.preparedView, { familyId: id }, await ctx(member));
		const refused = await errorOf(call(testRouter.test.preparedView, { familyId: id, fail: true, knownVersion: version }, await ctx(member)));
		expect(refused.code).toBe('invalid');

		const stranger = await db.createUser();
		const error = await errorOf(call(testRouter.test.preparedView, { familyId: id }, await ctx(stranger)));
		expect(error.code).toBe('forbidden');
		expect(preparedCalls).not.toContain(stranger.userId);
	});

	it('answers unchanged without running the handler, and fresh data after a change', async () => {
		const user = await db.createUser();
		const id = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		const first = await call(testRouter.test.familyView, { familyId: id }, options(await asUser(user)));
		expect(first.unchanged).toBe(false);
		const calls = testHandlerCalls.familyView;
		const second = await call(testRouter.test.familyView, { familyId: id, knownVersion: first.version }, options(await asUser(user)));
		expect(second).toEqual({ unchanged: true, version: first.version });
		expect(testHandlerCalls.familyView).toBe(calls);
		await db.bumpFamily(id);
		const third = await call(testRouter.test.familyView, { familyId: id, knownVersion: first.version }, options(await asUser(user)));
		expect(third.unchanged).toBe(false);
		expect(third.version).not.toBe(first.version);
	});

	it('never reuses a version across families or languages', async () => {
		// Every write happens before the first read: between the reads only the family or
		// the language differs, never a counter.
		const user = await db.createUser();
		const english = await db.createUser({ locale: 'en-GB' });
		const a = await db.createFamily([{ userId: user.userId, role: 'member' }, { userId: english.userId, role: 'member' }]);
		const b = await db.createFamily([{ userId: user.userId, role: 'member' }]);
		const viewA = await call(testRouter.test.familyView, { familyId: a }, options(await asUser(user)));
		const viewB = await call(testRouter.test.familyView, { familyId: b, knownVersion: viewA.version }, options(await asUser(user)));
		expect(viewB.unchanged).toBe(false);
		const viewEnglish = await call(testRouter.test.familyView, { familyId: a, knownVersion: viewA.version }, options(await asUser(english)));
		expect(viewEnglish.unchanged).toBe(false);
		// Same family and counters: the Italian reader still holds a current version.
		const again = await call(testRouter.test.familyView, { familyId: a, knownVersion: viewA.version }, options(await asUser(user)));
		expect(again).toEqual({ unchanged: true, version: viewA.version });
	});
});
