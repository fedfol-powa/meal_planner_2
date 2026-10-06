<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';

	const families = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
	const exclusions = $derived(app.family ? app.db.exclusions.filter((e) => e.familyId === app.family!.id).length : 0);
	const roleOf = (familyId: string) => families.find((f) => f.id === familyId)?.members.find((m) => m.userId === app.user.id)?.role ?? 'member';
	// Later routes of the prototype (percorsi 6-8).
	const upcoming = $derived(
		[
			['you.dest.curation', app.user.globalRoles.includes('recipe_curator')],
			['you.dest.admin', app.user.globalRoles.includes('app_admin')],
			['you.dest.mcp', true]
		].filter(([, visible]) => visible).map(([key]) => key as MessageKey)
	);
</script>

<section class="secondary-view app-view you" aria-labelledby="you-title">
	<div class="page-column">
		<h1 class="you-name" id="you-title">{app.user.displayName}</h1>
		<p class="meta-line">{app.user.email}</p>

		{#if app.family}
			<section class="settings-card" aria-labelledby="family-title">
				<h2 id="family-title">{app.family.name}</h2>
				<ul class="row-list">
					<li><a class="row-link" href="/you/family"><svg class="icon" aria-hidden="true"><use href="#icon-users" /></svg><span class="row-main">{app.t('you.members')}<small>{app.t('you.membersCount', { count: app.family.members.length })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/you/family/settings"><svg class="icon" aria-hidden="true"><use href="#icon-gear" /></svg><span class="row-main">{app.t('you.settings')}</span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/you/family/exclusions"><svg class="icon" aria-hidden="true"><use href="#icon-ban" /></svg><span class="row-main">{app.t('you.exclusions')}<small>{app.t('you.exclusionsCount', { count: exclusions })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
				</ul>
			</section>
		{/if}

		<!-- Variant "you" (round 4): the families listed here switch the current one; variant "menu" switches from the menu. -->
		<section class="settings-card" aria-labelledby="families-title">
			<h2 id="families-title">{app.t('you.families')}</h2>
			<ul class="row-list">
				{#if app.variants.familySwitch === 'you'}
					{#each families as family (family.id)}
						<li>
							<button type="button" class="row-link" aria-pressed={family.id === app.family?.id} onclick={() => app.switchFamily(family.id)}>
								<span class="row-main">{family.name}<small>{app.t(`you.role.${roleOf(family.id)}` as const)}</small></span>
								{#if family.id === app.family?.id}<svg class="icon current" aria-label={app.t('you.current')}><use href="#icon-check" /></svg>{/if}
							</button>
						</li>
					{/each}
				{/if}
				<li><a class="row-link" href="/welcome/family"><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg><span class="row-main">{families.length ? app.t('you.createAnother') : app.t('welcome.noFamily.create')}</span></a></li>
			</ul>
		</section>

		<section class="settings-card" aria-labelledby="account-title">
			<h2 id="account-title">{app.t('you.account')}</h2>
			<ul class="row-list">
				<li><a class="row-link" href="/you/preferences"><svg class="icon" aria-hidden="true"><use href="#icon-user" /></svg><span class="row-main">{app.t('you.preferences')}<small>{app.t('you.preferencesHint')}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
			</ul>
		</section>

		<section class="settings-card" aria-labelledby="next-title">
			<h2 id="next-title">{app.t('you.next')}</h2>
			<ul class="row-list">
				{#each upcoming as key (key)}<li><span class="row-main">{app.t(key)}<small>{app.t('common.comingSoon')}</small></span></li>{/each}
			</ul>
		</section>
	</div>
</section>

<style>
	.you { padding-top: max(20px, env(safe-area-inset-top)); }
	.you-name { margin: 0; font: 400 1.75rem/1.25 var(--heading-font); overflow-wrap: anywhere; }
	.you .meta-line { margin-bottom: 20px; }
	.current { color: var(--green); }
	.row-link[aria-pressed='true'] .row-main { font-weight: 700; }
</style>
