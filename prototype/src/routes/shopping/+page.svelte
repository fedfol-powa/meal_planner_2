<script lang="ts">
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatChangeTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getShoppingLists, type ShoppingListSummary } from '#lib/operations/shopping-lists.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Family shopping lists: the open ones first, the history below (round 3 revision).
	const result = $derived(getShoppingLists(app.db, app.ctx));

	const meals = (l: ShoppingListSummary) => (l.mealCount === 1 ? app.t('shopping.mealsOne') : app.t('shopping.meals', { count: l.mealCount }));
	const changedBy = (l: ShoppingListSummary) =>
		l.lastChange.byApp
			? app.t('shopping.createdByApp', { time: formatChangeTime(app.locale, l.lastChange.at) })
			: app.t('meal.changedBy', { name: l.lastChange.userName ?? app.t('meal.formerMember'), time: formatChangeTime(app.locale, l.lastChange.at) });
</script>

<section class="secondary-view app-view" aria-labelledby="lists-title">
	<div class="page-column">
		<header class="page-header">
			<a class="page-back" href="/menu">‹ {app.t('nav.menu')}</a>
			<div class="title-row">
				<h1 class="page-title" id="lists-title">{app.t('shopping.lists')}</h1>
				{#if app.settings.offline}
					<span class="text-button primary disabled" aria-disabled="true">{app.t('shopping.new')}</span>
				{:else}
					<a class="text-button primary" href="/shopping/new">{app.t('shopping.new')}</a>
				{/if}
			</div>
		</header>

		{#if !result.ok}
			<StateNotice title={app.t(errorKey(result.error))} />
		{:else}
			{#each result.value.open as list (list.id)}
				<a class="list-card" href="/shopping/{list.id}">
					{#if list.weekly}<span class="label-chip">{app.t('shopping.weekly')}</span>{/if}
					<h2>{list.name}</h2>
					<p class="progress"><strong>{app.t('shopping.progress', { checked: list.checked, total: list.total })}</strong> · {meals(list)}</p>
					<p class="changed">{changedBy(list)}</p>
					<span class="bar" aria-hidden="true"><span style="width: {list.total ? (100 * list.checked) / list.total : 0}%"></span></span>
				</a>
			{:else}
				<StateNotice title={app.t('shopping.noOpen.title')} body={app.t('shopping.noOpen.body')} />
			{/each}

			{#if result.value.closed.length}
				<details class="history">
					<summary>{app.t('shopping.history', { count: result.value.closed.length })}</summary>
					<ul>
						{#each result.value.closed as list (list.id)}
							<li>
								<a href="/shopping/{list.id}">
									<span class="history-name">{list.name}</span>
									<span class="history-meta">{app.t('shopping.closedOn', { time: formatChangeTime(app.locale, list.closedAt ?? list.lastChange.at) })} · {app.t('shopping.progress', { checked: list.checked, total: list.total })}</span>
								</a>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		{/if}
	</div>
</section>

<style>
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.disabled { opacity: 0.5; cursor: not-allowed; }
	.list-card { display: block; margin-bottom: 16px; padding: 18px 20px; background: var(--paper); box-shadow: var(--card-shadow); color: var(--ink); text-decoration: none; }
	.list-card:hover h2 { color: var(--green); }
	.label-chip { margin-bottom: 8px; }
	h2 { margin: 0 0 6px; font: 400 1.25rem/1.3 var(--meal-title-font); }
	.progress { margin: 0; font-size: 0.875rem; }
	.changed { margin: 2px 0 12px; color: var(--muted); font-size: 0.8125rem; }
	.bar { display: block; height: 4px; border-radius: 2px; background: var(--rule); overflow: hidden; }
	.bar span { display: block; height: 100%; background: var(--green); }
	.history { margin: 24px 0; }
	.history summary { min-height: 44px; display: flex; align-items: center; font: 400 1.25rem/1.3 var(--heading-font); cursor: pointer; }
	.history ul { margin: 8px 0 0; padding: 0; list-style: none; background: var(--paper); box-shadow: var(--card-shadow); }
	.history li + li { border-top: 1px solid var(--rule); }
	.history a { display: flex; flex-direction: column; min-height: 48px; padding: 12px 20px; color: var(--ink); text-decoration: none; }
	.history-name { font-weight: 700; }
	.history-meta { color: var(--muted); font-size: 0.8125rem; }
</style>
