<script lang="ts">
	import type { RecipeListItem } from '#lib/operations/recipes.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import RatingStars from './RatingStars.svelte';

	let { item }: { item: RecipeListItem } = $props();
	const recipe = $derived(item.recipe);
</script>

<article class="recipe-row" class:has-photo={!!recipe.photo}>
	{#if recipe.photo}<img class="recipe-thumbnail" src={recipe.photo} alt="" loading="lazy" decoding="async" />{/if}
	<div class="recipe-content">
		<h2><a class="title-link" href="/recipes/{recipe.id}">{recipe.name}</a></h2>
		<p>{recipe.description}</p>
		<p class="meta">
			{#if recipe.durationMinutes}{app.t('meal.minutes', { count: recipe.durationMinutes })}{/if}
			{#if recipe.proteinGroup} · {app.t(`group.${recipe.proteinGroup}` as const)}{/if}
		</p>
		<RatingStars summary={item.rating} recipeId={recipe.id} recipeName={recipe.name} variant={app.settings.ratingVariant} />
	</div>
</article>

<style>
	.title-link { color: inherit; text-decoration: none; }
	.title-link:hover { color: var(--green); }
	.meta { font-weight: 700; color: var(--ink) !important; }
</style>
