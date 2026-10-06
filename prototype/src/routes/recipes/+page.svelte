<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RecipeCard from '#lib/components/RecipeCard.svelte';
	import type { RecipeCardView } from '#lib/operations/views.ts';
	import RecipeFilters from '#lib/components/RecipeFilters.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import type { MealType, ProteinGroup } from '#lib/domain/types.ts';
	import { listDraftRecipes, searchRecipes, type DraftListItem, type RecipeListItem, type RecipeQuery, type RecipeSort } from '#lib/operations/recipes.ts';
	import { app } from '#lib/store/app.svelte.ts';

	const query = $derived.by((): RecipeQuery => {
		const p = page.url.searchParams;
		const n = (key: string) => (p.get(key) ? Number(p.get(key)) : undefined);
		return {
			text: p.get('q') ?? undefined,
			mealType: (p.get('meal') ?? undefined) as MealType | undefined,
			maxMinutes: n('time'),
			proteinGroup: (p.get('group') ?? undefined) as ProteinGroup | undefined,
			minStars: n('stars'),
			sort: (p.get('sort') ?? undefined) as RecipeSort | undefined,
			reversed: p.get('reversed') === '1' || undefined
		};
	});
	const result = $derived(searchRecipes(app.db, app.ctx, query));
	// Curators only (forbidden for others): drafts first, in a collapsible section.
	const drafts = $derived.by(() => {
		const r = listDraftRecipes(app.db, app.ctx, { text: query.text });
		return r.ok ? r.value : null;
	});
	let draftsOpen = $state(true);

	function draftCard(item: DraftListItem): RecipeCardView {
		return {
			key: `draft-${item.recipe.id}`,
			label: app.t('recipe.draft'),
			kind: 'recipe',
			recipe: item.recipe,
			freeText: null,
			servings: item.servings,
			ingredients: item.ingredients,
			note: null,
			notice: app.t('recipe.missingLabel', { items: item.missing.map((m) => app.t(`recipe.missing.${m}` as const)).join(', ') }),
			isPast: false,
			cooked: null,
			canMarkNotCooked: false,
			canRate: false,
			rating: null,
			lastChange: null,
			detailHref: `/recipes/${item.recipe.id}`
		};
	}

	function toCard(item: RecipeListItem): RecipeCardView {
		return {
			key: item.recipe.id,
			label: item.recipe.proteinGroup ? app.t(`group.${item.recipe.proteinGroup}` as const) : null,
			kind: 'recipe',
			recipe: item.recipe,
			freeText: null,
			servings: item.servings,
			ingredients: item.ingredients,
			note: null,
			isPast: false,
			cooked: null,
			canMarkNotCooked: false,
			canRate: true,
			rating: item.rating,
			lastChange: null,
			detailHref: `/recipes/${item.recipe.id}`
		};
	}

	function update(next: RecipeQuery) {
		const p = new URLSearchParams();
		if (next.text) p.set('q', next.text);
		if (next.mealType) p.set('meal', next.mealType);
		if (next.maxMinutes) p.set('time', String(next.maxMinutes));
		if (next.proteinGroup) p.set('group', next.proteinGroup);
		if (next.minStars) p.set('stars', String(next.minStars));
		if (next.sort) p.set('sort', next.sort);
		if (next.reversed) p.set('reversed', '1');
		goto(`/recipes${p.toString() ? `?${p}` : ''}`, { replace: true, reset: false });
	}
</script>

<section class="secondary-view app-view recipes">
	<h1 class="page-title">{app.t('recipes.title')}</h1>
	<RecipeFilters {query} onChange={update} />
	{#if drafts && drafts.length}
		<section class="drafts" aria-labelledby="drafts-title">
			<h2 id="drafts-title"><button type="button" class="drafts-toggle" aria-expanded={draftsOpen} onclick={() => (draftsOpen = !draftsOpen)}>
				{app.t('recipes.drafts', { count: drafts.length })}
				<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
			</button></h2>
			{#if draftsOpen}
				<div class="recipe-list">
					{#each drafts as item (item.recipe.id)}<RecipeCard card={draftCard(item)} system={app.family?.measurementSystem ?? 'metric'} />{/each}
				</div>
			{/if}
		</section>
	{/if}
	{#if !result.ok}
		<StateNotice title={app.t('error.forbidden')} />
	{:else if result.value.length === 0}
		<StateNotice title={app.t('recipes.noResults.title')} body={app.t('recipes.noResults.body')}>
			<button type="button" class="text-button" onclick={() => update({})}>{app.t('recipes.reset')}</button>
		</StateNotice>
	{:else}
		<p class="meta-line" role="status">{app.t('recipes.count', { count: result.value.length })}</p>
		<div class="recipe-list">
			{#each result.value as item (item.recipe.id)}<RecipeCard card={toCard(item)} system={app.family?.measurementSystem ?? 'metric'} />{/each}
		</div>
	{/if}
</section>

<style>
	.recipes { padding-top: max(20px, env(safe-area-inset-top)); }
	.drafts { margin-bottom: 24px; }
	.drafts h2 { margin: 0 0 12px; }
	.drafts-toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink); font: 400 1.25rem/1.3 var(--heading-font); cursor: pointer; }
	.drafts-toggle .icon { width: 18px; height: 18px; transition: transform 0.15s; }
	.drafts-toggle[aria-expanded='true'] .icon { transform: rotate(90deg); }
</style>
