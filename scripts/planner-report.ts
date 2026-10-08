// Planner quality report (spec section 9, M0 experiment): 20 weeks for the curator's family from real data.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, FOOD_GROUPS, generateWeek, hardViolations, isOutOfSeason, weekdayOf, weekMetrics, type PastMeal, type PlannedWeek, type PlannerInput, type WeekMetrics } from '../domain/src/planner/index.ts';
import { parseAttributes, toPlannerRecipes } from './planner-data/attributes.ts';
import { curatorFamilySettings, curatorRestrictions } from './planner-data/family.ts';
import { familyScoresOf, historyOf, originDir, publishable, readOriginRecipes } from './planner-data/origin.ts';

const FIRST_WEEK = '2026-10-12';
const WEEKS = 20;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const all = readOriginRecipes(originDir(root));
const catalogue = all.filter(publishable);
const { attributes, errors } = parseAttributes(readFileSync(resolve(root, 'scripts/import/recipe-attributes.yaml'), 'utf8'), catalogue);
if (errors.length) {
	console.error(errors.join('\n'));
	process.exit(1);
}
const recipes = toPlannerRecipes(catalogue, attributes);
const names = new Map(all.map((r) => [r.id, r.nome]));
const byId = new Map(recipes.map((r) => [r.id, r]));
const settings = curatorFamilySettings();
const restrictions = curatorRestrictions(recipes);
const familyScores = familyScoresOf(all);
const ownedBookIds = [...new Set(recipes.flatMap((r) => (r.bookId ? [r.bookId] : [])))];
const startHistory = historyOf(all, FIRST_WEEK);

const GROUP_LABEL: Record<string, string> = { fish: 'pesce', legumes: 'legumi', white_meat: 'carne bianca', red_meat: 'carne rossa', cured_meat: 'salumi', eggs: 'uova', cheese: 'formaggi', potatoes: 'patate', heavy: 'pesanti' };
const DAY_LABEL = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const MEAL_LABEL = { lunch: 'pranzo', dinner: 'cena' };

let history: PastMeal[] = startHistory;
const results: { input: PlannerInput; week: PlannedWeek; metrics: WeekMetrics; violations: string[] }[] = [];
for (let i = 0; i < WEEKS; i++) {
	const input: PlannerInput = { familyId: 'family-curator', weekStart: addDays(FIRST_WEEK, 7 * i), settings, recipes, ownedBookIds, exclusions: [], restrictions, familyScores, globalScores: {}, history };
	const week = generateWeek(input);
	results.push({ input, week, metrics: weekMetrics(week, input), violations: hardViolations(week, input) });
	history = [...history, ...week.slots.flatMap((s) => (s.content.kind === 'recipe' ? [{ date: s.date, mealType: s.mealType, recipeId: s.content.recipeId }] : []))];
}

const mealName = (m: PastMeal) => `${names.get(m.recipeId) ?? m.recipeId} (${DAY_LABEL[weekdayOf(m.date)]} ${m.date.slice(5)} ${MEAL_LABEL[m.mealType]})`;
const usage = new Map<string, number>();
for (const { week } of results) for (const s of week.slots) if (s.content.kind === 'recipe') usage.set(s.content.recipeId, (usage.get(s.content.recipeId) ?? 0) + 1);
const violations = results.flatMap((r) => r.violations.map((v) => `${r.week.weekStart}: ${v}`));

const lines: string[] = [
	'# Report del pianificatore (esperimento M0)',
	'',
	`Generato da \`npm run planner-report\`: ${WEEKS} settimane dal ${FIRST_WEEK}. Catalogo: ${recipes.length} ricette pubblicabili su ${all.length}. Storico iniziale: ${startHistory.length} pasti mangiati. Voti: ${Object.keys(familyScores).length} ricette votate. Impostazioni dalle regole d'origine (\`scripts/planner-data/family.ts\`).`,
	'',
	'## Sintesi',
	'',
	`- Violazioni dei vincoli rigidi: **${violations.length}**${violations.length ? `\n${violations.map((v) => `  - ${v}`).join('\n')}` : ''}`,
	`- Pasti «nessuna ricetta adatta»: **${results.reduce((n, r) => n + r.metrics.noMatch, 0)}** su ${results.reduce((n, r) => n + r.week.slots.filter((s) => s.content.kind !== 'free').length, 0)}`,
	`- Settimane con regole non rispettate (venerdì pesce, intervalli, note/nuove): **${results.filter((r) => r.metrics.problems.length > 0).length}** su ${WEEKS}`,
	`- Ricette usate almeno una volta: **${usage.size}** su ${recipes.length}`,
	`- Pasti fuori stagione: **${results.reduce((n, r) => n + r.metrics.outOfSeason, 0)}** (segnati con «fuori stagione» nelle settimane)`,
	'',
	'### Gruppi alimentari per settimana',
	'',
	'| Gruppo | Intervallo | Minimo | Medio | Massimo | Settimane fuori |',
	'|---|---|---|---|---|---|',
	...FOOD_GROUPS.map((g) => {
		const counts = results.map((r) => r.metrics.groupCounts[g]);
		const range = settings.groupRanges[g];
		const out = counts.filter((c) => c < range.min || c > range.max).length;
		return `| ${GROUP_LABEL[g]} | ${range.min}-${range.max} | ${Math.min(...counts)} | ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)} | ${Math.max(...counts)} | ${out} |`;
	}),
	'',
	'### Ricette più usate e mai usate',
	'',
	...[...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => `- ${names.get(id)}: ${n} volte`),
	'',
	`Mai usate: ${recipes.filter((r) => !usage.has(r.id)).map((r) => names.get(r.id)).join('; ') || 'nessuna'}.`,
	'',
	'### Coppie simili ravvicinate',
	'',
	...results.flatMap((r) => r.metrics.closePairs.filter((p) => p.distance === 1).map((p) => `- ${mealName(p.first)} → ${mealName(p.second)}: ${p.shared.join(', ')}`)),
	'',
	'## Settimane',
	''
];

for (const { week, metrics } of results) {
	lines.push(`### Settimana del ${week.weekStart}`, '', '| Giorno | Pranzo | Cena |', '|---|---|---|');
	for (let day = 0; day < 7; day++) {
		const date = addDays(week.weekStart, day);
		const cell = (mealType: 'lunch' | 'dinner') => {
			const slot = week.slots.find((s) => s.date === date && s.mealType === mealType);
			if (!slot) return '—';
			if (slot.content.kind === 'free') return `_${slot.content.text}_`;
			if (slot.content.kind === 'no_match') return '**nessuna ricetta adatta**';
			const recipe = byId.get(slot.content.recipeId)!;
			const stars = familyScores[recipe.id] ? `${familyScores[recipe.id]}★` : 'senza voto';
			const season = isOutOfSeason(recipe, date) ? ' · **fuori stagione**' : '';
			return `${names.get(recipe.id)} · ${recipe.durationMinutes ?? '?'} min · ${slot.servings} porz. · ${stars}${season}`;
		};
		lines.push(`| ${DAY_LABEL[day]} ${date.slice(8)} | ${cell('lunch')} | ${cell('dinner')} |`);
	}
	const groups = FOOD_GROUPS.filter((g) => metrics.groupCounts[g] > 0).map((g) => `${GROUP_LABEL[g]} ${metrics.groupCounts[g]}`).join(', ');
	const problems = metrics.problems.map((p) => `${p.kind} ${p.detail}`).join('; ') || 'nessuno';
	lines.push('', `Gruppi: ${groups}. Note/nuove: ${metrics.known}/${metrics.fresh}${metrics.knownNewApplies ? '' : ' (quota non ancora attiva)'}. Problemi di regole: ${problems}.`, '');
}

const output = resolve(root, 'progetto/reports/planner-report.md');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join('\n'));
console.log(`Scritto ${output}`);
if (violations.length) process.exit(1);
