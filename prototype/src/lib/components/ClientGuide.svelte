<script lang="ts">
	import CopyField from './CopyField.svelte';
	import { AGENT_CLIENTS, type AgentClient } from '#lib/domain/types.ts';
	import { CLIENT_GUIDES } from '#lib/mcp-clients.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Steps per client (round 6): the four clients as an accordion, chosen in the review.
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

<div class="accordion">
	{#each AGENT_CLIENTS as client (client)}
		<details>
			<summary>{app.t(`client.${client}` as const)}<svg class="icon" aria-hidden="true"><use href="#icon-chevron-right" /></svg></summary>
			{@render steps(client)}
		</details>
	{/each}
</div>

<style>
	.steps { margin: 0; padding-left: 20px; }
	.steps li { margin: 0 0 8px; }
	.note { margin: 4px 0 0; color: var(--muted); font-size: 0.8125rem; }
	.accordion details { border-top: 1px solid var(--rule); }
	.accordion details:last-child { border-bottom: 1px solid var(--rule); }
	summary { display: flex; align-items: center; justify-content: space-between; min-height: 48px; font-weight: 700; cursor: pointer; list-style: none; }
	summary::-webkit-details-marker { display: none; }
	summary .icon { transition: transform 0.15s; }
	details[open] summary .icon { transform: rotate(90deg); }
	details[open] { padding-bottom: 12px; }
</style>
