// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// iOS Safari zooms the page when a focused field has text below 16px (issue #51): a static check of
// every stylesheet of the app, since the test environment has no browser to compute styles.

const SRC = fileURLToPath(new URL('..', import.meta.url));
const FIELD = /^(input|select|textarea)(?![\w-])/;

interface Rule {
	file: string;
	selectors: string[];
	declarations: Map<string, string>;
}

const filesUnder = (dir: string, suffix: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		return entry.isDirectory() ? filesUnder(path, suffix) : entry.name.endsWith(suffix) ? [path] : [];
	});

/** Style rules of a stylesheet, also inside at-rules such as @media. */
function rulesOf(css: string, file: string): Rule[] {
	const rules: Rule[] = [];
	const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
	let i = 0;
	const parse = (): void => {
		while (i < text.length) {
			const open = text.indexOf('{', i);
			const close = text.indexOf('}', i);
			if (close !== -1 && (open === -1 || close < open)) {
				i = close + 1;
				return;
			}
			if (open === -1) return;
			const prelude = text.slice(i, open).trim();
			i = open + 1;
			if (prelude.startsWith('@')) {
				parse();
				continue;
			}
			const end = text.indexOf('}', i);
			const declarations = new Map<string, string>();
			for (const declaration of text.slice(i, end).split(';')) {
				const colon = declaration.indexOf(':');
				if (colon !== -1) declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
			}
			rules.push({ file, selectors: prelude.split(',').map((s) => s.trim()), declarations });
			i = end + 1;
		}
	};
	parse();
	return rules;
}

/** Classes put straight on an input, select or textarea in the components. */
function fieldClasses(): Set<string> {
	const classes = new Set<string>();
	for (const file of filesUnder(SRC, '.tsx')) {
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(/className=(?:\{styles\.(\w+)\}|"([^"]*)"|'([^']*)')/g)) {
			const tags = [...source.slice(0, match.index).matchAll(/<([a-zA-Z][\w.]*)/g)];
			if (!FIELD.test(tags.at(-1)?.[1] ?? '')) continue;
			for (const name of (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/)) if (name) classes.add(name);
		}
	}
	return classes;
}

/** The text size a font or font-size value sets, in px; null when it does not set a fixed one. */
function sizeInPx(value: string): number | null {
	const match = /(?:^|\s)(\d*\.?\d+)(px|rem)(?=[\s/]|$)/.exec(value);
	if (!match) return null;
	return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

const rules = filesUnder(SRC, '.css').flatMap((file) => rulesOf(readFileSync(file, 'utf8'), relative(SRC, file)));
const classes = fieldClasses();

const targetsField = (selector: string): boolean => {
	const last = selector.split(/\s*[\s>+~]\s*/).at(-1) ?? '';
	return FIELD.test(last) || [...last.matchAll(/\.([\w-]+)/g)].some((m) => classes.has(m[1] ?? ''));
};

describe('text size of the fields (issue #51)', () => {
	it('gives every field an explicit size of at least 16px', () => {
		const base = rules.find(
			(rule) => rule.file === join('design', 'global.css') && ['input', 'select', 'textarea'].every((tag) => rule.selectors.includes(tag))
		);
		expect(base).toBeDefined();
		const size = sizeInPx(base!.declarations.get('font-size') ?? base!.declarations.get('font') ?? '');
		expect(size).toBeGreaterThanOrEqual(16);
	});

	it('never sets a field below 16px', () => {
		const problems = rules.flatMap((rule) =>
			rule.selectors.filter(targetsField).flatMap((selector) =>
				['font', 'font-size'].flatMap((property) => {
					const value = rule.declarations.get(property);
					if (value === undefined) return [];
					const size = sizeInPx(value);
					return size !== null && size >= 16 ? [] : [`${rule.file}: ${selector} { ${property}: ${value} }`];
				})
			)
		);
		expect(problems).toEqual([]);
	});

	it('finds the fields styled through a module class', () => {
		expect(classes).toContain('select');
		expect(classes).toContain('search');
	});
});
