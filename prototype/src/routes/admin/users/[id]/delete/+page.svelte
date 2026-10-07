<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import ConfirmDanger from '#lib/components/ConfirmDanger.svelte';
	import DeletionFamilies from '#lib/components/DeletionFamilies.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { deleteUser, getUserDeletionPlan } from '#lib/operations/admin.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Deleting a user from the administration (round 6): the account deletion page of round 4, seen by an
	// administrator, with the same conditions.
	const userId = $derived(page.params.id ?? '');
	const plan = $derived(getUserDeletionPlan(app.db, app.ctx, userId));
	let successors = $state<Record<string, string>>({});
	const ready = $derived(plan.ok && !plan.value.lastAppAdmin && plan.value.families.every((f) => f.outcome !== 'needs_successor' || successors[f.familyId]));

	function confirm() {
		if (!plan.ok) return;
		const name = plan.value.name;
		const result = deleteUser(app.db, app.ctx, userId, successors);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.notify(app.t('admin.deleted', { name }));
		goto('/admin', { replaceState: true });
	}
</script>

<section class="secondary-view app-view" aria-labelledby="user-delete-title">
	<div class="page-column">
		<PageHeader back="/admin/users/{userId}" backLabel={plan.ok ? plan.value.name : app.t('admin.users')} title={plan.ok ? app.t('admin.deleteTitle', { name: plan.value.name }) : app.t('admin.deleteUser')} titleId="user-delete-title" />
		{#if !plan.ok}
			<StateNotice title={app.t(plan.error === 'forbidden' ? 'admin.forbidden' : plan.error === 'not_allowed' ? 'admin.deleteSelf' : errorKey(plan.error))} />
		{:else}
			{@const p = plan.value}
			<p class="meta-line email">{p.email}</p>
			{#if p.lastAppAdmin}<StateNotice title={app.t('admin.lastAppAdminDelete')} />{/if}
			<DeletionFamilies title={app.t('admin.deleteFamilies')} families={p.families} outcome={(o) => app.t(`admin.outcome.${o}` as const, { name: p.name })} bind:successors />
			<section class="settings-card">
				<h3>{app.t('account.whatGoes')}</h3>
				<p>{app.t('admin.deleteWhatGoes')}</p>
				{#if p.openInvitations}<p>{app.t('admin.deleteInvitations', { count: p.openInvitations })}</p>{/if}
				<p class="meta-line">{app.t('account.whatStays')}</p>
				<ConfirmDanger label={app.t('admin.deleteConfirm', { name: p.name })} disabled={!ready || app.settings.offline} onConfirm={confirm} />
			</section>
		{/if}
	</div>
</section>

<style>
	.email { overflow-wrap: anywhere; margin-bottom: 16px; }
	h3 { margin: 0 0 6px; font: 400 1.125rem/1.3 var(--meal-title-font); }
</style>
