// Import of the origin recipe book (detail spec, section 4): writes out/bundle.json, out/report.md and
// out/review.html. Reads ../meal_planner only; never writes to the database.
// Usage: node scripts/import/import-recipes.ts [--existing <file.json>] [--today <YYYY-MM-DD>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { parseAttributes } from '../planner-data/attributes.ts';
import { originDir, readOriginRecipes } from '../planner-data/origin.ts';
import { buildBundle, selectFresh, type BundleResult, type ExistingCatalogue } from './bundle.ts';
import { isValidIsoDate } from './family.ts';
import { readInputs } from './inputs.ts';
import { renderReport } from './report.ts';
import { renderReviewPage } from './review-page.ts';

export function runImport(options: { root: string; originDirectory?: string; existingFile?: string; today?: string; now?: Date }): { result: BundleResult; files: Record<string, string> } {
	const now = options.now ?? new Date();
	const importDate = options.today ?? now.toISOString().slice(0, 10);
	if (!isValidIsoDate(importDate)) throw new Error(`Invalid import date: ${importDate}`);

	const origin = options.originDirectory ?? originDir(options.root);
	const recipes = readOriginRecipes(origin);
	const existing: ExistingCatalogue = options.existingFile ? JSON.parse(readFileSync(options.existingFile, 'utf8')) : { recipes: [], ingredients: [], books: [] };
	// Cards already imported are set aside before validating attributes against their content (review, point 7).
	const { fresh } = selectFresh(recipes, existing);
	const importDir = resolve(options.root, 'scripts/import');
	const { attributes, errors } = parseAttributes(readFileSync(resolve(importDir, 'recipe-attributes.yaml'), 'utf8'), fresh);
	// The file classifies the cards with ingredients and servings; a card without an entry becomes a draft with
	// required attributes, and entries of cards set aside are not errors.
	const originIds = new Set(recipes.map((r) => r.id));
	const realErrors = errors.filter((e) => !e.endsWith(': missing') && !(e.endsWith(': not a recipe of the catalogue') && originIds.has(e.slice(0, e.indexOf(':')))));
	if (realErrors.length) throw new Error(`recipe-attributes.yaml is not valid:\n${realErrors.join('\n')}`);

	const result = buildBundle({ origin: recipes, attributes, inputs: readInputs(importDir), existing, importDate, generatedAt: now.toISOString() });
	const archivePath = resolve(origin, 'ricettario/archivio.yaml');
	const archivedCount = existsSync(archivePath) ? ((parse(readFileSync(archivePath, 'utf8')) as { ricette?: unknown[] }).ricette ?? []).length : 0;
	return {
		result,
		files: {
			'bundle.json': `${JSON.stringify(result.bundle, null, '\t')}\n`,
			'report.md': renderReport(result, { archivedCount }),
			'review.html': renderReviewPage(result.bundle)
		}
	};
}

/** One line for the console; files still to review block every publication (wave 2). */
export function summaryOf(result: BundleResult): string {
	const { recipes, ingredients, pendingReview } = result.bundle;
	const publishable = recipes.filter((r) => r.status === 'publishable').length;
	const pending = pendingReview.length ? ` ${pendingReview.length} input files pending review: nothing publishes until they are approved.` : '';
	return `${recipes.length} recipes (${publishable} publishable), ${ingredients.length} ingredients, ${result.skipped.length} skipped.${pending} Files in scripts/import/out/.`;
}

const argument = (name: string) => {
	const index = process.argv.indexOf(name);
	return index >= 0 ? process.argv[index + 1] : undefined;
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
	const { result, files } = runImport({ root, existingFile: argument('--existing'), today: argument('--today') });
	const out = resolve(root, 'scripts/import/out');
	mkdirSync(out, { recursive: true });
	for (const [name, content] of Object.entries(files)) writeFileSync(resolve(out, name), content);
	console.log(summaryOf(result));
}
