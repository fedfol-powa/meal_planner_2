// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// iOS Safari zooms the page when a focused field has text below 16px (issue #51). The test environment
// has no browser to compute styles, so this is a static, conservative check of the sources:
// - global.css gives input, select and textarea an explicit size of at least 16px;
// - no CSS rule of the app (global.css, *.module.css, also inside @media) sets font or font-size below
//   16px, or to a value without a fixed size (inherit, em, %, var…), on a selector that can reach a field:
//   a field tag, a class put on a field in the components, or a compound with no tag and no class
//   (attributes, pseudo-classes, *), such as [type='search'];
// - every <input>, <select> and <textarea> of the components (*.tsx, tests excluded) has a className
//   that is a module class (styles.x) or a string, an inline style with no font size or one of at least
//   16px, and no spread props, unless listed in EXCEPTIONS. Any other form is reported, not skipped.
// Out of reach: fields drawn by third-party code, styles set from scripts, sizes that come from a CSS
// variable or from a class used on an ancestor of the field. The browser check of the PR covers those.

const SRC = fileURLToPath(new URL('..', import.meta.url));
const FIELD = /^(input|select|textarea)(?![\w-])/;

/** Fields whose props the check cannot read, with the reason they are safe. Keyed by file and problem. */
const EXCEPTIONS: Record<string, string> = {
	'features/app-invitations/InvitePage.tsx: <input> spreads props': 'the spread is typed { type, autoComplete, autoCapitalize }',
	'features/family-invitations/InvitePage.tsx: <input> spreads props': 'the spread is typed { type, autoComplete, autoCapitalize }'
};

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

/** The text size a font or font-size value sets, in px; null when it does not set a fixed one. */
function sizeInPx(value: string): number | null {
	const match = /(?:^|\s)(\d*\.?\d+)(px|rem)(?=[\s/]|$)/.exec(value);
	if (!match) return null;
	return Number(match[1]) * (match[2] === 'rem' ? 16 : 1);
}

interface FieldTag {
	file: string;
	tag: string;
	/** The text from the tag name to the closing > of the opening tag. */
	props: string;
}

/** Opening tags of input, select and textarea in a component, read up to the > outside braces and strings. */
function fieldTagsOf(source: string, file: string): FieldTag[] {
	return [...source.matchAll(/<(input|select|textarea)(?![\w-])/g)].map((match) => {
		let i = match.index + match[0].length;
		let depth = 0;
		let quote: string | null = null;
		for (; i < source.length; i++) {
			const char = source[i];
			if (quote) {
				if (char === quote && source[i - 1] !== '\\') quote = null;
			} else if (char === '"' || char === "'" || char === '`') quote = char;
			else if (char === '{') depth++;
			else if (char === '}') depth--;
			else if (char === '>' && depth === 0) break;
		}
		return { file, tag: match[1] ?? '', props: source.slice(match.index + match[0].length, i) };
	});
}

/** The value of a JSX prop as written: {…} with balanced braces, or a quoted string; null when absent. */
function propValue(props: string, name: string): string | null {
	const match = new RegExp(`(?:^|\\s)${name}=`).exec(props);
	if (!match) return null;
	const start = match.index + match[0].length;
	const first = props[start];
	if (first === '"' || first === "'") return props.slice(start, props.indexOf(first, start + 1) + 1);
	let depth = 0;
	for (let i = start; i < props.length; i++) {
		if (props[i] === '{') depth++;
		else if (props[i] === '}' && --depth === 0) return props.slice(start, i + 1);
	}
	return props.slice(start);
}

/** Classes a field gets and what the check cannot accept about its props. */
function readField(field: FieldTag): { classes: string[]; problems: string[] } {
	const where = `${field.file}: <${field.tag}>`;
	const classes: string[] = [];
	const problems: string[] = [];
	const className = propValue(field.props, 'className');
	if (className !== null) {
		const module = /^\{\s*styles\.(\w+)\s*\}$/.exec(className);
		const text = /^(["'])(.*)\1$/.exec(className);
		if (module) classes.push(module[1] ?? '');
		else if (text) classes.push(...(text[2] ?? '').split(/\s+/).filter(Boolean));
		else problems.push(`${where} className the check cannot read: ${className}`);
	}
	const style = propValue(field.props, 'style');
	if (style !== null) {
		if (!/^\{\{[\s\S]*\}\}$/.test(style)) problems.push(`${where} style the check cannot read: ${style}`);
		for (const match of style.matchAll(/\b(fontSize|font)\s*:\s*([^,}]+)/g)) {
			const value = (match[2] ?? '').trim();
			const size = /^\d*\.?\d+$/.test(value) ? Number(value) : /^(["'])(.*)\1$/.test(value) ? sizeInPx(value.slice(1, -1)) : null;
			if (size === null || size < 16) problems.push(`${where} inline ${match[1]}: ${value}`);
		}
	}
	let depth = 0;
	for (let i = 0; i < field.props.length; i++) {
		if (field.props[i] === '{' && depth++ === 0 && /^\{\s*\.\.\./.test(field.props.slice(i))) problems.push(`${where} spreads props`);
		else if (field.props[i] === '}') depth--;
	}
	return { classes, problems };
}

/** A selector can reach a field when its last compound is a field tag, a field class, or has no tag and no class. */
function targetsField(selector: string, classes: ReadonlySet<string>): boolean {
	const last = selector.split(/\s*[\s>+~]\s*/).at(-1) ?? '';
	if (FIELD.test(last)) return true;
	const named = [...last.matchAll(/\.([\w-]+)/g)].map((m) => m[1] ?? '');
	if (named.some((name) => classes.has(name))) return true;
	return named.length === 0 && !/^[a-zA-Z]/.test(last);
}

/** Declarations that may put a field below 16px. */
function cssProblems(rules: Rule[], classes: ReadonlySet<string>): string[] {
	return rules.flatMap((rule) =>
		rule.selectors
			.filter((selector) => targetsField(selector, classes))
			.flatMap((selector) =>
				['font', 'font-size'].flatMap((property) => {
					const value = rule.declarations.get(property);
					if (value === undefined) return [];
					const size = sizeInPx(value);
					return size !== null && size >= 16 ? [] : [`${rule.file}: ${selector} { ${property}: ${value} }`];
				})
			)
	);
}

const rules = filesUnder(SRC, '.css').flatMap((file) => rulesOf(readFileSync(file, 'utf8'), relative(SRC, file)));
const fields = filesUnder(SRC, '.tsx')
	.filter((file) => !file.endsWith('.test.tsx'))
	.flatMap((file) => fieldTagsOf(readFileSync(file, 'utf8'), relative(SRC, file)))
	.map(readField);
const classes = new Set(fields.flatMap((field) => field.classes));

describe('text size of the fields (issue #51)', () => {
	it('gives every field an explicit size of at least 16px', () => {
		const base = rules.find(
			(rule) => rule.file === join('design', 'global.css') && ['input', 'select', 'textarea'].every((tag) => rule.selectors.includes(tag))
		);
		expect(base).toBeDefined();
		const size = sizeInPx(base!.declarations.get('font-size') ?? base!.declarations.get('font') ?? '');
		expect(size).toBeGreaterThanOrEqual(16);
	});

	it('never sets a field below 16px in the stylesheets', () => {
		expect(cssProblems(rules, classes)).toEqual([]);
	});

	it('reads the props of every field in the components', () => {
		const problems = fields.flatMap((field) => field.problems);
		expect(problems.filter((problem) => !(problem in EXCEPTIONS))).toEqual([]);
		expect(Object.keys(EXCEPTIONS).filter((exception) => !problems.includes(exception))).toEqual([]);
	});

	it('finds the fields styled through a module class', () => {
		expect(classes).toContain('select');
		expect(classes).toContain('search');
	});

	describe('catches the regressions of the review of PR #60', () => {
		const field = (source: string) => fieldTagsOf(source, 'X.tsx').map(readField)[0]!;

		it('an attribute selector that matches a field', () => {
			const rule = rulesOf("[type='search'] { font-size: 14px; }", 'global.css');
			expect(cssProblems(rule, new Set())).toEqual(["global.css: [type='search'] { font-size: 14px }"]);
		});

		it('an inline font size below 16px', () => {
			expect(field('<input type="search" style={{ fontSize: 14 }} />').problems).toEqual(['X.tsx: <input> inline fontSize: 14']);
			expect(field('<input style={{ fontSize: 16 }} />').problems).toEqual([]);
			expect(field("<select style={{ font: '400 0.875rem/1.3 serif' }}>").problems).toHaveLength(1);
		});

		it('a className or style it cannot read, and spread props', () => {
			expect(field('<input className={`${styles.a} ${styles.b}`} />').problems).toHaveLength(1);
			expect(field('<select className={open ? styles.a : styles.b}>').problems).toHaveLength(1);
			expect(field('<textarea style={styleOf(x)} />').problems).toHaveLength(1);
			expect(field('<input {...rest} onChange={() => set({ ...v })} />').problems).toEqual(['X.tsx: <input> spreads props']);
		});

		it('does not flag classes on other elements or tagged selectors', () => {
			const rule = rulesOf('.hint, label, p > span { font-size: 0.75rem; }', 'x.module.css');
			expect(cssProblems(rule, new Set(['search']))).toEqual([]);
		});
	});
});
