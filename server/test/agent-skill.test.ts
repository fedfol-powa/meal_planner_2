import { contract, errorCodes, errorDefinitions, type OperationMeta } from '@app/contract';
import { traverseContractProcedures } from '@orpc/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectTools } from '../src/mcp.ts';

// The skill offered on «Collega un agente» (W17): it names the tools generated from the contract.
const folder = join(import.meta.dirname, '..', '..', 'agent-skill', 'cosa-si-mangia');
const text = readFileSync(join(folder, 'SKILL.md'), 'utf8');
const tools = collectTools(contract).map((tool) => tool.name);

/** snake_case words of the skill that are not tools: global roles, error codes, not_allowed reasons. */
const NOT_TOOLS = new Set<string>(['recipe_curator', 'app_admin', ...errorCodes, ...errorDefinitions.not_allowed.data.shape.reason.options]);

/** Every snake_case reference that is neither a known non-tool nor a generated tool. */
function unknownReferences(source: string): string[] {
	const words = [...source.matchAll(/\b[a-z][A-Za-z]*(?:_[a-z][A-Za-z]*)+\b/g)].map(([word]) => word);
	return words.filter((word) => !NOT_TOOLS.has(word) && !tools.includes(word));
}

function frontmatter(source: string): Record<string, string> {
	const block = /^---\n([\s\S]*?)\n---\n/.exec(source);
	if (!block) throw new Error('SKILL.md has no frontmatter');
	return Object.fromEntries(block[1]!.split('\n').map((line) => {
		const at = line.indexOf(':');
		return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
	}));
}

describe('agent skill', () => {
	it('cites only tools the contract generates', () => {
		expect(unknownReferences(text)).toEqual([]);
		// The menu, family, recipe book and administration parts are all there.
		for (const name of ['menu_getWeek', 'meals_swap', 'meals_undo', 'family_addExclusion', 'catalogue_getGuide', 'users_setRole']) expect(text).toContain(name);
	});

	it('catches a renamed tool and a removed group', () => {
		expect(unknownReferences('Use `rating_set` to rate.')).toEqual(['rating_set']);
		expect(unknownReferences('Then `pantry_list`.')).toEqual(['pantry_list']);
	});

	it('lists as new ids exactly the operations that create, shopping aside', () => {
		const creating: string[] = [];
		traverseContractProcedures({ router: contract, path: [] }, ({ contract: procedure, path }) => {
			const meta = procedure['~orpc'].meta as OperationMeta;
			if (meta.mcp && meta.creates && path[0] !== 'shopping') creating.push(path.join('_'));
		});
		const block = /^ {2}- New ids:([\s\S]*?)^ {2}- Every other `id`/m.exec(text);
		if (!block) throw new Error('SKILL.md has no "New ids" list');
		const listed = [...block[1]!.matchAll(/`([a-zA-Z]+_[a-zA-Z]+)`/g)].map(([, name]) => name);
		expect(listed.sort()).toEqual(creating.sort());
	});

	it('has the frontmatter claude.ai accepts', () => {
		const meta = frontmatter(text);
		expect(Object.keys(meta).sort()).toEqual(['description', 'name']);
		expect(meta.name).toBe('cosa-si-mangia');
		expect(meta.name).toMatch(/^[a-z0-9-]{1,64}$/);
		expect(meta.description!.length).toBeGreaterThan(0);
		expect(meta.description!.length).toBeLessThanOrEqual(200);
		expect(meta.description).not.toMatch(/[<>]/);
	});

	it('carries the version the page shows', () => {
		expect(text).toMatch(/^Skill version: \d{4}-\d{2}-\d{2}$/m);
	});
});
