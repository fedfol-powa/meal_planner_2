<script lang="ts">
	import { page } from '$app/state';
	import { app } from '#lib/store/app.svelte.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import { getOpeningTarget } from '#lib/operations/meals.ts';
	import { newWeekNotice } from '#lib/store/new-week-notice.svelte.ts';

	// W24, navbar variant: a dot on Menu while the new week is not seen; a tap on Menu then opens its Monday.
	const pending = $derived(newWeekNotice.variant === 'navbar' ? newWeekNotice.pendingWeek(app.db, app.ctx) : null);

	// The shopping view opens from the menu, so the menu stays active there.
	const items: { href: string; icon: string; label: MessageKey; also?: string }[] = [
		{ href: '/menu', icon: 'calendar', label: 'nav.menu', also: '/shopping' },
		{ href: '/recipes', icon: 'book', label: 'nav.recipes' },
		{ href: '/profile', icon: 'user', label: 'nav.profile', also: '/admin' }
	];
	const under = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	const current = (item: (typeof items)[number]) => under(item.href) || (!!item.also && under(item.also));

	// Coming back from another view keeps the chosen day; a tap while already on the menu goes to today
	// (or the first day with meals, as when opening the app).
	function onMenuTap(event: MouseEvent) {
		if (pending) {
			app.selectedDate = pending;
			if (page.url.pathname === '/menu') event.preventDefault();
			return;
		}
		if (page.url.pathname !== '/menu') return;
		const opening = getOpeningTarget(app.db, app.ctx);
		if (!opening.ok || opening.value.kind !== 'day') return;
		event.preventDefault();
		app.selectedDate = opening.value.date;
	}
</script>

<nav class="bottom-navigation" aria-label={app.t('nav.main')}>
	{#each items as item (item.href)}
		<a class="navigation-item" href={item.href} aria-current={current(item) ? 'page' : undefined} onclick={item.href === '/menu' ? onMenuTap : undefined}>
			<span class="navigation-icon"><svg class="icon" aria-hidden="true"><use href="#icon-{item.icon}" /></svg>{#if item.href === '/menu' && pending}<span class="new-dot" aria-hidden="true"></span>{/if}</span>
			<span class="visually-hidden">{app.t(item.label)}{#if item.href === '/menu' && pending}, {app.t('menu.newWeekReady')}{/if}</span>
		</a>
	{/each}
</nav>

<style>
	.navigation-icon { position: relative; }
	.new-dot { position: absolute; top: 4px; right: 12px; width: 10px; height: 10px; border: 2px solid var(--paper); border-radius: 50%; background: var(--green); }
</style>
