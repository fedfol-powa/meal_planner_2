import type { ProteinGroup } from '@app/domain/planner';
import { plainWords, type Locale, type Localized } from '@app/domain/units';

/** A recipe of the book as the search sees it, loaded in bulk by the handler. */
export interface SearchCandidate {
	id: string;
	name: Localized;
	description: Localized;
	mealType: 'lunch' | 'dinner' | 'both';
	durationMinutes: number;
	proteinGroup: ProteinGroup;
	familyAverage: number | null;
	addedOn: string;
	lastEatenOn: string | null;
	/** Ingredient names, varieties and synonyms, already in the caller's language. */
	ingredientTexts: string[];
}

export interface RecipeQuery {
	text?: string;
	mealType?: 'lunch' | 'dinner';
	maxMinutes?: number;
	proteinGroup?: ProteinGroup;
	minStars?: number;
	sort?: 'name' | 'rating' | 'added' | 'lastEaten';
	reversed?: boolean;
}

const plain = (text: string) => plainWords(text).join(' ');

/** Every word of the search must appear in one of the texts of the caller's language. */
function matches(candidate: SearchCandidate, words: string[], locale: Locale): boolean {
	if (!words.length) return true;
	const texts = [candidate.name[locale], candidate.description[locale], ...candidate.ingredientTexts].map(plain);
	return words.every((word) => texts.some((text) => text.includes(word)));
}

const keyOf = (candidate: SearchCandidate, sort: RecipeQuery['sort']): string | number | null =>
	sort === 'rating' ? candidate.familyAverage : sort === 'added' ? candidate.addedOn : sort === 'lastEaten' ? candidate.lastEatenOn : null;

/** Filters and orders the recipe book (spec of W6): missing values stay last even when reversed. */
export function searchRecipes(candidates: SearchCandidate[], query: RecipeQuery, locale: Locale): SearchCandidate[] {
	const words = plainWords(query.text ?? '');
	const byName = (a: SearchCandidate, b: SearchCandidate) => a.name[locale].localeCompare(b.name[locale], locale);
	const sort = query.sort ?? 'name';
	const direction = query.reversed ? -1 : 1;
	return candidates
		.filter((c) => !query.mealType || c.mealType === query.mealType || c.mealType === 'both')
		.filter((c) => !query.maxMinutes || c.durationMinutes <= query.maxMinutes)
		.filter((c) => !query.proteinGroup || c.proteinGroup === query.proteinGroup)
		.filter((c) => !query.minStars || (c.familyAverage !== null && c.familyAverage >= query.minStars))
		.filter((c) => matches(c, words, locale))
		.sort((a, b) => {
			if (sort === 'name') return direction * byName(a, b);
			const ka = keyOf(a, sort);
			const kb = keyOf(b, sort);
			if (ka === null || kb === null) return ka === kb ? byName(a, b) : ka === null ? 1 : -1;
			if (ka === kb) return byName(a, b);
			// Most recent or best first; reversed flips only this, not the missing values.
			return direction * (ka < kb ? 1 : -1);
		});
}
