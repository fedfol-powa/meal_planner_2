import type { RecipeDraftDocument } from './document.ts';
import type { DraftTranslated } from './localized.ts';
import { cleanVariety } from './variety.ts';

const trim = (text: string | null | undefined) => (typeof text === 'string' ? text.trim() : text);

function cleanTranslated(value: DraftTranslated | null | undefined, clean: (t: string) => string = (t) => t.trim()) {
	if (!value) return value;
	return Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? clean(text) : text])) as DraftTranslated;
}

/** Texts trimmed on save (spec section 1); varieties also lose double spaces. */
export function cleanDraft(document: RecipeDraftDocument): RecipeDraftDocument {
	return {
		...document,
		name: cleanTranslated(document.name) ?? {},
		description: cleanTranslated(document.description),
		sourceUrl: trim(document.sourceUrl),
		bookPages: trim(document.bookPages),
		ingredients: document.ingredients?.map((line) => ({
			...line,
			variety: cleanTranslated(line.variety, cleanVariety),
			preparation: cleanTranslated(line.preparation),
			quantity: line.quantity.kind === 'text' ? { kind: 'text', text: cleanTranslated(line.quantity.text) ?? {} } : line.quantity,
			sourceText: line.sourceText.trim()
		}))
	};
}
