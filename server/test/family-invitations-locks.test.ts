import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { holdTransaction } from './support/hold.ts';
import { actAs, startTransaction, waitsOnLock } from './support/locks.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;
const hex = async (token: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');

interface Claim { user_id: string | null; state: string }

describe.skipIf(!hasDatabase)('family invitations under concurrency', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	const email = () => `c${crypto.randomUUID().slice(0, 8)}@x.it`;
	const link = async () => {
		const admin = await actors.user();
		const familyId = await actors.db.createFamily([{ userId: admin.userId, role: 'family_admin' }]);
		const { invitation, url } = await admin.client.familyInvitations.create({ familyId, id: crypto.randomUUID() });
		return { admin, familyId, id: invitation.id, hex: await hex(url.split('#')[1]!) };
	};
	const claimSql = (tokenHex: string, address: string) => (tx: Parameters<Parameters<typeof startTransaction>[1]>[0]) =>
		tx<Claim[]>`select user_id, state from app.claim_family_invitation(decode(${tokenHex}, 'hex'), ${address})`;
	const reserveNine = async (tokenHex: string) => {
		for (let i = 0; i < 9; i++) await actors.db.admin`select * from app.claim_family_invitation(decode(${tokenHex}, 'hex'), ${email()})`;
	};
	const count = async (invitationId: string) =>
		(await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_invitation_reservations where invitation_id = ${invitationId}`)[0]!.n;

	it('two new emails at the tenth place: one reserves, the other is refused; ten in all', async () => {
		const l = await link();
		await reserveNine(l.hex);
		let first: Claim | undefined;
		const held = await holdTransaction(adminUrl, async (tx) => {
			await actAs(tx, null);
			[first] = await claimSql(l.hex, email())(tx);
		});
		const second = startTransaction(adminUrl, async (tx) => { await actAs(tx, null); return (await claimSql(l.hex, email())(tx))[0]!; });
		const waited = await waitsOnLock(actors.db, await second.pid);
		await held.release();
		const { ok } = await second.outcome;
		expect(first!.state).toBe('create');
		expect(waited).toBe(true);
		expect(ok!.state).toBe('unavailable');
		expect(await count(l.id)).toBe(10);
	});

	it('the same email twice at the tenth place: one id, returned to both without errors', async () => {
		const l = await link();
		await reserveNine(l.hex);
		const address = email();
		let first: Claim | undefined;
		const held = await holdTransaction(adminUrl, async (tx) => {
			await actAs(tx, null);
			[first] = await claimSql(l.hex, address)(tx);
		});
		const second = startTransaction(adminUrl, async (tx) => { await actAs(tx, null); return (await claimSql(l.hex, address)(tx))[0]!; });
		// It queues on the email lock, before any read that decides.
		const waited = await waitsOnLock(actors.db, await second.pid, ['advisory']);
		await held.release();
		const { ok, code } = await second.outcome;
		expect(waited).toBe(true);
		expect(code).toBeUndefined();
		expect(ok).toEqual({ user_id: first!.user_id, state: 'create' });
		expect(await count(l.id)).toBe(10);
	});

	it('a reservation in progress against the deletion of an account with the same email', async () => {
		const l1 = await link();
		const l2 = await link();
		const address = email();
		// 1. Reserved on L2, committed, no account yet.
		const [{ user_id: u2 }] = await actors.db.admin<{ user_id: string }[]>`
			select user_id from app.claim_family_invitation(decode(${l2.hex}, 'hex'), ${address})`;
		// 2. A reservation on L1 held after its insert: it holds the email lock.
		const held = await holdTransaction(adminUrl, async (tx) => {
			await actAs(tx, null);
			await claimSql(l1.hex, address)(tx);
		});
		// 3. Auth creates U2 from the committed reservation (no email lock there).
		await actors.db.admin`insert into auth.users (id, email, aud, role) values (${u2}, ${address}, 'authenticated', 'authenticated')`;
		// 4. The deletion of U2 waits on the email lock.
		const deletion = startTransaction(adminUrl, async (tx) => {
			await actAs(tx, u2);
			await tx`select app.begin_account_deletion(${u2}::uuid, '{}'::jsonb, '{}'::uuid[])`;
		});
		const waited = await waitsOnLock(actors.db, await deletion.pid, ['advisory']);
		// 5. Released, the deletion clears the email from both reservations.
		await held.release();
		const { code } = await deletion.outcome;
		expect(waited).toBe(true);
		expect(code).toBeUndefined();
		const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_invitation_reservations where email = ${address}`;
		expect(n).toBe(0);
		expect(await count(l1.id)).toBe(1);
		expect(await count(l2.id)).toBe(1);
	});
});
