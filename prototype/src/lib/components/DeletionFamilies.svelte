<script lang="ts">
	import type { AccountDeletionPlan, FamilyOutcome } from '#lib/operations/account.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// What happens to each family when an account is deleted (round 4), shared by the own account page and
	// the app administration (round 6): outcome and, where needed, the choice of the successor.
	let {
		title,
		families,
		outcome,
		successors = $bindable()
	}: { title: string; families: AccountDeletionPlan['families']; outcome: (o: FamilyOutcome) => string; successors: Record<string, string> } = $props();
</script>

{#if families.length}
	<h2 class="section-title">{title}</h2>
	{#each families as f (f.familyId)}
		<section class="settings-card" aria-label={f.name}>
			<h3>{f.name}</h3>
			<p>{outcome(f.outcome)}</p>
			{#if f.outcome === 'needs_successor'}
				<fieldset>
					<legend>{app.t('account.chooseSuccessor')}</legend>
					{#each f.candidates as c (c.userId)}
						<label class="choice"><input type="radio" name="successor-{f.familyId}" value={c.userId} bind:group={successors[f.familyId]} />{c.name}</label>
					{/each}
				</fieldset>
			{/if}
		</section>
	{/each}
{/if}

<style>
	.section-title { margin: 8px 0 12px; font: 400 1.25rem/1.3 var(--heading-font); }
	h3 { margin: 0 0 6px; font: 400 1.125rem/1.3 var(--meal-title-font); }
	fieldset { margin: 8px 0 0; padding: 0; border: 0; }
	legend { margin-bottom: 4px; font-size: 0.875rem; font-weight: 700; }
</style>
