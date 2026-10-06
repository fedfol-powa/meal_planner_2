<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';

	let { value, min = 1, max, disabled = false, onChange }: { value: number; min?: number; max: number; disabled?: boolean; onChange: (value: number) => void } = $props();
</script>

<div class="servings">
	<span>{app.t('recipe.servingsLabel')}</span>
	<button type="button" class="step" aria-label={app.t('recipe.lessServings')} disabled={disabled || value <= min} onclick={() => onChange(value - 1)}>−</button>
	<strong aria-live="polite">{value}</strong>
	<button type="button" class="step" aria-label={app.t('recipe.moreServings')} disabled={disabled || value >= max} onclick={() => onChange(value + 1)}>+</button>
</div>

<style>
	.servings { display: flex; align-items: center; gap: 12px; margin: 8px 0 4px; font-weight: 700; }
	strong { min-width: 2ch; text-align: center; }
	.step { width: 44px; height: 44px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 700 1.25rem/1 var(--text-font); cursor: pointer; }
	.step:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
