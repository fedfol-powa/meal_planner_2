<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BottomSheet from '#lib/components/BottomSheet.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { summarize } from '#lib/domain/recipe-validation.ts';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import { compareVersions, restoreVersion, type FieldChange } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Comparison of a past version with the current one, and restore as a new version (round 5).
	const id = $derived(page.params.id ?? '');
	const version = $derived(Number(page.params.version));
	const result = $derived(compareVersions(app.db, app.ctx, id, version));
	let confirm = $state(false);

	const fieldLabel = (c: FieldChange) => {
		const key = c.field === 'bookId' ? 'book' : c.field === 'durationMinutes' ? 'duration' : c.field;
		const label = app.t(`curation.field.${key}` as MessageKey);
		return c.locale ? `${label} · ${app.t(c.locale === 'it-IT' ? 'curation.lang.it' : 'curation.lang.en')}` : label;
	};

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

<section class="secondary-view app-view" aria-labelledby="compare-title">
	<div class="page-column narrow">
		<PageHeader back="/recipes/{id}/versions" backLabel={app.t('curation.versions')} title={app.t('curation.version', { version })} titleId="compare-title" />
		{#if !result.ok}
			<StateNotice title={app.t(result.error === 'forbidden' ? 'curation.forbidden' : 'error.notFound')} />
		{:else}
			{@const c = result.value}
			<p class="page-meta">{c.name} · {c.byName}, {formatDateTime(app.locale, c.at)}</p>
			<h2 class="section-title">{app.t('curation.compare.title', { version: c.version, current: c.current })}</h2>
			{#if !c.fields.length && !c.ingredients.length}
				<p class="meta-line">{app.t('curation.compare.same')}</p>
			{:else}
				<div class="settings-card">
					<dl class="diff">
						{#each c.fields as change (change.field + change.locale)}
							<div class="diff-row">
								<dt>{fieldLabel(change)}</dt>
								<dd><span class="was">{app.t('curation.compare.then', { version: c.version })}</span> {change.before}</dd>
								<dd><span class="now">{app.t('curation.compare.now')}</span> {change.after}</dd>
							</div>
						{/each}
						{#each c.ingredients as line (line.name)}
							<div class="diff-row">
								<dt>{line.name}</dt>
								{#if line.before === null}
									<dd><span class="label-chip">{app.t('curation.compare.added')}</span> {line.after}</dd>
								{:else if line.after === null}
									<dd><span class="label-chip neutral">{app.t('curation.compare.removed')}</span> {line.before}</dd>
								{:else}
									<dd><span class="was">{app.t('curation.compare.then', { version: c.version })}</span> {line.before}</dd>
									<dd><span class="now">{app.t('curation.compare.now')}</span> {line.after}</dd>
								{/if}
							</div>
						{/each}
					</dl>
				</div>
			{/if}
			{#if c.issues.length}
				<p class="notice" role="note">{app.t('curation.restoreBlocked', { items: summarize(c.issues).map((m) => app.t(`recipe.missing.${m}` as MessageKey)).join(', ') })}</p>
			{/if}
			<button type="button" class="text-button primary wide" disabled={app.settings.offline || c.issues.length > 0} onclick={() => (confirm = true)}>{app.t('curation.restore')}</button>
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
	.section-title { margin: 0 0 10px; font: 400 1.25rem/1.3 var(--heading-font); }
	.diff { margin: 0; }
	.diff-row { padding: 10px 0; border-top: 1px solid var(--rule); }
	.diff-row:first-child { border-top: 0; }
	dt { margin-bottom: 4px; font-weight: 700; }
	dd { margin: 2px 0; overflow-wrap: anywhere; }
	.was, .now { display: block; color: var(--muted); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.035em; }
	dd + dd { margin-top: 8px; }
	.now { color: var(--green); font-weight: 700; }
	.notice { margin: 0 0 12px; padding: 10px 12px; background: var(--free-surface); border: 1px solid var(--free-border); font-size: 0.875rem; }
	.wide { width: 100%; margin-top: 8px; }
	.sheet-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
</style>
