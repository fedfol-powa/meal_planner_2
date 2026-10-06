<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import IngredientList from '#lib/components/IngredientList.svelte';
	import RatingStars from '#lib/components/RatingStars.svelte';
	import ServingsStepper from '#lib/components/ServingsStepper.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import { isIsoDate } from '#lib/domain/calendar.ts';
	import { getRecipeDetail } from '#lib/operations/recipes.ts';
	import { app } from '#lib/store/app.svelte.ts';

	const fromMenu = $derived(page.url.searchParams.get('from') === 'menu');
	const rawDay = $derived(page.url.searchParams.get('day'));
	const day = $derived(isIsoDate(rawDay) ? rawDay : null);
	const servingsParam = $derived(Number(page.url.searchParams.get('servings')) || undefined);
	const result = $derived(getRecipeDetail(app.db, app.ctx, page.params.id ?? '', servingsParam));
	const backHref = $derived(fromMenu ? `/menu${day ? `?day=${day}` : ''}` : '/recipes');

	function setServings(servings: number) {
		const p = new URLSearchParams(page.url.searchParams.toString());
		p.set('servings', String(servings));
		goto(`?${p}`, { replace: true, reset: false });
	}

	$effect(() => {
		if (fromMenu && day) app.selectedDate = day;
	});
</script>

<section class="secondary-view app-view detail">
	<header class="page-header"><a class="page-back" href={backHref}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>{fromMenu ? app.t('nav.menu') : app.t('nav.recipes')}</a></header>

	{#if !result.ok}
		<StateNotice title={app.t('recipe.unavailable')} />
	{:else}
		{@const d = result.value}
		<article class="meal">
			{#if d.recipe.photo}<div class="meal-media"><img class="meal-photo" src={d.recipe.photo} alt="" /></div>{/if}
			<div class="meal-content">
				<!-- Order agreed in review: title (source link), rating, description, timing, servings, ingredients. -->
				<h1 class="title">
					{#if d.recipe.sourceUrl}
						<a class="recipe-link" href={d.recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{d.recipe.name} <svg class="icon" aria-hidden="true"><use href="#icon-arrow" /></svg><span class="visually-hidden">({app.t('source.open')})</span></a>
					{:else}{d.recipe.name}{/if}
				</h1>
				{#if d.isDraft}
					<p class="draft-notice" role="note">
						<span class="label-chip neutral">{app.t('recipe.draft')}</span>
						{app.t('recipe.draftNotice')}
						{app.t('recipe.missingLabel', { items: d.missing.map((m) => app.t(`recipe.missing.${m}` as const)).join(', ') })}
					</p>
				{:else}
					<RatingStars summary={d.rating} recipeId={d.recipe.id} recipeName={d.recipe.name} />
				{/if}
				<p class="description">{d.recipe.description}</p>
				<p class="meal-meta">
					{#if d.recipe.durationMinutes}<svg class="icon" aria-hidden="true"><use href="#icon-clock" /></svg>{app.t('meal.minutes', { count: d.recipe.durationMinutes })}{/if}{#if d.recipe.durationMinutes && d.recipe.proteinGroup}{' · '}{/if}{#if d.recipe.proteinGroup}{app.t(`group.${d.recipe.proteinGroup}` as const)}{/if}
				</p>
				{#if d.recipe.sourceType === 'book' && d.recipe.bookTitle}
					<p class="meal-source">{app.t('source.book', { title: d.recipe.bookTitle, pages: d.recipe.bookPages ?? '—' })}</p>
				{:else if !d.recipe.sourceUrl}
					<p class="meal-source">{app.t('source.home')}</p>
				{/if}

				{#if d.baseServings && d.ingredients.length}
				<ServingsStepper value={d.servings} max={12} onChange={setServings} />
				<p class="meta-line">{app.t('recipe.baseServings', { count: d.baseServings })}</p>
				<IngredientList ingredients={d.ingredients} system={d.measurementSystem} label={d.recipe.name} collapsible={false} />
				{:else}
					<p class="meta-line">{app.t('meal.ingredientsMissing')}</p>
				{/if}

				<h2 class="history-title">{app.t('recipe.history')}</h2>
				{#if d.history.length}
					<ul class="history">{#each d.history as h (h.date + h.mealType)}<li>{formatDayLong(app.locale, h.date)} · {app.t(`meal.${h.mealType}` as const)}</li>{/each}</ul>
				{:else}
					<p class="meta-line">{app.t('recipe.historyEmpty')}</p>
				{/if}
			</div>
		</article>
	{/if}
</section>

<style>
	.detail { padding-top: max(16px, env(safe-area-inset-top)); }
	.title { margin: 0 0 12px; font: 400 1.375rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; }
	.title :global(.recipe-link .icon) { top: 8px; }
	.detail :global(.rating) { margin-bottom: 14px; }
	.draft-notice { display: grid; gap: 6px; justify-items: start; margin: 0 0 14px; padding: 12px; background: var(--free-surface); border: 1px solid var(--free-border); font-size: 0.875rem; }
	.history-title { margin: 24px 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	.history { margin: 0; padding: 0; list-style: none; }
	.history li { padding: 8px 0; border-bottom: 1px solid var(--rule); }
	@media (min-width: 768px) { .meal { max-width: 720px; } }
</style>
