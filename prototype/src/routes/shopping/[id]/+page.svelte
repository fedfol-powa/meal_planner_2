<script lang="ts">
	import { page } from '$app/state';
	import ShoppingList from '#lib/components/ShoppingList.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getShoppingListDetail } from '#lib/operations/shopping-lists.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Rebuilt on every change: meals, ticks by other members, language or units.
	const result = $derived(getShoppingListDetail(app.db, app.ctx, page.params.id ?? ''));
	const list = $derived(result.ok ? result.value : null);
</script>

<section class="secondary-view app-view" aria-labelledby="list-title">
	<div class="page-column">
		{#if !result.ok}
			<header class="page-header"><a class="page-back" href="/shopping"><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>{app.t('shopping.back')}</a></header>
			<StateNotice title={app.t(errorKey(result.error))} />
		{:else if list}
			<ShoppingList {list} />
		{/if}
	</div>
</section>
