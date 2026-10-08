<script lang="ts">
	import InviteSheet from '#lib/components/InviteSheet.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ShareLinkSheet from '#lib/components/ShareLinkSheet.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatDateTime, formatDayMonth } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { listUsers } from '#lib/operations/admin.ts';
	import { listAppInvitations, revokeAppInvitation } from '#lib/operations/app-invitations.ts';
	import { goto } from '$app/navigation';
	import { addDays } from '#lib/domain/calendar.ts';
	import { listCatalogueRestores } from '#lib/operations/catalogue-restore.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// App administration (round 6): users and roles, app invitations, recipe book restore, on one page.
	// The restore takes the recipe book back to a chosen moment, rebuilt from the history (8 October 2026).
	let text = $state('');
	const users = $derived(listUsers(app.db, app.ctx, text));
	const invitations = $derived(listAppInvitations(app.db, app.ctx));
	const restores = $derived(listCatalogueRestores(app.db, app.ctx));
	let restoreDay = $state(addDays(app.settings.now.slice(0, 10), -1));
	let restoreTime = $state('23:59');
	const restoreAt = $derived(`${restoreDay}T${restoreTime}`);
	const restoreInPast = $derived(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(restoreAt) && restoreAt < app.settings.now);
	let inviting = $state(false);
	let shared = $state<{ url: string; email: string } | null>(null);

	const linkOf = (token: string) => `${location.origin}/invite/app/${token}`;
	const day = (at: string) => formatDayMonth(app.locale, at.slice(0, 10));

	function revoke(token: string) {
		const result = revokeAppInvitation(app.db, app.ctx, token);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.notify(app.t('admin.revoked'));
	}
</script>

<section class="secondary-view app-view" aria-labelledby="admin-title">
	<div class="page-column">
		<PageHeader back="/profile" backLabel={app.t('nav.profile')} title={app.t('admin.title')} titleId="admin-title" />
		{#if !users.ok}
			<StateNotice title={app.t('admin.forbidden')} />
		{:else}
			<section class="settings-card" id="users" aria-labelledby="users-title">
				<h2 id="users-title">{app.t('admin.users')}</h2>
				<input class="search" type="search" placeholder={app.t('admin.search')} aria-label={app.t('admin.search')} bind:value={text} />
				{#if users.value.length}
					<ul class="row-list">
						{#each users.value as user (user.id)}
							<li>
								<a class="row-link" href="/admin/users/{user.id}">
									<span class="row-main">
										<span>{user.name}{#if user.isSelf}<span class="you">{` · ${app.t("admin.you")}`}</span>{/if}</span>
										<small>{user.email}</small>
										{#if user.roles.length}<span class="chips">{#each user.roles as role (role)}<span class="label-chip">{app.t(`admin.role.${role}` as const)}</span>{/each}</span>{/if}
									</span>
									<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="meta-line">{app.t('admin.noUsers')}</p>
				{/if}
			</section>

			<section class="settings-card" id="invitations" aria-labelledby="invitations-title">
				<div class="title-row">
					<h2 id="invitations-title">{app.t('admin.invitations')}</h2>
					<button type="button" class="text-button" disabled={app.settings.offline} onclick={() => (inviting = true)}><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg>{app.t('admin.invite')}</button>
				</div>
				<p class="meta-line">{app.t('admin.invitationsIntro')}</p>
				{#if invitations.ok && invitations.value.length}
					<ul class="row-list">
						{#each invitations.value as inv (inv.token)}
							<li class="invitation">
								<span class="row-main">
									<span class="email">{inv.email}</span>
									<small>
										{inv.roles.length ? inv.roles.map((r) => app.t(`admin.role.${r}` as const)).join(', ') : app.t('admin.invitation.noRoles')}
										· {inv.status === 'accepted'
											? app.t('admin.invitation.acceptedBy', { name: inv.acceptedByName ?? '', date: day(inv.acceptedAt ?? inv.createdAt) })
											: inv.status === 'expired'
												? app.t('admin.invitation.expiredOn', { date: day(inv.expiresAt) })
												: inv.status === 'pending'
													? app.t('admin.invitation.expires', { date: day(inv.expiresAt) })
													: app.t('admin.invitation.by', { name: inv.createdByName ?? '' })}
									</small>
									<span class="chips"><span class="label-chip" class:neutral={inv.status !== 'pending'}>{app.t(`admin.invitation.${inv.status}` as const)}</span></span>
								</span>
								{#if inv.status === 'pending'}
									<span class="actions">
										<button type="button" class="text-button" onclick={() => (shared = { url: linkOf(inv.token), email: inv.email })}>{app.t('admin.copyLink')}</button>
										<button type="button" class="text-button danger-outline" disabled={app.settings.offline} onclick={() => revoke(inv.token)}>{app.t('admin.revoke')}</button>
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="meta-line">{app.t('admin.noInvitations')}</p>
				{/if}
			</section>

			<section class="settings-card" id="restore" aria-labelledby="restore-title">
				<h2 id="restore-title">{app.t('admin.restoreSection')}</h2>
				<p class="meta-line">{app.t('admin.restoreSectionIntro')}</p>
				<div class="moment">
					<label class="field">{app.t('admin.restore.day')}<input type="date" bind:value={restoreDay} max={app.settings.now.slice(0, 10)} /></label>
					<label class="field">{app.t('admin.restore.time')}<input type="time" bind:value={restoreTime} /></label>
				</div>
				{#if !restoreInPast}<p class="meta-line">{app.t('admin.restore.past')}</p>{/if}
				<button type="button" class="text-button" disabled={!restoreInPast} onclick={() => goto(`/admin/restore?at=${restoreAt}`)}>{app.t('admin.restore.previewButton')}</button>
				{#if restores.ok && restores.value.length}
					<h3>{app.t('admin.restores')}</h3>
					<ul class="row-list">
						{#each restores.value as restore (restore.at)}
							<li>
								<a class="row-link" href="/admin/restore?at={restore.undoAt}">
									<span class="row-main">{app.t('admin.restoreRow', { date: formatDateTime(app.locale, restore.at), target: formatDateTime(app.locale, restore.restoredTo) })}<small>{app.t('admin.restoreRowHint', { name: restore.byName })}</small></span>
									<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	</div>
</section>

<InviteSheet open={inviting} onClose={() => (inviting = false)} onCreated={(token, email) => { inviting = false; shared = { url: linkOf(token), email }; }} />
<ShareLinkSheet url={shared?.url ?? null} onClose={() => (shared = null)} title={app.t('admin.inviteShareTitle')} body={app.t('admin.inviteShareBody', { email: shared?.email ?? '' })} />

<style>
	.moment { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
	.moment input { min-height: 44px; padding: 8px 12px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 1rem/1.5 var(--text-font); }
	h3 { margin: 20px 0 4px; }
	.search { width: 100%; min-height: 44px; margin: 4px 0 8px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); font: inherit; box-sizing: border-box; }
	.you { color: var(--muted); font-weight: 400; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.title-row h2 { margin: 0; }
	.invitation { display: grid; gap: 8px; padding: 10px 0; }
	.email { overflow-wrap: anywhere; }
	.actions { display: flex; flex-wrap: wrap; gap: 8px; }
	.row-main small { overflow-wrap: anywhere; }
</style>
