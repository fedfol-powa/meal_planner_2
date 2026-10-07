<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import type { GlobalRole } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { createAppInvitation } from '#lib/operations/app-invitations.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// App invitation (round 6): one email, optional roles given on acceptance; returns the link to share.
	let { open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (token: string, email: string) => void } = $props();
	let email = $state('');
	let roles = $state<GlobalRole[]>([]);
	let problem = $state<'invalid' | { userId: string; name: string } | null>(null);
	const pending = $derived(app.db.appInvitations.some((i) => i.status === 'pending' && i.expiresAt > app.settings.now && i.email === email.trim().toLowerCase()));

	$effect(() => {
		if (open) {
			email = '';
			roles = [];
			problem = null;
		}
	});

	function create(event: SubmitEvent) {
		event.preventDefault();
		const result = createAppInvitation(app.db, app.ctx, email, roles);
		if (!result.ok) {
			if (result.error === 'invalid') return (problem = 'invalid');
			return app.notify(app.t(errorKey(result.error)));
		}
		if (result.value.status === 'existing_user') {
			const userId = result.value.userId;
			return (problem = { userId, name: app.db.users.find((u) => u.id === userId)?.displayName ?? '' });
		}
		app.update(() => {});
		onCreated(result.value.token, email.trim().toLowerCase());
	}
</script>

<BottomSheet {open} title={app.t('admin.inviteTitle')} {onClose}>
	<form onsubmit={create} novalidate>
		<label class="field">{app.t('admin.inviteEmail')}
			<input type="email" autocomplete="off" inputmode="email" bind:value={email} aria-invalid={problem === 'invalid'} oninput={() => (problem = null)} />
		</label>
		{#if problem === 'invalid'}<p class="error">{app.t('admin.inviteInvalid')}</p>{/if}
		{#if problem && problem !== 'invalid'}
			<p class="error">{app.t('admin.inviteExisting')} <a class="link-inline" href="/admin/users/{problem.userId}">{app.t('admin.inviteOpenUser', { name: problem.name })}</a></p>
		{/if}
		{#if pending}<p class="meta-line">{app.t('admin.inviteReplaces')}</p>{/if}
		<fieldset>
			<legend>{app.t('admin.inviteRoles')}</legend>
			{#each ['recipe_curator', 'app_admin'] as const as role (role)}
				<label class="choice"><input type="checkbox" value={role} bind:group={roles} />{app.t(`admin.roleLong.${role}`)}</label>
			{/each}
		</fieldset>
		<p class="meta-line">{app.t('admin.inviteNote')}</p>
		<button type="submit" class="text-button primary wide" disabled={app.settings.offline}>{app.t('admin.inviteCreate')}</button>
	</form>
</BottomSheet>

<style>
	fieldset { margin: 12px 0 0; padding: 0; border: 0; }
	legend { margin-bottom: 4px; font-size: 0.875rem; font-weight: 700; }
	.error { margin: 4px 0 0; color: #b3261e; font-size: 0.875rem; }
	.wide { width: 100%; margin-top: 12px; }
</style>
