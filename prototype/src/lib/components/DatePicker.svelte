<script lang="ts">
	import { addDays, mondayOf } from '#lib/domain/calendar.ts';
	import type { IsoDate } from '#lib/domain/types.ts';
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let { dates, selected, onSelect }: { dates: IsoDate[]; selected: IsoDate; onSelect: (date: IsoDate) => void } = $props();

	let open = $state(false);
	let month = $state('');
	let panel: HTMLDivElement | undefined = $state();
	let toggle: HTMLButtonElement | undefined = $state();

	const available = $derived(new Set(dates));
	const firstMonth = $derived(dates[0]?.slice(0, 7) ?? '');
	const lastMonth = $derived(dates.at(-1)?.slice(0, 7) ?? '');
	const monthLabel = $derived(
		new Intl.DateTimeFormat(app.locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
	);
	// Monday-first weekday initials for the grid header.
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, i) =>
			new Intl.DateTimeFormat(app.locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(`${addDays('2026-10-05', i)}T00:00:00Z`))
		)
	);
	// Six weeks starting from the Monday on or before the 1st of the month.
	const cells = $derived.by(() => {
		if (!month) return [];
		const start = mondayOf(`${month}-01`);
		return Array.from({ length: 42 }, (_, i) => addDays(start, i));
	});

	function shiftMonth(delta: number) {
		const d = new Date(`${month}-01T00:00:00Z`);
		d.setUTCMonth(d.getUTCMonth() + delta);
		month = d.toISOString().slice(0, 7);
	}

	function show() {
		month = selected.slice(0, 7);
		open = true;
		queueMicrotask(() => panel?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus());
	}

	function close() {
		open = false;
		toggle?.focus();
	}

	function choose(date: IsoDate) {
		onSelect(date);
		close();
	}

	function onWindowClick(event: MouseEvent) {
		if (open && panel && !panel.contains(event.target as Node) && !toggle?.contains(event.target as Node)) open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => open && e.key === 'Escape' && close()} />

<div class="date-picker">
	<button bind:this={toggle} type="button" class="toggle" aria-expanded={open} aria-label={app.t('menu.pickDate')} onclick={() => (open ? close() : show())}>
		<svg class="icon" aria-hidden="true"><use href="#icon-calendar" /></svg>
	</button>
	{#if open}
		<div class="panel" bind:this={panel} role="dialog" aria-label={app.t('menu.pickDate')}>
			<div class="month">
				<button type="button" class="nav" aria-label={app.t('menu.previousMonth')} disabled={month <= firstMonth} onclick={() => shiftMonth(-1)}>
					<svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>
				</button>
				<strong>{monthLabel}</strong>
				<button type="button" class="nav" aria-label={app.t('menu.nextMonth')} disabled={month >= lastMonth} onclick={() => shiftMonth(1)}>
					<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
				</button>
			</div>
			<div class="grid">
				{#each weekdays as weekday, i (i)}<span class="weekday" aria-hidden="true">{weekday}</span>{/each}
				{#each cells as date (date)}
					{#if date.slice(0, 7) === month}
						<button type="button" class="day" aria-pressed={date === selected} aria-label={formatDayLong(app.locale, date)} disabled={!available.has(date)} onclick={() => choose(date)}>
							{Number(date.slice(8, 10))}
						</button>
					{:else}
						<span></span>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.date-picker { position: relative; flex: none; }
	.toggle { display: grid; place-items: center; width: 44px; height: 100%; min-height: 58px; padding: 0; border: 0; border-radius: 8px; background: transparent; color: var(--ink); cursor: pointer; }
	.toggle .icon { width: 26px; height: 26px; }
	.toggle[aria-expanded='true'] { color: var(--green); }
	.panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 15; width: min(320px, calc(100vw - 32px)); padding: 16px; background: var(--paper); box-shadow: 0 4px 16px rgb(0 0 0 / 15%); border-radius: 8px; }
	.month { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
	.month strong { text-transform: capitalize; }
	.nav { display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); cursor: pointer; }
	.nav:disabled { opacity: 0.3; cursor: not-allowed; }
	.grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
	.weekday { padding: 4px 0; color: var(--muted); font-size: 0.75rem; text-align: center; text-transform: uppercase; }
	.day { min-height: 40px; border: 0; border-radius: 8px; background: none; color: var(--ink); font: 700 0.875rem/1 var(--text-font); cursor: pointer; }
	.day:hover:not(:disabled) { background: #f0ede5; }
	.day[aria-pressed='true'] { color: #fff; background: var(--ink); }
	.day:disabled { color: var(--rule); font-weight: 400; cursor: not-allowed; }
</style>
