import { beforeEach, describe, expect, it } from 'vitest';
import type { DemoDatabase } from '#lib/domain/types.ts';
import { createInitial } from '#lib/store/persistence.ts';
import type { OperationContext } from './context';
import { deleteUser, getUserAdmin, getUserDeletionPlan, listUsers, setUserRole } from './admin';
import { acceptAppInvitation, createAppInvitation, getAppInvitation, listAppInvitations, revokeAppInvitation } from './app-invitations';
import { authorizeAgent, disconnectAgent, listConnectedAgents } from './agents';
import { deleteAccount } from './account';

let db: DemoDatabase;
const ctx = (over: Partial<OperationContext> = {}): OperationContext => ({
	userId: 'user-federico', familyId: 'family-main', channel: 'web', now: '2026-10-06T12:00', offline: false, ...over
});
const as = (userId: string, over: Partial<OperationContext> = {}) => ctx({ userId, familyId: '', ...over });
const value = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
	if (!r.ok) throw new Error(r.error);
	return r.value;
};

beforeEach(() => {
	db = createInitial().db;
});

describe('users and roles', () => {
	it('is reserved to app administrators', () => {
		expect(listUsers(db, as('user-lucia'))).toEqual({ ok: false, error: 'forbidden' });
		expect(setUserRole(db, as('user-anna'), 'user-anna', 'recipe_curator', true)).toEqual({ ok: false, error: 'forbidden' });
	});

	it('lists and searches users by name or email', () => {
		expect(value(listUsers(db, ctx())).length).toBe(db.users.length);
		expect(value(listUsers(db, ctx(), 'LUCIA@')).map((u) => u.id)).toEqual(['user-lucia']);
	});

	it('shows families by name and role, without their contents', () => {
		const anna = value(getUserAdmin(db, ctx(), 'user-anna'));
		expect(anna.families).toEqual([{ name: 'Famiglia Folloni', role: 'member' }]);
	});

	it('gives and removes roles, never to the last app administrator', () => {
		value(setUserRole(db, ctx(), 'user-anna', 'recipe_curator', true));
		expect(db.users.find((u) => u.id === 'user-anna')!.globalRoles).toEqual(['recipe_curator']);
		expect(setUserRole(db, ctx(), 'user-federico', 'app_admin', false)).toEqual({ ok: false, error: 'last_app_admin' });
		expect(setUserRole(db, ctx({ channel: 'mcp' }), 'user-federico', 'app_admin', false)).toEqual({ ok: false, error: 'last_app_admin' });
		value(setUserRole(db, ctx(), 'user-lucia', 'app_admin', true));
		value(setUserRole(db, ctx(), 'user-federico', 'app_admin', false));
		expect(db.users.find((u) => u.id === 'user-federico')!.globalRoles).toEqual(['recipe_curator']);
	});

	it('is read only offline', () => {
		expect(setUserRole(db, ctx({ offline: true }), 'user-anna', 'recipe_curator', true)).toEqual({ ok: false, error: 'offline' });
	});
});

describe('deleting a user', () => {
	it('plans each family and asks for successors', () => {
		const plan = value(getUserDeletionPlan(db, ctx(), 'user-lucia'));
		expect(plan.families.map((f) => f.outcome)).toContain('needs_successor');
		expect(getUserDeletionPlan(db, ctx(), 'user-federico')).toEqual({ ok: false, error: 'not_allowed' });
	});

	it('deletes the user, their agents and the links they created', () => {
		const agents = db.connectedAgents.filter((a) => a.userId === 'user-lucia').length;
		expect(agents).toBeGreaterThan(0);
		const plan = value(getUserDeletionPlan(db, ctx(), 'user-lucia'));
		const successors = Object.fromEntries(plan.families.filter((f) => f.outcome === 'needs_successor').map((f) => [f.familyId, f.candidates[0].userId]));
		expect(deleteUser(db, ctx(), 'user-lucia', {})).toEqual({ ok: false, error: 'last_admin' });
		value(deleteUser(db, ctx(), 'user-lucia', successors));
		expect(db.users.some((u) => u.id === 'user-lucia')).toBe(false);
		expect(db.connectedAgents.some((a) => a.userId === 'user-lucia')).toBe(false);
	});

	it('through MCP only returns the web page when a family would be deleted', () => {
		const giuliaFamily = { ...structuredClone(db.families[0]), id: 'family-giulia', name: 'Giulia', members: [{ userId: 'user-giulia', role: 'family_admin' as const, joinedAt: '2026-10-01T10:00' }] };
		db.families.push(giuliaFamily);
		expect(deleteUser(db, ctx({ channel: 'mcp' }), 'user-giulia', {})).toEqual({ ok: false, error: 'web_only' });
		expect(db.users.some((u) => u.id === 'user-giulia')).toBe(true);
		expect(value(deleteUser(db, ctx(), 'user-giulia', {})).deletedFamilies).toEqual(['family-giulia']);
	});

	it('removes connected agents also when users delete their own account', () => {
		value(setUserRole(db, ctx(), 'user-lucia', 'app_admin', true));
		value(deleteAccount(db, ctx({ familyId: 'family-main' }), { 'family-main': 'user-anna' }));
		expect(db.connectedAgents.some((a) => a.userId === 'user-federico')).toBe(false);
	});
});

describe('app invitations', () => {
	it('creates a single-use link for one email, with optional roles', () => {
		const created = value(createAppInvitation(db, ctx(), ' Nuova@Example.com ', ['recipe_curator']));
		expect(created.status).toBe('created');
		const token = created.status === 'created' ? created.token : '';
		expect(getAppInvitation(db, as(''), token).status).toBe('valid');
		expect(getAppInvitation(db, as('user-anna'), token).status).toBe('wrong_email');
		expect(acceptAppInvitation(db, as('user-anna'), token)).toEqual({ ok: false, error: 'not_allowed' });

		db.users.push({ id: 'user-nuova', displayName: 'Nuova', email: 'nuova@example.com', locale: 'it-IT', globalRoles: [] });
		value(acceptAppInvitation(db, as('user-nuova'), token));
		expect(db.users.find((u) => u.id === 'user-nuova')!.globalRoles).toEqual(['recipe_curator']);
		expect(getAppInvitation(db, as('user-nuova'), token).status).toBe('accepted');
		expect(acceptAppInvitation(db, as('user-nuova'), token)).toEqual({ ok: false, error: 'not_allowed' });
	});

	it('rejects invalid emails and points to existing users', () => {
		expect(createAppInvitation(db, ctx(), 'not an email', [])).toEqual({ ok: false, error: 'invalid' });
		expect(value(createAppInvitation(db, ctx(), 'anna@example.com', []))).toEqual({ status: 'existing_user', userId: 'user-anna' });
	});

	it('expires after 7 days, can be revoked, and a new invitation replaces the pending one', () => {
		const first = value(createAppInvitation(db, ctx(), 'x@example.com', []));
		const second = value(createAppInvitation(db, ctx(), 'x@example.com', ['app_admin']));
		if (first.status !== 'created' || second.status !== 'created') throw new Error('expected links');
		expect(getAppInvitation(db, as(''), first.token).status).toBe('revoked');
		expect(getAppInvitation(db, as('', { now: '2026-10-13T12:01' }), second.token).status).toBe('expired');
		value(revokeAppInvitation(db, ctx(), second.token));
		expect(getAppInvitation(db, as(''), second.token).status).toBe('revoked');
	});

	it('lists demo invitations with their state, for admins only', () => {
		expect(value(listAppInvitations(db, ctx())).map((i) => i.status).sort()).toEqual(['accepted', 'expired', 'pending']);
		expect(listAppInvitations(db, as('user-anna'))).toEqual({ ok: false, error: 'forbidden' });
	});
});

describe('connected agents', () => {
	it('lists only the own agents and disconnects them', () => {
		const mine = value(listConnectedAgents(db, ctx()));
		expect(mine.map((a) => a.client).sort()).toEqual(['chatgpt', 'claude_code']);
		const lucias = db.connectedAgents.find((a) => a.userId === 'user-lucia')!;
		expect(disconnectAgent(db, ctx(), lucias.id)).toEqual({ ok: false, error: 'not_found' });
		value(disconnectAgent(db, ctx(), mine[0].id));
		expect(value(listConnectedAgents(db, ctx())).length).toBe(1);
	});

	it('authorises a client again by replacing the old access', () => {
		value(authorizeAgent(db, ctx({ now: '2026-10-06T13:00' }), 'claude_code'));
		const agents = value(listConnectedAgents(db, ctx()));
		expect(agents.filter((a) => a.client === 'claude_code')).toHaveLength(1);
		expect(agents.find((a) => a.client === 'claude_code')!.connectedAt).toBe('2026-10-06T13:00');
		expect(authorizeAgent(db, ctx({ offline: true }), 'codex')).toEqual({ ok: false, error: 'offline' });
		expect(authorizeAgent(db, as(''), 'codex')).toEqual({ ok: false, error: 'forbidden' });
	});
});
