<script lang="ts">
	import DinersGrid from '#lib/components/DinersGrid.svelte';
	import IngredientRestrictions from '#lib/components/IngredientRestrictions.svelte';
	import MealRules from '#lib/components/MealRules.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import StateNotice from '#lib/components/StateNotice.svelte';
	import Stepper from '#lib/components/Stepper.svelte';
	import { CREA_RANGES } from '#lib/domain/settings.ts';
	import { FOOD_GROUPS, type FamilySettings, type MeasurementSystem } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { OpResult } from '#lib/operations/context.ts';
	import { FAMILY_NAME_MAX, roleOf, renameFamily, setFamilyBook, setMeasurementSystem, updateFamilySettings } from '#lib/operations/family.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Family settings (round 4): saved at every change, only administrators edit, members read.
	const family = $derived(app.family);
	const editable = $derived(!!family && roleOf(family, app.user.id) === 'family_admin' && !app.settings.offline);
	let name = $state(app.family?.name ?? '');
	$effect(() => {
		name = app.family?.name ?? '';
	});

	function act(result: OpResult<unknown>): boolean {
		if (!result.ok) {
			app.notify(app.t(errorKey(result.error)));
			return false;
		}
		app.update(() => {});
		return true;
	}

	const change = (fn: (s: FamilySettings) => void) => act(updateFamilySettings(app.db, app.ctx, fn));

	function saveName() {
		if (name.trim() && name.trim() !== family?.name) act(renameFamily(app.db, app.ctx, name));
		else name = family?.name ?? '';
	}
</script>

<section class="secondary-view app-view" aria-labelledby="settings-title">
	<div class="page-column">
		<PageHeader back="/profile" backLabel={app.t('nav.profile')} title={app.t('profile.settings')} titleId="settings-title" />
		{#if !family}
			<StateNotice title={app.t('error.forbidden')} />
		{:else}
			<p class="meta-line intro">{app.t(editable || app.settings.offline ? 'settings.intro' : 'settings.readOnly')}</p>

			<section class="settings-card">
				<label class="field">{app.t('settings.name')}
					<input type="text" maxlength={FAMILY_NAME_MAX} bind:value={name} disabled={!editable} onchange={saveName} />
				</label>
			</section>

			<section class="settings-card" aria-labelledby="diners-title">
				<h2 id="diners-title">{app.t('settings.diners')}</h2>
				<p class="meta-line">{app.t('settings.dinersHint')}</p>
				<DinersGrid settings={family.settings} {editable} onChange={(meal, weekday, slot) => change((s) => (s.slots[meal][weekday] = slot))} />
			</section>

			<section class="settings-card" aria-labelledby="rules-title">
				<h2 id="rules-title">{app.t('settings.rules')}</h2>
				<MealRules rules={family.settings.rules} {editable} onAdd={(rule) => change((s) => s.rules.push(rule))} onRemove={(id) => change((s) => (s.rules = s.rules.filter((r) => r.id !== id)))} />
			</section>

			<section class="settings-card" aria-labelledby="ingredients-title">
				<h2 id="ingredients-title">{app.t('settings.ingredients')}</h2>
				<IngredientRestrictions {editable} />
			</section>

			<section class="settings-card" aria-labelledby="books-title">
				<h2 id="books-title">{app.t('settings.books')}</h2>
				<p class="meta-line">{app.t('settings.booksHint')}</p>
				{#each app.db.books as book (book.id)}
					<label class="choice"><input type="checkbox" checked={family.bookIds.includes(book.id)} disabled={!editable} onchange={(e) => act(setFamilyBook(app.db, app.ctx, book.id, e.currentTarget.checked))} />{book.title}</label>
				{/each}
			</section>

			<section class="settings-card" aria-labelledby="units-title">
				<h2 id="units-title">{app.t('settings.units')}</h2>
				{#each ['metric', 'uk_imperial'] as const as system (system)}
					<label class="choice"><input type="radio" name="units" checked={family.measurementSystem === system} disabled={!editable} onchange={() => act(setMeasurementSystem(app.db, app.ctx, system as MeasurementSystem))} />{app.t(`settings.units.${system}` as const)}</label>
				{/each}
			</section>

			<details class="settings-card advanced">
				<summary><h2>{app.t('settings.advanced')}</h2></summary>
				<h3>{app.t('settings.knownNew')}</h3>
				<p class="meta-line">{app.t('settings.knownNewHint')}</p>
				<Stepper label={app.t('settings.known')} value={family.settings.knownNew.known} max={14} disabled={!editable} onChange={(n) => change((s) => (s.knownNew.known = n))} />
				<Stepper label={app.t('settings.new')} value={family.settings.knownNew.new} max={14} disabled={!editable} onChange={(n) => change((s) => (s.knownNew.new = n))} />
				<Stepper label={app.t('settings.tolerance')} value={family.settings.knownNew.tolerance} max={3} disabled={!editable} onChange={(n) => change((s) => (s.knownNew.tolerance = n))} />
				<h3>{app.t('settings.groups')}</h3>
				<p class="meta-line">{app.t('settings.groupsHint')}</p>
				<ul class="row-list groups">
					{#each FOOD_GROUPS as g (g)}
						{@const range = family.settings.groupRanges[g]}
						<li>
							<span class="row-main">{app.t(`food.${g}` as const)}<small>{app.t('settings.groupDefault', { min: CREA_RANGES[g].min, max: CREA_RANGES[g].max })}</small></span>
							<div class="range">
								<Stepper label={app.t('settings.min')} value={range.min} max={range.max} disabled={!editable} onChange={(n) => change((s) => (s.groupRanges[g].min = n))} />
								<Stepper label={app.t('settings.max')} value={range.max} min={range.min} max={14} disabled={!editable} onChange={(n) => change((s) => (s.groupRanges[g].max = n))} />
							</div>
						</li>
					{/each}
				</ul>
			</details>

			{#if roleOf(family, app.user.id) === 'family_admin'}
				<div class="danger-zone">
					<a class="text-button danger-outline" href="/profile/family/delete?family={family.id}">{app.t('settings.deleteFamily')}</a>
				</div>
			{/if}
		{/if}
	</div>
</section>

<style>
	.intro { margin-bottom: 16px; }
	.advanced summary { display: flex; align-items: center; justify-content: space-between; min-height: 44px; cursor: pointer; list-style: none; }
	.advanced summary::-webkit-details-marker { display: none; }
	.advanced summary::after { content: ''; width: 8px; height: 8px; margin-right: 6px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: rotate(45deg); }
	.advanced[open] summary::after { transform: rotate(225deg); }
	.advanced summary h2 { margin: 0; }
	h3 { margin: 20px 0 4px; font-size: 1rem; }
	.groups li { flex-wrap: wrap; padding: 8px 0; }
	.groups .row-main { flex-basis: 100%; }
	.range { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; }
</style>
