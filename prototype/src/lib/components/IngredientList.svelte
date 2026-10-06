<script lang="ts">
	import type { MeasurementSystem } from '#lib/domain/types.ts';
	import type { ScaledIngredient } from '#lib/operations/views.ts';
	import { formatQuantity } from '#lib/units/format.ts';
	import { app } from '#lib/store/app.svelte.ts';

	let { ingredients, system, label, collapsible = true }: { ingredients: ScaledIngredient[]; system: MeasurementSystem; label: string; collapsible?: boolean } = $props();
</script>

{#snippet rows()}
	<ul class="ingredient-list">
		{#each ingredients as item (item.ingredientId)}
			<li><span>{item.name}</span><span class="ingredient-quantity">{formatQuantity(item.quantity, item.sourceText, system, app.locale)}</span></li>
		{/each}
	</ul>
{/snippet}

{#if collapsible}
	<details class="ingredients">
		<summary aria-label="{app.t('meal.ingredients')}: {label}">{app.t('meal.ingredients')}<span class="ingredient-count">({ingredients.length})</span></summary>
		{@render rows()}
	</details>
{:else}
	{@render rows()}
{/if}
