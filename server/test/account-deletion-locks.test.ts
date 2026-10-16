import type postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupActors, type Actors } from './support/actors.ts';
import { onlyAppAdmins } from './support/app-admins.ts';
import { hasDatabase } from './support/db.ts';
import { holdTransaction } from './support/hold.ts';
import { actAs, startTransaction, waitsOnLock } from './support/locks.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;
type Tx = postgres.TransactionSql;

describe.skipIf(!hasDatabase)('account deletion and the last app administrator under concurrency', () => {
	let actors: Actors;
	let restore: (() => Promise<void>) | undefined;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterEach(async () => {
		await restore?.();
		restore = undefined;
	});
	afterAll(() => actors?.close());

	const admins = async (count: number) => {
		const people: string[] = [];
		for (let i = 0; i < count; i++) {
			const person = await actors.user();
			await actors.db.grantGlobalRole(person.userId, 'app_admin');
			people.push(person.userId);
		}
		restore = await onlyAppAdmins(actors.db.admin, people);
		return people;
	};
	const appAdmins = async () =>
		(await actors.db.admin<{ user_id: string }[]>`select user_id from app.user_roles where role = 'app_admin'`).map((r) => r.user_id).sort();
	const rolesOf = async (userId: string) =>
		(await actors.db.admin<{ role: string }[]>`select role from app.user_roles where user_id = ${userId}`).map((r) => r.role);
	const deleteAccount = (userId: string) => (tx: Tx) => tx`select app.begin_account_deletion(${userId}::uuid, '{}'::jsonb, '{}'::uuid[])`;
	const setRole = (userId: string, granted: boolean) => (tx: Tx) => tx`select app.set_user_role(${userId}::uuid, 'app_admin', ${granted})`;

	async function race([firstUser, first]: [string, (tx: Tx) => Promise<unknown>], [secondUser, second]: [string, (tx: Tx) => Promise<unknown>], events?: string[]) {
		const held = await holdTransaction(adminUrl, async (tx) => {
			await actAs(tx, firstUser);
			await first(tx);
		});
		const other = startTransaction(adminUrl, async (tx) => {
			await actAs(tx, secondUser);
			await second(tx);
		});
		let waited = false;
		try {
			waited = await waitsOnLock(actors.db, await other.pid, events);
		} finally {
			await held.release();
		}
		return { waited, code: (await other.outcome).code };
	}

	it('two app admins deleting their own accounts: the second gets last_app_admin; one remains', async () => {
		const [a, b] = await admins(2);
		const result = await race([a!, deleteAccount(a!)], [b!, deleteAccount(b!)], ['advisory']);
		expect(result).toEqual({ waited: true, code: 'P0A08' });
		expect(await appAdmins()).toEqual([b]);
	});

	it('two app admins deleting each other: the second, already deleted, is refused; one remains', async () => {
		const [a, b] = await admins(2);
		const result = await race([a!, deleteAccount(b!)], [b!, deleteAccount(a!)], ['advisory']);
		expect(result).toEqual({ waited: true, code: '42501' });
		expect(await appAdmins()).toEqual([a]);
	});

	it('a deletion against set_user_role removing app_admin from the other, in both orders: one admin remains', async () => {
		{
			const [a, b] = await admins(2);
			const result = await race([a!, deleteAccount(a!)], [b!, setRole(a!, false)], ['advisory']);
			expect(result.waited).toBe(true);
			expect(await appAdmins()).toEqual([b]);
		}
		{
			const [a, b] = await admins(2);
			const result = await race([b!, setRole(a!, false)], [a!, deleteAccount(a!)], ['advisory']);
			expect(result).toEqual({ waited: true, code: undefined });
			expect(await appAdmins()).toEqual([b]);
		}
	});

	it('an assignment in progress against the deletion of the same user: no roles left, in both orders', async () => {
		{
			const [granter] = await admins(1);
			const target = (await actors.user()).userId;
			const result = await race([granter!, setRole(target, true)], [target, deleteAccount(target)]);
			expect(result).toEqual({ waited: true, code: undefined });
			expect(await rolesOf(target)).toEqual([]);
		}
		{
			const [granter] = await admins(1);
			const target = (await actors.user()).userId;
			const result = await race([target, deleteAccount(target)], [granter!, setRole(target, true)]);
			expect(result).toEqual({ waited: true, code: 'P0A07' });
			expect(await rolesOf(target)).toEqual([]);
		}
	});
});
