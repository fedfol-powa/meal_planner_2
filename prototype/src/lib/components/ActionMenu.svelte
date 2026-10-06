<script lang="ts">
	import type { Snippet } from 'svelte';

	// The "…" menu at the top right of a page (round 3 pattern, shared from round 5). Items are buttons with
	// role="menuitem"; the menu closes before an item acts.
	let { label, items }: { label: string; items: Snippet<[(action: () => unknown) => void]> } = $props();

	let open = $state(false);
	let button: HTMLButtonElement | undefined = $state();
	let panel: HTMLDivElement | undefined = $state();

	function run(action: () => unknown) {
		open = false;
		action();
	}

	$effect(() => {
		if (!open) return;
		const onPointer = (e: PointerEvent) => {
			const target = e.target as Node;
			if (!panel?.contains(target) && !button?.contains(target)) open = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				open = false;
				button?.focus();
			}
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="menu-wrap">
	<button bind:this={button} type="button" class="menu-toggle" aria-haspopup="menu" aria-expanded={open} aria-label={label} onclick={() => (open = !open)}>
		<svg class="icon" aria-hidden="true"><use href="#icon-more" /></svg>
	</button>
	{#if open}
		<div class="menu" role="menu" bind:this={panel}>{@render items(run)}</div>
	{/if}
</div>

<style>
	.menu-wrap { position: relative; }
	.menu-toggle { display: grid; place-items: center; width: 44px; height: 44px; margin-right: -8px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--ink); cursor: pointer; }
	.menu-toggle .icon { width: 26px; height: 26px; fill: currentColor; stroke-width: 1.2; }
	.menu-toggle[aria-expanded='true'] { color: var(--green); }
	.menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 15; display: flex; flex-direction: column; min-width: 220px; padding: 6px 0; background: var(--paper); border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 15%); }
	.menu :global(button), .menu :global(a) { min-height: 44px; padding: 10px 16px; border: 0; background: none; color: var(--ink); font: 400 1rem/1.3 var(--text-font); text-align: left; text-decoration: none; cursor: pointer; }
	.menu :global(button:hover:not(:disabled)), .menu :global(a:hover) { background: var(--canvas); }
	.menu :global(button:disabled) { color: var(--muted); cursor: not-allowed; }
	.menu :global(.danger) { color: #b3261e; }
	.menu :global(small) { font-size: 0.75rem; }
</style>
