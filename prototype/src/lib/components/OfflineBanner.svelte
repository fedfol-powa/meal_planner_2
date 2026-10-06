<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';
</script>

{#if app.settings.offline}
	<p class="offline-banner" role="status">{app.t('offline.banner')}</p>
{/if}

<style>
	.offline-banner { margin: 0; padding: 10px 16px; color: var(--ink); background: var(--rule); font-size: 0.875rem; font-weight: 700; }
</style>
