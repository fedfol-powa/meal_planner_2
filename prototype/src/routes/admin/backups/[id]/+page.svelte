<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ConfirmDanger from '#lib/components/ConfirmDanger.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { previewCatalogueRestore, restoreCatalogue, type RecipeChange } from '#lib/operations/catalogue-backup.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// One backup (round 6): preview of the restore with the numbers, what does not change, the safety copy,
	// then the confirmation after the summary (round 4 pattern).
	const backupId = $derived(page.params.id ?? '');
	const preview = $derived(previewCatalogueRestore(app.db, app.ctx, backupId));
	const SHOWN = 5;

	function restore() {
		const result = restoreCatalogue(app.db, app.ctx, backupId);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.notify(app.t('admin.restore.done', result.value));
		goto('/admin#backups', { replaceState: true });
	}
</script>

{#snippet group(title: string, hint: string | null, items: RecipeChange[])}
	{#if items.length}
		<section class="settings-card">
			<h2>{title}</h2>
			{#if hint}<p class="meta-line">{hint}</p>{/if}
			<ul class="names">
				{#each items.slice(0, SHOWN) as item (item.recipeId)}<li><a class="link-inline" href="/recipes/{item.recipeId}">{item.name}</a></li>{/each}
			</ul>
			{#if items.length > SHOWN}
				<details>
					<summary>{app.t('admin.restore.more', { count: items.length - SHOWN })}</summary>
					<ul class="names">{#each items.slice(SHOWN) as item (item.recipeId)}<li><a class="link-inline" href="/recipes/{item.recipeId}">{item.name}</a></li>{/each}</ul>
				</details>
			{/if}
		</section>
	{/if}
{/snippet}

<section class="secondary-view app-view" aria-labelledby="backup-title">
	<div class="page-column">
		<PageHeader back="/admin#backups" backLabel={app.t('admin.title')} title={preview.ok ? app.t('admin.backupTitle', { date: formatDateTime(app.locale, preview.value.backup.takenAt) }) : app.t('admin.backups')} titleId="backup-title" />
		{#if !preview.ok}
			<StateNotice title={app.t(preview.error === 'forbidden' ? 'admin.forbidden' : errorKey(preview.error))} />
		{:else}
			{@const p = preview.value}
			{@const changes = p.reverted.length + p.archived.length + p.unarchived.length}
			<p class="section-intro">
				<span class="label-chip neutral">{app.t(`admin.backup.${p.backup.kind}` as const)}</span>
				{app.t('admin.restoreIntro', { date: formatDateTime(app.locale, p.backup.takenAt) })}
			</p>
			{#if changes === 0}
				<StateNotice title={app.t('admin.restore.nothing')} />
			{:else}
				{@render group(app.t('admin.restore.reverted', { count: p.reverted.length }), app.t('admin.restore.revertedHint'), p.reverted)}
				{@render group(app.t('admin.restore.archived', { count: p.archived.length }), app.t('admin.restore.archivedHint'), p.archived)}
				{@render group(app.t('admin.restore.unarchived', { count: p.unarchived.length }), null, p.unarchived)}
			{/if}
			{@render group(app.t('admin.restore.blocked', { count: p.blocked.length }), app.t('admin.restore.blockedHint'), p.blocked)}
			<section class="settings-card">
				<p>{app.t('admin.restore.unchanged', { count: p.unchanged })}{#if p.ingredients}{' '}{app.t('admin.restore.ingredients', { count: p.ingredients })}{/if}</p>
				<p>{app.t('admin.restore.untouched', { drafts: p.drafts })}</p>
				{#if changes}
					<p class="meta-line">{app.t('admin.restore.safety')}</p>
					<ConfirmDanger label={app.t('admin.restore.confirm')} disabled={app.settings.offline} onConfirm={restore} />
				{/if}
			</section>
		{/if}
	</div>
</section>

<style>
	h2 { margin: 0 0 4px; }
	.names { margin: 8px 0 0; padding-left: 20px; }
	.names li { margin: 4px 0; }
	summary { min-height: 40px; display: flex; align-items: center; color: var(--green); font-weight: 700; cursor: pointer; }
	.section-intro .label-chip { margin-right: 6px; }
</style>
