<script lang="ts">
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatDayMonth } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getExclusions } from '#lib/operations/family.ts';
	import { excludeRecipe, includeRecipe } from '#lib/operations/revision.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// "Non proporre più" (spec section 2): every member reads and manages it; recipes are excluded from a meal.
	const result = $derived(getExclusions(app.db, app.ctx));

	function include(recipeId: string, name: string) {
		const r = includeRecipe(app.db, app.ctx, recipeId);
		if (!r.ok) return app.notify(app.t(errorKey(r.error)));
		app.update(() => {});
		app.notify(app.t('exclusions.included', { name }), () => {
			if (excludeRecipe(app.db, app.ctx, recipeId).ok) app.update(() => {});
		});
	}
</script>

<section class="secondary-view app-view" aria-labelledby="exclusions-title">
	<div class="page-column">
		<PageHeader back="/you" backLabel={app.t('nav.you')} title={app.t('you.exclusions')} titleId="exclusions-title" />
		{#if !result.ok}
			<StateNotice title={app.t(errorKey(result.error))} />
		{:else if result.value.length === 0}
			<StateNotice title={app.t('exclusions.empty')} body={app.t('exclusions.emptyBody')} />
		{:else}
			<section class="settings-card">
				<ul class="row-list">
					{#each result.value as item (item.recipe.id)}
						<li class="wrap">
							<span class="row-main"><a class="link-inline" href="/recipes/{item.recipe.id}">{item.recipe.name}</a><small>{app.t('exclusions.by', { name: item.createdByName ?? app.t('meal.formerMember'), time: formatDayMonth(app.locale, item.createdAt.slice(0, 10)) })}</small></span>
							<button type="button" class="text-button small" disabled={app.settings.offline} onclick={() => include(item.recipe.id, item.recipe.name)}>{app.t('exclusions.include')}</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</section>

<style>
	.wrap { flex-wrap: wrap; padding: 10px 0; }
	.small { min-height: 40px; padding: 6px 12px; }
</style>
