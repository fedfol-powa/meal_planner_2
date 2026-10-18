<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { SimulatedLoad } from '#lib/store/loading.svelte.ts';
	import { app } from '#lib/store/app.svelte.ts';

	/**
	 * Round 7: content that loads, with a skeleton of the same size meanwhile.
	 * One announcement for the whole region; the skeleton itself is hidden from screen readers.
	 */
	let { load, label, skeleton, children }: {
		load: SimulatedLoad;
		/** Announced once while loading, e.g. "Caricamento dei suggerimenti". */
		label: string;
		skeleton: Snippet;
		children: Snippet;
	} = $props();
</script>

<span class="visually-hidden" role="status">{load.visible ? label : ''}</span>
<div class="loading-region" aria-busy={load.pending ? 'true' : undefined}>
	{#if load.pending}
		{#if app.settings.skeleton !== 'none'}
			<div class="sk sk-{app.settings.skeleton}" class:sk-waiting={!load.visible} aria-hidden="true">{@render skeleton()}</div>
		{/if}
	{:else}
		{@render children()}
	{/if}
</div>
