<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';

	// A command or address to copy (round 6): monospace, wraps on narrow screens, select-all fallback on http.
	let { value, label }: { value: string; label: string } = $props();
	let copied = $state(false);
	let code: HTMLElement | undefined = $state();

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			const range = document.createRange();
			if (code) range.selectNodeContents(code);
			getSelection()?.removeAllRanges();
			getSelection()?.addRange(range);
			document.execCommand('copy');
		}
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="copy-field">
	<code bind:this={code} aria-label={label}>{value}</code>
	<button type="button" class="text-button" onclick={copy}>{copied ? app.t('copy.copied') : app.t('copy.copy')}</button>
</div>

<style>
	.copy-field { display: flex; align-items: flex-start; gap: 8px; margin: 8px 0 12px; }
	code { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); font: 0.8125rem/1.5 ui-monospace, 'SF Mono', Menlo, monospace; overflow-wrap: anywhere; user-select: all; }
	.text-button { flex: none; }
</style>
