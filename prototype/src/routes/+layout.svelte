<script lang="ts">
	import '#lib/design/tokens.css';
	import '#lib/design/fonts.css';
	import '#lib/design/global.css';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import DevPanel from '#lib/components/DevPanel.svelte';
	import IconLibrary from '#lib/components/IconLibrary.svelte';
	import OfflineBanner from '#lib/components/OfflineBanner.svelte';
	import { app } from '#lib/store/app.svelte.ts';

	let { children } = $props();

	$effect(() => {
		document.documentElement.lang = app.locale === 'it-IT' ? 'it' : 'en-GB';
	});
</script>

<IconLibrary />
<a class="skip-link" href="#app-content">{app.t('skip')}</a>
<div class="shell">
	<OfflineBanner />
	<main class="app-content" id="app-content" tabindex="-1">{@render children()}</main>
	<BottomNav />
</div>
<DevPanel />
