<script lang="ts">
	import { formatDayLong } from '#lib/i18n/dates.ts';
	import { excludeRecipe, getFreeTextSuggestions, includeRecipe, MAX_FREE_TEXT, MAX_NOTE, replaceMealRecipe, setMealFree, setMealNote, swapMeals } from '#lib/operations/revision.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { MealView, WeekView } from '#lib/operations/views.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import BottomSheet from './BottomSheet.svelte';
	import type { EditorStage } from './MealActionList.svelte';
	import RecipePicker from './RecipePicker.svelte';
	import SwapPicker from './SwapPicker.svelte';

	let { meal, week, stage, onStage, onClose }: {
		meal: MealView | null;
		week: WeekView;
		stage: EditorStage;
		onStage: (stage: EditorStage) => void;
		onClose: () => void;
	} = $props();

	const title = $derived(meal ? app.t('revision.title', { meal: app.t(`meal.${meal.mealType}` as const), day: formatDayLong(app.locale, meal.date) }) : '');
	const stageTitle = $derived.by(() => {
		if (stage === 'swap') return app.t('revision.swapTitle');
		if (stage === 'exclude') return app.t('revision.exclude');
		if (stage === 'picker' && meal?.kind === 'recipe') return app.t('revision.change');
		return title;
	});

	let freeText = $state('');
	let note = $state('');
	$effect(() => {
		if (!meal) return;
		if (stage === 'free') freeText = meal.freeText ?? '';
		if (stage === 'note') note = meal.note ?? '';
	});
	const freeSuggestions = $derived.by(() => {
		const result = getFreeTextSuggestions(app.db, app.ctx);
		return result.ok ? result.value : [];
	});

	// Close after saving, and after an error too: the notice sits behind the modal sheet.
	function done(_saved: boolean) {
		onClose();
	}

	// The undo of an exclusion lives in the sheet: a toast would sit behind the modal.
	let excluded = $state<{ id: string; name: string } | null>(null);
	$effect(() => {
		if (!meal) excluded = null;
	});

	function exclude() {
		if (!meal?.recipe) return;
		const recipe = meal.recipe;
		const result = excludeRecipe(app.db, app.ctx, recipe.id);
		if (!result.ok) {
			app.notify(app.t(errorKey(result.error)));
			return onClose();
		}
		app.update(() => {});
		excluded = { id: recipe.id, name: recipe.name };
		// Decision 1 of round 2: excluding opens the suggestions to replace the dish.
		onStage('picker');
	}

	function undoExclusion() {
		if (!excluded) return;
		const result = includeRecipe(app.db, app.ctx, excluded.id);
		if (!result.ok) {
			app.notify(app.t(errorKey(result.error)));
			return onClose();
		}
		app.update(() => {});
		excluded = null;
	}
</script>

<BottomSheet open={meal !== null} title={stageTitle} {onClose}>
	{#if meal}
		{#if stage === 'picker'}
			{#if excluded}
				<p class="excluded" role="status">
					<span>{app.t('toast.excluded', { recipe: excluded.name })}</span>
					<button type="button" onclick={undoExclusion}>{app.t('toast.undo')}</button>
				</p>
			{/if}
			<RecipePicker slotId={meal.slotId} mealType={meal.mealType} currentRecipeId={meal.recipe?.id ?? null} onPick={(id) => done(app.applyRevision(replaceMealRecipe(app.db, app.ctx, meal.slotId, id), app.t('toast.changed')))}>
				{#snippet actions()}
					<ul class="other">
						<li>
							<button type="button" disabled={app.settings.offline} onclick={() => onStage('free')}>
								<svg class="icon" aria-hidden="true"><use href="#icon-free" /></svg>{meal.kind === 'free' ? app.t('revision.editFree') : app.t('revision.free')}
							</button>
						</li>
						{#if meal.kind === 'recipe' && meal.canRate && !excluded}
							<li>
								<button type="button" disabled={app.settings.offline} onclick={() => onStage('exclude')}>
									<svg class="icon" aria-hidden="true"><use href="#icon-ban" /></svg>{app.t('revision.exclude')}
								</button>
							</li>
						{/if}
					</ul>
				{/snippet}
			</RecipePicker>
		{:else if stage === 'swap'}
			<SwapPicker {week} slotId={meal.slotId} onPick={(other) => done(app.applyRevision(swapMeals(app.db, app.ctx, meal.slotId, other), app.t('toast.swapped')))} />
		{:else if stage === 'exclude' && meal.recipe}
			<p class="body">{app.t('revision.excludeBody', { recipe: meal.recipe.name })}</p>
			<div class="buttons">
				<button type="button" class="text-button" onclick={() => onStage('picker')}>{app.t('common.back')}</button>
				<button type="button" class="text-button primary" disabled={app.settings.offline} onclick={exclude}>{app.t('revision.excludeConfirm')}</button>
			</div>
		{:else if stage === 'free'}
			<form onsubmit={(e) => { e.preventDefault(); done(app.applyRevision(setMealFree(app.db, app.ctx, meal.slotId, freeText), app.t('toast.free'))); }}>
				<label class="field">{app.t('revision.freeLabel')}
					<input type="text" bind:value={freeText} maxlength={MAX_FREE_TEXT} placeholder={app.t('revision.freeHint')} required />
				</label>
				{#if freeSuggestions.length}
					<div class="chips">{#each freeSuggestions as text (text)}<button type="button" class="chip" aria-pressed={freeText === text} onclick={() => (freeText = text)}>{text}</button>{/each}</div>
				{/if}
				<div class="buttons">
					<button type="button" class="text-button" onclick={() => onStage('picker')}>{app.t('common.back')}</button>
					<button type="submit" class="text-button primary" disabled={!freeText.trim() || app.settings.offline}>{app.t('common.save')}</button>
				</div>
			</form>
		{:else if stage === 'note'}
			<form onsubmit={(e) => { e.preventDefault(); done(app.applyRevision(setMealNote(app.db, app.ctx, meal.slotId, note), app.t(note.trim() ? 'toast.note' : 'toast.noteRemoved'))); }}>
				<label class="field">{app.t('revision.noteLabel')}
					<textarea bind:value={note} maxlength={MAX_NOTE} rows="3"></textarea>
				</label>
				<p class="meta-line">{app.t('revision.charsLeft', { count: MAX_NOTE - note.length })}</p>
				<div class="buttons">
					{#if meal.note}<button type="button" class="text-button" disabled={app.settings.offline} onclick={() => done(app.applyRevision(setMealNote(app.db, app.ctx, meal.slotId, null), app.t('toast.noteRemoved')))}>{app.t('revision.removeNote')}</button>{/if}
					<button type="submit" class="text-button primary" disabled={app.settings.offline}>{app.t('common.save')}</button>
				</div>
			</form>
		{/if}
	{/if}
</BottomSheet>

<style>
	.other { margin: 0; padding: 0; list-style: none; }
	.other li + li { border-top: 1px solid var(--rule); }
	.other button { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 48px; padding: 8px 0; border: 0; background: none; color: var(--ink); font: 400 1rem/1.3 var(--text-font); text-align: left; cursor: pointer; }
	.other button:disabled { color: var(--muted); cursor: not-allowed; }
	.excluded { display: flex; align-items: center; gap: 12px; margin: 8px 0 4px; padding: 4px 4px 4px 12px; border: 1px solid var(--free-border); border-radius: 8px; background: var(--free-surface); font-size: 0.875rem; }
	.excluded span { flex: 1; }
	.excluded button { min-height: 44px; padding: 0 10px; border: 0; background: none; color: var(--green); font: 700 0.875rem/1 var(--text-font); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	.body { margin: 8px 0 16px; color: var(--body-text); }
	.buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin: 16px 0 4px; }
	.field { display: grid; gap: 6px; margin: 8px 0; font-size: 0.875rem; font-weight: 700; }
	.field input, .field textarea { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 1rem/1.4 var(--text-font); resize: vertical; }
	.field input:focus-visible, .field textarea:focus-visible { outline: 3px solid var(--green); outline-offset: 1px; }
	.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0; }
	.chip { min-height: 44px; padding: 8px 14px; border: 1px solid var(--free-border); border-radius: 8px; background: var(--free-surface); color: var(--ink); font: 400 0.875rem/1.3 var(--text-font); cursor: pointer; }
	.chip[aria-pressed='true'] { border-color: var(--green); color: var(--green); font-weight: 700; }
</style>
