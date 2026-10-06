<script lang="ts">
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { app } from '#lib/store/app.svelte.ts';

	// New recipe (round 5): the draft exists from the first "Salva bozza".
	const curator = $derived(app.user.globalRoles.includes('recipe_curator'));
</script>

{#if curator}
	<RecipeForm initial={null} />
{:else}
	<section class="secondary-view app-view"><StateNotice title={app.t('curation.forbidden')} /></section>
{/if}
