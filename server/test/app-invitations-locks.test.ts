import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { asUser, holdTransaction, stillPending } from './support/hold.ts';

const adminUrl = process.env.TEST_DATABASE_URL!;
const hex = async (token: string) => Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex');

describe.skipIf(!hasDatabase)('app invitations: renewal against revocation and closing', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	const setup = async () => {
		const admin = await actors.user();
		await actors.db.grantGlobalRole(admin.userId, 'app_admin');
		const input = { id: crypto.randomUUID(), email: `l${crypto.randomUUID().slice(0, 8)}@x.it`, roles: [] as [] };
		const { url } = await admin.client.appInvitations.create(input);
		return { admin, input, token: url.split('#')[1]! };
	};
	/** Reserves the id, as an acceptance that has not created the account yet. */
	const reserve = async (token: string, email: string) => {
		const [{ user_id }] = await actors.db.admin<{ user_id: string }[]>`
			select user_id from app.claim_app_invitation(decode(${await hex(token)}, 'hex'), ${email})`;
		return user_id;
	};
	const createAccount = (userId: string, email: string) =>
		actors.db.admin`insert into auth.users (id, email, aud, role) values (${userId}, ${email}, 'authenticated', 'authenticated')`;
	/** Reserves the id and creates the account, as an acceptance stopped before closing. */
	const reserveAndCreate = async (token: string, email: string) => {
		const userId = await reserve(token, email);
		await createAccount(userId, email);
		return userId;
	};
	/** A token of the renewal, unique across runs (the hash column is unique). */
	const renewedHex = () => hex(crypto.randomUUID().padEnd(43, 'r'));

	it('a revocation held open: the renewal waits, then refuses (no link of a revoked invitation)', async () => {
		const { admin, input } = await setup();
		const held = await holdTransaction(adminUrl, async (tx) => {
			await asUser(tx, admin.userId);
			await tx`select app.revoke_app_invitation(${input.id}::uuid)`;
		});
		const renewal = admin.client.appInvitations.create(input);
		expect(await stillPending(renewal)).toBe(true);
		await held.release();
		expect((await errorOf(renewal)).code).toBe('invalid');
	});

	it('a renewal held open: the revocation waits, then revokes the renewed invitation', async () => {
		const { admin, input } = await setup();
		const held = await holdTransaction(adminUrl, async (tx) => {
			await asUser(tx, admin.userId);
			await tx`select app.create_app_invitation(${input.id}::uuid, decode(${await renewedHex()}, 'hex'), ${input.email}, '[]'::jsonb)`;
		});
		const revocation = admin.client.appInvitations.revoke({ id: input.id });
		expect(await stillPending(revocation)).toBe(true);
		await held.release();
		expect((await revocation).invitation.status).toBe('revoked');
	});

	it('a closing held open: the renewal waits, then refuses', async () => {
		const { admin, input, token } = await setup();
		const userId = await reserveAndCreate(token, input.email);
		const held = await holdTransaction(adminUrl, async (tx) => {
			await tx`set local role anon`;
			await tx`select app.complete_app_invitation(decode(${await hex(token)}, 'hex'), ${userId}::uuid)`;
		});
		const renewal = admin.client.appInvitations.create(input);
		expect(await stillPending(renewal)).toBe(true);
		await held.release();
		// The closing needs the account, so the email has one: the account check refuses first.
		const error = await errorOf(renewal);
		expect([error.code, error.data]).toEqual(['not_allowed', { reason: 'account_exists' }]);
	});

	it('a renewal held open: the closing with the old link waits, then refuses', async () => {
		const { admin, input, token } = await setup();
		// The renewal passes the account check before Auth creates the account, then holds its locks.
		const userId = await reserve(token, input.email);
		const held = await holdTransaction(adminUrl, async (tx) => {
			await asUser(tx, admin.userId);
			await tx`select app.create_app_invitation(${input.id}::uuid, decode(${await renewedHex()}, 'hex'), ${input.email}, '[]'::jsonb)`;
		});
		await createAccount(userId, input.email);
		const other = postgres(adminUrl, { max: 1, onnotice: () => {} });
		const closing = other.begin(async (tx) => {
			await tx`set local role anon`;
			await tx`select app.complete_app_invitation(decode(${await hex(token)}, 'hex'), ${userId}::uuid)`;
		});
		expect(await stillPending(closing)).toBe(true);
		await held.release();
		await expect(closing).rejects.toMatchObject({ code: 'P0A01' });
		await other.end();
		expect((await actors.db.admin`select status from app.app_invitations where id = ${input.id}`)[0]!.status).toBe('pending');
	});
});
