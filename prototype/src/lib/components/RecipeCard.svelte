<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { MeasurementSystem } from '#lib/domain/types.ts';
	import type { RecipeCardView } from '#lib/operations/views.ts';
	import { formatAverage, formatChangeTime } from '#lib/i18n/dates.ts';
	import { truncate } from '#lib/i18n/text.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import IngredientList from './IngredientList.svelte';
	import RatingStars from './RatingStars.svelte';

	let { card: meal, system, editPanel, onChooseRecipe }: {
		card: RecipeCardView;
		system: MeasurementSystem;
		/** Meal actions under the pencil (menu only), panel chosen in the round 2 review. */
		editPanel?: Snippet;
		/** Empty slot: straight to the recipe picker. */
		onChooseRecipe?: () => void;
	} = $props();

	// Only one footer section is open at a time, to keep the card short.
	let expanded = $state<'rating' | 'ingredients' | 'actions' | null>(null);

	const headingId = $derived(`card-${meal.key}`);
	const recipe = $derived(meal.recipe);
	const sourceLine = $derived.by(() => {
		if (!recipe) return null;
		if (recipe.sourceType === 'book' && recipe.bookTitle) return app.t('source.book', { title: recipe.bookTitle, pages: recipe.bookPages ?? '—' });
		if (recipe.sourceType === 'youtube') return app.t('source.youtube');
		if (recipe.sourceUrl) return new URL(recipe.sourceUrl).hostname.replace(/^www\./, '');
		return app.t('source.home');
	});
	// Source shares the timing row: fixed length, full text on hover and for screen readers.
	const SOURCE_MAX_CHARS = 22;
	const averageText = $derived(meal.rating?.familyAverage != null ? formatAverage(app.locale, meal.rating.familyAverage) : '–');

	function toggle(section: 'rating' | 'ingredients' | 'actions') {
		expanded = expanded === section ? null : section;
	}
</script>

<article class="meal" class:meal-free={meal.kind !== 'recipe'} class:is-past={meal.isPast} aria-labelledby={headingId}>
	{#snippet label()}{#if meal.label}<span class="meal-label">{meal.label}</span>{/if}{/snippet}

	{#if recipe?.photo}
		<div class="meal-media"><img class="meal-photo" src={recipe.photo} alt="" loading="lazy" decoding="async" />{@render label()}</div>
	{:else}
		<div class="meal-heading">{@render label()}</div>
	{/if}

	<div class="meal-content">

		{#if meal.kind === 'free'}
			<span class="free-mark">{app.t('meal.free')}</span>
			<h3 id={headingId}>{meal.freeText}</h3>
		{:else if meal.kind === 'empty'}
			<h3 id={headingId}>{app.t('meal.empty.title')}</h3>
			<p class="description">{app.t('meal.empty.body')}</p>
			{#if onChooseRecipe}<button type="button" class="text-button primary" disabled={app.settings.offline} onclick={onChooseRecipe}>{app.t('meal.chooseRecipe')}</button>{/if}
		{:else if recipe}
			<h3 id={headingId}>
				{#if recipe.sourceUrl}
					<a class="recipe-link" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">{recipe.name} <svg class="icon" aria-hidden="true"><use href="#icon-arrow" /></svg><span class="visually-hidden">({app.t('source.open')})</span></a>
				{:else}{recipe.name}{/if}
			</h3>
			{#if recipe.translationMissing}<p class="meta-line">({app.t('meal.translationMissing')})</p>{/if}
			<p class="description">{recipe.description}</p>
			<div class="meta-row">
				<p class="meal-meta">
					{#if recipe.durationMinutes}<svg class="icon" aria-hidden="true"><use href="#icon-clock" /></svg>{app.t('meal.minutes', { count: recipe.durationMinutes })}{/if}{#if recipe.durationMinutes && meal.servings}{' · '}{/if}{#if meal.servings}{meal.servings === 1 ? app.t('meal.oneServing') : app.t('meal.servings', { count: meal.servings })}{/if}
				</p>
				{#if sourceLine}<p class="meal-source" title={sourceLine}><span aria-hidden="true">{truncate(sourceLine, SOURCE_MAX_CHARS)}</span><span class="visually-hidden">{sourceLine}</span></p>{/if}
			</div>
		{/if}

		{#if meal.lastChange}
			<p class="meta-line">{app.t('meal.changedBy', { name: meal.lastChange.userName ?? app.t('meal.formerMember'), time: formatChangeTime(app.locale, meal.lastChange.at) })}</p>
		{/if}
		{#if meal.note}<p class="meta-line"><strong>{app.t('meal.note')}:</strong> {meal.note}</p>{/if}
		{#if meal.notice}<p class="meta-line notice">{meal.notice}</p>{/if}
	</div>

	{#if (meal.kind === 'recipe' && recipe) || editPanel}
		<div class="meal-footer">
			{#if recipe && meal.detailHref}
				<a class="footer-action" href={meal.detailHref} aria-label={app.t('meal.details')}>
					<svg class="icon" aria-hidden="true"><use href="#icon-recipe" /></svg>
				</a>
			{/if}
			{#if meal.kind === 'recipe' && recipe}
			<button type="button" class="footer-action" aria-expanded={expanded === 'rating'} disabled={!meal.canRate} aria-label={app.t('meal.ratingAction', { value: averageText })} onclick={() => toggle('rating')}>
				<svg class="icon" class:mine={meal.rating?.myStars != null} aria-hidden="true"><use href="#icon-star" /></svg>
				<span aria-hidden="true">{averageText}</span>
			</button>
			<button type="button" class="footer-action" aria-expanded={expanded === 'ingredients'} aria-label={app.t('meal.ingredientsAction', { count: meal.ingredients?.length ?? 0 })} onclick={() => toggle('ingredients')}>
				<svg class="icon" aria-hidden="true"><use href="#icon-list" /></svg>
				<span aria-hidden="true">{meal.ingredients?.length ?? '–'}</span>
			</button>
			{/if}
			{#if editPanel}
				<button type="button" class="footer-action" aria-expanded={expanded === 'actions'} aria-label={app.t('meal.edit')} onclick={() => toggle('actions')}>
					<svg class="icon" aria-hidden="true"><use href="#icon-edit" /></svg>
				</button>
			{/if}
		</div>

		{#if expanded === 'actions' && editPanel}
			<div class="footer-panel">{@render editPanel()}</div>
		{:else if expanded === 'rating' && meal.rating && recipe}
			<div class="footer-panel">
				<RatingStars summary={meal.rating} recipeId={recipe.id} recipeName={recipe.name} />
			</div>
		{:else if expanded === 'ingredients' && recipe}
			<div class="footer-panel">
				{#if meal.ingredients}
					<IngredientList ingredients={meal.ingredients} {system} label={recipe.name} collapsible={false} />
				{:else}
					<p class="meta-line">{app.t('meal.ingredientsMissing')}</p>
				{/if}
			</div>
		{/if}
	{/if}
</article>

<style>
	/* Low banner (3:1), chosen in the round 1 review instead of the reference 16:9. */
	.meal-media { aspect-ratio: 3 / 1; }
	.meta-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
	.meta-row .meal-meta { flex: none; margin: 0; }
	/* Fixed-length cut first; on very narrow screens CSS ellipsis keeps it inside the card. */
	.meta-row .meal-source { flex: 0 1 auto; min-width: 0; margin: 0; overflow: hidden; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
	.is-past .meal-photo { filter: grayscale(0.4); opacity: 0.85; }
	.meal-content { padding-bottom: 14px; }
	.meal-footer { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); border-top: 1px solid var(--rule); }
	.footer-action { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 48px; padding: 0 8px; border: 0; background: none; color: var(--ink); font: 700 0.875rem/1 var(--text-font); text-decoration: none; cursor: pointer; }
	.footer-action + .footer-action { border-left: 1px solid var(--rule); }
	.footer-action .icon { width: 22px; height: 22px; }
	.footer-action .icon.mine { fill: var(--green); stroke: var(--green); }
	.footer-action[aria-expanded='true'] { color: var(--green); background: var(--soft-green); }
	.footer-action:disabled { color: var(--muted); cursor: not-allowed; }
	.footer-action:focus-visible { outline-offset: -3px; }
	.footer-panel { padding: 16px 18px 18px; border-top: 1px solid var(--rule); }
	.footer-panel :global(.ingredient-list) { margin-top: 0; }
	.footer-panel :global(.rating) { margin: 0; }
</style>
