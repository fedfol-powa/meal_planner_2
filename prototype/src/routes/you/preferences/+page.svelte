<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { LOCALES, type Locale } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { updateProfile } from '#lib/operations/account.ts';
	import { DISPLAY_NAME_MAX } from '#lib/operations/onboarding.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Personal preferences (spec section 7): name and language, independent of the family.
	const LOCALE_NAMES: Record<Locale, string> = { 'it-IT': 'Italiano', 'en-GB': 'English (UK)' };
	let name = $state(app.user.displayName);

	function save(change: { displayName?: string; locale?: Locale }) {
		const result = updateProfile(app.db, app.ctx, change);
		if (!result.ok) {
			name = app.user.displayName;
			return app.notify(app.t(errorKey(result.error)));
		}
		app.update(() => {});
	}

	function signOut() {
		app.signOut();
		goto('/welcome');
	}
</script>

<section class="secondary-view app-view" aria-labelledby="preferences-title">
	<div class="page-column">
		<PageHeader back="/you" backLabel={app.t('nav.you')} title={app.t('you.preferences')} titleId="preferences-title" />
		<section class="settings-card">
			<label class="field">{app.t('preferences.name')}
				<input type="text" maxlength={DISPLAY_NAME_MAX} bind:value={name} disabled={app.settings.offline} onchange={() => name.trim() !== app.user.displayName && save({ displayName: name })} />
			</label>
			<p class="field-static"><span>{app.t('preferences.email')}</span>{app.user.email}</p>
		</section>
		<section class="settings-card" aria-labelledby="language-title">
			<h2 id="language-title">{app.t('preferences.language')}</h2>
			{#each LOCALES as locale (locale)}
				<label class="choice" lang={locale}><input type="radio" name="locale" checked={app.locale === locale} disabled={app.settings.offline} onchange={() => save({ locale })} />{LOCALE_NAMES[locale]}</label>
			{/each}
			<p class="meta-line">{app.t('preferences.languageHint')}</p>
		</section>
		<button type="button" class="text-button" onclick={signOut}>{app.t('account.signOut')}</button>
		<div class="danger-zone">
			<a class="text-button danger-outline" href="/you/account/delete">{app.t('account.delete')}</a>
		</div>
	</div>
</section>

<style>
	.field-static { display: grid; gap: 6px; margin: 0; font-size: 1rem; overflow-wrap: anywhere; }
	.field-static span { font-size: 0.875rem; font-weight: 700; }
</style>
