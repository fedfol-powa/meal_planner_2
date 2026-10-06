<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';

	const families = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
	const exclusions = $derived(app.family ? app.db.exclusions.filter((e) => e.familyId === app.family!.id).length : 0);
	const roleOf = (familyId: string) => families.find((f) => f.id === familyId)?.members.find((m) => m.userId === app.user.id)?.role ?? 'member';
	// Later routes of the prototype (percorsi 6-8).
	const upcoming = $derived(
		[
			['profile.dest.curation', app.user.globalRoles.includes('recipe_curator')],
			['profile.dest.admin', app.user.globalRoles.includes('app_admin')],
			['profile.dest.mcp', true]
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
					<li><a class="row-link" href="/profile/family"><svg class="icon" aria-hidden="true"><use href="#icon-users" /></svg><span class="row-main">{app.t('profile.members')}<small>{app.t('profile.membersCount', { count: app.family.members.length })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/profile/family/settings"><svg class="icon" aria-hidden="true"><use href="#icon-gear" /></svg><span class="row-main">{app.t('profile.settings')}</span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/profile/family/exclusions"><svg class="icon" aria-hidden="true"><use href="#icon-ban" /></svg><span class="row-main">{app.t('profile.exclusions')}<small>{app.t('profile.exclusionsCount', { count: exclusions })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
				</ul>
			</section>
		{/if}

		<!-- The families listed here switch the current one (chosen in the round 4 review). -->
		<section class="settings-card" aria-labelledby="families-title">
			<h2 id="families-title">{app.t('profile.families')}</h2>
			<ul class="row-list">
					{#each families as family (family.id)}
						<li>
							<button type="button" class="row-link" aria-pressed={family.id === app.family?.id} onclick={() => app.switchFamily(family.id)}>
								<span class="row-main">{family.name}<small>{app.t(`profile.role.${roleOf(family.id)}` as const)}</small></span>
								{#if family.id === app.family?.id}<svg class="icon current" aria-label={app.t('profile.current')}><use href="#icon-check" /></svg>{/if}
							</button>
						</li>
					{/each}
				<li><a class="row-link" href="/welcome/family"><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg><span class="row-main">{families.length ? app.t('profile.createAnother') : app.t('welcome.noFamily.create')}</span></a></li>
			</ul>
		</section>

		<section class="settings-card" aria-labelledby="account-title">
			<h2 id="account-title">{app.t('profile.account')}</h2>
			<ul class="row-list">
				<li><a class="row-link" href="/profile/preferences"><svg class="icon" aria-hidden="true"><use href="#icon-user" /></svg><span class="row-main">{app.t('profile.preferences')}<small>{app.t('profile.preferencesHint')}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
			</ul>
		</section>

		<section class="settings-card" aria-labelledby="next-title">
			<h2 id="next-title">{app.t('profile.next')}</h2>
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
