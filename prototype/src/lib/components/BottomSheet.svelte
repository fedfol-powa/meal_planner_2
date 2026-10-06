<script lang="ts">
	import type { Snippet } from 'svelte';
	import { app } from '#lib/store/app.svelte.ts';

	// Modal sheet from the bottom of the screen, built on <dialog> for focus trapping and Esc.
	let { open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: Snippet } = $props();
	let dialog: HTMLDialogElement;
	const uid = $props.id();

	$effect(() => {
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	// A tap on the backdrop lands on the dialog element itself.
	function onclick(event: MouseEvent) {
		if (event.target === dialog) onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog class="sheet" bind:this={dialog} aria-labelledby="{uid}-title" onclose={onClose} {onclick}>
	<div class="sheet-body">
		<header>
			<h2 id="{uid}-title">{title}</h2>
			<button type="button" class="close" aria-label={app.t('common.close')} onclick={onClose}>×</button>
		</header>
		{#if open}{@render children()}{/if}
	</div>
</dialog>

<style>
	.sheet { position: fixed; inset: auto 0 0; width: min(100%, 640px); max-width: none; max-height: min(88dvh, 820px); margin: 0 auto; padding: 0; border: 0; border-radius: 8px 8px 0 0; background: var(--canvas); color: var(--ink); box-shadow: 0 -2px 12px rgb(0 0 0 / 15%); }
	.sheet::backdrop { background: rgb(0 0 0 / 35%); }
	.sheet-body { max-height: inherit; overflow-y: auto; overscroll-behavior: contain; padding: 4px 20px max(20px, env(safe-area-inset-bottom)); }
	header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 -20px 8px; padding: 12px 8px 8px 20px; background: var(--canvas); border-bottom: 1px solid var(--rule); }
	h2 { margin: 0; font: 400 1.25rem/1.3 var(--heading-font); overflow-wrap: anywhere; }
	.close { flex: none; width: 44px; height: 44px; border: 0; background: none; color: var(--ink); font: 400 1.75rem/1 var(--text-font); cursor: pointer; }
	@media (min-width: 768px) { .sheet { inset: 0; margin: auto; border-radius: 8px; } }
</style>
