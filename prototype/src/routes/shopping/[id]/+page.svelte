<script lang="ts">
	import { page } from '$app/state';
	import ShoppingList from '#lib/components/ShoppingList.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatChangeTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getShoppingListDetail } from '#lib/operations/shopping-lists.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Rebuilt on every change: meals, ticks by other members, language or units.
	const result = $derived(getShoppingListDetail(app.db, app.ctx, page.params.id ?? ''));
	const list = $derived(result.ok ? result.value : null);
	const changedBy = $derived(
		!list
			? ''
			: list.lastChange.byApp
				? app.t('shopping.createdByApp', { time: formatChangeTime(app.locale, list.lastChange.at) })
				: app.t('meal.changedBy', { name: list.lastChange.userName ?? app.t('meal.formerMember'), time: formatChangeTime(app.locale, list.lastChange.at) })
	);
</script>

<section class="secondary-view app-view shopping" aria-labelledby="list-title">
	<div class="page-column">
		<header class="page-header no-print">
			<div class="title-row">
				<a class="page-back" href="/shopping">‹ {app.t('shopping.back')}</a>
				{#if list?.status === 'open' && !app.settings.offline}
					<a class="page-back" href="/shopping/new?list={list.id}">{app.t('shopping.editMeals')}</a>
				{/if}
			</div>
			{#if list}
				{#if list.weekly}<span class="label-chip">{app.t('shopping.weekly')}</span>{/if}
				<h1 class="page-title" id="list-title">{list.name}</h1>
				<p class="page-meta">
					<strong>{app.t('shopping.progress', { checked: list.checked, total: list.total })}</strong> ·
					{list.mealCount === 1 ? app.t('shopping.mealsOne') : app.t('shopping.meals', { count: list.mealCount })}
				</p>
				<p class="page-meta changed">{changedBy}</p>
			{/if}
		</header>
		{#if !result.ok}
			<StateNotice title={app.t(errorKey(result.error))} />
		{:else if list}
			<ShoppingList {list} />
		{/if}
	</div>
</section>

<style>
	.shopping { padding-bottom: 0; }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.changed { margin-top: 0; color: var(--muted); font-size: 0.8125rem; }
</style>
