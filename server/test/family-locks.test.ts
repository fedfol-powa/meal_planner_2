import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbOn } from '../src/db.ts';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { holdTransaction } from './support/hold.ts';
import { actAs, startTransaction, waitsOnLock } from './support/locks.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;
const ROW_LOCK = ['tuple', 'transactionid'];
const hex = async (token: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');

describe.skipIf(!hasDatabase)('last family administrator under concurrency', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	const people = async (count: number) => {
		const list: string[] = [];
		for (let i = 0; i < count; i++) list.push((await actors.user()).userId);
		return list;
	};
	const familyOf = (members: [string, 'family_admin' | 'member'][]) =>
		actors.db.createFamily(members.map(([userId, role]) => ({ userId, role })));
	/** Checked first in every case: members but no administrator is the broken invariant. */
	const adminless = async (familyId: string) => {
		const [row] = await actors.db.admin<{ members: number; admins: number }[]>`
			select count(*)::int as members, count(*) filter (where role = 'family_admin')::int as admins
			from app.family_members where family_id = ${familyId}`;
		return row!.members > 0 && row!.admins === 0;
	};
	const admins = async (familyId: string) =>
		(await actors.db.admin<{ user_id: string }[]>`select user_id from app.family_members where family_id = ${familyId} and role = 'family_admin'`)
			.map((r) => r.user_id).sort();
	const exists = async (familyId: string) =>
		(await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.families where id = ${familyId}`)[0]!.n === 1;

	/** `first` held open as `firstUser`; `second` started as `secondUser`, waiting on `events`. */
	async function race(
		[firstUser, first]: [string, (tx: postgres.TransactionSql) => Promise<unknown>],
		[secondUser, second]: [string, (tx: postgres.TransactionSql) => Promise<unknown>],
		events = ROW_LOCK,
	) {
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
	const leave = (familyId: string, successor: string | null = null) => (tx: postgres.TransactionSql) =>
		tx`select app.leave_family(${familyId}::uuid, ${successor}::uuid)`;
	const demote = (familyId: string, userId: string) => (tx: postgres.TransactionSql) =>
		tx`select app.set_family_member_role(${familyId}::uuid, ${userId}::uuid, 'member')`;
	const remove = (familyId: string, userId: string) => (tx: postgres.TransactionSql) =>
		tx`select app.remove_family_member(${familyId}::uuid, ${userId}::uuid)`;
	const deleteAccount = (userId: string, successors: Record<string, string>, deleted: string[]) => (tx: postgres.TransactionSql) =>
		tx`select app.begin_account_deletion(${userId}::uuid, ${tx.json(successors)}::jsonb, ${deleted}::uuid[])`;
	const join = (tokenHex: string) => (tx: postgres.TransactionSql) => tx`select app.join_family(decode(${tokenHex}, 'hex'))`;
	const link = async (familyId: string, creator: string) => {
		const token = crypto.randomUUID().replaceAll('-', '').padEnd(43, 'x');
		const tokenHex = await hex(token);
		const id = crypto.randomUUID();
		await actors.db.admin.begin(async (tx) => {
			await actAs(tx, creator);
			await tx`select app.create_family_invitation(${familyId}::uuid, ${id}::uuid, decode(${tokenHex}, 'hex'))`;
		});
		return { id, tokenHex };
	};

	it('1. two administrators leaving together: the second needs a successor; one administrator remains', async () => {
		const [a, b, c] = await people(3);
		const familyId = await familyOf([[a!, 'family_admin'], [b!, 'family_admin'], [c!, 'member']]);
		const result = await race([a!, leave(familyId)], [b!, leave(familyId)]);
		expect(await adminless(familyId)).toBe(false);
		expect(result.waited).toBe(true);
		expect(result.code).toBe('P0A13');
		expect(await admins(familyId)).toEqual([b]);
	});

	it('2. crossed demotions: the second, already demoted, is refused; the first remains', async () => {
		const [a, b] = await people(2);
		const familyId = await familyOf([[a!, 'family_admin'], [b!, 'family_admin']]);
		const result = await race([a!, demote(familyId, b!)], [b!, demote(familyId, a!)]);
		expect(await adminless(familyId)).toBe(false);
		expect(result.waited).toBe(true);
		expect(result.code).toBe('42501');
		expect(await admins(familyId)).toEqual([a]);
	});

	it('3. leaving against an account deletion naming the leaver as successor, in both orders', async () => {
		{
			const [a, b, c] = await people(3);
			const familyId = await familyOf([[a!, 'family_admin'], [b!, 'member'], [c!, 'member']]);
			const result = await race([a!, deleteAccount(a!, { [familyId]: b! }, [])], [b!, leave(familyId)]);
			expect(await adminless(familyId)).toBe(false);
			expect(result.waited).toBe(true);
			// b became the only administrator meanwhile: leaving now needs a successor.
			expect(result.code).toBe('P0A13');
			expect(await admins(familyId)).toEqual([b]);
		}
		{
			const [a, b, c] = await people(3);
			const familyId = await familyOf([[a!, 'family_admin'], [b!, 'member'], [c!, 'member']]);
			const result = await race([b!, leave(familyId)], [a!, deleteAccount(a!, { [familyId]: b! }, [])]);
			expect(await adminless(familyId)).toBe(false);
			expect(result.waited).toBe(true);
			// The successor left meanwhile: the plan under the locks refuses it.
			expect(result.code).toBe('P0A13');
			expect(await admins(familyId)).toEqual([a]);
		}
	});

	it('4. joining against the deletion of the only member’s account, in both orders', async () => {
		{
			const [a, c] = await people(2);
			const familyId = await familyOf([[a!, 'family_admin']]);
			const { tokenHex } = await link(familyId, a!);
			const result = await race([c!, join(tokenHex)], [a!, deleteAccount(a!, {}, [familyId])]);
			expect(result.waited).toBe(true);
			expect(result.code).toBe('P0A11');
			expect(await adminless(familyId)).toBe(false);
		}
		{
			const [a, c] = await people(2);
			const familyId = await familyOf([[a!, 'family_admin']]);
			const { tokenHex } = await link(familyId, a!);
			const result = await race([a!, deleteAccount(a!, {}, [familyId])], [c!, join(tokenHex)]);
			expect(result.waited).toBe(true);
			expect(result.code).toBe('P0A01');
			expect(await exists(familyId)).toBe(false);
		}
	});

	it('5. a manual revocation against the demotion or removal of the link author: no 40P01, revoked once', async () => {
		for (const change of ['demote', 'remove'] as const) {
			for (const revokeFirst of [true, false]) {
				const [a, b, d] = await people(3);
				const familyId = await familyOf([[a!, 'family_admin'], [b!, 'family_admin'], [d!, 'family_admin']]);
				const { id } = await link(familyId, b!);
				const revoke = (tx: postgres.TransactionSql) => tx`select app.revoke_family_invitation(${familyId}::uuid, ${id}::uuid)`;
				const other = change === 'demote' ? demote(familyId, b!) : remove(familyId, b!);
				const result = revokeFirst ? await race([a!, revoke], [d!, other]) : await race([d!, other], [a!, revoke]);
				expect(result.code).toBeUndefined();
				expect(result.waited).toBe(true);
				const [row] = await actors.db.admin<{ reason: string }[]>`select revoke_reason as reason from app.family_invitations where id = ${id}`;
				expect(row!.reason).toBe(revokeFirst ? 'manual' : change === 'demote' ? 'creator_demoted' : 'creator_removed');
				const [member] = await actors.db.admin<{ role: string }[]>`select role from app.family_members where family_id = ${familyId} and user_id = ${b}`;
				expect(member?.role).toBe(change === 'demote' ? 'member' : undefined);
			}
		}
	});

	it('6. family.delete against an ordinary meal change holding its row: the family is gone, never 40P01', async () => {
		const admin = await actors.user();
		const familyId = await actors.db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
		const [{ id: weekId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.weeks (family_id, starts_on) values (${familyId}, '2031-03-03') returning id`;
		const [{ id: slotId }] = await actors.db.admin<{ id: string }[]>`
			insert into app.meal_slots (week_id, date, meal_type, free_text, servings) values (${weekId}, '2031-03-03', 'lunch', 'Pizza', 2) returning id`;
		let reached!: () => void;
		let go!: () => void;
		const atRow = new Promise<void>((r) => (reached = r));
		const proceed = new Promise<void>((r) => (go = r));
		// The change locks its slot first, then (through the version trigger) the family.
		const change = startTransaction(adminUrl, async (tx) => {
			await tx`select 1 from app.meal_slots where id = ${slotId} for update`;
			reached();
			await proceed;
			await tx`update app.meal_slots set free_text = 'Pasta' where id = ${slotId}`;
		});
		await atRow;
		const deletion = admin.client.family.delete({ familyId }).then(() => 'ok', (error: { code?: string }) => error.code);
		// The deletion holds the family and waits on the slot row.
		const [deleter] = await (async () => {
			const deadline = Date.now() + 3000;
			while (Date.now() < deadline) {
				const rows = await actors.db.admin<{ pid: number }[]>`
					select pid from pg_stat_activity where usename = 'app_server' and wait_event_type = 'Lock'`;
				if (rows.length) return rows.map((r) => r.pid);
				await new Promise((r) => setTimeout(r, 20));
			}
			return [];
		})();
		expect(deleter).toBeDefined();
		go();
		const [changed, deleted] = await Promise.all([change.outcome, deletion]);
		// Either outcome of the cycle is fine: Postgres picks the victim.
		expect([undefined, '40P01']).toContain(changed.code);
		expect(deleted).toBe('ok');
		expect(await exists(familyId)).toBe(false);
	});

	it('6b. creating a family or joining one against the deletion of the account: refused, nothing left half-way', async () => {
		{
			const [a] = await people(1);
			const result = await race(
				[a!, deleteAccount(a!, {}, [])],
				[a!, (tx) => tx`select app.create_family(${crypto.randomUUID()}::uuid, 'Late', 'metric', 'Europe/Rome')`],
				['advisory'],
			);
			expect(result.waited).toBe(true);
			expect(result.code).toBe('42501');
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_members where user_id = ${a}`;
			expect(n).toBe(0);
		}
		{
			const [a, c] = await people(2);
			const familyId = await familyOf([[a!, 'family_admin']]);
			const { tokenHex } = await link(familyId, a!);
			const result = await race([a!, deleteAccount(a!, {}, [familyId])], [c!, join(tokenHex)]);
			expect(result.waited).toBe(true);
			expect(result.code).toBe('P0A01');
			expect(await exists(familyId)).toBe(false);
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_members where user_id = ${c}`;
			expect(n).toBe(0);
		}
	});

	it('7. user transactions run in read committed, which the checks after the locks rely on', async () => {
		const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
		try {
			const person = await actors.user();
			const claims = { sub: person.userId, role: 'authenticated' as const, session_id: person.sessionId, exp: Math.floor(Date.now() / 1000) + 60 };
			const level = await withDbOn(sql, { kind: 'user', claims }, async (tx) => (await tx<{ transaction_isolation: string }[]>`show transaction_isolation`)[0]!.transaction_isolation);
			expect(level).toBe('read committed');
		} finally {
			await sql.end();
		}
	});

	it('the web answers forbidden to an administrator demoted while waiting', async () => {
		const a = await actors.user();
		const b = await actors.user();
		const familyId = await familyOf([[a.userId, 'family_admin'], [b.userId, 'family_admin']]);
		const held = await holdTransaction(adminUrl, async (tx) => {
			await actAs(tx, a.userId);
			await demote(familyId, b.userId)(tx);
		});
		const answer = errorOf(b.client.family.setMemberRole({ familyId, userId: a.userId, role: 'member' }));
		await new Promise((r) => setTimeout(r, 200));
		await held.release();
		expect((await answer).code).toBe('forbidden');
	});
});
