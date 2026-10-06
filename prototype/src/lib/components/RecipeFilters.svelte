<script lang="ts">
	import type { MealType, ProteinGroup } from '#lib/domain/types.ts';
	import type { RecipeQuery } from '#lib/operations/recipes.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let { query, onChange }: { query: RecipeQuery; onChange: (query: RecipeQuery) => void } = $props();
	const groups: ProteinGroup[] = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'];
	const set = (patch: Partial<RecipeQuery>) => onChange({ ...query, ...patch });
	const num = (value: string) => (value ? Number(value) : undefined);
</script>

<form class="filters" role="search" onsubmit={(e) => e.preventDefault()}>
	<label class="search">
		<span class="visually-hidden">{app.t('recipes.search')}</span>
		<input type="search" placeholder={app.t('recipes.search')} value={query.text ?? ''} oninput={(e) => set({ text: e.currentTarget.value || undefined })} />
	</label>
	<fieldset>
		<legend class="visually-hidden">{app.t('recipes.filters')}</legend>
		<label>{app.t('recipes.filter.meal')}
			<select value={query.mealType ?? ''} onchange={(e) => set({ mealType: (e.currentTarget.value || undefined) as MealType | undefined })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				<option value="lunch">{app.t('meal.lunch')}</option>
				<option value="dinner">{app.t('meal.dinner')}</option>
			</select>
		</label>
		<label>{app.t('recipes.filter.time')}
			<select value={String(query.maxMinutes ?? '')} onchange={(e) => set({ maxMinutes: num(e.currentTarget.value) })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				{#each [15, 30, 45] as minutes (minutes)}<option value={String(minutes)}>{app.t('recipes.filter.minutes', { count: minutes })}</option>{/each}
			</select>
		</label>
		<label>{app.t('recipes.filter.group')}
			<select value={query.proteinGroup ?? ''} onchange={(e) => set({ proteinGroup: (e.currentTarget.value || undefined) as ProteinGroup | undefined })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				{#each groups as group (group)}<option value={group}>{app.t(`group.${group}` as const)}</option>{/each}
			</select>
		</label>
		<label>{app.t('recipes.filter.stars')}
			<select value={String(query.minStars ?? '')} onchange={(e) => set({ minStars: num(e.currentTarget.value) })}>
				<option value="">{app.t('recipes.filter.any')}</option>
				{#each [3, 4] as stars (stars)}<option value={String(stars)}>{app.t('recipes.filter.starsAtLeast', { count: stars })}</option>{/each}
			</select>
		</label>
	</fieldset>
</form>

<style>
	.filters { display: grid; gap: 12px; margin-bottom: 16px; }
	input[type='search'] { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); }
	fieldset { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
	label { display: grid; gap: 4px; font-size: 0.75rem; font-weight: 700; color: var(--muted); }
	select { min-height: 44px; padding: 8px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font-size: 0.875rem; }
	@media (max-width: 767px) { fieldset { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
