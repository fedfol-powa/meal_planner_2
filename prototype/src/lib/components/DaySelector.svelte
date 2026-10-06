<script lang="ts">
	import type { IsoDate } from '#lib/domain/types.ts';
	import { formatDayLong, formatDayNumber, formatDayShort } from '#lib/i18n/dates.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let { dates, selected, onSelect }: { dates: IsoDate[]; selected: IsoDate; onSelect: (date: IsoDate) => void } = $props();
</script>

<div class="day-links">
	{#each dates as date (date)}
		<a class="day-link" href="#day-{date}" aria-current={date === selected ? 'location' : undefined} aria-label={formatDayLong(app.locale, date)} onclick={(e) => { e.preventDefault(); onSelect(date); }}>
			<span>{formatDayShort(app.locale, date)}</span><strong>{formatDayNumber(app.locale, date)}</strong>
		</a>
	{/each}
</div>
