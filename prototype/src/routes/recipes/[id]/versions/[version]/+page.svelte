<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BottomSheet from '#lib/components/BottomSheet.svelte';
	import IngredientList from '#lib/components/IngredientList.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { summarize } from '#lib/domain/recipe-validation.ts';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import { getRecipeVersion, restoreVersion } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// An older version as it was, read only, with "Ripristina" (round 5 review: no field-by-field comparison).
	const id = $derived(page.params.id ?? '');
	const version = $derived(Number(page.params.version));
	const result = $derived(getRecipeVersion(app.db, app.ctx, id, version));
	let confirm = $state(false);

	function restore() {
		confirm = false;
		const done = restoreVersion(app.db, app.ctx, id, version);
		if (!done.ok) return app.notify(app.t(errorKey(done.error)));
		if (done.value.status === 'invalid') return app.notify(app.t('curation.restoreInvalid'));
		app.update(() => {});
		app.notify(app.t('curation.restored', { version, next: done.value.version }));
		goto(`/recipes/${id}`, { replaceState: true });
	}
</script>

<section class="secondary-view app-view" aria-labelledby="version-title">
	<div class="page-column narrow">
		<PageHeader back="/recipes/{id}/versions" backLabel={app.t('curation.versions')} title={app.t('curation.version', { version })} titleId="version-title" />
		{#if !result.ok}
			<StateNotice title={app.t(result.error === 'forbidden' ? 'curation.forbidden' : 'error.notFound')} />
		{:else}
			{@const v = result.value}
			<p class="page-meta">{v.byName}, {formatDateTime(app.locale, v.at)}{#if v.restoredFrom} · {app.t('curation.restoredFrom', { version: v.restoredFrom })}{/if}</p>
			<article class="meal">
				<div class="meal-content">
					<h2 class="title">{v.recipe.name}</h2>
					<p class="description">{v.recipe.description}</p>
					<p class="meal-meta">
						{#if v.recipe.durationMinutes}<svg class="icon" aria-hidden="true"><use href="#icon-clock" /></svg>{app.t('meal.minutes', { count: v.recipe.durationMinutes })}{/if}{#if v.recipe.durationMinutes && v.recipe.proteinGroup}{' · '}{/if}{#if v.recipe.proteinGroup}{app.t(`group.${v.recipe.proteinGroup}` as const)}{/if}
					</p>
					{#if v.baseServings && v.ingredients.length}
						<p class="meta-line">{app.t('recipe.baseServings', { count: v.baseServings })}</p>
						<IngredientList ingredients={v.ingredients} system="metric" label={v.recipe.name} collapsible={false} />
					{/if}
				</div>
			</article>
			{#if v.version === v.current}
				<p class="meta-line current">{app.t('curation.current')}</p>
			{:else}
				{#if v.issues.length}
					<p class="notice" role="note">{app.t('curation.restoreBlocked', { items: summarize(v.issues).map((m) => app.t(`recipe.missing.${m}` as MessageKey)).join(', ') })}</p>
				{/if}
				<button type="button" class="text-button primary wide" disabled={app.settings.offline || v.issues.length > 0} onclick={() => (confirm = true)}>{app.t('curation.restore')}</button>
			{/if}
		{/if}
	</div>
</section>

<BottomSheet open={confirm} title={app.t('curation.restore')} onClose={() => (confirm = false)}>
	{#if result.ok}
		<p>{app.t('curation.restoreBody', { version, next: result.value.current + 1 })}</p>
		<div class="sheet-actions">
			<button type="button" class="text-button" onclick={() => (confirm = false)}>{app.t('curation.cancel')}</button>
			<button type="button" class="text-button primary" onclick={restore}>{app.t('curation.restoreConfirm')}</button>
		</div>
	{/if}
</BottomSheet>

<style>
	.narrow { max-width: 640px; }
	.page-meta { margin-bottom: 16px; }
	.title { margin: 0 0 12px; font: 400 1.375rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; }
	.notice { margin: 16px 0 0; padding: 10px 12px; background: var(--free-surface); border: 1px solid var(--free-border); font-size: 0.875rem; }
	.current { margin-top: 16px; }
	.wide { width: 100%; margin-top: 16px; }
	.sheet-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
</style>
