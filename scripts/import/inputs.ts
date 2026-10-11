import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import * as z from 'zod';
import { catalogueIngredientSchema, type CatalogueIngredient } from '../../domain/src/recipe/index.ts';
import {
	assertUnambiguousEquivalences, preparationKey, localizedSchema, unitCodeSchema, unitEquivalenceSchema, type Localized, type UnitEquivalence
} from '../../domain/src/units/index.ts';

// Reviewed inputs of the import (detail spec, section 4): YAML written by the agent, approved by the user
// with a header line bound to the content (review of 11 October 2026).

export const INPUT_FILES = ['ingredients.yaml', 'ingredient-lines.yaml', 'translations.en-GB.yaml', 'unit-equivalences.yaml'] as const;
const APPROVAL = /^# Revisione: (\d{4}-\d{2}-\d{2}), rivisto dall'utente, sha256:([0-9a-f]{64})\n/;

const withoutApproval = (text: string) => text.replace(APPROVAL, '');

/** SHA-256 of the file without its approval line. */
export const contentHash = (text: string) => createHash('sha256').update(withoutApproval(text)).digest('hex');

export function approvalOf(text: string): { date: string | null; valid: boolean } {
	const match = APPROVAL.exec(text);
	return match ? { date: match[1], valid: match[2] === contentHash(text) } : { date: null, valid: false };
}

/** The file with a fresh approval line: written only when the user says the review is done. */
export const approveText = (text: string, date: string) =>
	`# Revisione: ${date}, rivisto dall'utente, sha256:${contentHash(text)}\n${withoutApproval(text)}`;

export interface IngredientLineMapping {
	ingredient: string;
	variety: Localized | null;
	preparation: Localized | null;
	optional: boolean;
	note: string | null;
}
export interface RecipeTranslation {
	name: string;
	description: string;
}
export interface ImportInputs {
	ingredients: CatalogueIngredient[];
	lines: Map<string, IngredientLineMapping>;
	recipeTranslations: Map<string, RecipeTranslation>;
	quantityTranslations: Map<string, string>;
	equivalences: UnitEquivalence[];
	pendingReview: string[];
}

const explain = (error: z.ZodError) => error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ');
const section = (text: string, key: string): Record<string, unknown> => ((parse(text) as Record<string, unknown> | null)?.[key] ?? {}) as Record<string, unknown>;

const ingredientEntry = z.strictObject({
	name: localizedSchema,
	synonyms: catalogueIngredientSchema.shape.synonyms.optional(),
	department: catalogueIngredientSchema.shape.department,
	pantry: z.boolean()
});

export function parseIngredients(text: string): { ingredients: CatalogueIngredient[]; errors: string[] } {
	const ingredients: CatalogueIngredient[] = [];
	const errors: string[] = [];
	for (const [slug, raw] of Object.entries(section(text, 'ingredients'))) {
		const entry = ingredientEntry.safeParse(raw);
		if (!entry.success) {
			errors.push(`${slug}: ${explain(entry.error)}`);
			continue;
		}
		const ingredient = catalogueIngredientSchema.safeParse({ slug, name: entry.data.name, synonyms: entry.data.synonyms ?? { 'it-IT': [], 'en-GB': [] }, department: entry.data.department, isPantry: entry.data.pantry });
		if (ingredient.success) ingredients.push(ingredient.data);
		else errors.push(`${slug}: ${explain(ingredient.error)}`);
	}
	return { ingredients, errors };
}

const lineEntry = z.strictObject({ ingredient: z.string(), variety: localizedSchema.nullable(), preparation: localizedSchema.nullable(), optional: z.boolean(), note: z.string().nullable().optional() });

/** Entries no recipe of the bundle uses are allowed (cards already imported, rerun). */
export function parseLines(text: string, slugs: ReadonlySet<string>): { lines: Map<string, IngredientLineMapping>; errors: string[] } {
	const lines = new Map<string, IngredientLineMapping>();
	const errors: string[] = [];
	for (const [name, raw] of Object.entries(section(text, 'lines'))) {
		const entry = lineEntry.safeParse(raw);
		if (!entry.success) errors.push(`${name}: ${explain(entry.error)}`);
		else if (!slugs.has(entry.data.ingredient)) errors.push(`${name}: unknown ingredient "${entry.data.ingredient}"`);
		else lines.set(name, { ...entry.data, note: entry.data.note ?? null });
	}
	return { lines, errors };
}

const translationEntry = z.strictObject({ name: z.string().trim().min(1), description: z.string().trim().min(1) });

export function parseTranslations(text: string) {
	const recipes = new Map<string, RecipeTranslation>();
	const quantities = new Map<string, string>();
	const errors: string[] = [];
	for (const [slug, raw] of Object.entries(section(text, 'recipes'))) {
		const entry = translationEntry.safeParse(raw);
		if (entry.success) recipes.set(slug, entry.data);
		else errors.push(`recipes.${slug}: ${explain(entry.error)}`);
	}
	for (const [source, english] of Object.entries(section(text, 'quantities'))) {
		if (typeof english === 'string' && english.trim()) quantities.set(source, english.trim());
		else errors.push(`quantities.${source}: English text missing`);
	}
	return { recipes, quantities, errors };
}

const equivalenceEntry = z.strictObject({
	ingredient: z.string(),
	from: unitCodeSchema,
	to: unitCodeSchema,
	factor: z.number(),
	preparation: z.string().nullable().optional(),
	source: z.string()
});

/** Recipe-scope equivalences (US cups), with the preparation they are valid for (coordinator, 11 October 2026). */
export function parseEquivalences(text: string, slugs: ReadonlySet<string>): { equivalences: UnitEquivalence[]; errors: string[] } {
	const raw = ((parse(text) as { equivalences?: unknown[] } | null)?.equivalences ?? []) as unknown[];
	const equivalences: UnitEquivalence[] = [];
	const errors: string[] = [];
	raw.forEach((item, index) => {
		const entry = equivalenceEntry.safeParse(item);
		if (!entry.success) return errors.push(`equivalences.${index}: ${explain(entry.error)}`);
		if (!slugs.has(entry.data.ingredient)) return errors.push(`equivalences.${index}: unknown ingredient "${entry.data.ingredient}"`);
		const equivalence = unitEquivalenceSchema.safeParse({
			ingredientId: entry.data.ingredient, fromUnit: entry.data.from, toUnit: entry.data.to, factor: entry.data.factor,
			scope: 'recipe', preparation: preparationKey(entry.data.preparation), source: entry.data.source
		});
		if (equivalence.success) equivalences.push(equivalence.data);
		else errors.push(`equivalences.${index}: ${explain(equivalence.error)}`);
	});
	try {
		assertUnambiguousEquivalences(equivalences);
	} catch (error) {
		errors.push((error as Error).message);
	}
	return { equivalences, errors };
}

/** Reads the four files of scripts/import; every problem is reported at once. */
export function readInputs(dir: string): ImportInputs {
	const texts = Object.fromEntries(INPUT_FILES.map((f) => [f, readFileSync(resolve(dir, f), 'utf8')])) as Record<(typeof INPUT_FILES)[number], string>;
	const ingredients = parseIngredients(texts['ingredients.yaml']);
	const slugs = new Set(ingredients.ingredients.map((i) => i.slug));
	const lines = parseLines(texts['ingredient-lines.yaml'], slugs);
	const translations = parseTranslations(texts['translations.en-GB.yaml']);
	const equivalences = parseEquivalences(texts['unit-equivalences.yaml'], slugs);
	const errors = [...ingredients.errors, ...lines.errors, ...translations.errors, ...equivalences.errors];
	if (errors.length) throw new Error(`Import inputs are not valid:\n${errors.join('\n')}`);
	return {
		ingredients: ingredients.ingredients,
		lines: lines.lines,
		recipeTranslations: translations.recipes,
		quantityTranslations: translations.quantities,
		equivalences: equivalences.equivalences,
		pendingReview: INPUT_FILES.filter((f) => !approvalOf(texts[f]).valid)
	};
}
