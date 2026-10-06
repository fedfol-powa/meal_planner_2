<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';

	const families = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
	const destinations = $derived(
		[
			['you.dest.family', true],
			['you.dest.preferences', true],
			['you.dest.curation', app.user.globalRoles.includes('recipe_curator')],
			['you.dest.admin', app.user.globalRoles.includes('app_admin')],
			['you.dest.mcp', true]
		].filter(([, visible]) => visible).map(([key]) => key as MessageKey)
	);
</script>

<section class="secondary-view app-view you">
	<h1 class="page-title">{app.user.displayName}</h1>
	<h2>{app.t('you.families')}</h2>
	<ul>
		{#each families as family (family.id)}
			{@const role = family.members.find((m) => m.userId === app.user.id)!.role}
			<li><span>{family.name}</span><span class="label-chip neutral">{app.t(`you.role.${role}` as const)}</span></li>
		{/each}
	</ul>
	<h2>{app.t('you.next')}</h2>
	<ul>
		{#each destinations as key (key)}
			<li><span>{app.t(key)}</span><span class="meta-line">{app.t('common.comingSoon')}</span></li>
		{/each}
	</ul>
</section>

<style>
	.you { padding-top: max(20px, env(safe-area-inset-top)); }
	h2 { margin: 24px 0 8px; font: 400 1.25rem/1.3 var(--heading-font); }
	ul { margin: 0; padding: 0; list-style: none; background: var(--paper); box-shadow: var(--card-shadow); }
	li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 56px; padding: 12px 16px; border-bottom: 1px solid var(--rule); }
	li:last-child { border-bottom: 0; }
</style>
