<script lang="ts">
	import { page } from '$app/state';
	import ShoppingList from '#lib/components/ShoppingList.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getWeekShoppingList } from '#lib/operations/shopping-lists.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// The list of the week opened from the menu; rebuilt on every change (meals, other members, language, units).
	const result = $derived(getWeekShoppingList(app.db, app.ctx, page.params.week ?? ''));
</script>

<section class="secondary-view app-view" aria-labelledby="list-title">
	<div class="page-column">
		{#if result.ok}
			<ShoppingList list={result.value} />
		{:else}
			<header class="page-header"><a class="page-back" href="/menu"><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>{app.t('nav.menu')}</a></header>
			<StateNotice title={app.t(errorKey(result.error))} />
		{/if}
	</div>
</section>
