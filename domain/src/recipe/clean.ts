import type { RecipeDraftDocument } from './document.ts';
import { textOrNull, type DraftTranslated } from './localized.ts';
import { cleanVariety } from './variety.ts';

function cleanTranslated(value: DraftTranslated | null | undefined, clean: (t: string) => string = (t) => t.trim()) {
	if (!value) return value;
	return Object.fromEntries(Object.entries(value).map(([locale, text]) => [locale, typeof text === 'string' ? clean(text) : text])) as DraftTranslated;
}

/** Texts trimmed on save (spec section 1); varieties also lose double spaces, blank source fields become null. */
export function cleanDraft(document: RecipeDraftDocument): RecipeDraftDocument {
	return {
		...document,
		name: cleanTranslated(document.name) ?? {},
		description: cleanTranslated(document.description),
		// Blank source fields are no source data: null, as toPublished stores them.
		sourceUrl: textOrNull(document.sourceUrl?.trim()),
		bookId: textOrNull(document.bookId?.trim()),
		bookPages: textOrNull(document.bookPages?.trim()),
		ingredients: document.ingredients?.map((line) => ({
			...line,
			variety: cleanTranslated(line.variety, cleanVariety),
			preparation: cleanTranslated(line.preparation),
			quantity: line.quantity.kind === 'text' ? { kind: 'text', text: cleanTranslated(line.quantity.text) ?? {} } : line.quantity,
			sourceText: line.sourceText.trim()
		}))
	};
}
