<script lang="ts">
	import { page } from '$app/state';
	import { app } from '#lib/store/app.svelte.ts';

	// The shopping list is the only place editable offline (round 3).
	const onShopping = $derived(page.url.pathname.startsWith('/shopping/'));
</script>

{#if app.settings.offline}
	<p class="offline-banner" role="status">{app.t(onShopping ? 'offline.bannerShopping' : 'offline.banner')}</p>
{/if}

<style>
	.offline-banner { margin: 0; padding: 10px 16px; color: var(--ink); background: var(--rule); font-size: 0.875rem; font-weight: 700; }
</style>
