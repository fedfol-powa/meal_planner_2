<script lang="ts">
	import { formatDayShort, formatDayNumber } from '#lib/i18n/dates.ts';
	import type { MealView, WeekView } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Any other meal of the same week, lunch or dinner (round 2, provisional decision 5).
	let { week, slotId, onPick }: { week: WeekView; slotId: string; onPick: (otherSlotId: string) => void } = $props();

	const content = (meal: MealView) =>
		meal.kind === 'recipe' ? meal.recipe?.name ?? '' : meal.kind === 'free' ? meal.freeText ?? '' : app.t('meal.empty.title');
</script>

<ul class="swap-list">
	{#each week.days as day (day.date)}
		{#each day.meals.filter((m) => m.slotId !== slotId) as meal (meal.slotId)}
			<li>
				<button type="button" onclick={() => onPick(meal.slotId)}>
					<span class="when">{formatDayShort(app.locale, day.date)} {formatDayNumber(app.locale, day.date)} · {app.t(`meal.${meal.mealType}` as const)}</span>
					<span class="what" class:free={meal.kind !== 'recipe'}>{content(meal)}</span>
				</button>
			</li>
		{/each}
	{/each}
</ul>

<style>
	.swap-list { margin: 0; padding: 0; list-style: none; }
	.swap-list li + li { border-top: 1px solid var(--rule); }
	button { display: grid; gap: 2px; width: 100%; min-height: 56px; padding: 8px 0; border: 0; background: none; color: var(--ink); text-align: left; cursor: pointer; }
	.when { color: var(--muted); font-size: 0.75rem; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; }
	.what { font: 400 1rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; }
	.what.free { color: var(--green); font-family: var(--text-font); }
</style>
