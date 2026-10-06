<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MeasurementSystem } from '#lib/domain/types.ts';
	import type { MealView } from '#lib/operations/views.ts';
	import { formatAverage, formatChangeTime } from '#lib/i18n/dates.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import IngredientList from './IngredientList.svelte';

	let { meal, system, rating, onToggleCooked }: { meal: MealView; system: MeasurementSystem; rating?: Snippet<[MealView]>; onToggleCooked?: (meal: MealView) => void } = $props();

	const headingId = $derived(`meal-${meal.slotId}`);
	const recipe = $derived(meal.recipe);
	const sourceLine = $derived.by(() => {
		if (!recipe) return null;
		if (recipe.sourceType === 'book' && recipe.bookTitle) return app.t('source.book', { title: recipe.bookTitle, pages: recipe.bookPages ?? '—' });
		if (recipe.sourceType === 'youtube') return app.t('source.youtube');
		if (recipe.sourceUrl) return new URL(recipe.sourceUrl).hostname.replace(/^www\./, '');
		return app.t('source.home');
	});
	const ratingText = $derived.by(() => {
		const r = meal.rating;
		if (!r) return '';
		const family = r.familyAverage === null ? app.t('rating.none') : `★ ${formatAverage(app.locale, r.familyAverage)} · ${r.familyCount === 1 ? app.t('rating.oneVote') : app.t('rating.votes', { count: r.familyCount })}`;
		return r.myStars === null ? `${family} · ${app.t('rating.notRated')}` : `${family} · ${app.t('rating.you', { stars: r.myStars })}`;
	});
</script>

<article class="meal" class:meal-free={meal.kind !== 'recipe'} class:is-past={meal.isPast} aria-labelledby={headingId}>
	{#snippet label()}<span class="meal-label">{app.t(`meal.${meal.mealType}` as const)}</span>{/snippet}

	{#if recipe?.photo}
		<div class="meal-media"><img class="meal-photo" src={recipe.photo} alt="" loading="lazy" decoding="async" />{@render label()}</div>
	{:else}
		<div class="meal-heading">{@render label()}</div>
	{/if}

	<div class="meal-content">
		<div class="status-row">
			{#if meal.isPast}<span class="label-chip neutral">{app.t('meal.past')}</span>{/if}
			{#if meal.cooked === false}<span class="label-chip neutral">{app.t('meal.notCooked')}</span>{/if}
		</div>

		{#if meal.kind === 'free'}
			<span class="free-mark">{app.t('meal.free')}</span>
			<h3 id={headingId}>{meal.freeText}</h3>
		{:else if meal.kind === 'empty'}
			<h3 id={headingId}>{app.t('meal.empty.title')}</h3>
			<p class="description">{app.t('meal.empty.body')}</p>
		{:else if recipe}
			<h3 id={headingId}>
				{#if recipe.sourceUrl}
					<a class="recipe-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{recipe.name} <svg class="icon" aria-hidden="true"><use href="#icon-arrow" /></svg><span class="visually-hidden">({app.t('source.open')})</span></a>
				{:else}{recipe.name}{/if}
			</h3>
			{#if recipe.translationMissing}<p class="meta-line">({app.t('meal.translationMissing')})</p>{/if}
			<p class="description">{recipe.description}</p>
			<p class="meal-meta">
				{#if recipe.durationMinutes}<svg class="icon" aria-hidden="true"><use href="#icon-clock" /></svg>{app.t('meal.minutes', { count: recipe.durationMinutes })}{' · '}{/if}{app.t('meal.servings', { count: meal.servings })}
			</p>
			{#if sourceLine}<p class="meal-source">{sourceLine}</p>{/if}
			{#if rating}{@render rating(meal)}{:else}<p class="meta-line rating-text">{ratingText}</p>{/if}
			<p><a class="link-inline" href="/recipes/{recipe.id}?from=menu&day={meal.date}">{app.t('meal.details')}</a></p>
		{/if}

		{#if meal.lastChange}
			<p class="meta-line">{app.t('meal.changedBy', { name: meal.lastChange.userName ?? app.t('meal.formerMember'), time: formatChangeTime(app.locale, meal.lastChange.at) })}</p>
		{/if}
		{#if meal.note}<p class="meta-line"><strong>{app.t('meal.note')}:</strong> {meal.note}</p>{/if}
		{#if meal.canMarkNotCooked && onToggleCooked}
			<p><button type="button" class="text-button" disabled={app.settings.offline} onclick={() => onToggleCooked(meal)}>{meal.cooked === false ? app.t('meal.undoNotCooked') : app.t('meal.markNotCooked')}</button></p>
		{/if}

		{#if meal.kind === 'recipe' && recipe}
			{#if meal.ingredients}
				<IngredientList ingredients={meal.ingredients} {system} label={recipe.name} />
			{:else}
				<p class="meta-line">{app.t('meal.ingredientsMissing')}</p>
			{/if}
		{/if}
	</div>
</article>

<style>
	.status-row { display: flex; flex-wrap: wrap; gap: 6px; }
	.status-row:not(:empty) { margin-bottom: 12px; }
	.is-past .meal-photo { filter: grayscale(0.4); opacity: 0.85; }
	.rating-text { color: var(--ink); }
</style>
