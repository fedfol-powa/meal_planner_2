<script lang="ts">
	import BottomSheet from '#lib/components/BottomSheet.svelte';
	import ClientGuide from '#lib/components/ClientGuide.svelte';
	import CopyField from '#lib/components/CopyField.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import type { ConnectedAgent } from '#lib/domain/types.ts';
	import { formatDateTime, formatDayMonth } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import { CLIENT_GUIDES, MCP_URL } from '#lib/mcp-clients.ts';
	import { disconnectAgent, listConnectedAgents } from '#lib/operations/agents.ts';
	import { INGREDIENT_GUIDE } from '#lib/operations/curation-guide.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Agent connection page (spec section 13, round 6): what an agent can do, the address and the steps per
	// client, signing in, examples, and the agents authorised so far with "Scollega".
	const agents = $derived(listConnectedAgents(app.db, app.ctx));
	const roles = $derived(app.user.globalRoles.map((r) => app.t(`agents.role.${r}` as const)));
	const curator = $derived(app.user.globalRoles.includes('recipe_curator'));
	let leaving = $state<ConnectedAgent | null>(null);

	const lastUse = (at: string) => (at.slice(0, 10) === app.settings.now.slice(0, 10) ? app.t('agents.today', { time: at.slice(11) }) : formatDateTime(app.locale, at));

	function disconnect() {
		if (!leaving) return;
		const client = app.t(`client.${leaving.client}` as const);
		const result = disconnectAgent(app.db, app.ctx, leaving.id);
		leaving = null;
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		app.notify(app.t('agents.disconnected', { client }));
	}
</script>

<section class="secondary-view app-view" aria-labelledby="agents-title">
	<div class="page-column">
		<PageHeader back="/profile" backLabel={app.t('nav.profile')} title={app.t('agents.title')} titleId="agents-title" />
		<p class="section-intro">{app.t('agents.intro')}{#if roles.length}{' '}{app.t('agents.roles', { roles: roles.join(', ') })}{/if}</p>

		<section class="settings-card" aria-labelledby="address-title">
			<h2 id="address-title">{app.t('agents.address')}</h2>
			<CopyField value={MCP_URL} label={app.t('agents.address')} />
			<p class="meta-line">{app.t('agents.addressExample')}</p>
		</section>

		<section class="settings-card" aria-labelledby="client-title">
			<h2 id="client-title">{app.t('agents.choose')}</h2>
			<ClientGuide layout={app.settings.variants.agentClients} />
		</section>

		<section class="settings-card" aria-labelledby="sign-in-title">
			<h2 id="sign-in-title">{app.t('agents.signIn')}</h2>
			<p>{app.t('agents.signInBody')}</p>
		</section>

		<section class="settings-card" aria-labelledby="try-title">
			<h2 id="try-title">{app.t('agents.try')}</h2>
			<p>{app.t('agents.tryBody')}</p>
			<ul class="examples">
				<li>{app.t('agents.tryExample1')}</li>
				<li>{app.t('agents.tryExample2')}</li>
			</ul>
			{#if curator}
				<h3>{app.t('agents.curatorExample')}</h3>
				<ul class="examples"><li>{app.t('agents.curatorExampleBody')}</li></ul>
				<details class="guide">
					<summary>{app.t('agents.guide')}</summary>
					<p class="meta-line">{app.t('agents.guideNote')}</p>
					<pre>{INGREDIENT_GUIDE}</pre>
				</details>
			{/if}
			<p class="meta-line">{app.t('agents.familyDeletion')}</p>
		</section>

		<section class="settings-card" aria-labelledby="connected-title">
			<h2 id="connected-title">{app.t('agents.connected')}</h2>
			{#if agents.ok && agents.value.length}
				<ul class="row-list">
					{#each agents.value as agent (agent.id)}
						<li class="agent">
							<span class="row-main">{app.t(`client.${agent.client}` as const)}<small>{app.t('agents.connectedOn', { date: formatDayMonth(app.locale, agent.connectedAt.slice(0, 10)), last: lastUse(agent.lastUsedAt) })}</small></span>
							<button type="button" class="text-button" disabled={app.settings.offline} onclick={() => (leaving = agent)}>{app.t('agents.disconnect')}</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="meta-line">{app.t('agents.none')}</p>
			{/if}
		</section>
	</div>
</section>

<BottomSheet open={leaving !== null} title={leaving ? app.t('agents.disconnectTitle', { client: app.t(`client.${leaving.client}` as const) }) : ''} onClose={() => (leaving = null)}>
	{#if leaving}
		<p>{app.t('agents.disconnectBody', { how: app.t(CLIENT_GUIDES[leaving.client].remove) })}</p>
		<div class="sheet-actions">
			<button type="button" class="text-button" onclick={() => (leaving = null)}>{app.t('agents.cancel')}</button>
			<button type="button" class="text-button danger" onclick={disconnect}>{app.t('agents.disconnect')}</button>
		</div>
	{/if}
</BottomSheet>

<style>
	h3 { margin: 16px 0 4px; font-size: 1rem; }
	.examples { margin: 4px 0 12px; padding-left: 20px; }
	.examples li { margin: 4px 0; }
	.guide summary { min-height: 44px; display: flex; align-items: center; color: var(--green); font-weight: 700; cursor: pointer; }
	.guide pre { max-height: 320px; overflow: auto; margin: 0 0 12px; padding: 12px; border-radius: 8px; background: var(--paper); font: 0.75rem/1.5 ui-monospace, 'SF Mono', Menlo, monospace; white-space: pre-wrap; }
	.agent { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; }
	.sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
</style>
