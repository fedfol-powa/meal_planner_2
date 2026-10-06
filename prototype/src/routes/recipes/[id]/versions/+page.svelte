<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { getRecipeVersions } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Versions of a recipe (round 5): author and date; a past version opens the comparison and restore.
	const id = $derived(page.params.id ?? '');
	const result = $derived(getRecipeVersions(app.db, app.ctx, id));
</script>

<section class="secondary-view app-view" aria-labelledby="versions-title">
	<div class="page-column narrow">
		<PageHeader back="/recipes/{id}" backLabel={app.t('curation.backToRecipe')} title={app.t('curation.versions')} titleId="versions-title" />
		{#if !result.ok}
			<StateNotice title={app.t(result.error === 'forbidden' ? 'curation.forbidden' : 'error.notFound')} />
		{:else}
			<p class="page-meta">{result.value.name}</p>
			<ul class="row-list settings-card">
				{#each result.value.versions as v (v.version)}
					<li>
						{#if v.version === result.value.current}
							<span class="row-main"><strong>{app.t('curation.version', { version: v.version })}</strong> <span class="label-chip">{app.t('curation.current')}</span>
								<small>{v.byName}, {formatDateTime(app.locale, v.at)}{#if v.restoredFrom} · {app.t('curation.restoredFrom', { version: v.restoredFrom })}{/if}</small></span>
						{:else}
							<a class="row-link" href="/recipes/{id}/versions/{v.version}">
								<span class="row-main"><strong>{app.t('curation.version', { version: v.version })}</strong>
									<small>{v.byName}, {formatDateTime(app.locale, v.at)}{#if v.restoredFrom} · {app.t('curation.restoredFrom', { version: v.restoredFrom })}{/if}</small></span>
								<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
							</a>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="meta-line">{app.t('curation.versionsHint')}</p>
		{/if}
	</div>
</section>

<style>
	.narrow { max-width: 640px; }
	.page-meta { margin-bottom: 16px; }
	.settings-card { padding-block: 4px; }
	strong { font-weight: 700; }
	.label-chip { margin-left: 6px; }
</style>
