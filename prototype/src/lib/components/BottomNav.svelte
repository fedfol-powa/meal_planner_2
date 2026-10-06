<script lang="ts">
	import { page } from '$app/state';
	import { app } from '#lib/store/app.svelte.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';

	// The shopping view opens from the menu, so the menu stays active there.
	const items: { href: string; icon: string; label: MessageKey; also?: string }[] = [
		{ href: '/menu', icon: 'calendar', label: 'nav.menu', also: '/shopping' },
		{ href: '/recipes', icon: 'book', label: 'nav.recipes' },
		{ href: '/you', icon: 'user', label: 'nav.you' }
	];
	const under = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	const current = (item: (typeof items)[number]) => under(item.href) || (!!item.also && under(item.also));
</script>

<nav class="bottom-navigation" aria-label={app.t('nav.main')}>
	{#each items as item (item.href)}
		<a class="navigation-item" href={item.href} aria-current={current(item) ? 'page' : undefined}>
			<span class="navigation-icon"><svg class="icon" aria-hidden="true"><use href="#icon-{item.icon}" /></svg></span>
			<span class="visually-hidden">{app.t(item.label)}</span>
		</a>
	{/each}
</nav>
