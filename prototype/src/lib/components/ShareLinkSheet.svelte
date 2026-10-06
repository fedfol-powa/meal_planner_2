<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import { app } from '#lib/store/app.svelte.ts';

	// Fallback when Web Share is unavailable (http on the LAN preview): the link to copy, as in the shopping list.
	let { url, onClose }: { url: string | null; onClose: () => void } = $props();
	let copied = $state(false);
	let input: HTMLInputElement | undefined = $state();

	async function copy() {
		try {
			await navigator.clipboard.writeText(url ?? '');
		} catch {
			input?.select();
			document.execCommand('copy');
		}
		copied = true;
	}
	$effect(() => {
		if (url) copied = false;
	});
</script>

<BottomSheet open={url !== null} title={app.t('invite.shareSheet.title')} {onClose}>
	<p class="meta-line">{app.t('invite.shareSheet.body')}</p>
	<input bind:this={input} class="link" readonly value={url ?? ''} aria-label={app.t('invite.link')} />
	<button type="button" class="text-button primary wide" onclick={copy}>{copied ? app.t('shopping.copied') : app.t('shopping.copy')}</button>
</BottomSheet>

<style>
	.link { width: 100%; min-height: 44px; margin: 8px 0 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); font-size: 0.875rem; }
	.wide { width: 100%; }
</style>
