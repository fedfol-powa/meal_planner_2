import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';

describe.skipIf(!hasDatabase)('family name, units and time zone', () => {
	let actors: Actors;
	let admin: Actor;
	let member: Actor;
	let familyId: string;
	beforeAll(async () => {
		actors = await setupActors();
		admin = await actors.user();
		member = await actors.user();
		familyId = await actors.db.createFamily([
			{ userId: admin.userId, role: 'family_admin' },
			{ userId: member.userId, role: 'member' },
		]);
	});
	afterAll(() => actors?.close());

	it('renames, trimmed; repeating changes nothing', async () => {
		expect((await admin.client.family.rename({ familyId, name: '  Casa  ' })).name).toBe('Casa');
		expect((await admin.client.family.rename({ familyId, name: 'Casa' })).name).toBe('Casa');
	});

	it('refuses an empty or long name', async () => {
		for (const name of ['   ', 'x'.repeat(61)]) {
			expect((await errorOf(admin.client.family.rename({ familyId, name }))).code).toBe('invalid');
		}
	});

	it('changes units and time zone', async () => {
		expect((await admin.client.family.setMeasurementSystem({ familyId, measurementSystem: 'uk_imperial' })).measurementSystem).toBe('uk_imperial');
		expect((await admin.client.family.setTimeZone({ familyId, timeZone: 'Europe/London' })).timeZone).toBe('Europe/London');
		const profile = await admin.client.profile.get({});
		expect(profile.families.find((f) => f.id === familyId)).toMatchObject({ measurementSystem: 'uk_imperial', timeZone: 'Europe/London' });
	});

	it('refuses an unknown time zone with invalid on the field', async () => {
		const error = await errorOf(admin.client.family.setTimeZone({ familyId, timeZone: 'Mars/Olympus' }));
		expect(error.code).toBe('invalid');
		expect(error.data).toEqual({ issues: [{ path: ['timeZone'], code: 'invalid' }] });
	});

	it('is for administrators only', async () => {
		expect((await errorOf(member.client.family.rename({ familyId, name: 'Mine' }))).code).toBe('forbidden');
		expect((await errorOf(member.client.family.setMeasurementSystem({ familyId, measurementSystem: 'metric' }))).code).toBe('forbidden');
		expect((await errorOf(member.client.family.setTimeZone({ familyId, timeZone: 'Europe/Rome' }))).code).toBe('forbidden');
	});

	it('bumps the family version', async () => {
		const before = await member.client.family.get({ familyId });
		await admin.client.family.rename({ familyId, name: 'Casa nuova' });
		expect((await member.client.family.get({ familyId, knownVersion: before.version })).unchanged).toBe(false);
	});
});
