<script lang="ts">
	import { formatAverage } from '#lib/i18n/dates.ts';
	import { rateRecipe } from '#lib/operations/recipes.ts';
	import type { RatingSummary } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import type { RatingVariant } from '#lib/store/persistence.ts';

	let { summary, recipeId, recipeName, variant, size = 'compact' }: { summary: RatingSummary; recipeId: string; recipeName: string; variant: RatingVariant; size?: 'compact' | 'large' } = $props();

	let open = $state(false);
	let error = $state(false);
	const groupName = $derived(`rating-${recipeId}-${Math.random().toString(36).slice(2, 8)}`);
	const familyText = $derived(
		summary.familyAverage === null
			? app.t('rating.none')
			: `★ ${formatAverage(app.locale, summary.familyAverage)} · ${summary.familyCount === 1 ? app.t('rating.oneVote') : app.t('rating.votes', { count: summary.familyCount })}`
	);

	function rate(stars: number | null) {
		const result = rateRecipe(app.db, app.ctx, recipeId, stars);
		error = !result.ok;
		if (result.ok) app.update(() => {});
	}
</script>

{#snippet stars()}
	<fieldset class="stars" class:large={size === 'large' || variant === 'panel'} disabled={app.settings.offline}>
		<legend class="visually-hidden">{app.t('rating.mine')}</legend>
		{#each [1, 2, 3, 4, 5] as value (value)}
			<label class="star" class:filled={summary.myStars !== null && value <= summary.myStars}>
				<input class="visually-hidden" type="radio" name={groupName} {value} checked={summary.myStars === value} onchange={() => rate(value)} />
				<svg class="icon" aria-hidden="true"><use href="#icon-star" /></svg>
				<span class="visually-hidden">{app.t('rating.give', { stars: value, recipe: recipeName })}</span>
			</label>
		{/each}
	</fieldset>
	{#if summary.myStars !== null}
		<button type="button" class="remove" disabled={app.settings.offline} onclick={() => rate(null)}>{app.t('rating.remove')}</button>
	{/if}
	{#if error}<p class="meta-line" role="alert">{app.t('error.offline')}</p>{/if}
{/snippet}

<div class="rating">
	{#if variant === 'row'}
		<div class="row-variant">
			<p class="average" aria-label={summary.familyAverage === null ? app.t('rating.none') : app.t('rating.averageLabel', { value: formatAverage(app.locale, summary.familyAverage), votes: summary.familyCount === 1 ? app.t('rating.oneVote') : app.t('rating.votes', { count: summary.familyCount }) })}>
				{#if summary.familyAverage === null}
					<span class="value muted" aria-hidden="true">–</span>
				{:else}
					<span class="value" aria-hidden="true">{formatAverage(app.locale, summary.familyAverage)}</span>
					<span class="count" aria-hidden="true">({summary.familyCount})</span>
				{/if}
			</p>
			<!-- Tapping the chosen star again removes the rating, so no separate link is needed. -->
			<fieldset class="stars large" disabled={app.settings.offline}>
				<legend class="visually-hidden">{app.t('rating.mine')}</legend>
				{#each [1, 2, 3, 4, 5] as value (value)}
					<label class="star" class:filled={summary.myStars !== null && value <= summary.myStars}>
						<input class="visually-hidden" type="radio" name={groupName} {value} checked={summary.myStars === value} onclick={() => rate(summary.myStars === value ? null : value)} />
						<svg class="icon" aria-hidden="true"><use href="#icon-star" /></svg>
						<span class="visually-hidden">{summary.myStars === value ? app.t('rating.removeStars', { stars: value }) : app.t('rating.give', { stars: value, recipe: recipeName })}</span>
					</label>
				{/each}
			</fieldset>
		</div>
		{#if error}<p class="meta-line" role="alert">{app.t('error.offline')}</p>{/if}
	{:else if variant === 'inline'}
		<p class="family"><span>{app.t('rating.family')}</span> <strong>{familyText}</strong></p>
		<div class="mine">
			<span>{summary.myStars === null ? app.t('rating.notRated') : app.t('rating.mine')}</span>
			{@render stars()}
		</div>
	{:else}
		<button type="button" class="summary" aria-expanded={open} aria-label={app.t('rating.open', { recipe: recipeName })} onclick={() => (open = !open)}>
			<span>{familyText}</span>
			<span>{summary.myStars === null ? app.t('rating.notRated') : app.t('rating.you', { stars: summary.myStars })}</span>
			<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
		</button>
		{#if open}
			<div class="panel">
				<p class="family"><span>{app.t('rating.mine')}</span></p>
				{@render stars()}
				<p class="meta-line">{app.t('rating.family')}: {familyText}</p>
				<button type="button" class="text-button" onclick={() => (open = false)}>{app.t('common.close')}</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.rating { margin: 0 0 16px; font-size: 0.875rem; }
	.family { margin: 0 0 4px; color: var(--muted); }
	.family strong { color: var(--ink); }
	.mine { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--muted); }
	.stars { display: inline-flex; margin: 0; padding: 0; border: 0; }
	.star { display: grid; place-items: center; width: 36px; height: 44px; color: var(--ink); cursor: pointer; }
	.star .icon { width: 22px; height: 22px; }
	.star.filled .icon { fill: var(--green); stroke: var(--green); }
	.stars.large .star { width: 48px; height: 48px; }
	.stars.large .icon { width: 30px; height: 30px; }
	.star:has(input:focus-visible) { outline: 3px solid var(--green); outline-offset: -3px; border-radius: 8px; }
	.stars:disabled .star { opacity: 0.4; cursor: not-allowed; }
	.remove { min-height: 44px; padding: 0 4px; border: 0; background: none; color: var(--green); font: 700 0.875rem/1.5 var(--text-font); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; width: 100%; min-height: 44px; padding: 8px 0; border: 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); background: none; color: var(--ink); font: 700 0.875rem/1.5 var(--text-font); text-align: left; cursor: pointer; }
	.summary .icon { margin-left: auto; width: 16px; height: 16px; }
	.summary[aria-expanded='true'] .icon { transform: rotate(90deg); }
	.row-variant { display: flex; align-items: center; gap: 12px; }
	.average { display: flex; align-items: baseline; gap: 4px; margin: 0; min-width: 3.5ch; }
	.value { font: 700 1.5rem/1 var(--text-font); color: var(--ink); }
	.value.muted { color: var(--muted); }
	.count { color: var(--muted); font-size: 0.8125rem; }
	.row-variant .stars.large .star { width: 40px; height: 44px; }
	.row-variant .stars.large .icon { width: 26px; height: 26px; }
	.panel { margin-top: 8px; padding: 16px; background: var(--soft-green); border-radius: 8px; }
</style>
