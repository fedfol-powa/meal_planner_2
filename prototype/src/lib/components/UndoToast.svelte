<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';

	const DURATION_MS = 6000;

	$effect(() => {
		const toast = app.toast;
		if (!toast) return;
		const timer = setTimeout(() => {
			if (app.toast?.id === toast.id) app.toast = null;
		}, DURATION_MS);
		return () => clearTimeout(timer);
	});

	function undo() {
		const action = app.toast?.undo;
		app.toast = null;
		action?.();
	}
</script>

<div class="toast-region" role="status" aria-live="polite">
	{#if app.toast}
		{#key app.toast.id}
			<div class="toast">
				<span>{app.toast.message}</span>
				{#if app.toast.undo}<button type="button" onclick={undo}>{app.t('toast.undo')}</button>{/if}
			</div>
		{/key}
	{/if}
</div>

<style>
	.toast-region { position: fixed; left: 0; right: 0; bottom: calc(var(--toast-offset, 80px) + env(safe-area-inset-bottom)); z-index: 30; display: flex; justify-content: center; padding: 0 16px; pointer-events: none; }
	.toast { display: flex; align-items: center; gap: 16px; width: min(100%, 480px); min-height: 48px; padding: 4px 8px 4px 16px; border-radius: 8px; color: #fff; background: var(--ink); font-size: 0.875rem; box-shadow: 0 2px 8px rgb(0 0 0 / 20%); pointer-events: auto; }
	.toast span { flex: 1; }
	button { min-height: 44px; padding: 0 12px; border: 0; background: none; color: #fff; font: 700 0.875rem/1 var(--text-font); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	button:focus-visible { outline-color: #fff; }
</style>
