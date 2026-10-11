import { contract } from '@app/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectTools } from '../../src/mcp.ts';
import { messages } from '../../src/messages.ts';
import { hasDatabase } from '../support/db.ts';
import { mcp, toolBody } from '../support/requests.ts';
import { catalogueActors, completeContent, draftContent, type CatalogueActors } from './support.ts';

const reads = ['getGuide', 'overview', 'getDraft', 'listDraftSaves', 'getDraftSave', 'checkDraft', 'searchRecipes', 'listVersions', 'getVersion', 'searchIngredients', 'getIngredient', 'listVarieties', 'checkVariety', 'listBooks'];
const writes = ['createDraft', 'startRevision', 'saveDraft', 'publish', 'discardDraft', 'setArchived', 'restoreVersion', 'createIngredient', 'updateIngredient', 'setEquivalence', 'removeEquivalence', 'createBook'];

describe('catalogue tools', () => {
	it('exposes every operation, read-only only for reads', () => {
		const tools = new Map(collectTools(contract).map((t) => [t.name, t.readOnly]));
		for (const name of reads) expect(tools.get(`catalogue_${name}`), name).toBe(true);
		for (const name of writes) expect(tools.get(`catalogue_${name}`), name).toBe(false);
	});
});

describe.skipIf(!hasDatabase)('catalogue over MCP', () => {
	let c: CatalogueActors;
	beforeAll(async () => {
		c = await catalogueActors();
	});
	afterAll(() => c?.actors.close());
	const call = (token: string, name: string, args: unknown) => mcp(c.actors.app, c.actors.env, token, 'tools/call', { name, arguments: args });

	it('lists the catalogue tools to a curator agent', async () => {
		const agent = await c.curator({ agent: true });
		const listed = await mcp(c.actors.app, c.actors.env, agent.token, 'tools/list');
		const names = listed.body.result.tools.map((t: { name: string }) => t.name);
		for (const name of [...reads, ...writes]) expect(names).toContain(`catalogue_${name}`);
	});

	it('lets a curator agent write a recipe from guide to publication, recorded as mcp', async () => {
		const agent = await c.curator({ agent: true, locale: 'en-GB' });
		expect(toolBody(await call(agent.token, 'catalogue_getGuide', {})).guide).toContain('explicit yes');
		const ingredientId = await c.ingredient('Fagioli');
		const created = toolBody(await call(agent.token, 'catalogue_createDraft', { id: crypto.randomUUID(), content: completeContent('Pasta e fagioli', ingredientId) }));
		const published = toolBody(await call(agent.token, 'catalogue_publish', { draftId: created.draftId }));
		expect(published.version).toBe(1);
		const [row] = await c.actors.db.admin`select channel from app.recipe_versions where recipe_id = ${created.recipeId}`;
		expect(row!.channel).toBe('mcp');
	});

	it('renders conflicts and invalid drafts in the profile language', async () => {
		const a = await c.curator({ agent: true, locale: 'it-IT' });
		const b = await c.curator();
		const d = toolBody(await call(a.token, 'catalogue_createDraft', { id: crypto.randomUUID(), content: draftContent('Cassoeula') }));
		await b.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Cassoeula', { durationMinutes: 180 }) });
		const conflict = await call(a.token, 'catalogue_saveDraft', { draftId: d.draftId, baseRevision: 1, content: draftContent('Cassœula') });
		expect(conflict.body.result.isError).toBe(true);
		expect(toolBody(conflict)).toMatchObject({ code: 'conflict', message: messages.conflict['it-IT'], data: { kind: 'draft', revision: 2 } });
		const invalid = await call(a.token, 'catalogue_publish', { draftId: d.draftId });
		expect(toolBody(invalid)).toMatchObject({ code: 'invalid', message: messages.invalid['it-IT'] });
		const notAllowed = await call(a.token, 'catalogue_startRevision', { recipeId: d.recipeId, id: crypto.randomUUID() });
		expect(toolBody(notAllowed)).toMatchObject({ code: 'not_allowed', message: messages.not_allowed['it-IT'], data: { reason: 'not_published' } });
	});

	it('recovers an overwritten save from a new conversation, through the usual save', async () => {
		const lucia = await c.curator({ agent: true });
		const marco = await c.curator();
		const d = toolBody(await call(lucia.token, 'catalogue_createDraft', { id: crypto.randomUUID(), content: draftContent('Ribollita') }));
		await marco.client.catalogue.saveDraft({ draftId: d.draftId, baseRevision: 1, content: draftContent('Ribollita', { durationMinutes: 150 }) });
		await call(lucia.token, 'catalogue_saveDraft', { draftId: d.draftId, baseRevision: 1, content: draftContent('Ribollita toscana'), overwriteRevision: 2 });

		// Another agent, knowing only the draft (catalogue_overview lists it).
		const agent = await c.curator({ agent: true });
		const listed = toolBody(await call(agent.token, 'catalogue_listDraftSaves', { draftId: d.draftId }));
		expect(listed).toMatchObject({ draftId: d.draftId, revision: 3, outcome: null });
		expect(listed.saves.map((s: { revision: number; overwritten: boolean }) => [s.revision, s.overwritten])).toEqual([[3, false], [2, true], [1, false]]);
		expect(listed.saves[1]).toMatchObject({ savedBy: { userId: marco.userId }, channel: 'web' });
		const save = toolBody(await call(agent.token, 'catalogue_getDraftSave', { draftId: d.draftId, revision: 2 }));
		expect(save).toMatchObject({ draftId: d.draftId, revision: 2, overwritten: true, content: { durationMinutes: 150 } });
		const recovered = toolBody(await call(agent.token, 'catalogue_saveDraft', { draftId: d.draftId, baseRevision: listed.revision, content: save.content }));
		expect(recovered).toMatchObject({ revision: 4, content: { durationMinutes: 150, name: { 'it-IT': 'Ribollita' } } });

		// Closed drafts keep their saves; a missing revision or draft is not_found.
		await call(agent.token, 'catalogue_discardDraft', { draftId: d.draftId });
		expect(toolBody(await call(agent.token, 'catalogue_listDraftSaves', { draftId: d.draftId }))).toMatchObject({ outcome: 'discarded', revision: 4 });
		expect(toolBody(await call(agent.token, 'catalogue_getDraftSave', { draftId: d.draftId, revision: 9 }))).toMatchObject({ code: 'not_found' });
		expect(toolBody(await call(agent.token, 'catalogue_listDraftSaves', { draftId: crypto.randomUUID() }))).toMatchObject({ code: 'not_found' });
		const member = await c.actors.user({ agent: true });
		expect(toolBody(await call(member.token, 'catalogue_getDraftSave', { draftId: d.draftId, revision: 2 }))).toMatchObject({ code: 'forbidden' });
	});

	it('refuses a member agent', async () => {
		const agent = await c.actors.user({ agent: true });
		expect(toolBody(await call(agent.token, 'catalogue_overview', {}))).toMatchObject({ code: 'forbidden' });
	});
});
