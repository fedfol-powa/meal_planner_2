import { contract } from '@app/contract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { collectTools } from '../src/mcp.ts';

// The skill offered on «Collega un agente» (W17): it names the tools generated from the contract.
const folder = join(import.meta.dirname, '..', '..', 'agent-skill', 'cosa-si-mangia');
const text = readFileSync(join(folder, 'SKILL.md'), 'utf8');

function frontmatter(source: string): Record<string, string> {
	const block = /^---\n([\s\S]*?)\n---\n/.exec(source);
	if (!block) throw new Error('SKILL.md has no frontmatter');
	return Object.fromEntries(block[1]!.split('\n').map((line) => {
		const at = line.indexOf(':');
		return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
	}));
}

describe('agent skill', () => {
	const tools = collectTools(contract).map((tool) => tool.name);
	const groups = new Set(tools.map((name) => name.split('_')[0]!));

	it('cites only tools the contract generates', () => {
		const cited = [...text.matchAll(/\b([a-z][A-Za-z]*)_([a-z][A-Za-z]*)\b/g)].filter(([, group]) => groups.has(group!)).map(([name]) => name);
		const unknown = cited.filter((name) => !tools.includes(name));
		expect(unknown).toEqual([]);
		// The menu, family, recipe book and administration parts are all there.
		for (const name of ['menu_getWeek', 'meals_swap', 'meals_undo', 'family_addExclusion', 'catalogue_getGuide', 'users_setRole']) expect(cited).toContain(name);
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
