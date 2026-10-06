<script lang="ts">
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import type { ShoppingSelectionView, ShoppingShortcut } from '#lib/operations/shopping.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Step 1 of the shopping view: which meals to shop for (spec section 6).
	let {
		view,
		selected = $bindable(),
		mode = 'create',
		onSubmit
	}: { view: ShoppingSelectionView; selected: Set<string>; mode?: 'create' | 'edit'; onSubmit: () => void } = $props();

	const shortcuts = $derived(
		(['rest_of_week', 'next_week'] as ShoppingShortcut[]).flatMap((id) => {
			const ids = view.shortcuts[id];
			return ids?.length ? [{ id, ids }] : [];
		})
	);
	const sameAs = (ids: string[]) => ids.length === selected.size && ids.every((id) => selected.has(id));

	function toggle(slotId: string, on: boolean) {
		const next = new Set(selected);
		if (on) next.add(slotId);
		else next.delete(slotId);
		selected = next;
	}

	const generateLabel = $derived(
		selected.size === 0
			? app.t('shopping.generateNone')
			: mode === 'edit'
				? selected.size === 1 ? app.t('shopping.saveMealsOne') : app.t('shopping.saveMeals', { count: selected.size })
				: selected.size === 1 ? app.t('shopping.generateOne') : app.t('shopping.generate', { count: selected.size })
	);
</script>

<div class="shortcuts" role="group" aria-label={app.t('shopping.selectTitle')}>
	{#each shortcuts as shortcut (shortcut.id)}
		<button type="button" class="chip" aria-pressed={sameAs(shortcut.ids)} onclick={() => (selected = new Set(shortcut.ids))}>{app.t(`shopping.shortcut.${shortcut.id}`)}</button>
	{/each}
	<button type="button" class="chip" aria-pressed={selected.size === 0} onclick={() => (selected = new Set())}>{app.t('shopping.shortcut.none')}</button>
</div>

{#each view.days as day (day.date)}
	<section class="shopping-group" aria-labelledby="shop-day-{day.date}">
		<h2 id="shop-day-{day.date}">{formatDayLong(app.locale, day.date)}</h2>
		<ul class="shopping-items">
			{#each day.meals as meal (meal.slotId)}
				<li>
					{#if meal.selectable}
						<label class="shopping-item pick">
							<input type="checkbox" checked={selected.has(meal.slotId)} onchange={(e) => toggle(meal.slotId, e.currentTarget.checked)} />
							<span class="pick-name"><span class="meal-kind">{app.t(`meal.${meal.mealType}`)}</span>{meal.label}</span>
						</label>
					{:else}
						<div class="shopping-item pick unavailable">
							<span></span>
							<span class="pick-name">
								<span class="meal-kind">{app.t(`meal.${meal.mealType}`)}</span>
								{#if meal.kind === 'recipe'}{meal.label} <small>{app.t('shopping.unavailable')}</small>
								{:else if meal.kind === 'free'}{meal.label}
								{:else}{app.t('meal.empty.title')}{/if}
							</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/each}

<div class="action-bar">
	<button type="button" class="text-button primary" disabled={selected.size === 0 || app.settings.offline} onclick={onSubmit}>{generateLabel}</button>
</div>

<style>
	.shortcuts { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 20px; }
	.chip { min-height: 44px; padding: 8px 14px; border: 1px solid var(--ink); border-radius: 8px; color: var(--ink); background: var(--paper); font: 700 0.875rem/1.3 var(--text-font); cursor: pointer; }
	.chip[aria-pressed='true'] { color: #fff; background: var(--ink); }
	.shopping-group h2 { margin: 0 0 12px; }
	.shopping-group h2::first-letter { text-transform: uppercase; }
	.pick { grid-template-columns: 20px minmax(0, 1fr); align-items: center; }
	.pick input { margin: 0; }
	.pick-name { display: flex; flex-direction: column; overflow-wrap: anywhere; }
	/* Selection is not "already have it": no strike-through here. */
	.shopping-item.pick:has(input:checked) .pick-name { color: inherit; text-decoration: none; }
	.meal-kind { color: var(--green); font: 700 0.75rem/1.5 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
	.unavailable { color: var(--muted); cursor: default; }
	.unavailable .meal-kind { color: var(--muted); }
	small { font-size: 0.8125rem; }
	.action-bar { position: sticky; bottom: 0; display: flex; padding: 12px 0 4px; background: var(--canvas); }
	.action-bar .text-button { flex: 1; min-height: 48px; }
</style>
