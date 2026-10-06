<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';

	// Confirmation of an irreversible action, in the variant chosen in the Prova panel (round 4):
	// "button" confirms after the summary; "type" enables the button once `expected` is typed.
	let { label, expected, disabled = false, onConfirm }: { label: string; expected: string; disabled?: boolean; onConfirm: () => void } = $props();
	let typed = $state('');
	const uid = $props.id();
	const matches = $derived(app.variants.dangerConfirm === 'button' || typed.trim().toLocaleLowerCase(app.locale) === expected.toLocaleLowerCase(app.locale));
</script>

<div class="confirm">
	{#if app.variants.dangerConfirm === 'type'}
		<label for="{uid}-typed">{app.t('danger.typeToConfirm', { text: expected })}</label>
		<input id="{uid}-typed" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" bind:value={typed} {disabled} />
	{/if}
	<button type="button" class="text-button danger" disabled={disabled || !matches} onclick={onConfirm}>{label}</button>
</div>

<style>
	.confirm { display: grid; gap: 8px; margin-top: 20px; }
	label { font-size: 0.875rem; font-weight: 700; }
	input { min-height: 44px; padding: 8px 12px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); }
</style>
