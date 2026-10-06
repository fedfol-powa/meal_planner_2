<script lang="ts">
	import { formatAverage } from '#lib/i18n/dates.ts';
	import { rateRecipe } from '#lib/operations/recipes.ts';
	import type { RatingSummary } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Family average and own stars on one row, no labels (chosen in the round 1 review).
	let { summary, recipeId, recipeName }: { summary: RatingSummary; recipeId: string; recipeName: string } = $props();

	const uid = $props.id();
	let error = $state(false);
	const votesText = $derived(summary.familyCount === 1 ? app.t('rating.oneVote') : app.t('rating.votes', { count: summary.familyCount }));

	function rate(stars: number | null) {
		const result = rateRecipe(app.db, app.ctx, recipeId, stars);
		error = !result.ok;
		if (result.ok) app.update(() => {});
	}
</script>

<div class="rating">
	<div class="row">
		<p class="average" aria-label={summary.familyAverage === null ? app.t('rating.none') : app.t('rating.averageLabel', { value: formatAverage(app.locale, summary.familyAverage), votes: votesText })}>
			{#if summary.familyAverage === null}
				<span class="value muted" aria-hidden="true">–</span>
			{:else}
				<span class="value" aria-hidden="true">{formatAverage(app.locale, summary.familyAverage)}</span>
				<span class="count" aria-hidden="true">({summary.familyCount})</span>
			{/if}
		</p>
		<!-- Tapping the chosen star again removes the rating, so no separate link is needed. -->
		<fieldset class="stars" disabled={app.settings.offline}>
			<legend class="visually-hidden">{app.t('rating.mine')}</legend>
			{#each [1, 2, 3, 4, 5] as value (value)}
				<label class="star" class:filled={summary.myStars !== null && value <= summary.myStars}>
					<input class="visually-hidden" type="radio" name="rating-{uid}" {value} checked={summary.myStars === value} onclick={() => rate(summary.myStars === value ? null : value)} />
					<svg class="icon" aria-hidden="true"><use href="#icon-star" /></svg>
					<span class="visually-hidden">{summary.myStars === value ? app.t('rating.removeStars', { stars: value }) : app.t('rating.give', { stars: value, recipe: recipeName })}</span>
				</label>
			{/each}
		</fieldset>
	</div>
	{#if error}<p class="meta-line" role="alert">{app.t('error.offline')}</p>{/if}
</div>

<style>
	.rating { margin: 0 0 16px; font-size: 0.875rem; }
	.row { display: flex; align-items: center; gap: 12px; }
	.average { display: flex; align-items: baseline; gap: 4px; margin: 0; min-width: 3.5ch; }
	.value { font: 700 1.5rem/1 var(--text-font); color: var(--ink); }
	.value.muted { color: var(--muted); }
	.count { color: var(--muted); font-size: 0.8125rem; }
	.stars { display: inline-flex; margin: 0; padding: 0; border: 0; }
	.star { display: grid; place-items: center; width: 40px; height: 44px; color: var(--ink); cursor: pointer; }
	.star .icon { width: 26px; height: 26px; }
	.star.filled .icon { fill: var(--green); stroke: var(--green); }
	.star:has(input:focus-visible) { outline: 3px solid var(--green); outline-offset: -3px; border-radius: 8px; }
	.stars:disabled .star { opacity: 0.4; cursor: not-allowed; }
</style>
