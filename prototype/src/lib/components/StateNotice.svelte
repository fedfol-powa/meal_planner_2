<script lang="ts">
	import type { Snippet } from 'svelte';
	let { title, body, children }: { title: string; body?: string; children?: Snippet } = $props();
</script>

<section class="state-notice" role="status">
	<h2>{title}</h2>
	{#if body}<p>{body}</p>{/if}
	{@render children?.()}
</section>

<style>
	.state-notice { margin: 16px 0; padding: 20px; background: var(--paper); box-shadow: var(--card-shadow); }
	h2 { margin: 0 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	p { margin: 0 0 16px; color: var(--body-text); }
</style>
