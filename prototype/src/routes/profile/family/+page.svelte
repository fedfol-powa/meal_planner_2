<script lang="ts">
	import { goto } from '$app/navigation';
	import BottomSheet from '#lib/components/BottomSheet.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ShareLinkSheet from '#lib/components/ShareLinkSheet.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { formatDayLong, formatDayMonth } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { OpResult } from '#lib/operations/context.ts';
	import { getFamilyOverview, leaveFamily, removeMember, setMemberRole, type MemberView } from '#lib/operations/family.ts';
	import { createInvitation, revokeInvitation } from '#lib/operations/invitations.ts';
	import { app } from '#lib/store/app.svelte.ts';

	const overview = $derived(getFamilyOverview(app.db, app.ctx));
	const isAdmin = $derived(overview.ok && overview.value.myRole === 'family_admin');
	let member = $state<MemberView | null>(null);
	let confirmRemoval = $state(false);
	let leaving = $state(false);
	let successor = $state<string | null>(null);
	let shareUrl = $state<string | null>(null);

	const inviteUrl = (token: string) => `${location.origin}/invite/${token}`;

	function act(result: OpResult<unknown>, message: string | null = null): boolean {
		if (!result.ok) {
			app.notify(app.t(errorKey(result.error)));
			return false;
		}
		app.update(() => {});
		if (message) app.notify(message);
		return true;
	}

	function newLink() {
		const result = createInvitation(app.db, app.ctx);
		if (act(result, app.t('invite.created')) && result.ok) share(result.value.token);
	}

	// Web Share needs a secure context: on the LAN preview (http) the sheet with the link opens.
	async function share(token: string) {
		const url = inviteUrl(token);
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ title: app.t('invite.shareTitle', { family: app.family?.name ?? '' }), url });
				return;
			} catch (error) {
				if ((error as DOMException).name === 'AbortError') return;
			}
		}
		shareUrl = url;
	}

	function openMember(m: MemberView) {
		member = m;
		confirmRemoval = false;
	}

	function changeRole(m: MemberView) {
		const role = m.role === 'family_admin' ? 'member' : 'family_admin';
		if (act(setMemberRole(app.db, app.ctx, m.userId, role), app.t(role === 'family_admin' ? 'members.madeAdmin' : 'members.madeMember', { name: m.name }))) member = null;
	}

	function remove(m: MemberView) {
		if (act(removeMember(app.db, app.ctx, m.userId), app.t('members.removed', { name: m.name }))) member = null;
	}

	const lastAdmin = $derived(overview.ok && isAdmin && overview.value.members.filter((m) => m.role === 'family_admin').length === 1);
	const alone = $derived(overview.ok && overview.value.members.length === 1);

	function leave() {
		const name = app.family?.name ?? '';
		if (!act(leaveFamily(app.db, app.ctx, successor))) return;
		leaving = false;
		const next = app.db.families.find((f) => f.members.some((m) => m.userId === app.user.id));
		app.switchFamily(next?.id ?? null);
		app.notify(app.t('members.left', { family: name }));
		goto(next ? '/profile' : '/welcome');
	}
</script>

<section class="secondary-view app-view" aria-labelledby="members-title">
	<div class="page-column">
		<PageHeader back="/profile" backLabel={app.t('nav.profile')} title={app.t('profile.members')} titleId="members-title" />
		{#if !overview.ok}
			<StateNotice title={app.t(errorKey(overview.error))} />
		{:else}
			{@const o = overview.value}
			<section class="settings-card" aria-labelledby="list-title">
				<h2 id="list-title">{o.name}</h2>
				<ul class="row-list">
					{#each o.members as m (m.userId)}
						<li>
							<span class="row-main">{m.isMe ? app.t('members.you', { name: m.name }) : m.name}<small>{app.t('members.since', { time: formatDayMonth(app.locale, m.joinedAt.slice(0, 10)) })}</small></span>
							<span class="label-chip" class:neutral={m.role === 'member'}>{app.t(`profile.role.${m.role}` as const)}</span>
							{#if isAdmin && !m.isMe}
								<button type="button" class="icon-button" aria-label={app.t('members.actions', { name: m.name })} disabled={app.settings.offline} onclick={() => openMember(m)}><svg class="icon" aria-hidden="true"><use href="#icon-more" /></svg></button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>

			<section class="settings-card" aria-labelledby="links-title">
				<h2 id="links-title">{app.t('invite.links')}</h2>
				{#if o.invitations}
					<p class="meta-line">{app.t('invite.linksHint')}</p>
					<ul class="row-list">
						{#each o.invitations as inv (inv.token)}
							<li class="link-row">
								<span class="row-main">{app.t('invite.linkBy', { name: inv.createdByName ?? app.t('meal.formerMember') })}<small>{app.t('invite.expires', { time: formatDayLong(app.locale, inv.expiresAt.slice(0, 10)) })}</small></span>
								<span class="link-actions">
									<button type="button" class="text-button small" onclick={() => share(inv.token)}>{app.t('invite.share')}</button>
									<button type="button" class="text-button small" disabled={app.settings.offline} onclick={() => act(revokeInvitation(app.db, app.ctx, inv.token), app.t('invite.revoked'))}>{app.t('invite.revoke')}</button>
								</span>
							</li>
						{/each}
					</ul>
					<button type="button" class="text-button primary new-link" disabled={app.settings.offline} onclick={newLink}><svg class="icon" aria-hidden="true"><use href="#icon-link" /></svg>{app.t('invite.create')}</button>
				{:else}
					<p class="meta-line">{app.t('invite.askAdmin', { names: o.adminNames.join(', ') })}</p>
				{/if}
			</section>

			<div class="danger-zone">
				<button type="button" class="text-button danger-outline" disabled={app.settings.offline} onclick={() => { leaving = true; successor = null; }}>{app.t('members.leave')}</button>
			</div>

			<BottomSheet open={member !== null} title={member?.name ?? ''} onClose={() => (member = null)}>
				{#if member && !confirmRemoval}
					<ul class="row-list">
						<li><button type="button" class="row-link" onclick={() => changeRole(member!)}>{app.t(member.role === 'family_admin' ? 'members.makeMember' : 'members.makeAdmin')}</button></li>
						<li><button type="button" class="row-link danger-text" onclick={() => (confirmRemoval = true)}>{app.t('members.remove')}</button></li>
					</ul>
				{:else if member}
					<p>{app.t('members.removeBody', { name: member.name })}</p>
					<button type="button" class="text-button danger wide" onclick={() => remove(member!)}>{app.t('members.removeConfirm', { name: member.name })}</button>
				{/if}
			</BottomSheet>

			<BottomSheet open={leaving} title={app.t('members.leaveTitle', { family: o.name })} onClose={() => (leaving = false)}>
				{#if alone}
					<p>{app.t('error.soleMember')}</p>
					<a class="text-button wide" href="/profile/family/delete?family={o.id}">{app.t('settings.deleteFamily')}</a>
				{:else if lastAdmin}
					<p>{app.t('members.leaveSuccessor')}</p>
					<fieldset>
						<legend class="visually-hidden">{app.t('members.successor')}</legend>
						{#each o.members.filter((m) => !m.isMe) as m (m.userId)}
							<label class="choice"><input type="radio" name="successor" value={m.userId} bind:group={successor} />{m.name}</label>
						{/each}
					</fieldset>
					<button type="button" class="text-button danger wide" disabled={!successor} onclick={leave}>{app.t('members.leaveWithSuccessor')}</button>
				{:else}
					<p>{app.t('members.leaveBody')}</p>
					<button type="button" class="text-button danger wide" onclick={leave}>{app.t('members.leaveConfirm')}</button>
				{/if}
			</BottomSheet>

			<ShareLinkSheet url={shareUrl} onClose={() => (shareUrl = null)} />
		{/if}
	</div>
</section>

<style>
	.icon-button { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border: 0; border-radius: 8px; background: none; color: var(--ink); cursor: pointer; }
	.icon-button:disabled { opacity: 0.4; }
	.link-row { flex-wrap: wrap; }
	.link-actions { display: flex; gap: 8px; }
	.small { min-height: 40px; padding: 6px 12px; }
	.new-link { margin-top: 12px; }
	.wide { width: 100%; margin-top: 8px; }
	.danger-text { color: #b3261e; font-weight: 700; }
	fieldset { margin: 0 0 8px; padding: 0; border: 0; }
</style>
