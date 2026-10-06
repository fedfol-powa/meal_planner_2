<script lang="ts">
	import type { Snippet } from 'svelte';

	// Secondary page header (round 3 pattern): back arrow with the destination name, title, optional actions.
	let { back, backLabel, title, titleId, actions }: { back: string; backLabel: string; title: string; titleId?: string; actions?: Snippet } = $props();
</script>

<header class="page-header">
	<a class="page-back" href={back}><svg class="icon" aria-hidden="true"><use href="#icon-chevron-left" /></svg>{backLabel}</a>
	<div class="title-row">
		<h1 class="page-title" id={titleId}>{title}</h1>
		{@render actions?.()}
	</div>
</header>

<style>
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
</style>
