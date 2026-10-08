<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { AGENT_CLIENTS, type AgentClient } from '#lib/domain/types.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { authorizeAgent } from '#lib/operations/agents.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Consent opened by an agent in the browser (round 6, simulated OAuth): who connects, as whom, what it
	// can and cannot do. Signing in first goes through /welcome (layout redirect).
	const raw = $derived(page.url.searchParams.get('client') ?? '');
	const client = $derived((AGENT_CLIENTS as readonly string[]).includes(raw) ? (raw as AgentClient) : null);
	const name = $derived(client ? app.t(`client.${client}` as const) : '');
	let outcome = $state<'asking' | 'allowed' | 'denied'>('asking');

	function allow() {
		if (!client) return;
		const result = authorizeAgent(app.db, app.ctx, client);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		outcome = 'allowed';
	}

	function switchAccount() {
		app.signOut();
		goto(`/welcome?next=${encodeURIComponent(page.url.pathname + page.url.search)}`);
	}
</script>

<section class="secondary-view app-view authorize" aria-labelledby="authorize-title">
	<div class="column">
		<p class="brand">Cosa si mangia?</p>
		{#if !client}
			<h1 id="authorize-title">{app.t('authorize.unknown')}</h1>
			<p class="lead">{app.t('authorize.unknownBody')}</p>
		{:else if outcome === 'allowed'}
			<h1 id="authorize-title">{app.t('authorize.done')}</h1>
			<p class="lead">{app.t('authorize.doneBody', { client: name })}</p>
			<a class="link-inline" href="/profile/agents">{app.t('authorize.toAgents')}</a>
		{:else if outcome === 'denied'}
			<h1 id="authorize-title">{app.t('authorize.denied')}</h1>
			<p class="lead">{app.t('authorize.deniedBody', { client: name })}</p>
		{:else}
			<h1 id="authorize-title">{app.t('authorize.title', { client: name })}</h1>
			<div class="account">
				<span class="label">{app.t('authorize.account')}</span>
				<strong>{app.user.displayName}</strong>
				<span>{app.user.email}</span>
				<button type="button" class="link-inline plain" onclick={switchAccount}>{app.t('authorize.notYou')}</button>
			</div>
			<h2>{app.t('authorize.can')}</h2>
			<ul>
				<li>{app.t('authorize.can.meals')}</li>
				<li>{app.t('authorize.can.family')}</li>
				{#if app.user.globalRoles.includes('recipe_curator')}<li>{app.t('authorize.can.curation')}</li>{/if}
				{#if app.user.globalRoles.includes('app_admin')}<li>{app.t('authorize.can.admin')}</li>{/if}
			</ul>
			<h2>{app.t('authorize.cannot')}</h2>
			<ul>
				<li>{app.t('authorize.cannot.delete')}</li>
				<li>{app.t('authorize.cannot.password')}</li>
			</ul>
			<div class="actions">
				<button type="button" class="text-button primary" disabled={app.settings.offline} onclick={allow}>{app.t('authorize.allow')}</button>
				<button type="button" class="text-button" onclick={() => (outcome = 'denied')}>{app.t('authorize.deny')}</button>
			</div>
		{/if}
		<p class="meta-line simulated">{app.t('authorize.simulated')}</p>
	</div>
</section>

<style>
	.authorize { padding-top: max(32px, env(safe-area-inset-top)); }
	.column { max-width: 420px; margin-inline: auto; }
	.brand { margin: 0 0 32px; color: var(--green); font: 700 0.875rem/1.3 var(--text-font); letter-spacing: 0.035em; text-transform: uppercase; }
	h1 { margin: 0 0 16px; font: 400 1.75rem/1.25 var(--heading-font); overflow-wrap: anywhere; }
	h2 { margin: 20px 0 6px; font-size: 1rem; }
	ul { margin: 0; padding-left: 20px; color: var(--body-text); }
	li { margin: 4px 0; }
	.lead { margin: 0 0 24px; color: var(--body-text); }
	.account { display: grid; gap: 2px; padding: 12px 16px; border-radius: 8px; background: var(--paper); box-shadow: var(--card-shadow); overflow-wrap: anywhere; }
	.account .label { color: var(--muted); font-size: 0.8125rem; }
	.plain { justify-self: start; min-height: 36px; padding: 0; border: 0; background: none; font: inherit; font-weight: 700; cursor: pointer; text-decoration: underline; }
	.actions { display: grid; gap: 10px; margin-top: 28px; }
	.simulated { margin-top: 32px; }
</style>
