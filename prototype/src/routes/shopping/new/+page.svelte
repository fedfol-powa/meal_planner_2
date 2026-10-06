<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { untrack } from 'svelte';
	import ShoppingSelection from '#lib/components/ShoppingSelection.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getShoppingSelection } from '#lib/operations/shopping.ts';
	import { createShoppingList, getShoppingListDetail, setShoppingListMeals } from '#lib/operations/shopping-lists.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// New list, or `?list=` to change the meals of an open one.
	const listId = $derived(page.url.searchParams.get('list'));
	const editing = $derived(listId ? getShoppingListDetail(app.db, app.ctx, listId) : null);
	const selection = $derived(getShoppingSelection(app.db, app.ctx));
	let selected = $state<Set<string>>(new Set());

	// Start from the list's meals or the default selection; again when user, family or time change.
	const resetKey = $derived(`${listId}|${app.settings.familyId}|${app.settings.userId}|${app.settings.now}`);
	$effect(() => {
		void resetKey;
		untrack(() => {
			if (editing?.ok) selected = new Set(editing.value.slotIds);
			else selected = new Set(selection.ok ? selection.value.selected : []);
		});
	});

	function submit() {
		if (editing?.ok) {
			// Past meals are not shown here but stay in the list.
			const shown = new Set(selection.ok ? selection.value.days.flatMap((d) => d.meals.map((m) => m.slotId)) : []);
			const kept = editing.value.slotIds.filter((id) => !shown.has(id));
			const result = setShoppingListMeals(app.db, app.ctx, editing.value.id, [...kept, ...selected]);
			if (!result.ok) return app.notify(app.t(errorKey(result.error)));
			app.update(() => {});
			goto(`/shopping/${editing.value.id}`);
			return;
		}
		const result = createShoppingList(app.db, app.ctx, [...selected]);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		goto(`/shopping/${result.value.id}`, { replaceState: true });
	}
</script>

<section class="secondary-view app-view shopping" aria-labelledby="new-title">
	<div class="page-column">
		<header class="page-header">
			<a class="page-back" href={editing?.ok ? `/shopping/${editing.value.id}` : '/shopping'}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>{editing?.ok ? editing.value.name : app.t('shopping.back')}</a>
			<h1 class="page-title" id="new-title">{app.t('shopping.selectTitle')}</h1>
		</header>
		{#if !selection.ok}
			<StateNotice title={app.t(errorKey(selection.error))} />
		{:else if editing && !editing.ok}
			<StateNotice title={app.t(errorKey(editing.error))} />
		{:else if selection.value.days.length === 0}
			<StateNotice title={app.t('shopping.empty.title')} body={app.t('shopping.empty.body')} />
		{:else}
			<ShoppingSelection view={selection.value} bind:selected mode={editing ? 'edit' : 'create'} onSubmit={submit} />
		{/if}
	</div>
</section>

<style>
	.shopping { padding-bottom: 0; }
</style>
