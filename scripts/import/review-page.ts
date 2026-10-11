import type { CatalogueIngredient, DraftTranslated } from '../../domain/src/recipe/index.ts';
import type { ImportBundle } from './bundle.ts';

// Standalone review page for the user (detail spec, section 5): Italian and English side by side.

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const both = (v: DraftTranslated | null | undefined) =>
	v ? `${escape(v['it-IT'] ?? '')}<br><span class="en">${escape(v['en-GB'] ?? '') || '<em>manca</em>'}</span>` : '';

const STYLE = `:root{--bg:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e2dc;--warn:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#f2f0ea;--muted:#a3a19a;--line:#33322e;--warn:#f2b8b5}}
body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
table{border-collapse:collapse;width:100%;margin:8px 0 24px}td,th{border-bottom:1px solid var(--line);padding:6px;text-align:left;vertical-align:top}
.en{color:var(--muted)}.issue{color:var(--warn)}section{overflow-x:auto}`;

/**
 * `catalogue` names every ingredient a line may use, also those already in the database on a rerun;
 * the bundle's own list is only what is still to insert.
 */
export function renderReviewPage(bundle: ImportBundle, catalogue: CatalogueIngredient[]): string {
	const ingredientName = new Map(catalogue.map((i) => [i.slug, i.name]));
	const recipes = bundle.recipes.map((r) => {
		const d = r.document;
		const rows = (d.ingredients ?? []).map((l) => {
			const q = l.quantity;
			const quantity = q.kind === 'amount' ? `${q.value ?? '?'} ${q.unit}` : q.kind === 'to_taste' ? 'q.b.' : both(q.text);
			const ingredient = l.ingredientId === null ? '<span class="issue">da mappare</span>' : both(ingredientName.get(l.ingredientId)) || escape(l.ingredientId);
			return `<tr><td>${escape(l.sourceText)}</td><td>${ingredient}</td><td>${both(l.variety)}</td><td>${both(l.preparation)}</td><td>${quantity}</td><td>${l.isOptional ? 'sì' : ''}</td><td>${l.isPrimary ? 'sì' : ''}</td></tr>`;
		});
		const issues = r.issues.map((i) => `${i.code} (${i.path.join('.')})`).join(', ');
		return `<section><h2>${escape(d.name['it-IT'] ?? r.origin.slug)}</h2><p><code>${escape(r.origin.slug)}</code> · ${r.status === 'publishable' ? 'pubblicabile' : 'bozza'}${issues ? ` · <span class="issue">${escape(issues)}</span>` : ''}</p>
<table><tr><th>Nome</th><td>${both(d.name)}</td></tr><tr><th>Descrizione</th><td>${both(d.description)}</td></tr></table>
<table><tr><th>Riga della fonte</th><th>Ingrediente</th><th>Varietà</th><th>Preparazione</th><th>Quantità</th><th>Facoltativo</th><th>Principale</th></tr>${rows.join('')}</table></section>`;
	});
	const toInsert = bundle.ingredients.map((i) => `<tr><td><code>${escape(i.slug)}</code></td><td>${both(i.name)}</td><td>${escape(i.department)}</td><td>${i.isPantry ? 'sì' : ''}</td></tr>`);
	return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisione import</title><style>${STYLE}</style></head>
<body><h1>Revisione dell'import del ricettario</h1><p>Generata il ${escape(bundle.generatedAt)}. Per ogni ricetta: italiano sopra, inglese sotto in grigio.</p>
${recipes.join('\n')}
<section><h2>Ingredienti da inserire nel catalogo</h2><table><tr><th>Slug</th><th>Nome</th><th>Reparto</th><th>Dispensa</th></tr>${toInsert.join('')}</table></section>
</body></html>
`;
}
