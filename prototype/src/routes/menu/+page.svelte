<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import DaySelector from '#lib/components/DaySelector.svelte';
	import RecipeCard from '#lib/components/RecipeCard.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import DatePicker from '#lib/components/DatePicker.svelte';
	import MealActionList, { type EditorStage } from '#lib/components/MealActionList.svelte';
	import MealEditor from '#lib/components/MealEditor.svelte';
	import SetupCard from '#lib/components/SetupCard.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { roleOf } from '#lib/operations/family.ts';
	import { generateFirstWeeks } from '#lib/operations/onboarding.ts';
	import { setMealServings } from '#lib/operations/revision.ts';
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import { isIsoDate } from '#lib/domain/calendar.ts';
	import { getMenuDates, getOpeningTarget, getWeekView, pickSelectedDate, resolveWeekStart } from '#lib/operations/meals.ts';
	import type { MealView, RecipeCardView } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let track: HTMLDivElement | undefined = $state();
	const isAdmin = $derived(!!app.family && roleOf(app.family, app.user.id) === 'family_admin');

	// No weeks yet (e.g. a family created before round 4): administrators generate them now (simulated).
	function generate() {
		const result = generateFirstWeeks(app.db, app.ctx);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.selectedDate = null;
		app.notify(app.t('wizard.generated'));
	}
	let pickerOpen = $state(false);
	// Meal being revised and the sheet stage shown (round 2).
	let editing = $state<{ slotId: string; stage: EditorStage } | null>(null);

	const opening = $derived(getOpeningTarget(app.db, app.ctx));
	const openingDay = $derived(opening.ok && opening.value.kind === 'day' ? opening.value : null);
	const rawDay = $derived(page.url.searchParams.get('day'));
	const dayParam = $derived(isIsoDate(rawDay) ? rawDay : null);
	// A remembered or linked day whose week is hidden (or invalid) falls back to the opening week.
	const weekStart = $derived(openingDay ? resolveWeekStart(app.db, app.ctx, [app.selectedDate, dayParam], openingDay.weekStartsOn) : null);
	const weekResult = $derived(weekStart ? getWeekView(app.db, app.ctx, weekStart) : null);
	const week = $derived(weekResult?.ok ? weekResult.value : null);
	const selected = $derived(
		week ? pickSelectedDate(week, [app.selectedDate, dayParam].find((d) => week.days.some((day) => day.date === d)) ?? null, openingDay?.date ?? null) : null
	);

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

	const monthLabel = $derived(
		selected ? new Intl.DateTimeFormat(app.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${selected}T00:00:00Z`)) : ''
	);

	// W23: the «Oggi» button returns to today, as a tap on Menu; when today has no meals the opening
	// is another day, so the button is not shown (decision of 2026-10-23).
	let monthButton: HTMLButtonElement | undefined = $state();
	const todayTarget = $derived(openingDay?.date === app.settings.now.slice(0, 10) ? openingDay.date : null);
	function goToday() {
		if (!todayTarget) return;
		app.selectedDate = todayTarget;
		// The button disappears once on today: keep the focus in the bar.
		monthButton?.focus();
	}

	// The chosen day lives in app.selectedDate; `?day=` only seeds it when arriving from a link.
	function pickDate(date: string) {
		app.selectedDate = date;
	}

	function toCard(meal: MealView): RecipeCardView {
		return {
			...meal,
			key: meal.slotId,
			label: app.t(`meal.${meal.mealType}` as const),
			detailHref: meal.recipe && meal.canOpenRecipe ? `/recipes/${meal.recipe.id}?from=menu&day=${meal.date}&slot=${meal.slotId}` : null
		};
	}

	const editingMeal = $derived(editing ? week?.days.flatMap((d) => d.meals).find((m) => m.slotId === editing?.slotId) ?? null : null);
	const openEditor = (slotId: string, stage: EditorStage) => (editing = { slotId, stage });

	// Remember the shown day (also when it came from `?day=` or the opening), e.g. for the Prova panel.
	$effect(() => {
		if (selected && app.selectedDate === null) app.selectedDate = selected;
	});

	$effect(() => {
		if (!week || !selected) return;
		const target = selected;
		tick().then(() => scrollToDate(target, 'instant'));
	});
</script>

{#if !opening.ok}
	<section class="secondary-view app-view"><StateNotice title={app.t('error.forbidden')} /></section>
{:else if opening.value.kind === 'no_weeks'}
	<section class="secondary-view app-view">
		<StateNotice title={app.t('menu.noWeeks.title')} body={app.t(isAdmin ? 'menu.noWeeks.body' : 'menu.noWeeks.member')}>
			{#if isAdmin}<button type="button" class="text-button primary" disabled={app.settings.offline} onclick={generate}>{app.t('menu.noWeeks.action')}</button>{/if}
		</StateNotice>
	</section>
{:else if week && selected}
	<section class="calendar app-view" aria-label={app.t('nav.menu')}>
		<nav class="day-navigation" aria-label={app.t('menu.days')}>
			<SetupCard />
			<div class="menu-toolbar">
				<button type="button" class="month-button" bind:this={monthButton} data-date-picker-toggle aria-expanded={pickerOpen} onclick={() => (pickerOpen = !pickerOpen)}>{monthLabel}</button>
				<div class="toolbar-actions">
					{#if todayTarget && selected !== todayTarget}
						<button type="button" class="today-button" aria-label={app.t('menu.todayLabel')} onclick={goToday}>
							<svg class="icon" aria-hidden="true"><use href="#icon-today" /></svg>
							<span>{app.t('menu.today')}</span>
						</button>
					{/if}
					<DatePicker dates={menuDates} {selected} onSelect={pickDate} bind:open={pickerOpen} />
					<a class="toolbar-link" href="/shopping/{week.startsOn}" aria-label={app.t('menu.shopping')}><svg class="icon" aria-hidden="true"><use href="#icon-bag" /></svg></a>
				</div>
			</div>
			<DaySelector dates={week.days.map((d) => d.date)} {selected} onSelect={select} />
		</nav>
		<!-- Scrollable region must be focusable for keyboard scrolling, as in the approved reference. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div class="week-track" bind:this={track} tabindex="0" role="region" aria-label={app.t('menu.week')} onscroll={onScroll}>
			{#each week.days as day (day.date)}
				<section class="day" id="day-{day.date}" aria-labelledby="heading-{day.date}">
					<h2 class="day-title visually-hidden" id="heading-{day.date}">{formatDayLong(app.locale, day.date)}</h2>
					{#each day.meals as meal (meal.slotId)}
						<RecipeCard
							card={toCard(meal)}
							system={week.measurementSystem}
							editPanel={actionsPanel}
							onChooseRecipe={() => openEditor(meal.slotId, 'picker')}
						/>
						{#snippet actionsPanel()}
							<MealActionList
								{meal}
								onOpen={(stage) => openEditor(meal.slotId, stage)}
								onServings={(n) => app.applyRevision(setMealServings(app.db, app.ctx, meal.slotId, n), app.t('toast.servings', { count: n }))}
							/>
						{/snippet}
					{:else}
						<StateNotice title={app.t('menu.dayEmpty')} />
					{/each}
				</section>
			{/each}
		</div>
	</section>
	<MealEditor meal={editingMeal} {week} stage={editing?.stage ?? 'picker'} onStage={(stage) => editing && (editing = { ...editing, stage })} onClose={() => (editing = null)} />
{:else}
	<section class="secondary-view app-view"><StateNotice title={app.t('error.notFound')} /></section>
{/if}

<style>
	.menu-toolbar { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -4px 0 8px; }
	.month-button { min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink); font: 400 1.25rem/1.3 var(--heading-font); text-transform: capitalize; white-space: nowrap; cursor: pointer; }
	.month-button[aria-expanded='true'] { color: var(--green); }
	.toolbar-actions { display: flex; align-items: center; gap: 4px; }
	.toolbar-link { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; color: var(--ink); }
	.toolbar-link .icon { width: 26px; height: 26px; }
	/* W23: icon with label left of the calendar; the month stays put and the bar keeps its height. */
	.today-button { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 6px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: 700 0.875rem/1 var(--text-font); white-space: nowrap; cursor: pointer; }
	.today-button .icon { width: 22px; height: 22px; }
</style>
