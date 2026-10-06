<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import Stepper from './Stepper.svelte';
	import { MAX_SERVINGS, TIME_LIMITS } from '#lib/domain/settings.ts';
	import type { FamilySettings, MealType, SlotSetting } from '#lib/domain/types.ts';
	import { formatWeekday } from '#lib/i18n/dates.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// "Chi mangia quando" (round 4): the week pattern of servings, fixed free meals and time limits.
	let { settings, editable, onChange }: { settings: FamilySettings; editable: boolean; onChange: (meal: MealType, weekday: number, slot: SlotSetting) => void } = $props();
	const MEALS: MealType[] = ['lunch', 'dinner'];
	let editing = $state<{ meal: MealType; weekday: number } | null>(null);
	const current = $derived(editing ? settings.slots[editing.meal][editing.weekday] : null);
	const kind = $derived(current ? (current.servings === 0 ? 'none' : current.fixedText !== null ? 'fixed' : 'recipe') : 'recipe');
	let fixedDraft = $state('');

	function open(meal: MealType, weekday: number) {
		editing = { meal, weekday };
		fixedDraft = settings.slots[meal][weekday].fixedText ?? '';
	}

	function save(change: Partial<SlotSetting>) {
		if (!editing || !current) return;
		onChange(editing.meal, editing.weekday, { ...current, ...change });
	}

	function setKind(next: 'recipe' | 'fixed' | 'none') {
		if (!current) return;
		const servings = current.servings || 2;
		if (next === 'none') save({ servings: 0, fixedText: null, maxMinutes: null });
		if (next === 'recipe') save({ servings, fixedText: null });
		if (next === 'fixed') {
			fixedDraft ||= app.t('settings.slot.fixedDefault');
			save({ servings, fixedText: fixedDraft, maxMinutes: null });
		}
	}

	const sheetTitle = $derived(editing ? `${formatWeekday(app.locale, editing.weekday)} · ${app.t(`meal.${editing.meal}` as const)}` : '');
</script>

<table class="diners">
	<thead>
		<tr><td></td>{#each MEALS as meal (meal)}<th scope="col">{app.t(`meal.${meal}` as const)}</th>{/each}</tr>
	</thead>
	<tbody>
		{#each Array.from({ length: 7 }, (_, i) => i) as weekday (weekday)}
			<tr>
				<th scope="row">{formatWeekday(app.locale, weekday, 'short')}</th>
				{#each MEALS as meal (meal)}
					{@const slot = settings.slots[meal][weekday]}
					<td>
						<button type="button" class="cell" class:fixed={slot.fixedText !== null} class:off={slot.servings === 0} disabled={!editable} onclick={() => open(meal, weekday)}
							aria-label={`${formatWeekday(app.locale, weekday)} ${app.t(`meal.${meal}` as const)}: ${slot.servings === 0 ? app.t('settings.slot.none') : slot.fixedText ?? app.t('meal.servings', { count: slot.servings })}${slot.maxMinutes ? `, ${app.t('settings.slot.maxShort', { count: slot.maxMinutes })}` : ''}`}>
							{#if slot.servings === 0}<span>—</span>
							{:else if slot.fixedText !== null}<span class="fixed-text">{slot.fixedText}</span>
							{:else}<span class="servings"><svg class="icon" aria-hidden="true"><use href="#icon-user" /></svg>{slot.servings}</span>{/if}
							{#if slot.maxMinutes}<span class="limit"><svg class="icon" aria-hidden="true"><use href="#icon-clock" /></svg>{slot.maxMinutes}′</span>{/if}
						</button>
					</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>

<BottomSheet open={editing !== null} title={sheetTitle} onClose={() => (editing = null)}>
	{#if current}
		<fieldset>
			<legend class="visually-hidden">{app.t('settings.slot.kind')}</legend>
			<label class="choice"><input type="radio" name="slot-kind" checked={kind === 'recipe'} onchange={() => setKind('recipe')} />{app.t('settings.slot.recipe')}</label>
			<label class="choice"><input type="radio" name="slot-kind" checked={kind === 'fixed'} onchange={() => setKind('fixed')} />{app.t('settings.slot.fixed')}</label>
			<label class="choice"><input type="radio" name="slot-kind" checked={kind === 'none'} onchange={() => setKind('none')} />{app.t('settings.slot.none')}</label>
		</fieldset>
		{#if kind === 'fixed'}
			<label class="field">{app.t('settings.slot.fixedText')}
				<input type="text" maxlength="60" bind:value={fixedDraft} onchange={() => fixedDraft.trim() && save({ fixedText: fixedDraft.trim() })} />
			</label>
		{/if}
		{#if kind !== 'none'}
			<Stepper label={app.t('recipe.servingsLabel')} value={current.servings} min={1} max={MAX_SERVINGS} onChange={(n) => save({ servings: n })} />
		{/if}
		{#if kind === 'recipe'}
			<label class="field limit-field">{app.t('settings.slot.maxMinutes')}
				<select value={current.maxMinutes ?? ''} onchange={(e) => save({ maxMinutes: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
					<option value="">{app.t('settings.slot.noLimit')}</option>
					{#each TIME_LIMITS as minutes (minutes)}<option value={minutes}>{app.t('settings.slot.maxShort', { count: minutes })}</option>{/each}
				</select>
			</label>
		{/if}
		<button type="button" class="text-button primary wide" onclick={() => (editing = null)}>{app.t('common.done')}</button>
	{/if}
</BottomSheet>

<style>
	.diners { width: 100%; border-collapse: collapse; table-layout: fixed; }
	.diners thead th { padding: 0 0 6px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.035em; text-transform: uppercase; color: var(--muted); }
	.diners thead td { width: 3.5em; }
	.diners tbody th { padding-right: 8px; text-align: left; font-size: 0.875rem; font-weight: 700; text-transform: capitalize; }
	.diners td { padding: 3px; }
	.cell { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px 10px; width: 100%; min-height: 48px; padding: 6px 8px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font: 700 0.9375rem/1.3 var(--text-font); cursor: pointer; }
	.cell:disabled { cursor: default; color: var(--ink); opacity: 1; }
	.cell.fixed { border-color: var(--free-border); background: var(--free-surface); }
	.cell.off { color: var(--muted); background: var(--canvas); }
	.servings, .limit { display: inline-flex; align-items: center; gap: 3px; }
	.servings .icon, .limit .icon { width: 15px; height: 15px; }
	.limit { color: var(--green); font-size: 0.8125rem; }
	.fixed-text { color: var(--green); font-weight: 400; overflow-wrap: anywhere; }
	fieldset { margin: 0 0 8px; padding: 0; border: 0; }
	.limit-field { margin-top: 8px; }
	.wide { width: 100%; margin-top: 12px; }
</style>
