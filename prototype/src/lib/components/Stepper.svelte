<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';

	// Generic − value + control with a visible label; same look as ServingsStepper.
	let { label, value, min = 0, max, disabled = false, onChange }: { label: string; value: number; min?: number; max: number; disabled?: boolean; onChange: (value: number) => void } = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
	<span class="label">{label}</span>
	<button type="button" class="step" aria-label={app.t('common.less', { label })} disabled={disabled || value <= min} onclick={() => onChange(value - 1)}>−</button>
	<strong aria-live="polite">{value}</strong>
	<button type="button" class="step" aria-label={app.t('common.more', { label })} disabled={disabled || value >= max} onclick={() => onChange(value + 1)}>+</button>
</div>

<style>
	.stepper { display: flex; align-items: center; gap: 10px; min-height: 48px; }
	.label { flex: 1; min-width: 0; }
	strong { min-width: 2ch; text-align: center; }
	.step { flex: none; width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 700 1.25rem/1 var(--text-font); cursor: pointer; }
	.step:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
