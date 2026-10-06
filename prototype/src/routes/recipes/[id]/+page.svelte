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
	import ActionMenu from '#lib/components/ActionMenu.svelte';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { archiveRecipe, startRevision, unarchiveRecipe } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	const fromMenu = $derived(page.url.searchParams.get('from') === 'menu');
	const rawDay = $derived(page.url.searchParams.get('day'));
	const day = $derived(isIsoDate(rawDay) ? rawDay : null);
	const servingsParam = $derived(Number(page.url.searchParams.get('servings')) || undefined);
	const slotParam = $derived(page.url.searchParams.get('slot') ?? undefined);
	const result = $derived(getRecipeDetail(app.db, app.ctx, page.params.id ?? '', servingsParam, slotParam));
	const currentHref = $derived.by(() => {
		const p = new URLSearchParams(page.url.searchParams.toString());
		p.delete('slot');
		return `?${p}`;
	});

	// Curators (round 5): edit through a revision draft, versions, archive with undo.
	function edit(recipeId: string) {
		const started = startRevision(app.db, app.ctx, recipeId);
		if (!started.ok) return app.notify(app.t(errorKey(started.error)));
		app.update(() => {});
		goto(`/recipes/drafts/${started.value.draftId}`);
	}

	function setArchived(recipeId: string, archived: boolean) {
		const done = (archived ? archiveRecipe : unarchiveRecipe)(app.db, app.ctx, recipeId);
		if (!done.ok) return app.notify(app.t(errorKey(done.error)));
		app.update(() => {});
		app.notify(app.t(archived ? 'curation.archivedToast' : 'curation.unarchivedToast'), () => {
			const back = (archived ? unarchiveRecipe : archiveRecipe)(app.db, app.ctx, recipeId);
			if (back.ok) app.update(() => {});
			app.notify(app.t(back.ok ? 'toast.undone' : 'toast.undoFailed'));
		});
	}
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
	<header class="page-header title-row">
		<a class="page-back" href={backHref}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>{fromMenu ? app.t('nav.menu') : app.t('nav.recipes')}</a>
		{#if result.ok && result.value.curation}
			{@const c = result.value.curation}
			{@const id = result.value.recipe.id}
			<ActionMenu label={app.t('curation.actions')}>
				{#snippet items(run)}
					{#if c.status === 'draft'}
						{#if c.draftId}<button type="button" role="menuitem" onclick={() => run(() => goto(`/recipes/drafts/${c.draftId}`))}>{app.t('curation.completeDraft')}</button>{/if}
					{:else}
						{#if c.draftId}
							<button type="button" role="menuitem" onclick={() => run(() => goto(`/recipes/drafts/${c.draftId}`))}>{app.t('curation.resumeRevision')}</button>
						{:else if c.status === 'published'}
							<button type="button" role="menuitem" disabled={app.settings.offline} onclick={() => run(() => edit(id))}>{app.t('curation.edit')}</button>
						{/if}
						<button type="button" role="menuitem" onclick={() => run(() => goto(`/recipes/${id}/versions`))}>{app.t('curation.versions')}</button>
						<button type="button" role="menuitem" disabled={app.settings.offline} onclick={() => run(() => setArchived(id, c.status === 'published'))}>{app.t(c.status === 'published' ? 'curation.archive' : 'curation.unarchive')}</button>
					{/if}
				{/snippet}
			</ActionMenu>
		{/if}
	</header>

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
				{#if d.curation?.status === 'archived'}
					<p class="draft-notice" role="note">
						<span class="label-chip neutral">{app.t('curation.archivedChip')}</span>
						{app.t('curation.archivedNotice', { name: d.curation.archivedByName ?? '—', time: formatDateTime(app.locale, d.curation.archivedAt ?? '') })}
					</p>
				{/if}
				{#if d.shownVersion}
					<p class="draft-notice" role="note">
						{app.t('curation.shownVersion', { version: d.shownVersion.version, current: d.shownVersion.current })}
						<a class="link-inline" href={currentHref}>{app.t('curation.seeCurrent')}</a>
					</p>
				{/if}
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
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.history-title { margin: 24px 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	.history { margin: 0; padding: 0; list-style: none; }
	.history li { padding: 8px 0; border-bottom: 1px solid var(--rule); }
	@media (min-width: 768px) { .meal { max-width: 720px; } }
</style>
