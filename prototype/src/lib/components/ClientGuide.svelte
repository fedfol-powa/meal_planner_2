<script lang="ts">
	import CopyField from './CopyField.svelte';
	import { AGENT_CLIENTS, type AgentClient } from '#lib/domain/types.ts';
	import { CLIENT_GUIDES } from '#lib/mcp-clients.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Steps per client (round 6), in the two variants of the Prova panel: one client at a time behind tabs,
	// or the four clients as an accordion.
	let { layout }: { layout: 'tabs' | 'accordion' } = $props();
	let chosen = $state<AgentClient>('claude_code');
	const uid = $props.id();
</script>

{#snippet steps(client: AgentClient)}
	{@const guide = CLIENT_GUIDES[client]}
	<ol class="steps">
		{#each guide.steps as step (step.text)}
			<li>{app.t(step.text)}{#if step.command}<CopyField value={step.command} label={app.t(`client.${client}` as const)} />{/if}</li>
		{/each}
	</ol>
	<p class="note">{app.t(guide.unverified ?? 'agents.example')}</p>
{/snippet}

{#if layout === 'tabs'}
	<div class="tabs" role="tablist" aria-label={app.t('agents.choose')}>
		{#each AGENT_CLIENTS as client (client)}
			<button type="button" role="tab" id="{uid}-{client}" aria-selected={chosen === client} aria-controls="{uid}-panel" onclick={() => (chosen = client)}>{app.t(`client.${client}` as const)}</button>
		{/each}
	</div>
	<div class="panel" role="tabpanel" id="{uid}-panel" aria-labelledby="{uid}-{chosen}">
		{@render steps(chosen)}
	</div>
{:else}
	<div class="accordion">
		{#each AGENT_CLIENTS as client (client)}
			<details>
				<summary>{app.t(`client.${client}` as const)}<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></summary>
				{@render steps(client)}
			</details>
		{/each}
	</div>
{/if}

<style>
	.tabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 6px; margin: 4px 0 12px; }
	.tabs button { min-height: 40px; padding: 6px 12px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 700 0.875rem/1.3 var(--text-font); cursor: pointer; }
	.tabs [aria-selected='true'] { color: #fff; background: var(--ink); }
	.steps { margin: 0; padding-left: 20px; }
	.steps li { margin: 0 0 8px; }
	.note { margin: 4px 0 0; color: var(--muted, #5f6368); font-size: 0.8125rem; }
	.accordion details { border-top: 1px solid var(--rule); }
	.accordion details:last-child { border-bottom: 1px solid var(--rule); }
	summary { display: flex; align-items: center; justify-content: space-between; min-height: 48px; font-weight: 700; cursor: pointer; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary .icon { transition: transform 0.15s; }
	details[open] summary .icon { transform: rotate(90deg); }
	details[open] { padding-bottom: 12px; }
</style>
