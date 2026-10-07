<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import RecipeCard from '#lib/components/RecipeCard.svelte';
	import type { RecipeCardView } from '#lib/operations/views.ts';
	import RecipeFilters from '#lib/components/RecipeFilters.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import type { MealType, ProteinGroup } from '#lib/domain/types.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import { getCurationOverview } from '#lib/operations/curation.ts';
	import { searchRecipes, type RecipeListItem, type RecipeQuery, type RecipeSort } from '#lib/operations/recipes.ts';
	import { formatDateTime } from '#lib/i18n/dates.ts';
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
	// Curators only (forbidden for others): drafts first, then archived recipes, in collapsible sections.
	const curation = $derived.by(() => {
		const r = getCurationOverview(app.db, app.ctx, query.text);
		return r.ok ? r.value : null;
	});
	let draftsOpen = $state(true);
	let archivedOpen = $state(false);
	const missingText = (missing: string[]) => app.t('recipe.missingLabel', { items: missing.map((m) => app.t(`recipe.missing.${m}` as MessageKey)).join(', ') });

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
	<div class="title-row">
		<h1 class="page-title">{app.t('recipes.title')}</h1>
		{#if curation}<a class="add-recipe" href="/recipes/new" aria-label={app.t('curation.new')}><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg></a>{/if}
	</div>
	<RecipeFilters {query} onChange={update} />
	{#if curation && curation.drafts.length}
		<section class="curation" id="drafts" aria-labelledby="drafts-title">
			<h2 id="drafts-title"><button type="button" class="section-toggle" aria-expanded={draftsOpen} onclick={() => (draftsOpen = !draftsOpen)}>
				{app.t('recipes.drafts', { count: curation.drafts.length })}
				<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
			</button></h2>
			{#if draftsOpen}
				<ul class="row-list settings-card">
					{#each curation.drafts as draft (draft.id)}
						<li><a class="row-link" href="/recipes/drafts/{draft.id}">
							<span class="row-main"><strong>{draft.name}</strong>
								<small>{app.t(draft.kind === 'new' ? 'curation.kind.new' : 'curation.kind.revision')} · {app.t('curation.lastSaved', { name: draft.updatedByName, time: formatDateTime(app.locale, draft.updatedAt) })}</small>
								<small class:ready={draft.verified}>{draft.verified ? app.t('curation.readyToPublish') : draft.missing.length ? missingText(draft.missing) : app.t('curation.toVerify')}</small>
							</span>
							<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
						</a></li>
					{/each}
				</ul>
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
	{#if curation && curation.archived.length}
		<section class="curation archived" aria-labelledby="archived-title">
			<h2 id="archived-title"><button type="button" class="section-toggle" aria-expanded={archivedOpen} onclick={() => (archivedOpen = !archivedOpen)}>
				{app.t('recipes.archived', { count: curation.archived.length })}
				<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
			</button></h2>
			{#if archivedOpen}
				<ul class="row-list settings-card">
					{#each curation.archived as item (item.recipeId)}
						<li><a class="row-link" href="/recipes/{item.recipeId}">
							<span class="row-main">{item.name}<small>{app.t('curation.archivedBy', { name: item.archivedByName, time: formatDateTime(app.locale, item.archivedAt) })}</small></span>
							<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
						</a></li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</section>

<style>
	.recipes { padding-top: max(20px, env(safe-area-inset-top)); }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.title-row .page-title { margin: 0 0 16px; }
	/* Same box as the filter toggle below, so the two icons share the same centre. */
	.add-recipe { display: grid; place-items: center; width: 48px; height: 48px; margin: -10px 0 6px 0; border-radius: 8px; color: var(--ink); }
	.add-recipe .icon { width: 26px; height: 26px; }
	.curation { margin-bottom: 20px; }
	.archived { margin: 24px 0 0; }
	.curation h2 { margin: 0 0 8px; }
	.curation .settings-card { padding-block: 4px; }
	.section-toggle { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink); font: 400 1.25rem/1.3 var(--heading-font); cursor: pointer; }
	.section-toggle .icon { width: 18px; height: 18px; transition: transform 0.15s; }
	.section-toggle[aria-expanded='true'] .icon { transform: rotate(90deg); }
	.row-main strong { font-weight: 700; }
	.ready { color: var(--green) !important; font-weight: 700; }
</style>
