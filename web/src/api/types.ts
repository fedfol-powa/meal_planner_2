import type {
  Contract,
  RecipeDetailView as ContractRecipeDetailView,
  IngredientLineView,
  ProfileView,
  RatingSummaryView,
  RecipeListItemView,
  RecipeSummaryView
} from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import type { IsoDate, LocalDateTime, MealType } from '../lib/calendar';

export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
export type ProteinGroup = 'fish' | 'white_meat' | 'red_meat' | 'cured_meat' | 'legumes' | 'eggs' | 'cheese' | 'vegetarian';
export type FamilyRole = 'family_admin' | 'member';

/** Recipe views of the contract (W6): a never-published recipe has only id, name and maybe a description. */
export type RatingSummary = RatingSummaryView;
export type RecipeSummary = RecipeSummaryView;
/** Quantity already scaled, converted and written in the user's language (spec section 1, ready views). */
export type IngredientLine = IngredientLineView;
export interface MealView {
  slotId: string; date: IsoDate; mealType: MealType; kind: 'recipe' | 'free' | 'empty';
  recipe: RecipeSummary | null; freeText: string | null; servings: number;
  /** null when the recipe has no verified ingredients yet. */
  ingredients: IngredientLine[] | null; note: string | null;
  /** null when the recipe cannot be rated or opened by this user (e.g. a draft). */
  rating: RatingSummary | null; canOpenRecipe: boolean;
  /** userName null: the author is no longer a member. */
  lastChange: { userName: string | null; at: LocalDateTime } | null;
}
export interface DayView { date: IsoDate; meals: MealView[] }
export interface WeekView { startsOn: IsoDate; days: DayView[] }
export type OpeningView = { kind: 'no_weeks' } | { kind: 'day'; date: IsoDate; weekStartsOn: IsoDate };
export type RecipeSort = 'name' | 'rating' | 'added' | 'lastEaten';
export interface RecipeQuery {
  text?: string; mealType?: MealType; maxMinutes?: number; proteinGroup?: ProteinGroup; minStars?: number;
  sort?: RecipeSort; reversed?: boolean;
}
export type RecipeListItem = RecipeListItemView;
export type RecipeDetailView = ContractRecipeDetailView;
export type { ProfileView };
/** A family of the profile: the one shown is `currentFamilyId`. */
export type FamilyView = ProfileView['families'][number];

/** «Invariato» in the contract (decided by W1). The version is an opaque string: kept and sent back, never parsed. */
export type Read<T> = { unchanged: true; version: string } | { unchanged: false; version: string; data: T };
export interface ReadInput { knownVersion?: string }
export interface FamilyInput extends ReadInput { familyId: string }

/**
 * Areas of the contract read from the Worker (second PR). Each wave 2 producer adds its area here
 * when it is in the contract and served, removes it from ProvisionalApi and aligns the fake client.
 */
export const SERVER_AREAS = ['session', 'profile', 'recipes', 'ratings'] as const satisfies readonly (keyof Contract)[];
export type ServerArea = (typeof SERVER_AREAS)[number];

/** What the screens use: the contract's client for the server areas, the provisional areas otherwise. */
export type Api = ContractRouterClient<Pick<Contract, ServerArea>> & ProvisionalApi;

/** Areas not served yet: same shape as the oRPC client (nested by area), answered by the fake client. */
export interface ProvisionalApi {
  menu: {
    getOpening(input: FamilyInput): Promise<Read<OpeningView>>;
    getWeek(input: FamilyInput & { weekStartsOn: IsoDate }): Promise<Read<WeekView>>;
    /** Days with a menu in a month (YYYY-MM), for the date picker. */
    getDates(input: FamilyInput & { month: string }): Promise<Read<IsoDate[]>>;
  };
}

export const PROTEIN_GROUPS = ['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian'] as const satisfies readonly ProteinGroup[];
