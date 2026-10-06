<script lang="ts" module>
	export type EditorStage = 'menu' | 'picker' | 'swap' | 'free' | 'note' | 'exclude';
</script>

<script lang="ts">
	import { MAX_SERVINGS } from '#lib/operations/revision.ts';
	import type { MealView } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import ServingsStepper from './ServingsStepper.svelte';

	// Same list in the bottom sheet and in the card panel (round 2 variants).
	let { meal, onOpen, onAnother, onServings }: {
		meal: MealView;
		onOpen: (stage: Exclude<EditorStage, 'menu'>) => void;
		onAnother: () => void;
		onServings: (servings: number) => void;
	} = $props();

	const offline = $derived(app.settings.offline);
	const SAVE_DELAY_MS = 800;
	// Servings are saved once the taps stop, so one undo restores the whole adjustment.
	let pending = $state<number | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function flush() {
		clearTimeout(timer);
		if (pending !== null && pending !== meal.servings) onServings(pending);
		pending = null;
	}
	function stepServings(value: number) {
		pending = value;
		clearTimeout(timer);
		timer = setTimeout(flush, SAVE_DELAY_MS);
	}
	// Closing the sheet or panel saves what is still pending.
	$effect(() => flush);
</script>

<ul class="actions">
	<li>
		<button type="button" disabled={offline} onclick={() => onOpen('picker')}>
			<svg class="icon" aria-hidden="true"><use href="#icon-search" /></svg>{meal.kind === 'recipe' ? app.t('revision.change') : app.t('meal.chooseRecipe')}
		</button>
	</li>
	<li>
		<button type="button" disabled={offline} onclick={onAnother}>
			<svg class="icon" aria-hidden="true"><use href="#icon-shuffle" /></svg>{app.t('revision.another')}
		</button>
	</li>
	{#if meal.kind === 'recipe'}
		<li class="stepper-row"><ServingsStepper value={pending ?? meal.servings} max={MAX_SERVINGS} disabled={offline} onChange={stepServings} /></li>
	{/if}
	<li>
		<button type="button" disabled={offline} onclick={() => onOpen('swap')}>
			<svg class="icon" aria-hidden="true"><use href="#icon-swap" /></svg>{app.t('revision.swap')}
		</button>
	</li>
	<li>
		<button type="button" disabled={offline} onclick={() => onOpen('free')}>
			<svg class="icon" aria-hidden="true"><use href="#icon-free" /></svg>{meal.kind === 'free' ? app.t('revision.editFree') : app.t('revision.free')}
		</button>
	</li>
	<li>
		<button type="button" disabled={offline} onclick={() => onOpen('note')}>
			<svg class="icon" aria-hidden="true"><use href="#icon-note" /></svg>{meal.note ? app.t('revision.editNote') : app.t('revision.addNote')}
		</button>
	</li>
	{#if meal.kind === 'recipe' && meal.canRate}
		<li>
			<button type="button" disabled={offline} onclick={() => onOpen('exclude')}>
				<svg class="icon" aria-hidden="true"><use href="#icon-ban" /></svg>{app.t('revision.exclude')}
			</button>
		</li>
	{/if}
</ul>
{#if offline}<p class="meta-line">{app.t('offline.blocked')}</p>{/if}

<style>
	.actions { margin: 0; padding: 0; list-style: none; }
	.actions li { border-bottom: 1px solid var(--rule); }
	.actions li:last-child { border-bottom: 0; }
	.actions button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 8px 0; border: 0; background: none; color: var(--ink); font: 400 1rem/1.3 var(--text-font); text-align: left; cursor: pointer; }
	.actions button:disabled { color: var(--muted); cursor: not-allowed; }
	.actions button:focus-visible { outline-offset: -3px; }
	.stepper-row { padding: 2px 0 6px; }
	.stepper-row :global(.servings) { margin: 0; font-weight: 400; }
</style>
