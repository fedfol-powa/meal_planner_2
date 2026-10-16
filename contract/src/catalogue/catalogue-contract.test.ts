import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { checkContract } from '../check.ts';
import { contract } from '../contract.ts';
import { catalogueContract } from './operations.ts';

type Def = { meta: { role: string; offline: boolean; mcp: unknown; reads?: string[] }; route: { path: string }; inputSchema: unknown };
const ops = Object.entries(catalogueContract).map(([name, o]) => [name, (o as unknown as { '~orpc': Def })['~orpc']] as const);

describe('catalogue contract', () => {
	it('passes the platform checks', () => {
		// checkContract returns the problems found, it does not throw.
		expect(checkContract(contract)).toEqual([]);
	});

	it('is for curators only, exposed to MCP (but the file upload), never offline, without familyId', () => {
		expect(ops.map(([name]) => name).sort()).toEqual([
			'checkDraft', 'checkVariety', 'createBook', 'createDraft', 'createIngredient', 'discardDraft', 'getDraft', 'getDraftSave', 'getGuide',
			'getIngredient', 'getVersion', 'listBooks', 'listDraftSaves', 'listVarieties', 'listVersions', 'overview', 'publish', 'removeEquivalence',
			'removePhoto', 'restoreVersion', 'saveDraft', 'searchIngredients', 'searchRecipes', 'setArchived', 'setEquivalence', 'setPhotoFromUrl',
			'startRevision', 'updateIngredient', 'uploadPhoto',
		]);
		for (const [name, def] of ops) {
			expect(def.meta, name).toMatchObject({ role: 'curator', offline: false });
			// MCP carries no files: agents set the photo from an address (spec W12, section 5).
			if (name === 'uploadPhoto') expect(def.meta.mcp).toBe(false);
			else expect(def.meta.mcp, name).not.toBe(false);
			expect(def.route.path.startsWith('/catalogue/'), name).toBe(true);
			const shape = def.inputSchema instanceof z.ZodObject ? def.inputSchema.shape : {};
			expect(Object.keys(shape), name).not.toContain('familyId');
		}
	});

	it('versions only the reads that depend on the catalogue counter', () => {
		const versioned = ops.filter(([, def]) => def.meta.reads).map(([name]) => name).sort();
		expect(versioned).toEqual(['getIngredient', 'getVersion', 'listBooks', 'listVarieties', 'listVersions', 'searchIngredients', 'searchRecipes']);
	});

	it('is registered in the root contract', () => {
		expect(contract.catalogue).toBe(catalogueContract);
	});
});
