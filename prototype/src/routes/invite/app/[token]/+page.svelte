<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { acceptAppInvitation, getAppInvitation } from '#lib/operations/app-invitations.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// App invitation link (round 6): readable before signing in; one email, single use, optional roles.
	const token = $derived(page.params.token ?? '');
	const invitation = $derived(getAppInvitation(app.db, app.ctx, token));
	const roles = $derived(invitation.roles.map((r) => app.t(`admin.roleLong.${r}` as const)).join(', '));
	const here = $derived(`/invite/app/${token}`);

	function accept() {
		const result = acceptAppInvitation(app.db, app.ctx, token);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.notify(roles ? app.t('appInvite.acceptedRoles', { roles }) : app.t('appInvite.accepted'));
		goto(app.family ? '/menu' : '/welcome');
	}

	function switchAccount() {
		app.signOut();
		goto(`/welcome?next=${encodeURIComponent(here)}`);
	}
</script>

<section class="secondary-view app-view invite" aria-labelledby="app-invite-title">
	<div class="column">
		<p class="brand">App Famiglia</p>
		{#if invitation.status === 'valid'}
			<h1 id="app-invite-title">{app.t('appInvite.title')}</h1>
			<p class="lead">{app.t('appInvite.body', { name: invitation.invitedByName ?? '' })}</p>
			{#if roles}<p class="lead">{app.t('appInvite.roles', { roles })}</p>{/if}
			{#if app.signedIn}
				<button type="button" class="text-button primary wide" disabled={app.settings.offline} onclick={accept}>{app.t('appInvite.accept')}</button>
				<p class="meta-line">{app.t('invite.signedInAs', { name: app.user.displayName })}</p>
			{:else}
				<p class="meta-line">{app.t('appInvite.for', { email: invitation.email ?? '' })}</p>
				<a class="text-button primary wide" href="/welcome?next={encodeURIComponent(here)}">{app.t('appInvite.signIn')}</a>
			{/if}
		{:else if invitation.status === 'wrong_email'}
			<h1 id="app-invite-title">{app.t('appInvite.wrongEmail')}</h1>
			<p class="lead">{app.t('appInvite.wrongEmailBody', { email: invitation.email ?? '', current: app.user.email })}</p>
			<button type="button" class="text-button primary wide" onclick={switchAccount}>{app.t('appInvite.signOut')}</button>
		{:else}
			<h1 id="app-invite-title">{app.t(invitation.status === 'accepted' ? 'appInvite.used' : invitation.status === 'expired' ? 'appInvite.expired' : invitation.status === 'revoked' ? 'appInvite.revoked' : 'appInvite.notFound')}</h1>
			<p class="lead">
				{app.t('appInvite.askNew')}
				{#if invitation.status === 'expired' && invitation.expiresAt}<br /><span class="meta-line">{app.t('invite.expiredOn', { time: formatDayLong(app.locale, invitation.expiresAt.slice(0, 10)) })}</span>{/if}
			</p>
		{/if}
		<a class="link-inline" href={app.signedIn ? (app.family ? '/menu' : '/welcome') : '/welcome'}>{app.t('appInvite.toApp')}</a>
	</div>
</section>

<style>
	.invite { padding-top: max(32px, env(safe-area-inset-top)); }
	.column { max-width: 420px; margin-inline: auto; }
	.brand { margin: 0 0 32px; color: var(--green); font: 700 0.875rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
	h1 { margin: 0 0 12px; font: 400 1.75rem/1.25 var(--heading-font); overflow-wrap: anywhere; }
	.lead { margin: 0 0 16px; color: var(--body-text); }
	.wide { width: 100%; margin: 8px 0 12px; box-sizing: border-box; }
</style>
