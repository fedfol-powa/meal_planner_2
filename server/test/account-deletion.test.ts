import type { Contract } from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { finishAccountDeletion } from '../src/account/delete.ts';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { onlyAppAdmins } from './support/app-admins.ts';
import { hasDatabase } from './support/db.ts';
import { installFakeAuth } from './support/fake-auth.ts';
import { holdTransaction } from './support/hold.ts';
import { mcp, rest, rpcClient, toolBody } from './support/requests.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;

describe.skipIf(!hasDatabase)('account and user deletion', () => {
	let actors: Actors;
	let auth: ReturnType<typeof installFakeAuth>;
	let restore: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		actors = await setupActors();
		auth = installFakeAuth(actors.db);
	});
	afterEach(async () => {
		await restore?.();
		restore = undefined;
		auth.calls.length = 0;
	});
	afterAll(async () => {
		auth?.restore();
		await actors?.close();
	});

	const inAuth = async (userId: string) =>
		(await actors.db.admin<{ n: number }[]>`select count(*)::int as n from auth.users where id = ${userId}`)[0]!.n === 1;
	const deletionRow = async (userId: string) =>
		(await actors.db.admin<{ attempts: number; completed: boolean; requested_by: string }[]>`
			select attempts, completed_at is not null as completed, requested_by from app.account_deletions where user_id = ${userId}`)[0];
	const familyExists = async (familyId: string) =>
		(await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.families where id = ${familyId}`)[0]!.n === 1;
	const appAdmin = async () => {
		const person = await actors.user();
		await actors.db.grantGlobalRole(person.userId, 'app_admin');
		return person;
	};
	/** An app administrator as an agent: its token carries a client_id. */
	const agentOf = async (person: Actor) => {
		const token = await actors.keys.sign({ sub: person.userId, session_id: person.sessionId, client_id: 'test-agent' });
		return token;
	};

	describe('account', () => {
		it('the plan says what happens to each family, with the connected agents', async () => {
			const a = await actors.user();
			const b = await actors.user();
			const stays = await actors.db.createFamily([{ userId: b.userId, role: 'family_admin' }, { userId: a.userId, role: 'member' }]);
			const needs = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }, { userId: b.userId, role: 'member' }]);
			const deleted = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }]);
			await a.client.familyInvitations.create({ familyId: needs, id: crypto.randomUUID() });
			const plan = await a.client.account.getDeletionPlan({});
			const outcome = Object.fromEntries(plan.families.map((f) => [f.familyId, f.outcome]));
			expect(outcome).toEqual({ [stays]: 'stays', [needs]: 'needs_successor', [deleted]: 'deleted' });
			expect(plan.families.find((f) => f.familyId === needs)!.candidates.map((c) => c.userId)).toEqual([b.userId]);
			expect(plan).toMatchObject({ lastAppAdmin: false, openInvitations: 1, pending: false, connectedAgents: 0 });
		});

		it('deletes: the row is closed, the account gone, the issued token refused on RPC, REST and MCP', async () => {
			const a = await actors.user();
			const b = await actors.user();
			const shared = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }, { userId: b.userId, role: 'member' }]);
			const own = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }]);
			expect(await a.client.account.delete({ successors: { [shared]: b.userId }, deletedFamilies: [own] })).toEqual({ completed: true });
			expect(await inAuth(a.userId)).toBe(false);
			expect(await deletionRow(a.userId)).toMatchObject({ completed: true, requested_by: a.userId });
			expect(await familyExists(own)).toBe(false);
			const [{ role }] = await actors.db.admin<{ role: string }[]>`select role from app.family_members where family_id = ${shared} and user_id = ${b.userId}`;
			expect(role).toBe('family_admin');
			expect((await errorOf(a.client.profile.get({}))).code).toBe('unauthorized');
			expect((await rest(actors.app, actors.env, 'GET', '/api/profile', a.token)).status).toBe(401);
			expect((await mcp(actors.app, actors.env, await agentOf(a), 'tools/list')).status).toBe(401);
			expect(auth.calls).toContain('DELETE id');
		});

		it('conflict after someone joins a sole-member family', async () => {
			const a = await actors.user();
			const own = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }]);
			const { url } = await a.client.familyInvitations.create({ familyId: own, id: crypto.randomUUID() });
			const plan = await a.client.account.getDeletionPlan({});
			const c = await actors.user();
			await c.client.family.join({ token: url.split('#')[1]! });
			const error = await errorOf(a.client.account.delete({ successors: {}, deletedFamilies: plan.families.map((f) => f.familyId) }));
			expect(error.code).toBe('conflict');
			expect(await inAuth(a.userId)).toBe(true);
			expect(await deletionRow(a.userId)).toBeUndefined();
		});

		it('a missing successor is invalid on successors', async () => {
			const a = await actors.user();
			const b = await actors.user();
			await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }, { userId: b.userId, role: 'member' }]);
			const error = await errorOf(a.client.account.delete({ successors: {}, deletedFamilies: [] }));
			expect([error.code, error.data]).toEqual(['invalid', { issues: [{ path: ['successors'], code: 'successor' }] }]);
		});

		it('MCP with a family to delete answers web_only and writes nothing', async () => {
			const a = await actors.user();
			const own = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }]);
			const call = await mcp(actors.app, actors.env, await agentOf(a), 'tools/call', {
				name: 'account_delete', arguments: { successors: {}, deletedFamilies: [own] },
			});
			expect(toolBody(call)).toMatchObject({ code: 'web_only', data: { url: 'https://app.test/profile/account/delete' } });
			expect(await familyExists(own)).toBe(true);
			expect(await deletionRow(a.userId)).toBeUndefined();
		});

		it('MCP without families to delete deletes', async () => {
			const a = await actors.user();
			const call = await mcp(actors.app, actors.env, await agentOf(a), 'tools/call', { name: 'account_delete', arguments: { successors: {}, deletedFamilies: [] } });
			expect(toolBody(call)).toEqual({ completed: true });
			expect(await inAuth(a.userId)).toBe(false);
		});

		it('Auth failure answers completed false and leaves the row pending; the account is unusable', async () => {
			const a = await actors.user();
			auth.failNextDelete(500);
			expect(await a.client.account.delete({ successors: {}, deletedFamilies: [] })).toEqual({ completed: false });
			expect(await deletionRow(a.userId)).toMatchObject({ attempts: 1, completed: false });
			expect(await inAuth(a.userId)).toBe(true);
			expect((await errorOf(a.client.profile.get({}))).code).toBe('unauthorized');
			const [{ last_error }] = await actors.db.admin<{ last_error: string }[]>`select last_error from app.account_deletions where user_id = ${a.userId}`;
			expect(last_error).toBe('status_500');
		});

		it('MCP answers web_only when the family composition changes while waiting for the lock', async () => {
			const a = await actors.user();
			const b = await actors.user();
			const shared = await actors.db.createFamily([{ userId: a.userId, role: 'family_admin' }, { userId: b.userId, role: 'family_admin' }]);
			const held = await holdTransaction(adminUrl, async (tx) => {
				await tx`select pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`;
			});
			// The plan read first says the family stays: no shortcut; then the request waits on the lock.
			const answer = mcp(actors.app, actors.env, await agentOf(a), 'tools/call', { name: 'account_delete', arguments: { successors: {}, deletedFamilies: [] } });
			await new Promise((r) => setTimeout(r, 300));
			await b.client.family.leave({ familyId: shared });
			await held.release();
			expect(toolBody(await answer)).toMatchObject({ code: 'web_only', data: { url: 'https://app.test/profile/account/delete' } });
			expect(await familyExists(shared)).toBe(true);
			expect(await inAuth(a.userId)).toBe(true);
			expect(await deletionRow(a.userId)).toBeUndefined();
		});
	});

	describe('administration', () => {
		it('own account: not_allowed own_account on the plan and the deletion', async () => {
			const admin = await appAdmin();
			for (const error of [
				await errorOf(admin.client.users.getDeletionPlan({ id: admin.userId })),
				await errorOf(admin.client.users.delete({ id: admin.userId, successors: {}, deletedFamilies: [] })),
			]) {
				expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'own_account' }]);
			}
		});

		it('plan in the third person, unknown user not_found, plain users forbidden', async () => {
			const admin = await appAdmin();
			const target = await actors.user();
			const plan = await admin.client.users.getDeletionPlan({ id: target.userId });
			expect(plan.user).toMatchObject({ id: target.userId, email: `${target.userId}@test.local` });
			expect((await errorOf(admin.client.users.getDeletionPlan({ id: crypto.randomUUID() }))).code).toBe('not_found');
			expect((await errorOf(target.client.users.getDeletionPlan({ id: admin.userId }))).code).toBe('forbidden');
		});

		it('the last app admin: a demoted administrator is refused, the last one cannot delete itself', async () => {
			const a = await appAdmin();
			const b = await appAdmin();
			restore = await onlyAppAdmins(actors.db.admin, [a.userId, b.userId]);
			await a.client.users.setRole({ id: a.userId, role: 'app_admin', granted: false });
			expect((await errorOf(a.client.users.delete({ id: b.userId, successors: {}, deletedFamilies: [] }))).code).toBe('forbidden');
			expect((await errorOf(b.client.account.delete({ successors: {}, deletedFamilies: [] }))).code).toBe('last_app_admin');
			expect((await b.client.account.getDeletionPlan({})).lastAppAdmin).toBe(true);
		});

		it('users.delete deletes another user; after completion it answers completed true', async () => {
			const admin = await appAdmin();
			const target = await actors.user();
			expect(await admin.client.users.delete({ id: target.userId, successors: {}, deletedFamilies: [] })).toEqual({ completed: true });
			expect(await deletionRow(target.userId)).toMatchObject({ completed: true, requested_by: admin.userId });
			expect(await admin.client.users.delete({ id: target.userId, successors: {}, deletedFamilies: [] })).toEqual({ completed: true });
			expect((await errorOf(admin.client.users.delete({ id: crypto.randomUUID(), successors: {}, deletedFamilies: [] }))).code).toBe('not_found');
		});

		it('an account born from an app invitation leaves its email in no invitation, also in the admin list', async () => {
			const admin = await appAdmin();
			const email = `p${crypto.randomUUID().slice(0, 8)}@x.it`;
			const { invitation, url } = await admin.client.appInvitations.create({ id: crypto.randomUUID(), email, roles: [] });
			const anonymous = rpcClient<ContractRouterClient<Contract>>(actors.app, actors.env);
			await anonymous.appInvitations.accept({ token: url.split('#')[1]!, email, displayName: 'Giulia', locale: 'it-IT' });
			const [user] = await actors.db.admin<{ id: string }[]>`select id from auth.users where email = ${email}`;
			expect(await admin.client.users.delete({ id: user!.id, successors: {}, deletedFamilies: [] })).toEqual({ completed: true });
			expect(await actors.db.admin`select id from app.app_invitations where email = ${email}`).toHaveLength(0);
			const { invitations } = await admin.client.appInvitations.list({});
			expect(invitations.find((i) => i.id === invitation.id)).toMatchObject({ email: null, status: 'accepted', acceptedByName: null });
			expect(JSON.stringify(invitations)).not.toContain(email);
		});

		it('users.delete on a pending row repeats only the Auth step; list and get carry the deletion', async () => {
			const admin = await appAdmin();
			const target = await actors.user();
			const family = await actors.db.createFamily([{ userId: target.userId, role: 'family_admin' }]);
			auth.failNextDelete('network');
			expect(await admin.client.users.delete({ id: target.userId, successors: {}, deletedFamilies: [family] })).toEqual({ completed: false });
			const detail = await admin.client.users.get({ id: target.userId });
			expect(detail.user.deletion).toMatchObject({ attempts: 1 });
			const listed = await admin.client.users.list({ query: target.userId.slice(0, 8) });
			expect(listed.users.find((u) => u.id === target.userId)?.deletion).toMatchObject({ attempts: 1 });
			// The page shows no family any more: the plan is empty, and the repeat goes straight to Auth.
			expect(await admin.client.users.delete({ id: target.userId, successors: {}, deletedFamilies: [] })).toEqual({ completed: true });
			expect(await inAuth(target.userId)).toBe(false);
			expect((await admin.client.users.get({ id: admin.userId })).user.deletion).toBeNull();
		});

		it('an app invitation for the email of a pending account answers account_exists', async () => {
			const admin = await appAdmin();
			const target = await actors.user();
			auth.failNextDelete(503);
			await admin.client.users.delete({ id: target.userId, successors: {}, deletedFamilies: [] });
			const error = await errorOf(admin.client.appInvitations.create({ id: crypto.randomUUID(), email: `${target.userId}@test.local`, roles: [] }));
			expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
		});

		it('MCP users.delete answers web_only when the family composition changes while waiting for the lock', async () => {
			const admin = await appAdmin();
			const target = await actors.user();
			const other = await actors.user();
			const shared = await actors.db.createFamily([{ userId: target.userId, role: 'family_admin' }, { userId: other.userId, role: 'family_admin' }]);
			const held = await holdTransaction(adminUrl, async (tx) => {
				await tx`select pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0))`;
			});
			const answer = mcp(actors.app, actors.env, await agentOf(admin), 'tools/call', {
				name: 'users_delete', arguments: { id: target.userId, successors: {}, deletedFamilies: [] },
			});
			await new Promise((r) => setTimeout(r, 300));
			await other.client.family.leave({ familyId: shared });
			await held.release();
			expect(toolBody(await answer)).toMatchObject({ code: 'web_only', data: { url: `https://app.test/admin/users/${target.userId}/delete` } });
			expect(await familyExists(shared)).toBe(true);
			expect(await inAuth(target.userId)).toBe(true);
		});

		it('roles cannot be granted to a pending account and the last app admin survives the resume', async () => {
			const a = await appAdmin();
			const b = await appAdmin();
			restore = await onlyAppAdmins(actors.db.admin, [a.userId, b.userId]);
			auth.failNextDelete(500);
			expect(await a.client.account.delete({ successors: {}, deletedFamilies: [] })).toEqual({ completed: false });
			expect((await errorOf(b.client.users.setRole({ id: a.userId, role: 'app_admin', granted: true }))).code).toBe('not_found');
			const viaMcp = await mcp(actors.app, actors.env, await agentOf(b), 'tools/call', { name: 'users_setRole', arguments: { id: a.userId, role: 'app_admin', granted: true } });
			expect(toolBody(viaMcp).code).toBe('not_found');
			expect((await errorOf(b.client.users.setRole({ id: b.userId, role: 'app_admin', granted: false }))).code).toBe('last_app_admin');
			expect(await finishAccountDeletion(actors.env, a.userId)).toBe(true);
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.user_roles where role = 'app_admin' and user_id = ${b.userId}`;
			expect(n).toBe(1);
			expect(await inAuth(a.userId)).toBe(false);
		});

		it('MCP tools ask for confirmation', async () => {
			const admin = await appAdmin();
			const tools: { name: string; description: string }[] = (await mcp(actors.app, actors.env, await agentOf(admin), 'tools/list')).body.result.tools;
			for (const name of ['account_getDeletionPlan', 'account_delete', 'users_getDeletionPlan', 'users_delete']) {
				expect(tools.map((t) => t.name)).toContain(name);
			}
			expect(tools.find((t) => t.name === 'users_delete')!.description).toMatch(/confirmation/);
			expect(tools.find((t) => t.name === 'account_delete')!.description).toMatch(/confirm/);
		});
	});
});
