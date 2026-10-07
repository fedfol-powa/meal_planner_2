<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BottomSheet from '#lib/components/BottomSheet.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import type { GlobalRole } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { getUserAdmin, setUserRole } from '#lib/operations/admin.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// One user (round 6): global roles with the last administrator protected, families by name and role only,
	// deletion. Appointing an administrator and giving up one's own role ask for confirmation.
	const userId = $derived(page.params.id ?? '');
	const user = $derived(getUserAdmin(app.db, app.ctx, userId));
	let confirming = $state<'appoint' | 'drop_self' | null>(null);

	function apply(role: GlobalRole, on: boolean) {
		if (!user.ok) return;
		const name = user.value.name;
		const result = setUserRole(app.db, app.ctx, userId, role, on);
		confirming = null;
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.notify(app.t(on ? 'admin.roleOn' : 'admin.roleOff', { name, role: app.t(`admin.roleLong.${role}`) }));
		if (!on && role === 'app_admin' && userId === app.user.id) goto('/profile');
	}

	function toggle(event: Event, role: GlobalRole) {
		const input = event.currentTarget as HTMLInputElement;
		const on = input.checked;
		if (role === 'app_admin' && on) {
			input.checked = false;
			confirming = 'appoint';
		} else if (role === 'app_admin' && !on && userId === app.user.id) {
			input.checked = true;
			confirming = 'drop_self';
		} else apply(role, on);
	}
</script>

<section class="secondary-view app-view" aria-labelledby="user-title">
	<div class="page-column">
		<PageHeader back="/admin" backLabel={app.t('admin.title')} title={user.ok ? user.value.name : app.t('admin.users')} titleId="user-title" />
		{#if !user.ok}
			<StateNotice title={app.t(user.error === 'forbidden' ? 'admin.forbidden' : errorKey(user.error))} />
		{:else}
			{@const u = user.value}
			<p class="meta-line email">{u.email}{#if u.agents}{` · ${u.agents === 1 ? app.t('admin.agentsOne') : app.t('admin.agents', { count: u.agents })}`}{/if}</p>

			<section class="settings-card" aria-labelledby="roles-title">
				<h2 id="roles-title">{app.t('admin.roles')}</h2>
				{#each ['recipe_curator', 'app_admin'] as const as role (role)}
					{@const locked = role === 'app_admin' && u.lastAppAdmin}
					<label class="role">
						<input type="checkbox" role="switch" checked={u.roles.includes(role)} disabled={locked || app.settings.offline} onchange={(e) => toggle(e, role)} />
						<span class="row-main">{app.t(`admin.roleLong.${role}`)}<small>{locked ? app.t('admin.lastAppAdmin') : app.t(`admin.roleHint.${role}`)}</small></span>
					</label>
				{/each}
			</section>

			<section class="settings-card" aria-labelledby="families-title">
				<h2 id="families-title">{app.t('admin.families')}</h2>
				{#if u.families.length}
					<ul class="row-list">
						{#each u.families as f (f.name)}<li><span class="row-main">{f.name}<small>{app.t(`profile.role.${f.role}` as const)}</small></span></li>{/each}
					</ul>
				{:else}
					<p>{app.t('admin.noFamilies')}</p>
				{/if}
				<p class="meta-line">{app.t('admin.familiesNote')}</p>
			</section>

			<div class="danger-zone">
				{#if u.isSelf}
					<p class="meta-line">{app.t('admin.deleteSelf')} <a class="link-inline" href="/profile/preferences">{app.t('profile.preferences')}</a></p>
				{:else}
					<a class="text-button danger-outline" href="/admin/users/{u.id}/delete">{app.t('admin.deleteUser')}</a>
				{/if}
			</div>
		{/if}
	</div>
</section>

<BottomSheet open={confirming !== null} title={user.ok ? app.t(confirming === 'drop_self' ? 'admin.dropSelfTitle' : 'admin.appointTitle', { name: user.value.name }) : ''} onClose={() => (confirming = null)}>
	<p>{app.t(confirming === 'drop_self' ? 'admin.dropSelfBody' : 'admin.appointBody')}</p>
	<div class="sheet-actions">
		<button type="button" class="text-button" onclick={() => (confirming = null)}>{app.t('agents.cancel')}</button>
		<button type="button" class="text-button {confirming === 'drop_self' ? 'danger' : 'primary'}" onclick={() => apply('app_admin', confirming === 'appoint')}>{app.t(confirming === 'drop_self' ? 'admin.dropSelf' : 'admin.appoint')}</button>
	</div>
</BottomSheet>

<style>
	.email { overflow-wrap: anywhere; margin-bottom: 16px; }
	.role { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 8px 0; cursor: pointer; }
	.role input { flex: none; width: 20px; height: 20px; margin: 2px 0 0; accent-color: var(--green); }
	.role small { display: block; color: var(--muted); }
	.sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
