<script lang="ts">
	import { DEPARTMENTS, type Department } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { createIngredient, searchCatalogueIngredients } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Content of the sheet that picks the catalogue ingredient of a recipe line, or adds a new one (round 5).
	let { onPick }: { onPick: (ingredientId: string) => void } = $props();

	let text = $state('');
	let creating = $state(false);
	let nameIt = $state('');
	let nameEn = $state('');
	let department = $state<Department>('produce');
	const results = $derived.by(() => {
		const r = searchCatalogueIngredients(app.db, app.ctx, text);
		return r.ok ? r.value : [];
	});

	function startNew() {
		creating = true;
		nameIt = app.locale === 'it-IT' ? text.trim() : '';
		nameEn = app.locale === 'en-GB' ? text.trim() : '';
	}

	function create(event: SubmitEvent) {
		event.preventDefault();
		const created = createIngredient(app.db, app.ctx, { 'it-IT': nameIt, 'en-GB': nameEn || null }, department);
		if (!created.ok) return app.notify(app.t(errorKey(created.error)));
		app.update(() => {});
		onPick(created.value.id);
	}
</script>

{#if !creating}
	<label class="field">{app.t('curation.ingredient.search')}
		<!-- svelte-ignore a11y_autofocus -->
		<input type="text" bind:value={text} autofocus autocomplete="off" />
	</label>
	{#if text.trim().length >= 2}
		<ul class="row-list">
			{#each results as item (item.id)}
				<li><button type="button" class="row-link" onclick={() => onPick(item.id)}><span class="row-main">{item.name}</span></button></li>
			{:else}
				<li><span class="row-main meta-line">{app.t('curation.ingredient.none')}</span></li>
			{/each}
		</ul>
	{/if}
	<button type="button" class="text-button add" disabled={app.settings.offline} onclick={startNew}><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg>{app.t('curation.ingredient.new')}</button>
{:else}
	<form onsubmit={create}>
		<p class="meta-line">{app.t('curation.ingredient.newHint')}</p>
		<label class="field">{app.t('curation.ingredient.nameIt')}<input type="text" maxlength={80} bind:value={nameIt} required /></label>
		<label class="field">{app.t('curation.ingredient.nameEn')}<input type="text" maxlength={80} bind:value={nameEn} /></label>
		<label class="field">{app.t('curation.ingredient.department')}
			<select bind:value={department}>
				{#each DEPARTMENTS as d (d)}<option value={d}>{app.t(`department.${d}` as const)}</option>{/each}
			</select>
		</label>
		<div class="actions">
			<button type="button" class="text-button" onclick={() => (creating = false)}>{app.t('common.back')}</button>
			<button type="submit" class="text-button primary" disabled={!nameIt.trim()}>{app.t('curation.ingredient.add')}</button>
		</div>
	</form>
{/if}

<style>
	.add { margin-top: 12px; }
	.actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
