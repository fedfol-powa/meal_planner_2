<script lang="ts">
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import type { DraftSummary } from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Drafts at the top of the catalogue (round 5). Three forms to compare on iPhone (pannello Prova):
	// cards, a horizontal strip of small cards, rows. Same content: kind, title, who and when, what is missing.
	let { drafts }: { drafts: DraftSummary[] } = $props();

	const style = $derived(app.settings.variants.draftList);
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
		{#if draft.verified}
			<span class="ready"><svg class="icon" aria-hidden="true"><use href="#icon-check" /></svg>{app.t('curation.ready')}</span>
		{:else if draft.missing.length}
			<span class="visually-hidden">{app.t('curation.missingPrefix')}</span>
			{#each draft.missing as m (m)}<span class="missing">{app.t(`curation.missingShort.${m}` as MessageKey)}</span>{/each}
		{:else}
			<span class="missing">{app.t('curation.toVerify')}</span>
		{/if}
	</span>
{/snippet}

{#if style === 'rows'}
	<ul class="rows settings-card">
		{#each drafts as draft (draft.id)}
			<li><a class="draft row" href="/recipes/drafts/{draft.id}">
				<span class="row-body">{@render body(draft)}</span>
				<svg class="icon chevron" aria-hidden="true"><use href="#icon-chevron-right" /></svg>
			</a></li>
		{/each}
	</ul>
{:else}
	<ul class={style === 'strip' ? 'strip' : 'cards'}>
		{#each drafts as draft (draft.id)}
			<li><a class="draft card" href="/recipes/drafts/{draft.id}">{@render body(draft)}</a></li>
		{/each}
	</ul>
{/if}

<style>
	ul { margin: 0; padding: 0; list-style: none; }
	.draft { display: flex; color: var(--ink); text-decoration: none; }
	.card { flex-direction: column; gap: 8px; height: 100%; padding: 16px; background: var(--paper); box-shadow: var(--card-shadow); box-sizing: border-box; }
	.top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
	.who { color: var(--muted); font-size: 0.8125rem; white-space: nowrap; }
	.title { font: 400 1.0625rem/1.3 var(--meal-title-font); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.state { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; }
	.missing { padding: 2px 8px; border: 1px solid var(--rule); border-radius: 4px; color: var(--body-text); font-size: 0.75rem; line-height: 1.5; }
	.ready { display: inline-flex; align-items: center; gap: 4px; color: var(--green); font-size: 0.8125rem; font-weight: 700; }
	.ready .icon { width: 16px; height: 16px; }

	.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
	@media (max-width: 767px) { .cards { grid-template-columns: minmax(0, 1fr); gap: 12px; } }

	.strip { display: grid; grid-auto-flow: column; grid-auto-columns: min(72%, 260px); gap: 12px; margin: 0 -24px; padding: 2px 24px 10px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: 24px; scrollbar-width: none; }
	.strip li { scroll-snap-align: start; }
	.strip .card { min-height: 148px; }
	@media (max-width: 767px) { .strip { margin-inline: -16px; padding-inline: 16px; scroll-padding-inline: 16px; } }

	.rows { padding-block: 0; }
	.rows li + li { border-top: 1px solid var(--rule); }
	.row { align-items: center; gap: 12px; min-height: 52px; padding: 14px 0; }
	.row-body { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 6px; }
	.chevron { color: var(--muted); }
</style>
