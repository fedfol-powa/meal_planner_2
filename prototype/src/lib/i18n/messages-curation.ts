// Round 5 texts (curation), merged into messages.ts.
export const itCuration = {
	'recipe.missing.names': 'nome o descrizione',
	'recipe.missing.source': 'dati della fonte',
	'recipe.missing.details': 'durata',
	'recipe.missing.invalid': 'dati da correggere',
	'curation.source.web': 'Sito web',
	'curation.source.youtube': 'Video YouTube',
	'curation.source.book': 'Libro',
	'curation.source.home': 'Ricetta di casa',
	'curation.mealType.lunch': 'Pranzo',
	'curation.mealType.dinner': 'Cena',
	'curation.mealType.both': 'Pranzo e cena',
	'curation.optional': 'facoltativo'
} as const;

export const enCuration: Record<keyof typeof itCuration, string> = {
	'recipe.missing.names': 'name or description',
	'recipe.missing.source': 'source details',
	'recipe.missing.details': 'duration',
	'recipe.missing.invalid': 'data to fix',
	'curation.source.web': 'Website',
	'curation.source.youtube': 'YouTube video',
	'curation.source.book': 'Book',
	'curation.source.home': 'Home recipe',
	'curation.mealType.lunch': 'Lunch',
	'curation.mealType.dinner': 'Dinner',
	'curation.mealType.both': 'Lunch and dinner',
	'curation.optional': 'optional'
};
