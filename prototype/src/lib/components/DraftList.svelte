<script lang="ts">
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import type { DraftSummary } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Drafts at the top of the catalogue as cards (chosen on iPhone, round 5): kind, title, who and when,
	// what is still missing (nothing when complete: no "verified" label, round 5 review).
	let { drafts }: { drafts: DraftSummary[] } = $props();

	const shortDate = (at: string) =>
		new Intl.DateTimeFormat(app.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${at.slice(0, 10)}T12:00:00Z`));
</script>

{#snippet body(draft: DraftSummary)}
	<span class="top">
		<span class="label-chip" class:neutral={draft.kind === 'new'}>{app.t(draft.kind === 'new' ? 'curation.kind.new' : 'curation.kind.revision')}</span>
		<span class="who">{draft.updatedByName} · {shortDate(draft.updatedAt)}</span>
	</span>
	<span class="title">{draft.name}</span>
	<span class="state">
		{#if draft.missing.length}
			<span class="visually-hidden">{app.t('curation.missingPrefix')}</span>
			{#each draft.missing as m (m)}<span class="missing">{app.t(`curation.missingShort.${m}` as MessageKey)}</span>{/each}
		{/if}
	</span>
{/snippet}

<ul class="cards">
	{#each drafts as draft (draft.id)}
		<li><a class="draft card" href="/recipes/drafts/{draft.id}">{@render body(draft)}</a></li>
	{/each}
</ul>

<style>
	ul { margin: 0; padding: 0; list-style: none; }
	.draft { display: flex; color: var(--ink); text-decoration: none; }
	.card { flex-direction: column; gap: 8px; height: 100%; padding: 16px; background: var(--paper); box-shadow: var(--card-shadow); box-sizing: border-box; }
	.top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.who { color: var(--muted); font-size: 0.8125rem; white-space: nowrap; }
	.title { font: 400 1.0625rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.state { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
	.missing { padding: 2px 8px; border: 1px solid var(--rule); border-radius: 4px; color: var(--body-text); font-size: 0.75rem; line-height: 1.5; }

	.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
	@media (max-width: 767px) { .cards { grid-template-columns: minmax(0, 1fr); gap: 12px; } }

</style>
