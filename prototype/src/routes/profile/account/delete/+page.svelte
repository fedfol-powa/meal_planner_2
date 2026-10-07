<script lang="ts">
	import { goto } from '$app/navigation';
	import ConfirmDanger from '#lib/components/ConfirmDanger.svelte';
	import DeletionFamilies from '#lib/components/DeletionFamilies.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { deleteAccount, getAccountDeletionPlan } from '#lib/operations/account.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Account deletion (spec section 7): what happens family by family; blocked until every condition holds.
	const plan = $derived(getAccountDeletionPlan(app.db, app.ctx));
	let successors = $state<Record<string, string>>({});
	const ready = $derived(plan.ok && !plan.value.lastAppAdmin && plan.value.families.every((f) => f.outcome !== 'needs_successor' || successors[f.familyId]));

	function confirm() {
		const result = deleteAccount(app.db, app.ctx, successors);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.signOut();
		app.notify(app.t('account.deleted'));
		goto('/welcome');
	}
</script>

<section class="secondary-view app-view" aria-labelledby="account-delete-title">
	<div class="page-column">
		<PageHeader back="/profile/preferences" backLabel={app.t('profile.preferences')} title={app.t('account.delete')} titleId="account-delete-title" />
		{#if !plan.ok}
			<StateNotice title={app.t(errorKey(plan.error))} />
		{:else}
			{@const p = plan.value}
			{#if p.lastAppAdmin}
				<StateNotice title={app.t('account.lastAppAdmin')} body={app.t('account.lastAppAdminBody')} />
			{/if}
			<DeletionFamilies title={app.t('account.families')} families={p.families} outcome={(o) => app.t(`account.outcome.${o}` as const)} bind:successors />
			<section class="settings-card">
				<h3>{app.t('account.whatGoes')}</h3>
				<p>{app.t('account.whatGoesBody')}</p>
				{#if p.openInvitations}<p>{app.t('account.invitations', { count: p.openInvitations })}</p>{/if}
				<p class="meta-line">{app.t('account.whatStays')}</p>
				<ConfirmDanger label={app.t('account.deleteConfirm')} disabled={!ready || app.settings.offline} onConfirm={confirm} />
			</section>
		{/if}
	</div>
</section>

<style>
	h3 { margin: 0 0 6px; font: 400 1.125rem/1.3 var(--meal-title-font); }
</style>
