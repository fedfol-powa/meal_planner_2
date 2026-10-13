import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('family.create', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	it('creates the family with the creator as admin and shows it', async () => {
		const giulia = await actors.user();
		const id = crypto.randomUUID();
		const view = await giulia.client.family.create({ id, name: ' Casa Giulia ', measurementSystem: 'metric', timeZone: 'Europe/London' });
		expect(view.currentFamilyId).toBe(id);
		expect(view.families).toEqual([{ id, name: 'Casa Giulia', role: 'family_admin', timeZone: 'Europe/London', measurementSystem: 'metric' }]);
		expect((await giulia.client.family.create({ id, name: 'Casa Giulia', measurementSystem: 'metric' })).families).toHaveLength(1);
	});

	it('two concurrent creations with the same id give one family', async () => {
		const ada = await actors.user();
		const id = crypto.randomUUID();
		const input = { id, name: 'Ada', measurementSystem: 'metric' as const };
		await Promise.all([ada.client.family.create(input), ada.client.family.create(input)]);
		expect((await actors.db.admin`select count(*)::int as n from app.family_members where family_id = ${id}`)[0]!.n).toBe(1);
	});

	it('falls back to Europe/Rome for a missing or invalid time zone', async () => {
		const ugo = await actors.user();
		for (const timeZone of [undefined, 'Etc/Unknown', 'Mars/Base']) {
			const id = crypto.randomUUID();
			const view = await ugo.client.family.create({ id, name: 'X', measurementSystem: 'metric', ...(timeZone ? { timeZone } : {}) });
			expect(view.families.find((f) => f.id === id)?.timeZone, String(timeZone)).toBe('Europe/Rome');
		}
	});

	it("refuses the id of someone else's family", async () => {
		const owner = await actors.user();
		const id = crypto.randomUUID();
		await owner.client.family.create({ id, name: 'Mia', measurementSystem: 'metric' });
		const other = await actors.user();
		expect((await errorOf(other.client.family.create({ id, name: 'Mia', measurementSystem: 'metric' }))).code).toBe('invalid');
	});

	it('the first menu read generates the week', async () => {
		const piero = await actors.user();
		const id = crypto.randomUUID();
		await piero.client.family.create({ id, name: 'Piero', measurementSystem: 'metric', timeZone: 'Europe/Rome' });
		await piero.client.menu.getOpening({ familyId: id });
		expect((await actors.db.admin`select count(*)::int as n from app.weeks where family_id = ${id}`)[0]!.n).toBeGreaterThan(0);
	});

	it('is an MCP tool that takes the agent time zone', async () => {
		const agent = await actors.user({ agent: true });
		const id = crypto.randomUUID();
		const result = await mcp(actors.app, actors.env, agent.token, 'tools/call', {
			name: 'family_create', arguments: { id, name: 'Agente', measurementSystem: 'uk_imperial', timeZone: 'Europe/Dublin' },
		});
		expect(toolBody(result).families[0]).toMatchObject({ id, timeZone: 'Europe/Dublin', measurementSystem: 'uk_imperial' });
	});
});
