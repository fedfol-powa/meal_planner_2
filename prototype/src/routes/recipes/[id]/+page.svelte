<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import IngredientList from '#lib/components/IngredientList.svelte';
	import RatingStars from '#lib/components/RatingStars.svelte';
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
	<a class="link-inline back" href={backHref}>‹ {fromMenu ? app.t('recipe.backToMenu') : app.t('recipe.backToRecipes')}</a>

	{#if !result.ok}
		<StateNotice title={app.t('recipe.unavailable')} />
	{:else}
		{@const d = result.value}
		<article class="meal">
			{#if d.recipe.photo}<div class="meal-media"><img class="meal-photo" src={d.recipe.photo} alt="" /></div>{/if}
			<div class="meal-content">
				<h1 class="title">{d.recipe.name}</h1>
				<p class="description">{d.recipe.description}</p>
				<p class="meal-meta">{#if d.recipe.durationMinutes}{app.t('meal.minutes', { count: d.recipe.durationMinutes })}{' · '}{/if}{#if d.recipe.proteinGroup}{app.t(`group.${d.recipe.proteinGroup}` as const)}{/if}</p>
				<p class="meal-source">
					{#if d.recipe.sourceType === 'book' && d.recipe.bookTitle}{app.t('source.book', { title: d.recipe.bookTitle, pages: d.recipe.bookPages ?? '—' })}
					{:else if d.recipe.sourceUrl}<a class="link-inline" href={d.recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{app.t('source.open')} ↗</a>
					{:else}{app.t('source.home')}{/if}
				</p>
				<RatingStars summary={d.rating} recipeId={d.recipe.id} recipeName={d.recipe.name} variant={app.settings.ratingVariant} size="large" />

				<div class="servings">
					<span>{app.t('recipe.servingsLabel')}</span>
					<button type="button" class="step" aria-label={app.t('recipe.lessServings')} disabled={d.servings <= 1} onclick={() => setServings(d.servings - 1)}>−</button>
					<strong aria-live="polite">{d.servings}</strong>
					<button type="button" class="step" aria-label={app.t('recipe.moreServings')} disabled={d.servings >= 12} onclick={() => setServings(d.servings + 1)}>+</button>
				</div>
				<p class="meta-line">{app.t('recipe.baseServings', { count: d.baseServings })}</p>
				<IngredientList ingredients={d.ingredients} system={d.measurementSystem} label={d.recipe.name} collapsible={false} />

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
	.back { display: inline-flex; align-items: center; min-height: 44px; margin-bottom: 8px; text-decoration: none; }
	.title { margin: 0 0 12px; font: 400 1.375rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; }
	.servings { display: flex; align-items: center; gap: 12px; margin: 8px 0 4px; font-weight: 700; }
	.step { width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); font: 700 1.25rem/1 var(--text-font); cursor: pointer; }
	.step:disabled { opacity: 0.3; cursor: not-allowed; }
	.history-title { margin: 24px 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	.history { margin: 0; padding: 0; list-style: none; }
	.history li { padding: 8px 0; border-bottom: 1px solid var(--rule); }
	@media (min-width: 768px) { .meal { max-width: 720px; } }
</style>
