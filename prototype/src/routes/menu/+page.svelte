<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import DaySelector from '#lib/components/DaySelector.svelte';
	import MealCard from '#lib/components/MealCard.svelte';
	import RatingStars from '#lib/components/RatingStars.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import { getMenuDates, getOpeningTarget, getWeekView, pickSelectedDate, setMealCooked } from '#lib/operations/meals.ts';
	import type { MealView } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let track: HTMLDivElement | undefined = $state();
	let actionError = $state<MessageKey | null>(null);
	let simulatedNotice = $state(false);

	const opening = $derived(getOpeningTarget(app.db, app.ctx));
	const openingDay = $derived(opening.ok && opening.value.kind === 'day' ? opening.value : null);
	const dayParam = $derived(page.url.searchParams.get('day'));
	const weekResult = $derived(openingDay ? getWeekView(app.db, app.ctx, app.selectedDate ?? dayParam ?? openingDay.weekStartsOn) : null);
	const week = $derived(weekResult?.ok ? weekResult.value : null);
	const selected = $derived(week ? pickSelectedDate(week, app.selectedDate ?? dayParam, openingDay?.date ?? null) : null);

	function scrollToDate(date: string, behavior: ScrollBehavior) {
		track?.querySelector(`#day-${date}`)?.scrollIntoView({ behavior, inline: 'start', block: 'nearest' });
	}

	function select(date: string) {
		app.selectedDate = date;
		scrollToDate(date, 'smooth');
	}

	// Debounced instead of `scrollend`, which older iOS Safari versions do not fire.
	let scrollTimer: ReturnType<typeof setTimeout> | undefined;
	function onScroll() {
		clearTimeout(scrollTimer);
		scrollTimer = setTimeout(() => {
			if (!track || !week) return;
			const day = week.days[Math.round(track.scrollLeft / track.clientWidth)];
			if (day && day.date !== app.selectedDate) app.selectedDate = day.date;
		}, 120);
	}

	const menuDates = $derived.by(() => {
		const result = getMenuDates(app.db, app.ctx);
		return result.ok ? result.value : [];
	});

	// The chosen day lives in app.selectedDate; `?day=` only seeds it when arriving from a link.
	function pickDate(date: string) {
		app.selectedDate = date;
	}

	function toggleCooked(meal: MealView) {
		const result = setMealCooked(app.db, app.ctx, meal.slotId, meal.cooked === false ? null : false);
		actionError = result.ok ? null : (`error.${result.error === 'not_allowed' ? 'notAllowed' : result.error === 'not_found' ? 'notFound' : result.error}` as MessageKey);
		if (result.ok) app.update(() => {});
	}

	$effect(() => {
		if (!week || !selected) return;
		const target = selected;
		tick().then(() => scrollToDate(target, 'instant'));
	});
</script>

{#snippet mealRating(meal: MealView)}
	{#if meal.recipe && meal.rating}
		<RatingStars summary={meal.rating} recipeId={meal.recipe.id} recipeName={meal.recipe.name} variant={app.settings.ratingVariant} />
	{/if}
{/snippet}

{#if !opening.ok}
	<section class="secondary-view app-view"><StateNotice title={app.t('error.forbidden')} /></section>
{:else if opening.value.kind === 'no_weeks'}
	<section class="secondary-view app-view">
		<StateNotice title={app.t('menu.noWeeks.title')} body={app.t('menu.noWeeks.body')}>
			<button type="button" class="text-button primary" onclick={() => (simulatedNotice = true)}>{app.t('menu.noWeeks.action')}</button>
			{#if simulatedNotice}<p class="meta-line" role="status">{app.t('menu.noWeeks.simulated')}</p>{/if}
		</StateNotice>
	</section>
{:else if week && selected}
	<section class="calendar app-view" aria-label={app.t('nav.menu')}>
		<nav class="day-navigation" aria-label={app.t('menu.days')}>
			<div class="day-row">
				<DaySelector dates={week.days.map((d) => d.date)} {selected} onSelect={select} />
				<DatePicker dates={menuDates} {selected} onSelect={pickDate} />
			</div>
			{#if actionError}<p class="meta-line" role="alert">{app.t(actionError)}</p>{/if}
		</nav>
		<!-- Scrollable region must be focusable for keyboard scrolling, as in the approved reference. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="week-track" bind:this={track} tabindex="0" role="region" aria-label={app.t('menu.week')} onscroll={onScroll}>
			{#each week.days as day (day.date)}
				<section class="day" id="day-{day.date}" aria-labelledby="heading-{day.date}">
					<h2 class="day-title visually-hidden" id="heading-{day.date}">{formatDayLong(app.locale, day.date)}</h2>
					{#each day.meals as meal (meal.slotId)}
						<MealCard {meal} system={week.measurementSystem} rating={mealRating} onToggleCooked={toggleCooked} />
					{:else}
						<StateNotice title={app.t('menu.dayEmpty')} />
					{/each}
				</section>
			{/each}
		</div>
	</section>
{:else}
	<section class="secondary-view app-view"><StateNotice title={app.t('error.notFound')} /></section>
{/if}

<style>
	.day-row { display: flex; align-items: stretch; gap: 8px; }
	.day-row :global(.day-links) { flex: 1; min-width: 0; }
</style>
