import { missingData, type MissingData } from '../../domain/src/recipe/index.ts';
import type { BundleResult } from './bundle.ts';
import type { HistoryFindingKind } from './family.ts';
import type { FindingKind } from './recipes.ts';

// Report of the ambiguities (spec section 8), in Italian: what the import did not decide on its own.

const MISSING_LABEL: Record<MissingData, string> = {
	names: 'Nome e descrizione', source: 'Fonte', details: 'Durata', attributes: 'Attributi del pianificatore',
	baseServings: 'Porzioni', ingredients: 'Ingredienti', translation: 'Traduzione', invalid: 'Dati non validi'
};
const HISTORY_LABEL: Record<HistoryFindingKind, string> = {
	not_cooked: 'non cucinato, non importato',
	outcome_not_recorded: 'esito non registrato, importato come mangiato',
	week_not_concluded: 'settimana non conclusa, non importato',
	unrecognised_slot: 'giorno o pasto non riconosciuto, scartato',
	invalid_week: 'settimana non valida (data inesistente o non di lunedì), scartato'
};

const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : '_Nessuna voce._');

export function renderReport(result: BundleResult, extras: { archivedCount: number }): string {
	const { bundle, recipeFindings, historyFindings, skipped } = result;
	const findings = (kind: FindingKind) => [...recipeFindings].flatMap(([slug, fs]) => fs.filter((f) => f.kind === kind).map((f) => `\`${slug}\`: ${f.detail}`));
	const drafts = bundle.recipes.filter((r) => r.status === 'draft').map((r) => `\`${r.origin.slug}\`: ${missingData(r.issues).map((m) => MISSING_LABEL[m]).join(', ')}`);
	const published = bundle.recipes.length - drafts.length;
	return [
		`# Report dell'import del ricettario`,
		`Data dell'import: ${bundle.importDate}. Ricette nel pacchetto: ${bundle.recipes.length} (${published} pubblicabili, ${drafts.length} in bozza). Ingredienti nuovi: ${bundle.ingredients.length}. Libri nuovi: ${bundle.books.length}.`,
		`## File da rivedere`, list(bundle.pendingReview.map((f) => `\`${f}\` senza approvazione valida (assente o contenuto cambiato dopo la revisione): nessuna ricetta si pubblica finché non è rivisto`)),
		`## Ricette in bozza`, list(drafts),
		`## Righe da mappare`, "Righe rimaste nel documento senza ingrediente del catalogo: la ricetta non si pubblica finché un curatore non sceglie l'ingrediente.", list(findings('unmapped_line')),
		`## Righe ripetute dopo la mappatura`, 'Restano entrambe: unire le quantità è una scelta del curatore.', list(findings('duplicate_after_mapping')),
		`## Tazze senza equivalenza`, list(findings('cup_without_equivalence')),
		`## Attributi mancanti`, list(findings('missing_attributes')),
		`## Ricette di casa con URL (R4)`, "Importate come `web` con l'URL; il tipo d'origine resta `casa`. Le note riportano anche gli adattamenti della famiglia, che non entrano nella ricetta.", list(findings('home_with_url')),
		`## Ricette provate senza data (R4)`, "Registrate come `triedUndated` nel pacchetto (nel database in `family_tried_recipes` con `source: 'import'`), senza pasti inventati; per ora il pianificatore non le usa.", list(bundle.family.triedUndated.map((s) => `\`${s}\``)),
		`## Storico non importato o senza esito`, list(historyFindings.map((h) => `\`${h.originSlug}\`, settimana ${h.week}, ${h.slot}: ${HISTORY_LABEL[h.kind]}`)),
		`## Ingredienti di dispensa esclusi nell'origine`, "L'import non aggiunge righe senza la fonte: un curatore può aggiungerle verificandole.", list(findings('pantry_excluded')),
		`## Alternative nei nomi e note della mappatura`, list([...findings('alternative_in_name'), ...findings('mapping_note')]),
		`## Preparazioni in altre pagine del libro`, list(findings('book_dependency')),
		`## Quantità con note`, 'Approssimazioni, note tra parentesi e numeri ambigui («1.000»: uno o mille?), anche quando la quantità è rimasta testo.', list(findings('quantity_note')),
		`## Tag d'origine`, 'Non importati: li sostituiscono gli attributi del pianificatore.',
		`## Schede già presenti`, list(skipped.map((s) => `\`${s}\` saltata: già nel database`)),
		`## Archivio`, `${extras.archivedCount} schede di \`archivio.yaml\` non importate.`
	].join('\n\n') + '\n';
}
