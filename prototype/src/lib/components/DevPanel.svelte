<script lang="ts">
	import { app } from '#lib/store/app.svelte.ts';
	import { LOCALES, type Locale, type MeasurementSystem } from '#lib/domain/types.ts';
	import type { RatingVariant, ScenarioId } from '#lib/store/persistence.ts';

	let dialog: HTMLDialogElement;
	let scenario = $state<ScenarioId>(app.settings.scenario);
	const scenarios: ScenarioId[] = ['standard', 'new_family', 'empty_today'];
	const userFamilies = $derived(app.db.families.filter((f) => f.members.some((m) => m.userId === app.user.id)));
</script>

<button class="dev-toggle" type="button" onclick={() => dialog.showModal()}>
	<svg class="icon" aria-hidden="true"><use href="#icon-tools" /></svg><span class="toggle-label">{app.t('dev.open')}</span>
</button>

<dialog class="dev-panel" bind:this={dialog} aria-labelledby="dev-title">
	<header>
		<h2 id="dev-title">{app.t('dev.title')}</h2>
		<button type="button" class="text-button" onclick={() => dialog.close()}>{app.t('common.close')}</button>
	</header>
	<p class="meta-line">{app.t('dev.disclaimer')}</p>

	<label>{app.t('dev.user')}
		<select value={app.user.id} onchange={(e) => app.switchUser(e.currentTarget.value)}>
			{#each app.db.users as user (user.id)}<option value={user.id}>{user.displayName} ({user.globalRoles.join(', ') || '—'})</option>{/each}
		</select>
	</label>
	<label>{app.t('dev.family')}
		<select value={app.settings.familyId} onchange={(e) => { const id = e.currentTarget.value; app.update((s) => (s.settings.familyId = id)); app.selectedDate = null; }}>
			{#each userFamilies as family (family.id)}<option value={family.id}>{family.name}</option>{/each}
		</select>
	</label>
	<label>{app.t('dev.language')}
		<select value={app.locale} onchange={(e) => { const locale = e.currentTarget.value as Locale; app.update((s) => { const u = s.db.users.find((x) => x.id === s.settings.userId); if (u) u.locale = locale; }); }}>
			{#each LOCALES as locale (locale)}<option value={locale}>{locale}</option>{/each}
		</select>
	</label>
	{#if app.family}
		<label>{app.t('dev.units')}
			<select value={app.family.measurementSystem} onchange={(e) => { const system = e.currentTarget.value as MeasurementSystem; app.update((s) => { const f = s.db.families.find((x) => x.id === s.settings.familyId); if (f) f.measurementSystem = system; }); }}>
				<option value="metric">{app.t('dev.units.metric')}</option>
				<option value="uk_imperial">{app.t('dev.units.uk_imperial')}</option>
			</select>
		</label>
	{/if}
	<label>{app.t('dev.now')}
		<input type="datetime-local" value={app.settings.now} onchange={(e) => { const now = e.currentTarget.value.slice(0, 16); if (now) app.update((s) => (s.settings.now = now)); }} />
	</label>
	<div class="row">
		<label>{app.t('dev.scenario')}
			<select bind:value={scenario}>
				{#each scenarios as id (id)}<option value={id}>{app.t(`dev.scenario.${id}` as const)}</option>{/each}
			</select>
		</label>
		<button type="button" class="text-button" onclick={() => app.setScenario(scenario)}>{app.t('dev.applyScenario')}</button>
	</div>
	<label class="check"><input type="checkbox" checked={app.settings.offline} onchange={(e) => { const offline = e.currentTarget.checked; app.update((s) => (s.settings.offline = offline)); }} />{app.t('dev.offline')}</label>
	<fieldset>
		<legend>{app.t('dev.ratingVariant')}</legend>
		{#each ['row', 'inline', 'panel'] as const as variant (variant)}
			<label class="check"><input type="radio" name="rating-variant" value={variant} checked={app.settings.ratingVariant === variant} onchange={() => app.update((s) => (s.settings.ratingVariant = variant as RatingVariant))} />{app.t(`dev.ratingVariant.${variant}` as const)}</label>
		{/each}
	</fieldset>
	<p class="meta-line">{app.t('dev.demoData')}</p>
	<button type="button" class="text-button" onclick={() => app.reset()}>{app.t('dev.reset')}</button>
</dialog>

<style>
	.dev-toggle { position: fixed; bottom: calc(88px + env(safe-area-inset-bottom)); right: 8px; z-index: 20; display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 4px 10px; border: 1px dashed var(--ink); border-radius: 8px; background: #fff8d6; color: var(--ink); font: 700 0.75rem/1.3 var(--text-font); opacity: 0.85; cursor: pointer; }
	.dev-toggle .icon { width: 14px; height: 14px; }
	@media (max-width: 767px) { .toggle-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); } }
	.dev-panel { width: min(100% - 32px, 420px); max-height: calc(100dvh - 32px); padding: 20px; border: 2px dashed var(--ink); border-radius: 8px; background: #fffdf2; }
	.dev-panel::backdrop { background: rgb(0 0 0 / 30%); }
	header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	h2 { margin: 0; font: 400 1.25rem/1.3 var(--heading-font); }
	label, fieldset { display: grid; gap: 4px; margin: 0 0 14px; font-size: 0.875rem; font-weight: 700; }
	fieldset { border: 0; padding: 0; }
	select, input[type='datetime-local'] { min-height: 44px; padding: 8px; border: 1px solid var(--ink); border-radius: 8px; background: #fff; font-weight: 400; }
	.check { display: flex; align-items: center; gap: 8px; font-weight: 400; min-height: 44px; }
	.row { display: flex; align-items: end; gap: 8px; }
	.row label { flex: 1; margin: 0; }
</style>
