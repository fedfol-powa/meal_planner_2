<script lang="ts">
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getIngredientRestrictions, searchIngredients, setIngredientRestriction } from '#lib/operations/family.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Ingredients to avoid (out of menus and shopping lists) or to limit to a weekly maximum (spec section 3).
	let { editable }: { editable: boolean } = $props();
	let query = $state('');
	const restrictions = $derived.by(() => {
		const r = getIngredientRestrictions(app.db, app.ctx);
		return r.ok ? r.value : [];
	});
	const results = $derived.by(() => {
		const r = searchIngredients(app.db, app.ctx, query);
		return r.ok ? r.value : [];
	});

	function set(id: string, restriction: 'avoid' | 'limit' | null, weeklyMax: number | null = null) {
		const result = setIngredientRestriction(app.db, app.ctx, id, restriction, weeklyMax);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
	}

	function onSelect(id: string, value: string) {
		if (value === 'avoid') set(id, 'avoid');
		else set(id, 'limit', Number(value));
	}

	function add(id: string) {
		set(id, 'avoid');
		query = '';
	}
</script>

{#if restrictions.length}
	<ul class="row-list">
		{#each restrictions as r (r.ingredientId)}
			<li>
				<span class="row-main">{r.name}</span>
				{#if editable}
					<select aria-label={app.t('settings.ingredients.restriction', { name: r.name })} value={r.restriction === 'avoid' ? 'avoid' : String(r.weeklyMax)} onchange={(e) => onSelect(r.ingredientId, e.currentTarget.value)}>
						<option value="avoid">{app.t('settings.ingredients.avoid')}</option>
						{#each [1, 2, 3] as n (n)}<option value={String(n)}>{app.t('settings.ingredients.limit', { count: n })}</option>{/each}
					</select>
					<button type="button" class="remove" aria-label={app.t('settings.ingredients.remove', { name: r.name })} onclick={() => set(r.ingredientId, null)}>×</button>
				{:else}
					<span class="label-chip neutral">{r.restriction === 'avoid' ? app.t('settings.ingredients.avoid') : app.t('settings.ingredients.limit', { count: r.weeklyMax ?? 1 })}</span>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="meta-line">{app.t('settings.ingredients.none')}</p>
{/if}
{#if editable}
	<label class="field search">
		<span class="visually-hidden">{app.t('settings.ingredients.search')}</span>
		<input type="text" placeholder={app.t('settings.ingredients.search')} bind:value={query} autocomplete="off" />
	</label>
	{#if results.length}
		<ul class="results">
			{#each results as item (item.id)}
				<li><button type="button" class="row-link" onclick={() => add(item.id)}><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg>{item.name}</button></li>
			{/each}
		</ul>
	{:else if query.trim().length >= 2}
		<p class="meta-line">{app.t('settings.ingredients.noResults')}</p>
	{/if}
{/if}

<style>
	select { min-height: 40px; max-width: 46%; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 0.875rem/1.3 var(--text-font); }
	.remove { flex: none; width: 44px; height: 44px; border: 0; background: none; color: var(--ink); font: 400 1.5rem/1 var(--text-font); cursor: pointer; }
	.search { margin: 12px 0 4px; }
	.results { margin: 0; padding: 0; list-style: none; }
	.results .row-link { min-height: 44px; }
</style>
