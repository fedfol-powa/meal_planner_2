<script lang="ts">
	import { page } from '$app/state';
	import RecipeForm from '#lib/components/RecipeForm.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { getDraft } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// A shared draft, new or a revision (round 5); the form keeps its own copy until "Salva bozza".
	const id = $derived(page.params.id ?? '');
	const result = $derived.by(() => {
		const r = getDraft(app.db, app.ctx, id);
		return r.ok ? r.value : r.error;
	});
</script>

{#if typeof result === 'string'}
	<section class="secondary-view app-view">
		<StateNotice title={app.t(result === 'forbidden' ? 'curation.forbidden' : 'curation.draftGone')}>
			<a class="text-button" href="/recipes">{app.t('nav.recipes')}</a>
		</StateNotice>
	</section>
{:else}
	<!-- The form reads the draft once: later saves by others reach it as a notice, not as new content. -->
	{#key id}<RecipeForm initial={result} />{/key}
{/if}
