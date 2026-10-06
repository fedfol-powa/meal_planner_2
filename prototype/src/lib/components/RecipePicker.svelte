<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { MealType } from '#lib/domain/types.ts';
	import { formatAverage } from '#lib/i18n/dates.ts';
	import { searchRecipes, type RecipeQuery } from '#lib/operations/recipes.ts';
	import { getSuggestions } from '#lib/operations/suggestions.ts';
	import type { RatingSummary, RecipeSummary } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import RecipeFilters from './RecipeFilters.svelte';

	let { slotId, mealType, currentRecipeId, onPick, actions }: {
		slotId: string;
		mealType: MealType;
		currentRecipeId: string | null;
		onPick: (recipeId: string) => void;
		/** Other ways to change the meal (free meal, don't suggest again), under the suggestions. */
		actions?: Snippet;
	} = $props();

	const MAX_RESULTS = 30;
	// "Proponimene altri" shows the next five candidates in this view (round 2 review).
	let offset = $state(0);
	const page = $derived.by(() => {
		const result = getSuggestions(app.db, app.ctx, slotId, offset);
		return result.ok ? result.value : { items: [], nextOffset: 0 };
	});
	const suggestions = $derived(page.items);
	let suggestionList: HTMLElement | undefined = $state();
	let suggestionSection: HTMLElement | undefined = $state();
	function more() {
		offset = page.nextOffset;
		suggestionList?.scrollTo?.({ left: 0 });
		suggestionSection?.scrollIntoView({ block: 'start', behavior: 'smooth' });
	}
	// Starts on the slot's meal (the picker is mounted per slot); results appear once the user types or changes a filter.
	let query = $state<RecipeQuery>(untrack(() => ({ mealType })));
	const searching = $derived(!!query.text || query.mealType !== mealType || !!query.maxMinutes || !!query.proteinGroup || !!query.minStars || !!query.sort);
	const results = $derived.by(() => {
		if (!searching) return [];
		const result = searchRecipes(app.db, app.ctx, query);
		return result.ok ? result.value.filter((i) => i.recipe.id !== currentRecipeId) : [];
	});

	// Rating always shown with the recipe (spec section 5): family average, votes and own stars.
	function ratingText(rating: RatingSummary): string {
		const average = rating.familyAverage != null ? `★ ${formatAverage(app.locale, rating.familyAverage)} (${rating.familyCount})` : app.t('rating.none');
		return `${average} · ${rating.myStars != null ? app.t('rating.you', { stars: rating.myStars }) : app.t('rating.notRated')}`;
	}
	const metaText = (recipe: RecipeSummary) => [recipe.durationMinutes ? app.t('meal.minutes', { count: recipe.durationMinutes }) : null, recipe.proteinGroup ? app.t(`group.${recipe.proteinGroup}` as const) : null].filter(Boolean).join(' · ');
</script>

{#snippet row(recipe: RecipeSummary, rating: RatingSummary)}
	<li>
		<button type="button" class="row" aria-label={app.t('revision.pick', { recipe: recipe.name })} onclick={() => onPick(recipe.id)}>
			{#if recipe.photo}<img src={recipe.photo} alt="" loading="lazy" />{:else}<span class="no-photo" aria-hidden="true"></span>{/if}
			<span class="row-text">
				<span class="name">{recipe.name}</span>
				<span class="meta">{metaText(recipe)}</span>
				<span class="meta">{ratingText(rating)}</span>
			</span>
		</button>
	</li>
{/snippet}

<section class="suggestions" aria-labelledby="{slotId}-suggestions" bind:this={suggestionSection}>
	<h3 id="{slotId}-suggestions" class="picker-title">{app.t('revision.suggestions')}</h3>
	{#if suggestions.length === 0}
		<p class="meta-line">{app.t('revision.noCandidates')}</p>
	{:else if app.settings.suggestionLayout === 'cards'}
		<ul class="cards" bind:this={suggestionList}>
			{#each suggestions as s (s.recipe.id)}
				<li>
					<button type="button" class="card" aria-label={app.t('revision.pick', { recipe: s.recipe.name })} onclick={() => onPick(s.recipe.id)}>
						{#if s.recipe.photo}<img src={s.recipe.photo} alt="" loading="lazy" />{:else}<span class="card-no-photo" aria-hidden="true"></span>{/if}
						<span class="card-text">
							<span class="name">{s.recipe.name}</span>
							<span class="description">{s.recipe.description}</span>
							<span class="meta">{metaText(s.recipe)}</span>
							<span class="meta">{ratingText(s.rating)}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="rows">{#each suggestions as s (s.recipe.id)}{@render row(s.recipe, s.rating)}{/each}</ul>
	{/if}
	{#if suggestions.length && (page.nextOffset !== 0 || offset !== 0)}
		<button type="button" class="text-button more" onclick={more}>
			<svg class="icon" aria-hidden="true"><use href="#icon-shuffle" /></svg>{app.t('revision.another')}
		</button>
	{/if}
	<p class="simulated">{app.t('revision.simulated')}</p>
	{#if actions}<div class="other-actions">{@render actions()}</div>{/if}
</section>

<section class="search" aria-labelledby="{slotId}-search">
	<h3 id="{slotId}-search" class="picker-title">{app.t('revision.search')}</h3>
	<RecipeFilters {query} onChange={(next) => (query = next)} />
	{#if searching}
		{#if results.length}
			<ul class="rows">{#each results.slice(0, MAX_RESULTS) as item (item.recipe.id)}{@render row(item.recipe, item.rating)}{/each}</ul>
		{:else}
			<p class="meta-line">{app.t('recipes.noResults.body')}</p>
		{/if}
	{/if}
</section>

<style>
	.picker-title { margin: 12px 0 8px; font: 700 0.875rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; color: var(--body-text); }
	.rows { margin: 0; padding: 0; list-style: none; }
	.rows li + li { border-top: 1px solid var(--rule); }
	.row { display: grid; grid-template-columns: 64px minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; min-height: 64px; padding: 8px 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
	.row img, .no-photo { width: 64px; height: 64px; object-fit: cover; background: #e6e2d7; }
	.row-text, .card-text { display: grid; gap: 2px; min-width: 0; }
	.name { font: 400 1.0625rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; }
	.meta { color: var(--muted); font-size: 0.8125rem; }
	.cards { display: grid; grid-auto-flow: column; grid-auto-columns: min(78%, 280px); gap: 12px; margin: 0 -20px; padding: 2px 20px 8px; list-style: none; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: 20px; scrollbar-width: none; }
	.cards::-webkit-scrollbar { display: none; }
	.cards li { scroll-snap-align: start; display: flex; }
	.card { display: flex; flex-direction: column; width: 100%; padding: 0; border: 0; background: var(--paper); box-shadow: var(--card-shadow); color: var(--ink); text-align: left; cursor: pointer; }
	.card img, .card-no-photo { display: block; width: 100%; aspect-ratio: 3 / 1; object-fit: cover; background: #e6e2d7; }
	.card-text { padding: 12px 14px 14px; }
	.description { color: var(--body-text); font-size: 0.875rem; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.suggestions { scroll-margin-top: 72px; }
	.more { width: 100%; margin-top: 8px; }
	.other-actions { margin-top: 12px; border-top: 1px solid var(--rule); }
	.simulated { margin: 6px 0 0; color: var(--muted); font-size: 0.75rem; font-style: italic; }
	.search { margin-top: 16px; padding-top: 4px; border-top: 1px solid var(--rule); }
	.search :global(.filters) { margin-bottom: 8px; }
</style>
