<script lang="ts">
	import type { MealType, ProteinGroup } from '#lib/domain/types.ts';
	import type { RecipeQuery, RecipeSort } from '#lib/operations/recipes.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let { query, onChange }: { query: RecipeQuery; onChange: (query: RecipeQuery) => void } = $props();
	const groups: ProteinGroup[] = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'];
	const set = (patch: Partial<RecipeQuery>) => onChange({ ...query, ...patch });
	const num = (value: string) => (value ? Number(value) : undefined);
	const sorts: RecipeSort[] = ['name', 'rating', 'added', 'lastEaten'];
	let open = $state(false);
	// Highlight the toggle when something other than the defaults is applied.
	const active = $derived(!!(query.mealType || query.maxMinutes || query.proteinGroup || query.minStars || query.reversed || (query.sort && query.sort !== 'name')));
</script>

<form class="filters" role="search" onsubmit={(e) => e.preventDefault()}>
	<div class="search-row">
		<label class="search">
			<span class="visually-hidden">{app.t('recipes.search')}</span>
			<input type="search" placeholder={app.t('recipes.search')} value={query.text ?? ''} oninput={(e) => set({ text: e.currentTarget.value || undefined })} />
		</label>
		<button type="button" class="filter-toggle" class:active aria-expanded={open} aria-controls="recipe-filters" aria-label={app.t('recipes.toggleFilters')} onclick={() => (open = !open)}>
			<svg class="icon" aria-hidden="true"><use href="#icon-filter" /></svg>
		</button>
	</div>
	<fieldset id="recipe-filters" hidden={!open}>
		<div class="sort">
			<label>{app.t('recipes.sort')}
				<select value={query.sort ?? 'name'} onchange={(e) => set({ sort: e.currentTarget.value === 'name' ? undefined : (e.currentTarget.value as RecipeSort) })}>
					{#each sorts as sort (sort)}<option value={sort}>{app.t(`recipes.sort.${sort}` as const)}</option>{/each}
				</select>
			</label>
			<button type="button" class="reverse" aria-pressed={!!query.reversed} aria-label={app.t('recipes.reverse')} onclick={() => set({ reversed: query.reversed ? undefined : true })}>
				<svg class="icon" aria-hidden="true"><use href="#icon-sort" /></svg>
			</button>
		</div>
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
	.search-row { display: flex; align-items: center; gap: 4px; }
	.search { flex: 1; min-width: 0; }
	.filter-toggle { display: grid; place-items: center; width: 48px; height: 48px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--ink); cursor: pointer; }
	.filter-toggle .icon { width: 26px; height: 26px; }
	.filter-toggle[aria-expanded='true'], .filter-toggle.active { color: var(--green); }
	.filter-toggle.active { background: var(--soft-green); }
	input[type='search'] { width: 100%; min-height: 48px; padding: 10px 14px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); }
	fieldset { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; border: 0; }
	label { display: grid; gap: 4px; font-size: 0.75rem; font-weight: 700; color: var(--muted); }
	select { min-height: 44px; padding: 8px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font-size: 0.875rem; }
	fieldset[hidden] { display: none; }
	.sort { display: flex; align-items: end; gap: 4px; }
	.sort label { flex: 1; min-width: 0; }
	.reverse { display: grid; place-items: center; flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--ink); cursor: pointer; }
	.reverse .icon { width: 24px; height: 24px; }
	.reverse[aria-pressed='true'] { color: var(--green); background: var(--soft-green); }
	@media (max-width: 767px) { fieldset { grid-template-columns: repeat(2, minmax(0, 1fr)); } fieldset > .sort { grid-column: 1 / -1; } }
</style>
