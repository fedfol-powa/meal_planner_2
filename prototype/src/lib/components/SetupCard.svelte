<script lang="ts">
	import { dismissSetupCard } from '#lib/operations/family.ts';
	import { roleOf } from '#lib/operations/family.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Shown once after the first generation, to administrators (round 4).
	const visible = $derived(!!app.family?.showSetupCard && roleOf(app.family, app.user.id) === 'family_admin');

	function dismiss() {
		if (dismissSetupCard(app.db, app.ctx).ok) app.update(() => {});
	}
</script>

{#if visible}
	<aside class="setup" aria-label={app.t('setup.title')}>
		<p>{app.t('setup.title')}</p>
		<div class="links">
			<a class="link-inline" href="/you/family">{app.t('setup.invite')}</a>
			<a class="link-inline" href="/you/family/settings">{app.t('setup.settings')}</a>
		</div>
		<button type="button" class="close" aria-label={app.t('common.close')} disabled={app.settings.offline} onclick={dismiss}>×</button>
	</aside>
{/if}

<style>
	.setup { position: relative; margin: 0 0 10px; padding: 10px 44px 10px 14px; border: 1px solid var(--free-border); border-radius: 8px; background: var(--free-surface); font-size: 0.875rem; }
	p { margin: 0 0 2px; font-weight: 700; }
	.links { display: flex; flex-wrap: wrap; gap: 4px 16px; }
	.links a { display: inline-flex; align-items: center; min-height: 32px; }
	.close { position: absolute; top: 2px; right: 0; width: 44px; height: 44px; border: 0; background: none; color: var(--ink); font: 400 1.5rem/1 var(--text-font); cursor: pointer; }
</style>
