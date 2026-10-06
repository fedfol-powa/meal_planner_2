<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ConfirmDanger from '#lib/components/ConfirmDanger.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { deleteFamily, getFamilyDeletion } from '#lib/operations/family.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Dedicated page (spec section 7), also the link MCP returns: the URL only navigates, nothing is
	// deleted on opening; permissions are checked again at confirmation.
	const familyId = $derived(page.url.searchParams.get('family') ?? app.settings.familyId ?? '');
	const view = $derived(getFamilyDeletion(app.db, app.ctx, familyId));

	function confirm() {
		const name = view.ok ? view.value.name : '';
		const result = deleteFamily(app.db, app.ctx, familyId);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		const next = app.db.families.find((f) => f.members.some((m) => m.userId === app.user.id));
		app.switchFamily(app.settings.familyId === familyId ? next?.id ?? null : app.settings.familyId);
		app.notify(app.t('deleteFamily.done', { family: name }));
		goto(app.family ? '/profile' : '/welcome');
	}
</script>

<section class="secondary-view app-view" aria-labelledby="delete-title">
	<div class="page-column">
		<PageHeader back="/profile/family/settings" backLabel={app.t('profile.settings')} title={app.t('settings.deleteFamily')} titleId="delete-title" />
		{#if !view.ok}
			<StateNotice title={app.t(errorKey(view.error))} />
		{:else}
			{@const v = view.value}
			<section class="settings-card">
				<h2>{v.name}</h2>
				<p>{app.t('deleteFamily.removed', { members: v.memberNames.join(', ') })}</p>
				<ul class="facts">
					<li>{app.t('deleteFamily.weeks', { count: v.weekCount })}</li>
					<li>{app.t('deleteFamily.data')}</li>
				</ul>
				<p class="meta-line">{app.t('deleteFamily.kept')}</p>
				{#if v.canDelete}
					<ConfirmDanger label={app.t('deleteFamily.confirm', { family: v.name })} disabled={app.settings.offline} onConfirm={confirm} />
				{:else}
					<p class="blocked" role="status">{app.t('deleteFamily.adminOnly')}</p>
				{/if}
			</section>
		{/if}
	</div>
</section>

<style>
	.facts { margin: 0 0 12px; padding-left: 20px; }
	.facts li { margin: 4px 0; }
	.blocked { margin: 16px 0 0; font-weight: 700; }
</style>
