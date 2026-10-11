export const publishedExample = {
	schemaVersion: 1,
	name: { 'it-IT': 'Pasta al tonno', 'en-GB': 'Tuna pasta' },
	description: { 'it-IT': 'Condisci la pasta col tonno.', 'en-GB': 'Dress the pasta with tuna.' },
	sourceType: 'home',
	sourceUrl: null,
	bookId: null,
	bookPages: null,
	durationMinutes: 20,
	baseServings: 4,
	mealType: 'lunch',
	proteinGroup: 'fish',
	isFreshFish: false,
	carbohydrateGroup: 'pasta',
	category: 'other',
	hasVegetables: false,
	isHeavy: false,
	seasons: [],
	ingredients: [
		{
			ingredientId: 'pasta-corta',
			variety: null,
			preparation: null,
			quantity: { kind: 'amount', value: 320, unit: 'g' },
			sourceText: 'Pasta corta: 320 g',
			isOptional: false,
			isPrimary: false
		},
		{
			ingredientId: 'tonno',
			variety: null,
			preparation: { 'it-IT': 'sgocciolato', 'en-GB': 'drained' },
			quantity: { kind: 'to_taste' },
			sourceText: "Tonno sott'olio: q.b.",
			isOptional: false,
			isPrimary: true
		}
	]
} as const;
