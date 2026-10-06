import type {
	IsoDate,
	LocalDateTime,
	MealType,
	MeasurementSystem,
	ProteinGroup,
	Quantity,
	RecipeMealType,
	SourceType,
	WeekStatus
} from '#lib/domain/types.ts';

export interface RatingSummary {
	familyAverage: number | null;
	familyCount: number;
	myStars: number | null;
}

export interface RecipeSummary {
	id: string;
	name: string;
	description: string;
	translationMissing: boolean;
	photo: string | null;
	durationMinutes: number | null;
	sourceType: SourceType;
	sourceUrl: string | null;
	bookTitle: string | null;
	bookPages: string | null;
	mealType: RecipeMealType;
	proteinGroup: ProteinGroup | null;
}

export interface ScaledIngredient {
	ingredientId: string;
	name: string;
	quantity: Quantity;
	sourceText: string;
}

export interface MealView {
	slotId: string;
	date: IsoDate;
	mealType: MealType;
	kind: 'recipe' | 'free' | 'empty';
	recipe: RecipeSummary | null;
	freeText: string | null;
	servings: number;
	/** null when the recipe still lacks verified ingredients (draft). */
	ingredients: ScaledIngredient[] | null;
	note: string | null;
	isPast: boolean;
	cooked: boolean | null;
	canMarkNotCooked: boolean;
	canRate: boolean;
	rating: RatingSummary | null;
	/** userName is null when the author is no longer a member ("former member"). */
	lastChange: { userName: string | null; at: LocalDateTime } | null;
}

export interface DayView {
	date: IsoDate;
	meals: MealView[];
}

export interface WeekView {
	startsOn: IsoDate;
	status: WeekStatus;
	days: DayView[];
	previous: IsoDate | null;
	next: IsoDate | null;
	measurementSystem: MeasurementSystem;
}

export type OpeningTarget = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };
