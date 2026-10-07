<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';

	const families = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
	const exclusions = $derived(app.family ? app.db.exclusions.filter((e) => e.familyId === app.family!.id).length : 0);
	const roleOf = (familyId: string) => families.find((f) => f.id === familyId)?.members.find((m) => m.userId === app.user.id)?.role ?? 'member';
	const curator = $derived(app.user.globalRoles.includes('recipe_curator'));
	const drafts = $derived(curator ? app.db.recipeDrafts.length : 0);
	const agents = $derived(app.db.connectedAgents.filter((a) => a.userId === app.user.id).length);
	// Round 6: app administration, only for app_admin.
	const admin = $derived(app.user.globalRoles.includes('app_admin'));
	const pendingInvitations = $derived(app.db.appInvitations.filter((i) => i.status === 'pending' && i.expiresAt > app.settings.now).length);
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
				<li><a class="row-link" href="/profile/agents"><svg class="icon" aria-hidden="true"><use href="#icon-link" /></svg><span class="row-main">{app.t('profile.agents')}<small>{agents === 1 ? app.t('profile.agentsCountOne') : agents ? app.t('profile.agentsCount', { count: agents }) : app.t('profile.agentsHint')}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
			</ul>
		</section>

		{#if curator}
			<!-- Round 5: curation lives in the catalogue; this row opens it on the drafts. -->
			<section class="settings-card" aria-labelledby="curation-title">
				<h2 id="curation-title">{app.t('profile.dest.curation')}</h2>
				<ul class="row-list">
					<li><a class="row-link" href="/recipes#drafts"><svg class="icon" aria-hidden="true"><use href="#icon-recipe" /></svg><span class="row-main">{app.t('profile.curation.drafts')}<small>{app.t('profile.curation.draftsCount', { count: drafts })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/recipes/new"><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg><span class="row-main">{app.t('curation.new')}</span></a></li>
				</ul>
			</section>
		{/if}

		{#if admin}
			<section class="settings-card" aria-labelledby="admin-title">
				<h2 id="admin-title">{app.t('profile.dest.admin')}</h2>
				<ul class="row-list">
					<li><a class="row-link" href="/admin#users"><svg class="icon" aria-hidden="true"><use href="#icon-users" /></svg><span class="row-main">{app.t('profile.admin.users')}<small>{app.t('profile.admin.usersCount', { count: app.db.users.length })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/admin#invitations"><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg><span class="row-main">{app.t('profile.admin.invitations')}<small>{app.t('profile.admin.invitationsCount', { count: pendingInvitations })}</small></span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
					<li><a class="row-link" href="/admin#backups"><svg class="icon" aria-hidden="true"><use href="#icon-book" /></svg><span class="row-main">{app.t('profile.admin.backups')}</span><svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></a></li>
				</ul>
			</section>
		{/if}
	</div>
</section>

<style>
	.you { padding-top: max(20px, env(safe-area-inset-top)); }
	.you-name { margin: 0; font: 400 1.75rem/1.25 var(--heading-font); overflow-wrap: anywhere; }
	.you .meta-line { margin-bottom: 20px; }
	.current { color: var(--green); }
	.row-link[aria-pressed='true'] .row-main { font-weight: 700; }
</style>
