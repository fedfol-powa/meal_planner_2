<script lang="ts">
	import { page } from '$app/state';
	import { app } from '#lib/store/app.svelte.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';

	const items: { href: string; icon: string; label: MessageKey }[] = [
		{ href: '/menu', icon: 'calendar', label: 'nav.menu' },
		{ href: '/recipes', icon: 'book', label: 'nav.recipes' },
		{ href: '/you', icon: 'user', label: 'nav.you' }
	];
	const current = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<nav class="bottom-navigation" aria-label={app.t('nav.main')}>
	{#each items as item (item.href)}
		<a class="navigation-item" href={item.href} aria-current={current(item.href) ? 'page' : undefined}>
			<span class="navigation-icon"><svg class="icon" aria-hidden="true"><use href="#icon-{item.icon}" /></svg></span>
			<span class="visually-hidden">{app.t(item.label)}</span>
		</a>
	{/each}
</nav>
