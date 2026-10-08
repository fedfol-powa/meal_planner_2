<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { acceptInvitation, getInvitation } from '#lib/operations/invitations.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Invitation link (spec section 7): readable before signing in; joining is an explicit choice.
	const token = $derived(page.params.token ?? '');
	const invitation = $derived(getInvitation(app.db, app.ctx, token));

	function join() {
		const result = acceptInvitation(app.db, app.ctx, token);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.switchFamily(result.value.familyId);
		app.notify(app.t('invite.joined', { family: invitation.familyName ?? '' }));
		goto('/menu');
	}

	function openFamily() {
		if (invitation.familyId) app.switchFamily(invitation.familyId);
		goto('/menu');
	}
</script>

<section class="secondary-view app-view invite" aria-labelledby="invite-title">
	<div class="column">
		<p class="brand">Cosa si mangia?</p>
		{#if invitation.status === 'valid'}
			<h1 id="invite-title">{app.t('invite.title', { family: invitation.familyName ?? '' })}</h1>
			<p class="lead">{app.t('invite.body', { name: invitation.invitedByName ?? app.t('meal.formerMember') })}</p>
			{#if app.signedIn}
				<button type="button" class="text-button primary wide" disabled={app.settings.offline} onclick={join}>{app.t('invite.join')}</button>
				<p class="meta-line">{app.t('invite.signedInAs', { name: app.user.displayName })}</p>
			{:else}
				<a class="text-button primary wide" href="/welcome?next={encodeURIComponent(`/invite/${token}`)}">{app.t('invite.signInToJoin')}</a>
			{/if}
		{:else if invitation.status === 'already_member'}
			<h1 id="invite-title">{app.t('invite.already', { family: invitation.familyName ?? '' })}</h1>
			<button type="button" class="text-button primary wide" onclick={openFamily}>{app.t('invite.openMenu')}</button>
		{:else if invitation.status === 'not_found'}
			<h1 id="invite-title">{app.t('invite.notFound')}</h1>
			<p class="lead">{app.t('invite.askNew')}</p>
		{:else}
			<!-- Expired, revoked, or removed after the link was created (R2): the same request for a new link. -->
			<h1 id="invite-title">{app.t(invitation.status === 'expired' ? 'invite.expired' : 'invite.invalid')}</h1>
			<p class="lead">
				{app.t('invite.askNewFrom', { family: invitation.familyName ?? '' })}
				{#if invitation.status === 'expired' && invitation.expiresAt}<br /><span class="meta-line">{app.t('invite.expiredOn', { time: formatDayLong(app.locale, invitation.expiresAt.slice(0, 10)) })}</span>{/if}
			</p>
		{/if}
		{#if app.signedIn && invitation.status !== 'already_member'}
			<a class="link-inline" href={app.family ? '/menu' : '/welcome'}>{app.t('invite.toApp')}</a>
		{/if}
	</div>
</section>

<style>
	.invite { padding-top: max(32px, env(safe-area-inset-top)); }
	.column { max-width: 420px; margin-inline: auto; }
	.brand { margin: 0 0 32px; color: var(--green); font: 700 0.875rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
	h1 { margin: 0 0 12px; font: 400 1.75rem/1.25 var(--heading-font); overflow-wrap: anywhere; }
	.lead { margin: 0 0 24px; color: var(--body-text); }
	.wide { width: 100%; margin-bottom: 12px; box-sizing: border-box; }
</style>
