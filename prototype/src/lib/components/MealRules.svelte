<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import { DISH_KINDS, type DishKind, type MealRule, type ProteinGroup } from '#lib/domain/types.ts';
	import { formatWeekday } from '#lib/i18n/dates.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Meal rules from templates (round 4): no free-text rules.
	let { rules, editable, onAdd, onRemove }: { rules: MealRule[]; editable: boolean; onAdd: (rule: MealRule) => void; onRemove: (id: string) => void } = $props();
	const GROUPS: ProteinGroup[] = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'];
	let adding = $state(false);
	let kind = $state<MealRule['kind']>('at_least_one');
	let dish = $state<DishKind>('pasta');
	let group = $state<ProteinGroup>('fish');
	let weekday = $state(4);

	const groupName = (g: ProteinGroup) => app.t(`group.${g}` as const);
	function describeRule(rule: MealRule): string {
		if (rule.kind === 'only_lunch') return app.t('rule.only_lunch', { dish: app.t(`dish.${rule.dish}` as const) });
		return app.t(`rule.${rule.kind}` as const, { group: groupName(rule.group), day: formatWeekday(app.locale, rule.weekday) });
	}

	function add() {
		const id = `rule-${Date.now().toString(36)}`;
		onAdd(kind === 'only_lunch' ? { id, kind, dish } : { id, kind, group, weekday });
		adding = false;
	}
</script>

{#if rules.length}
	<ul class="row-list">
		{#each rules as rule (rule.id)}
			<li>
				<span class="row-main">{describeRule(rule)}</span>
				{#if editable}<button type="button" class="remove" aria-label={app.t('settings.rules.remove', { rule: describeRule(rule) })} onclick={() => onRemove(rule.id)}>×</button>{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p class="meta-line">{app.t('settings.rules.none')}</p>
{/if}
{#if editable}
	<button type="button" class="row-link add" onclick={() => (adding = true)}><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg>{app.t('settings.rules.add')}</button>
{/if}

<BottomSheet open={adding} title={app.t('settings.rules.add')} onClose={() => (adding = false)}>
	<fieldset>
		<legend class="visually-hidden">{app.t('settings.rules.template')}</legend>
		<label class="choice"><input type="radio" name="rule-kind" value="at_least_one" bind:group={kind} />{app.t('settings.rules.template.at_least_one')}</label>
		<label class="choice"><input type="radio" name="rule-kind" value="never_on" bind:group={kind} />{app.t('settings.rules.template.never_on')}</label>
		<label class="choice"><input type="radio" name="rule-kind" value="only_lunch" bind:group={kind} />{app.t('settings.rules.template.only_lunch')}</label>
	</fieldset>
	{#if kind === 'only_lunch'}
		<label class="field">{app.t('settings.rules.dish')}
			<select bind:value={dish}>{#each DISH_KINDS as d (d)}<option value={d}>{app.t(`dish.${d}` as const)}</option>{/each}</select>
		</label>
	{:else}
		<div class="pair">
			<label class="field">{app.t('settings.rules.group')}
				<select bind:value={group}>{#each GROUPS as g (g)}<option value={g}>{groupName(g)}</option>{/each}</select>
			</label>
			<label class="field">{app.t('settings.rules.day')}
				<select bind:value={weekday}>{#each Array.from({ length: 7 }, (_, i) => i) as d (d)}<option value={d}>{formatWeekday(app.locale, d)}</option>{/each}</select>
			</label>
		</div>
	{/if}
	<p class="preview">{describeRule(kind === 'only_lunch' ? { id: '', kind, dish } : { id: '', kind, group, weekday })}</p>
	<button type="button" class="text-button primary wide" onclick={add}>{app.t('settings.rules.addButton')}</button>
</BottomSheet>

<style>
	.remove { flex: none; width: 44px; height: 44px; border: 0; background: none; color: var(--ink); font: 400 1.5rem/1 var(--text-font); cursor: pointer; }
	.add { min-height: 48px; color: var(--green); font-weight: 700; }
	fieldset { margin: 0 0 8px; padding: 0; border: 0; }
	.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
	.preview { margin: 0 0 12px; padding: 10px 12px; border-radius: 4px; background: var(--soft-green); color: var(--green); font-weight: 700; }
	.wide { width: 100%; }
</style>
