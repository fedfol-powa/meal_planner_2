import type { HistoryFindingKind } from '../family.ts';
import type { Counted } from './catalogue.ts';
import type { LoadResult } from './run.ts';

// Report of the production load (detail spec, section 6), in Italian: what the load wrote or would
// write, then what needs a look before the "vai", then the import report. No connection string.

const HISTORY_LABEL: Record<HistoryFindingKind, string> = {
	not_cooked: 'non cucinato, non importato',
	outcome_not_recorded: 'esito non registrato, importato come mangiato',
	week_not_concluded: 'settimana non conclusa, non importato',
	unrecognised_slot: 'giorno o pasto non riconosciuto, scartato',
	invalid_week: 'settimana non valida, scartato',
};
const MEAL_LABEL = { lunch: 'pranzo', dinner: 'cena' } as const;

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '_Nessuna voce._');
const row = (label: string, c: Counted) => `| ${label} | ${c.created} | ${c.present} |`;

export function renderLoadReport(result: LoadResult, header: { endpoint: string; inputs: string }): string {
	const { catalogue: c, family: f } = result;
	const blocked = c.publicationBlocked.length
		? `**Nessuna pubblicazione: file da approvare (${c.publicationBlocked.join(', ')}). Tutte le ricette restano bozze.**`
		: 'Pubblicazione ammessa: tutti i file di revisione sono approvati.';
	// The import report keeps its sections, one level down.
	const importReport = result.importReport.replace(/^(#+) /gm, '#$1 ');
	return [
		`# Caricamento (${result.mode})`,
		`Destinazione: \`${header.endpoint}\`. Impronta degli input: \`${header.inputs}\`.`,
		blocked,
		[
			'| Voce | Creati | Già presenti |',
			'|---|---|---|',
			row('Libri', c.books),
			row('Ingredienti', c.ingredients),
			row('Equivalenze', c.equivalences),
			`| Ricette | ${c.recipes.published} pubblicate, ${c.recipes.drafts} bozze | ${c.recipes.present} |`,
			`| Impostazioni (chiavi) | ${f.settings} | |`,
			row('Limiti sugli ingredienti', f.restrictions),
			row('Libri posseduti', f.books),
			row('Voti', f.ratings),
			row('Ricette provate', f.tried),
			`| Settimane | ${f.weeks.created} (${f.weeks.slots} pasti) | ${f.weeks.present} |`,
		].join('\n'),
		'## Preferenze da sistemare a mano',
		'Note delle schede d\'origine con preferenze che non sono esclusioni: da decidere con la famiglia prima del «vai».',
		list(f.preferences.map((p) => `\`${p.originSlug}\` (${p.name}): ${p.note}`)),
		'## Equivalenze divergenti, conservate',
		list(c.equivalences.diverging),
		'## Voti in sospeso',
		'Voti su ricette ancora in bozza: si aggiungono con un rilancio dopo la pubblicazione.',
		list(f.ratings.pending.map((s) => `\`${s}\``)),
		'## Libri posseduti',
		list(f.ownedBooks),
		'## Ricette dello storico assenti',
		list(f.missingRecipes.map((s) => `\`${s}\``)),
		'## Pasti doppi: passati fra le provate',
		list(f.duplicates.map((d) => `\`${d.originSlug}\`, ${d.date} ${MEAL_LABEL[d.mealType]}`)),
		'## Note del menu in corso non importate',
		"L'app ricalcola le dosi: le note del vecchio PDF restano qui.",
		list(f.notes.map((n) => `${n.date} ${MEAL_LABEL[n.mealType]}: ${n.note}`)),
		'## Casi dello storico (R4)',
		list(f.findings.map((h) => `\`${h.originSlug}\`, settimana ${h.week}, ${h.slot}: ${HISTORY_LABEL[h.kind]}`)),
		importReport.trimEnd(),
	].join('\n\n') + '\n';
}

export function loadSummary(result: LoadResult): string {
	const { catalogue: c, family: f } = result;
	return `${result.mode}: ${c.ingredients.created} ingredients, ${c.recipes.published} published, ${c.recipes.drafts} drafts, ${f.weeks.created} weeks, ${f.ratings.created} ratings (${f.ratings.pending.length} pending), ${f.preferences.length} preferences to settle`;
}
