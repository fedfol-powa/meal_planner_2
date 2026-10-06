<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import type { MeasurementSystem } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { FAMILY_NAME_MAX } from '#lib/operations/family.ts';
	import { createFamily, generateFirstWeeks } from '#lib/operations/onboarding.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Minimal wizard (round 4): name and units, then the first generation; the rest from the settings.
	let name = $state('');
	let system = $state<MeasurementSystem>(app.locale === 'en-GB' ? 'uk_imperial' : 'metric');
	const hasFamilies = $derived(app.db.families.some((f) => f.members.some((m) => m.userId === app.user.id)));

	$effect(() => {
		if (!app.signedIn) goto('/welcome', { replaceState: true });
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const created = createFamily(app.db, app.ctx, name, system);
		if (!created.ok) return app.notify(app.t(errorKey(created.error)));
		const familyId = created.value.familyId;
		app.switchFamily(familyId);
		const generated = generateFirstWeeks(app.db, { ...app.ctx, familyId });
		app.update(() => {});
		app.notify(app.t(generated.ok ? 'wizard.generated' : 'wizard.createdOnly'));
		goto('/menu');
	}
</script>

<section class="secondary-view app-view" aria-labelledby="wizard-title">
	<div class="page-column narrow">
		<PageHeader back={hasFamilies ? '/you' : '/welcome'} backLabel={hasFamilies ? app.t('nav.you') : app.t('common.back')} title={app.t('wizard.title')} titleId="wizard-title" />
		<form class="settings-card" onsubmit={submit}>
			<label class="field">{app.t('wizard.name')}
				<input type="text" maxlength={FAMILY_NAME_MAX} placeholder={app.t('wizard.namePlaceholder')} bind:value={name} required />
			</label>
			<fieldset>
				<legend>{app.t('settings.units')}</legend>
				<label class="choice"><input type="radio" name="units" value="metric" bind:group={system} />{app.t('settings.units.metric')}</label>
				<label class="choice"><input type="radio" name="units" value="uk_imperial" bind:group={system} />{app.t('settings.units.uk_imperial')}</label>
			</fieldset>
			<button type="submit" class="text-button primary wide" disabled={!name.trim() || app.settings.offline}>{app.t('wizard.generate')}</button>
			<p class="meta-line">{app.t('wizard.later')}</p>
		</form>
	</div>
</section>

<style>
	.narrow { max-width: 480px; }
	fieldset { margin: 0 0 20px; padding: 0; border: 0; }
	legend { margin-bottom: 4px; font-size: 0.875rem; font-weight: 700; }
	.wide { width: 100%; margin: 0 0 12px; }
</style>
