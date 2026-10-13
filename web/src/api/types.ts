import type {
  Contract,
  RecipeDetailView as ContractRecipeDetailView,
  ExclusionsView,
  FamilyView as FamilyDetailView,
  IngredientLineView,
  ProfileView,
  RatingSummaryView,
  RecipeListItemView,
  RecipeSummaryView,
  SettingsView,
  WeekView
} from '@app/contract';
import type { ContractRouterClient } from '@orpc/contract';
import type { MealType } from '../lib/calendar';

export type RecipeMealType = MealType | 'both';
export type SourceType = 'web' | 'youtube' | 'book' | 'home';
export type ProteinGroup = 'fish' | 'white_meat' | 'red_meat' | 'cured_meat' | 'legumes' | 'eggs' | 'cheese' | 'vegetarian';
export type FamilyRole = 'family_admin' | 'member';

/** Recipe views of the contract (W6): a never-published recipe has only id, name and maybe a description. */
export type RatingSummary = RatingSummaryView;
export type RecipeSummary = RecipeSummaryView;
/** Quantity already scaled, converted and written in the user's language (spec section 1, ready views). */
export type IngredientLine = IngredientLineView;
/** The menu's views come from the contract (W1): the area is served by the Worker. */
export type { MealView, OpeningView, WeekView } from '@app/contract';
/** The revision of the meals (W1): every write answers with the meal's week and the action. */
export type { MealActionResult, SuggestionsView } from '@app/contract';
export type DayView = WeekView['days'][number];
export type RecipeSort = 'name' | 'rating' | 'added' | 'lastEaten';
export interface RecipeQuery {
  text?: string; mealType?: MealType; maxMinutes?: number; proteinGroup?: ProteinGroup; minStars?: number;
  sort?: RecipeSort; reversed?: boolean;
}
export type RecipeListItem = RecipeListItemView;
export type RecipeDetailView = ContractRecipeDetailView;
export type { ExclusionsView, FamilyDetailView, ProfileView, SettingsView };
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
export const SERVER_AREAS = ['session', 'profile', 'recipes', 'ratings', 'menu', 'family', 'shopping', 'catalogue', 'meals', 'agents', 'appInvitations'] as const satisfies readonly (keyof Contract)[];
export type ServerArea = (typeof SERVER_AREAS)[number];

/** What the screens use: the contract's client for the server areas, the provisional areas otherwise. */
export type Api = ContractRouterClient<Pick<Contract, ServerArea>> & ProvisionalApi;

/**
 * Areas not served yet: same shape as the oRPC client (nested by area), answered by the fake
 * client. Every area of wave 2 is served; new areas start here.
 */
export interface ProvisionalApi {}

export const PROTEIN_GROUPS = ['fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian'] as const satisfies readonly ProteinGroup[];
