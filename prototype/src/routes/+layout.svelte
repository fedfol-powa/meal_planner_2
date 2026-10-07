<script lang="ts">
	import '#lib/design/tokens.css';
	import '#lib/design/fonts.css';
	import '#lib/design/global.css';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BottomNav from '#lib/components/BottomNav.svelte';
	import DevPanel from '#lib/components/DevPanel.svelte';
	import IconLibrary from '#lib/components/IconLibrary.svelte';
	import OfflineBanner from '#lib/components/OfflineBanner.svelte';
	import UndoToast from '#lib/components/UndoToast.svelte';
	import { app } from '#lib/store/app.svelte.ts';

	let { children } = $props();

	// Entry pages (round 4): sign-in, the new family wizard and invitation links, without the navbar.
	const path = $derived(page.url.pathname);
	const isEntry = $derived(path.startsWith('/welcome') || path.startsWith('/invite/'));
	// Round 6: the agent consent page needs a signed-in user but, like entry pages, has no navbar.
	const hideNav = $derived(isEntry || path === '/authorize');
	// Views that need a family; the "Tu" pages also work without one (preferences, account deletion).
	const needsFamily = $derived(['/menu', '/recipes', '/shopping'].some((p) => path === p || path.startsWith(`${p}/`)));
	const redirect = $derived(
		!app.signedIn && !isEntry ? (app.signedOutOnPurpose ? '/welcome' : `/welcome?next=${encodeURIComponent(path + page.url.search)}`) : app.signedIn && !app.family && needsFamily ? '/welcome' : null
	);

	$effect(() => {
		if (redirect) goto(redirect, { replaceState: true });
	});

	$effect(() => {
		document.documentElement.lang = app.locale === 'it-IT' ? 'it' : 'en-GB';
	});
</script>

<IconLibrary />
<a class="skip-link" href="#app-content">{app.t('skip')}</a>
<div class="shell">
	<OfflineBanner />
	<main class="app-content" id="app-content" tabindex="-1">{#if !redirect}{@render children()}{/if}</main>
	{#if app.signedIn && !hideNav}<BottomNav />{/if}
</div>
<UndoToast />
<DevPanel />
