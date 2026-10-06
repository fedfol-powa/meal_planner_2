<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { LOCALES, type Locale } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { createUser, findUserByEmail, isEmail } from '#lib/operations/onboarding.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Simulated Google account (round 4): no real authentication in the prototype.
	const GOOGLE = { email: 'giulia@example.com', name: 'Giulia' };

	let step = $state<'start' | 'sent' | 'name'>('start');
	let email = $state('');
	let name = $state('');
	let emailError = $state(false);

	// Only internal paths: the link may come from an invitation or from a page that needs signing in.
	const next = $derived.by(() => {
		const value = page.url.searchParams.get('next');
		return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/welcome') ? value : null;
	});

	$effect(() => {
		if (app.signedIn && (app.family || next?.startsWith('/invite/') || next?.startsWith('/you'))) goto(next ?? '/menu', { replaceState: true });
	});

	function sendLink(event: SubmitEvent) {
		event.preventDefault();
		emailError = !isEmail(email);
		if (!emailError) step = 'sent';
	}

	function openLink() {
		const user = findUserByEmail(app.db, email);
		if (user) app.signIn(user.id);
		else step = 'name';
	}

	function register(event: SubmitEvent, address: string, displayName: string) {
		event.preventDefault();
		const result = createUser(app.db, address, displayName, app.settings.guestLocale);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.signIn(result.value.userId);
	}

	function google() {
		const user = findUserByEmail(app.db, GOOGLE.email);
		if (user) return app.signIn(user.id);
		const result = createUser(app.db, GOOGLE.email, GOOGLE.name, app.settings.guestLocale);
		if (result.ok) app.signIn(result.value.userId);
	}

	const setGuestLocale = (locale: Locale) => app.update((s) => (s.settings.guestLocale = locale));
	const LOCALE_NAMES: Record<Locale, string> = { 'it-IT': 'Italiano', 'en-GB': 'English (UK)' };
</script>

<section class="secondary-view app-view welcome" aria-labelledby="welcome-title">
	<div class="column">
		<p class="brand">App Famiglia</p>
		{#if !app.signedIn}
			{#if step === 'start'}
				<h1 id="welcome-title">{app.t('welcome.title')}</h1>
				<p class="lead">{app.t('welcome.lead')}</p>
				<form onsubmit={sendLink} novalidate>
					<label class="field">{app.t('welcome.email')}
						<input type="email" autocomplete="email" inputmode="email" bind:value={email} aria-invalid={emailError} aria-describedby={emailError ? 'email-error' : undefined} />
					</label>
					{#if emailError}<p class="error" id="email-error">{app.t('welcome.emailInvalid')}</p>{/if}
					<button type="submit" class="text-button primary wide">{app.t('welcome.sendLink')}</button>
				</form>
				<p class="or">{app.t('welcome.or')}</p>
				<button type="button" class="text-button wide" onclick={google}>{app.t('welcome.google')}</button>
				<p class="meta-line simulated">{app.t('welcome.simulated')}</p>
			{:else if step === 'sent'}
				<h1 id="welcome-title">{app.t('welcome.sent.title')}</h1>
				<p class="lead">{app.t('welcome.sent.body', { email })}</p>
				<button type="button" class="text-button primary wide" onclick={openLink}>{app.t('welcome.sent.open')}</button>
				<button type="button" class="text-button wide" onclick={() => (step = 'start')}>{app.t('welcome.sent.change')}</button>
			{:else}
				<h1 id="welcome-title">{app.t('welcome.name.title')}</h1>
				<p class="lead">{app.t('welcome.name.body')}</p>
				<form onsubmit={(e) => register(e, email, name)}>
					<label class="field">{app.t('welcome.name.label')}
						<input type="text" autocomplete="given-name" maxlength="40" bind:value={name} required />
					</label>
					<button type="submit" class="text-button primary wide" disabled={!name.trim()}>{app.t('welcome.name.continue')}</button>
				</form>
			{/if}
			<div class="languages" role="group" aria-label={app.t('preferences.language')}>
				{#each LOCALES as locale (locale)}
					<button type="button" class="link-button" aria-pressed={app.settings.guestLocale === locale} onclick={() => setGuestLocale(locale)} lang={locale}>{LOCALE_NAMES[locale]}</button>
				{/each}
			</div>
		{:else}
			<h1 id="welcome-title">{app.t('welcome.noFamily.title', { name: app.user.displayName })}</h1>
			<p class="lead">{app.t('welcome.noFamily.body')}</p>
			<a class="text-button primary wide" href="/welcome/family">{app.t('welcome.noFamily.create')}</a>
			<p class="meta-line hint">{app.t('welcome.noFamily.invited')}</p>
			<div class="footer-links">
				<a class="link-inline" href="/you/preferences">{app.t('you.preferences')}</a>
				<button type="button" class="link-button" onclick={() => app.signOut()}>{app.t('account.signOut')}</button>
			</div>
		{/if}
	</div>
</section>

<style>
	.welcome { padding-top: max(32px, env(safe-area-inset-top)); }
	.column { max-width: 420px; margin-inline: auto; }
	.brand { margin: 0 0 32px; color: var(--green); font: 700 0.875rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
	h1 { margin: 0 0 12px; font: 400 1.75rem/1.25 var(--heading-font); }
	.lead { margin: 0 0 24px; color: var(--body-text); }
	.wide { width: 100%; margin-bottom: 12px; box-sizing: border-box; }
	.or { margin: 4px 0 16px; color: var(--muted); text-align: center; font-size: 0.875rem; }
	.error { margin: -8px 0 12px; color: #b3261e; font-size: 0.875rem; }
	.simulated, .hint { margin-top: 4px; }
	.languages, .footer-links { display: flex; gap: 16px; justify-content: center; margin-top: 32px; }
	.link-button { min-height: 44px; padding: 0 4px; border: 0; background: none; color: var(--green); font: 700 0.875rem/1.3 var(--text-font); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
	.link-button[aria-pressed='true'] { color: var(--ink); text-decoration: none; }
	.footer-links { align-items: center; }
</style>
