<script lang="ts">
	import ShoppingList from '#lib/components/ShoppingList.svelte';
	import ShoppingSelection from '#lib/components/ShoppingSelection.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { untrack } from 'svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { arrangeShoppingList, buildShoppingList, getShoppingSelection } from '#lib/operations/shopping.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Nothing here is saved: leaving the view discards selection and list (spec section 6).
	const selection = $derived(getShoppingSelection(app.db, app.ctx));
	let selected = $state<Set<string>>(new Set());
	// Slots the current list was generated from; null while choosing meals.
	let generated = $state<string[] | null>(null);
	let removed = $state<Set<string>>(new Set());
	let addedBack = $state<Set<string>>(new Set());

	// Start again from the default selection when the family, user or simulated time changes.
	const resetKey = $derived(`${app.settings.familyId}|${app.settings.userId}|${app.settings.now}`);
	$effect(() => {
		void resetKey;
		untrack(() => {
			const result = getShoppingSelection(app.db, app.ctx);
			selected = new Set(result.ok ? result.value.selected : []);
			generated = null;
		});
	});

	// Rebuilt on language or unit changes too; items removed or added back are kept by ingredient.
	const listResult = $derived(generated ? buildShoppingList(app.db, app.ctx, generated) : null);
	const list = $derived(listResult?.ok ? arrangeShoppingList(listResult.value, addedBack) : null);

	function generate() {
		const view = selection.ok ? selection.value : null;
		// Keep the chronological order of the selection.
		generated = view ? view.days.flatMap((d) => d.meals).filter((m) => selected.has(m.slotId)).map((m) => m.slotId) : [];
		removed = new Set();
		addedBack = new Set();
		document.querySelector('.secondary-view')?.scrollTo({ top: 0 });
	}

	const summary = $derived(
		list ? (list.mealCount === 1 ? app.t('shopping.listSummaryOne') : app.t('shopping.listSummary', { count: list.mealCount })) : ''
	);
</script>

<section class="secondary-view app-view shopping" aria-labelledby="shopping-title">
	<div class="column">
	<header class="shopping-header no-print">
		{#if generated}
			<button type="button" class="link-inline back" onclick={() => (generated = null)}>‹ {app.t('shopping.editMeals')}</button>
		{:else}
			<a class="link-inline back" href="/menu">‹ {app.t('nav.menu')}</a>
		{/if}
		<h1 id="shopping-title">{generated ? app.t('shopping.listTitle') : app.t('shopping.selectTitle')}</h1>
		{#if list}<p class="summary">{summary}</p>{/if}
	</header>

	{#if !selection.ok}
		<StateNotice title={app.t(errorKey(selection.error))} />
	{:else if listResult && !listResult.ok}
		<StateNotice title={app.t(errorKey(listResult.error))} />
	{:else if list}
		<ShoppingList {list} bind:removed bind:addedBack />
	{:else if selection.value.days.length === 0}
		<StateNotice title={app.t('shopping.empty.title')} body={app.t('shopping.empty.body')} />
	{:else}
		<ShoppingSelection view={selection.value} bind:selected onGenerate={generate} />
	{/if}
	</div>
</section>

<style>
	.shopping { padding-bottom: 0; }
	/* A list reads better in one narrow column on wide screens. */
	.column { max-width: 720px; margin-inline: auto; }
	.shopping-header { padding: max(12px, env(safe-area-inset-top)) 0 16px; }
	.back { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink); font: 700 0.875rem/1.5 var(--text-font); text-decoration: none; cursor: pointer; }
	h1 { margin: 4px 0 0; font: 400 1.5rem/1.3 var(--heading-font); }
	.summary { margin: 4px 0 0; color: var(--body-text); font-size: 0.875rem; }
</style>
