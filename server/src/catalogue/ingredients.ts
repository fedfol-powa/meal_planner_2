import type { IngredientView } from '@app/contract';
import { varietyHints } from '@app/domain/recipe';
import { preparationKey, unitEquivalenceSchema, type Locale } from '@app/domain/units';
import { z } from 'zod';
import type { Tx } from '../db.ts';
import { withInvalidOn } from '../db-errors.ts';
import { appError } from '../errors.ts';
import { foldText } from '../family/views.ts';
import { writeInstant, type Actor } from './actor.ts';
import { changedFields } from './fields.ts';
import { loadAuthors } from './load.ts';
import { localText } from './views.ts';

/** A row of ingredient_versions: the whole ingredient as it was, every equivalence included (catalogue restore). */
export const ingredientVersionContent = z.object({
	slug: z.string(),
	name: z.object({ 'it-IT': z.string(), 'en-GB': z.string() }),
	synonyms: z.object({ 'it-IT': z.array(z.string()), 'en-GB': z.array(z.string()) }),
	department: z.string(),
	isPantry: z.boolean(),
	equivalences: z.array(
		z.object({
			fromUnit: z.string(),
			toUnit: z.string(),
			factor: z.number(),
			scope: z.enum(['recipe', 'shopping']),
			preparation: z.string().nullable(),
			source: z.string(),
		}),
	),
});
type IngredientVersionContent = z.infer<typeof ingredientVersionContent>;

interface IngredientRow {
	id: string;
	slug: string;
	name: Partial<Record<Locale, string | null>>;
	synonyms: Partial<Record<Locale, string[]>>;
	department: string;
	is_pantry: boolean;
	version: number;
}
interface EquivalenceRow {
	id: string;
	from_unit: string;
	to_unit: string;
	factor: string | number;
	scope: 'recipe' | 'shopping';
	preparation: string | null;
	source: string;
}

const names = (row: IngredientRow) => ({ 'it-IT': row.name['it-IT'] ?? '', 'en-GB': row.name['en-GB'] ?? '' });
const synonymsOf = (row: IngredientRow) => ({ 'it-IT': row.synonyms['it-IT'] ?? [], 'en-GB': row.synonyms['en-GB'] ?? [] });

async function ingredientRow(tx: Tx, id: string, lock = false): Promise<IngredientRow> {
	const rows = lock
		? await tx<IngredientRow[]>`select id, slug, name, synonyms, department, is_pantry, version from app.ingredients where id = ${id} and archived_at is null for no key update`
		: await tx<IngredientRow[]>`select id, slug, name, synonyms, department, is_pantry, version from app.ingredients where id = ${id} and archived_at is null`;
	if (!rows[0]) throw appError('not_found');
	return rows[0];
}

const equivalencesOf = (tx: Tx, id: string) => tx<EquivalenceRow[]>`
	select id, from_unit, to_unit, factor, scope, preparation, source from app.ingredient_unit_equivalences
	where ingredient_id = ${id} order by from_unit, preparation nulls first, id`;

export async function ingredientViewOf(tx: Tx, id: string): Promise<IngredientView> {
	const row = await ingredientRow(tx, id);
	const eqs = (await equivalencesOf(tx, id)).filter((e) => e.scope === 'recipe');
	return {
		ingredientId: row.id,
		slug: row.slug,
		name: names(row),
		synonyms: synonymsOf(row),
		department: row.department as IngredientView['department'],
		isPantry: row.is_pantry,
		version: row.version,
		equivalences: eqs.map((e) => ({
			id: e.id,
			fromUnit: e.from_unit as IngredientView['equivalences'][number]['fromUnit'],
			toUnit: e.to_unit as IngredientView['equivalences'][number]['toUnit'],
			factor: Number(e.factor),
			preparation: e.preparation,
			source: e.source,
		})),
	};
}

/** The history row of the ingredient as it is now; `bump` raises its version first (every change but the creation). */
export async function recordIngredientVersion(tx: Tx, actor: Actor, id: string, options: { bump: boolean; at: Date }): Promise<number> {
	if (options.bump) await tx`update app.ingredients set version = version + 1, updated_by = ${actor.userId}, updated_at = ${options.at} where id = ${id}`;
	const row = await ingredientRow(tx, id);
	const content: IngredientVersionContent = ingredientVersionContent.parse({
		slug: row.slug,
		name: names(row),
		synonyms: synonymsOf(row),
		department: row.department,
		isPantry: row.is_pantry,
		equivalences: (await equivalencesOf(tx, id)).map((e) => ({
			fromUnit: e.from_unit,
			toUnit: e.to_unit,
			factor: Number(e.factor),
			scope: e.scope,
			preparation: e.preparation,
			source: e.source,
		})),
	});
	await tx`insert into app.ingredient_versions (ingredient_id, version, content, changed_by, changed_at, channel)
		values (${id}, ${row.version}, ${tx.json(content)}, ${actor.userId}, ${options.at}, ${actor.channel})`;
	return row.version;
}

/** The catalogue's capitalisation ("Lenticchie rosse"), as in the prototype. */
export const capitalise = (text: string) => {
	const t = text.trim();
	return t.charAt(0).toLocaleUpperCase('it-IT') + t.slice(1);
};
export const cleanName = (name: { 'it-IT': string; 'en-GB': string | null }) => ({
	'it-IT': capitalise(name['it-IT']),
	'en-GB': name['en-GB']?.trim() ? capitalise(name['en-GB']) : '',
});
export const cleanSynonyms = (s: Partial<Record<Locale, string[]>> | undefined) => ({
	'it-IT': [...new Set((s?.['it-IT'] ?? []).map((x) => x.trim()).filter(Boolean))],
	'en-GB': [...new Set((s?.['en-GB'] ?? []).map((x) => x.trim()).filter(Boolean))],
});

export async function updateIngredient(
	tx: Tx,
	actor: Actor,
	input: { ingredientId: string; baseVersion: number; name: { 'it-IT': string; 'en-GB': string | null }; synonyms: Record<Locale, string[]>; department: string; isPantry: boolean },
): Promise<IngredientView> {
	const row = await ingredientRow(tx, input.ingredientId, true);
	const next = { name: cleanName(input.name), synonyms: cleanSynonyms(input.synonyms), department: input.department, isPantry: input.isPantry };
	const current = { name: names(row), synonyms: synonymsOf(row), department: row.department, isPantry: row.is_pantry };
	if (changedFields(current, next).length === 0) return ingredientViewOf(tx, row.id); // nothing to change, also on a repeat
	if (input.baseVersion !== row.version) {
		const [last] = await tx<{ changed_by: string | null; changed_at: Date }[]>`
			select changed_by, changed_at from app.ingredient_versions where ingredient_id = ${row.id} order by version desc limit 1`;
		const [base] = await tx<{ content: IngredientVersionContent }[]>`
			select content from app.ingredient_versions where ingredient_id = ${row.id} and version = ${input.baseVersion}`;
		const authors = await loadAuthors(tx);
		const parsed = ingredientVersionContent.safeParse(base?.content);
		const from = parsed.success ? { name: parsed.data.name, synonyms: parsed.data.synonyms, department: parsed.data.department, isPantry: parsed.data.isPantry } : current;
		throw appError('conflict', {
			kind: 'ingredient',
			version: row.version,
			by: last?.changed_by ?? null,
			byName: last?.changed_by ? (authors.get(last.changed_by) ?? null) : null,
			at: (last?.changed_at ?? new Date(0)).toISOString(),
			fields: changedFields(from, current),
		});
	}
	const at = await writeInstant(tx);
	await withInvalidOn(['name'], () =>
		tx`update app.ingredients set name = ${tx.json(next.name)}, synonyms = ${tx.json(next.synonyms)}, department = ${next.department}, is_pantry = ${next.isPantry}
			where id = ${row.id}`,
	);
	await recordIngredientVersion(tx, actor, row.id, { bump: true, at });
	return ingredientViewOf(tx, row.id);
}

/**
 * Idempotent: identical values write nothing; other values update the row in place (to_unit,
 * factor and source are the columns curators may update), keeping its id.
 */
export async function setEquivalence(
	tx: Tx,
	actor: Actor,
	input: { ingredientId: string; fromUnit: string; toUnit: string; factor: number; preparation: string | null; source: string },
): Promise<IngredientView> {
	await ingredientRow(tx, input.ingredientId, true);
	const parsed = unitEquivalenceSchema.safeParse({
		ingredientId: input.ingredientId,
		fromUnit: input.fromUnit,
		toUnit: input.toUnit,
		factor: input.factor,
		scope: 'recipe',
		preparation: preparationKey(input.preparation),
		source: input.source,
	});
	if (!parsed.success) throw appError('invalid', { issues: parsed.error.issues.map((i) => ({ path: i.path as (string | number)[], code: 'invalid_value' })) });
	const eq = parsed.data;
	const [existing] = await tx<EquivalenceRow[]>`
		select id, from_unit, to_unit, factor, scope, preparation, source from app.ingredient_unit_equivalences
		where ingredient_id = ${eq.ingredientId} and scope = 'recipe' and from_dimension = app.unit_dimension(${eq.fromUnit})
			and preparation is not distinct from ${eq.preparation}`;
	if (existing && existing.from_unit === eq.fromUnit && existing.to_unit === eq.toUnit && Number(existing.factor) === eq.factor && existing.source === eq.source.trim()) {
		return ingredientViewOf(tx, input.ingredientId); // a repeat: same id, same version
	}
	const at = await writeInstant(tx);
	await withInvalidOn(['fromUnit'], async () => {
		if (existing && existing.from_unit === eq.fromUnit) {
			await tx`update app.ingredient_unit_equivalences set to_unit = ${eq.toUnit}, factor = ${eq.factor}, source = ${eq.source.trim()} where id = ${existing.id}`;
			return;
		}
		// Another unit of the same dimension (g → kg): from_unit cannot be updated, the row is replaced.
		if (existing) await tx`delete from app.ingredient_unit_equivalences where id = ${existing.id}`;
		await tx`insert into app.ingredient_unit_equivalences (ingredient_id, from_unit, to_unit, factor, scope, preparation, source)
			values (${eq.ingredientId}, ${eq.fromUnit}, ${eq.toUnit}, ${eq.factor}, 'recipe', ${eq.preparation}, ${eq.source.trim()})`;
	});
	await recordIngredientVersion(tx, actor, input.ingredientId, { bump: true, at });
	return ingredientViewOf(tx, input.ingredientId);
}

/** Removing an equivalence already gone answers the current view: a repeat after a lost answer. */
export async function removeEquivalence(tx: Tx, actor: Actor, input: { ingredientId: string; equivalenceId: string }): Promise<IngredientView> {
	await ingredientRow(tx, input.ingredientId, true);
	const removed = await tx`delete from app.ingredient_unit_equivalences
		where id = ${input.equivalenceId} and ingredient_id = ${input.ingredientId} and scope = 'recipe' returning id`;
	if (removed.length > 0) await recordIngredientVersion(tx, actor, input.ingredientId, { bump: true, at: await writeInstant(tx) });
	return ingredientViewOf(tx, input.ingredientId);
}

export async function searchCatalogueIngredients(tx: Tx, text: string, locale: Locale) {
	const needle = foldText(text);
	const rows = await tx<IngredientRow[]>`select id, slug, name, synonyms, department, is_pantry, version from app.ingredients where archived_at is null`;
	const varieties = await tx<{ ingredient_id: string; variety: Partial<Record<Locale, string>> }[]>`
		select distinct on (ri.ingredient_id, ri.variety_key) ri.ingredient_id, ri.variety
		from app.recipe_ingredients ri join app.recipes r on r.id = ri.recipe_id
		where r.status <> 'draft' and ri.variety is not null`;
	const base = (r: IngredientRow) => ({ ingredientId: r.id, name: localText(r.name, locale), department: r.department as IngredientView['department'], isPantry: r.is_pantry });
	const byName = rows.filter((r) => foldText(localText(r.name, locale)).includes(needle)).map((r) => ({ ...base(r), variety: null, matched: 'name' as const }));
	const named = new Set(byName.map((n) => n.ingredientId));
	const bySynonym = rows
		.filter((r) => !named.has(r.id) && (r.synonyms[locale] ?? []).some((s) => foldText(s).includes(needle)))
		.map((r) => ({ ...base(r), variety: null, matched: 'synonym' as const }));
	const byId = new Map(rows.map((r) => [r.id, r]));
	const byVariety = varieties
		.filter((v) => byId.has(v.ingredient_id) && foldText(v.variety[locale] ?? '').includes(needle))
		.map((v) => ({ ...base(byId.get(v.ingredient_id)!), variety: { 'it-IT': v.variety['it-IT'] ?? '', 'en-GB': v.variety['en-GB'] ?? '' }, matched: 'variety' as const }));
	return { items: [...byName.sort((a, b) => a.name.localeCompare(b.name, locale)), ...bySynonym, ...byVariety].slice(0, 20) };
}

/** Varieties already written for an ingredient in published recipes, the most used spelling of each. */
export async function knownVarieties(tx: Tx, ingredientId: string) {
	await ingredientRow(tx, ingredientId);
	const rows = await tx<{ variety: Partial<Record<Locale, string>>; variety_key: string }[]>`
		select ri.variety, ri.variety_key from app.recipe_ingredients ri join app.recipes r on r.id = ri.recipe_id
		where ri.ingredient_id = ${ingredientId} and r.status <> 'draft' and ri.variety is not null`;
	const groups = new Map<string, { spellings: Map<string, { variety: Record<Locale, string>; n: number }>; uses: number }>();
	for (const r of rows) {
		const variety = { 'it-IT': r.variety['it-IT'] ?? '', 'en-GB': r.variety['en-GB'] ?? '' };
		const group = groups.get(r.variety_key) ?? { spellings: new Map(), uses: 0 };
		const key = JSON.stringify(variety);
		const spelling = group.spellings.get(key) ?? { variety, n: 0 };
		spelling.n++;
		group.uses++;
		group.spellings.set(key, spelling);
		groups.set(r.variety_key, group);
	}
	const varieties = [...groups.values()]
		.map((g) => ({ variety: [...g.spellings.values()].sort((a, b) => b.n - a.n)[0]!.variety, uses: g.uses }))
		.sort((a, b) => b.uses - a.uses || a.variety['it-IT'].localeCompare(b.variety['it-IT'], 'it-IT'));
	return { varieties };
}

export async function varietyCheck(tx: Tx, ingredientId: string, text: string, locale: Locale) {
	const row = await ingredientRow(tx, ingredientId);
	const { varieties } = await knownVarieties(tx, ingredientId);
	return { hints: varietyHints({ ingredientName: localText(row.name, locale), known: varieties.map((v) => v.variety), text, locale }) };
}

export async function listBooks(tx: Tx) {
	const rows = await tx<{ id: string; slug: string; title: string; archived_at: Date | null }[]>`select id, slug, title, archived_at from app.books order by title, slug`;
	return { books: rows.map((b) => ({ bookId: b.id, slug: b.slug, title: b.title, archived: b.archived_at !== null })) };
}
