<script lang="ts">
	import { addDays } from '#lib/domain/calendar.ts';
	import type { WeekView } from '#lib/operations/views.ts';
	import { formatDayMonth, formatWeekRange } from '#lib/i18n/dates.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let { week, onNavigate }: { week: WeekView; onNavigate: (startsOn: string) => void } = $props();

	const hint = $derived.by(() => {
		if (week.status === 'draft') return app.t('week.hint.draft', { date: formatDayMonth(app.locale, addDays(week.startsOn, -1)) });
		if (week.status === 'pending_close') return app.t('week.hint.pending_close', { date: formatDayMonth(app.locale, addDays(week.startsOn, 9)) });
		return app.t(`week.hint.${week.status}` as const);
	});
</script>

<div class="week-header">
	<button type="button" class="week-nav" disabled={!week.previous} aria-label={app.t('menu.previousWeek')} onclick={() => week.previous && onNavigate(week.previous)}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg></button>
	<div class="week-title">
		<strong>{formatWeekRange(app.locale, week.startsOn)}</strong>
		<span class="label-chip" class:neutral={week.status === 'closed'}>{app.t(`week.status.${week.status}` as const)}</span>
	</div>
	<button type="button" class="week-nav" disabled={!week.next} aria-label={app.t('menu.nextWeek')} onclick={() => week.next && onNavigate(week.next)}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></button>
</div>
<p class="week-hint">{hint}</p>

<style>
	.week-header { display: flex; align-items: center; gap: 8px; margin: 0 72px 8px 0; }
	.week-title { flex: 1; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; }
	.week-nav { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); cursor: pointer; }
	.week-nav:disabled { opacity: 0.3; cursor: not-allowed; }
	.week-hint { margin: 0 0 10px; color: var(--muted); font-size: 0.8125rem; text-align: center; }
</style>
