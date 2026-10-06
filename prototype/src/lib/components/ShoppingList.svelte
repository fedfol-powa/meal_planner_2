<script lang="ts">
	import BottomSheet from './BottomSheet.svelte';
	import { formatDayNumber, formatDayShort } from '#lib/i18n/dates.ts';
	import { shoppingExport, type ArrangedShoppingList } from '#lib/operations/shopping.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// Step 2: ephemeral list, kept only in this view (spec section 6).
	let {
		list,
		removed = $bindable(),
		addedBack = $bindable()
	}: { list: ArrangedShoppingList; removed: Set<string>; addedBack: Set<string> } = $props();

	let expanded = $state<Set<string>>(new Set());
	let sheet = $state<'text' | 'bring' | null>(null);
	let copied = $state(false);

	const exported = $derived(shoppingExport(list, removed, app.locale));
	const nothingLeft = $derived(exported.bringItems.length === 0);
	const title = $derived(exported.text.split('\n')[0]);

	const flip = (set: Set<string>, id: string) => {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	};

	async function share() {
		// Web Share needs a secure context: on the LAN preview (http) the fallback sheet opens.
		if (typeof navigator.share === 'function') {
			try {
				await navigator.share({ title, text: exported.text });
				app.notify(app.t('shopping.shared'));
			} catch (error) {
				if ((error as DOMException).name !== 'AbortError') sheet = 'text';
			}
			return;
		}
		copied = false;
		sheet = 'text';
	}

	let textArea: HTMLTextAreaElement | undefined = $state();
	async function copy() {
		try {
			await navigator.clipboard.writeText(exported.text);
		} catch {
			// Clipboard API is unavailable over http: select the text and use the legacy command.
			textArea?.select();
			document.execCommand('copy');
		}
		copied = true;
	}

	function sendToBring() {
		sheet = null;
		app.notify(app.t('shopping.sentToBring'));
	}

	const sourceLabel = (s: ArrangedShoppingList['departments'][number]['items'][number]['sources'][number]) =>
		`${formatDayShort(app.locale, s.date)} ${formatDayNumber(app.locale, s.date)} · ${app.t(`meal.${s.mealType}`)} · ${s.recipeName}`;
</script>

<h1 class="print-only print-title">{title}</h1>

{#if list.skipped.length}
	<p class="skipped">{app.t('shopping.skipped', { names: list.skipped.map((s) => s.recipeName).join(', ') })}</p>
{/if}

{#each list.departments as group (group.department)}
	<section class="shopping-group" aria-labelledby="dep-{group.department}">
		<h2 id="dep-{group.department}">{app.t(`department.${group.department}`)}</h2>
		<ul class="shopping-items">
			{#each group.items as item (item.id)}
				{@const isOpen = expanded.has(item.id)}
				<li class:removed={removed.has(item.id)}>
					<div class="row">
						<label class="shopping-item">
							<input type="checkbox" checked={removed.has(item.id)} aria-label={app.t(removed.has(item.id) ? 'shopping.restore' : 'shopping.remove', { name: item.name })} onchange={() => (removed = flip(removed, item.id))} />
							<span class="shopping-name">{item.name}{#if item.isOptional}<small class="optional"> · {app.t('shopping.optional')}</small>{/if}</span>
							<span class="shopping-quantity">{item.quantity}</span>
						</label>
						<button type="button" class="expand no-print" aria-expanded={isOpen} aria-label={app.t('shopping.sources', { name: item.name })} onclick={() => (expanded = flip(expanded, item.id))}>
							<span class="chevron" aria-hidden="true"></span>
						</button>
					</div>
					{#if isOpen}
						<ul class="sources no-print">
							{#each item.sources as source, index (index)}
								<li><span>{sourceLabel(source)}</span><span class="source-quantity">{source.quantity}</span></li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/each}

{#if list.excluded.length}
	<details class="shopping-group excluded no-print">
		<summary>{app.t('shopping.excluded.title', { count: list.excluded.length })}</summary>
		<ul class="shopping-items">
			{#each list.excluded as item (item.id)}
				<li class="excluded-row">
					<span class="shopping-name">{item.name} <small>· {app.t(item.excluded === 'avoid' ? 'shopping.excluded.avoid' : 'shopping.excluded.pantry')}</small></span>
					<span class="shopping-quantity">{item.quantity}</span>
					<button type="button" class="add" aria-label={app.t('shopping.addBack', { name: item.name })} onclick={() => (addedBack = flip(addedBack, item.id))}>+</button>
				</li>
			{/each}
		</ul>
	</details>
{/if}

<div class="action-bar no-print">
	{#if nothingLeft}<p class="all-removed" role="status">{app.t('shopping.allRemoved')}</p>{/if}
	<div class="exports">
		<button type="button" class="text-button primary" disabled={nothingLeft} onclick={share}>{app.t('shopping.share')}</button>
		<button type="button" class="text-button" disabled={nothingLeft} onclick={() => window.print()}>{app.t('shopping.pdf')}</button>
		<button type="button" class="text-button" disabled={nothingLeft || app.settings.offline} title={app.settings.offline ? app.t('shopping.bringOffline') : undefined} onclick={() => (sheet = 'bring')}>{app.t('shopping.bring')}</button>
	</div>
</div>

<BottomSheet open={sheet === 'text'} title={app.t('shopping.shareSheet.title')} onClose={() => (sheet = null)}>
	<p class="sheet-note">{app.t('shopping.shareSheet.body')}</p>
	<textarea bind:this={textArea} readonly rows="12" value={exported.text}></textarea>
	<button type="button" class="text-button primary wide" onclick={copy}>{copied ? app.t('shopping.copied') : app.t('shopping.copy')}</button>
</BottomSheet>

<BottomSheet open={sheet === 'bring'} title={app.t('shopping.bringSheet.title')} onClose={() => (sheet = null)}>
	<p class="sheet-note">{app.t('shopping.bringSheet.body')}</p>
	<ul class="bring-items">
		{#each exported.bringItems as line, index (index)}<li>{line}</li>{/each}
	</ul>
	<button type="button" class="text-button primary wide" onclick={sendToBring}>{app.t('shopping.bringSheet.open')}</button>
</BottomSheet>

<style>
	.shopping-group h2 { margin: 0 0 12px; }
	.row { display: grid; grid-template-columns: minmax(0, 1fr) 44px; align-items: start; border-top: 1px solid var(--rule); }
	.row .shopping-item { border-top: 0; }
	.shopping-quantity { max-width: 16ch; }
	.removed .shopping-quantity { color: var(--muted); text-decoration: line-through; font-weight: 400; }
	.optional { color: var(--muted); font-size: 0.8125rem; }
	.expand { display: grid; place-items: center; width: 44px; height: 48px; padding: 0; border: 0; background: none; color: var(--ink); cursor: pointer; }
	.chevron { width: 8px; height: 8px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); }
	.expand[aria-expanded='true'] .chevron { transform: translateY(2px) rotate(225deg); }
	.sources { margin: -4px 0 0; padding: 0 44px 10px 32px; list-style: none; color: var(--muted); font-size: 0.8125rem; }
	.sources li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 3px 0; }
	.source-quantity { font-weight: 700; }
	.skipped { margin: 0 0 16px; color: var(--body-text); font-size: 0.875rem; }
	.excluded summary { min-height: 44px; display: flex; align-items: center; font: 400 1.25rem/1.3 var(--heading-font); cursor: pointer; }
	.excluded[open] summary { margin-bottom: 8px; }
	.excluded-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 44px; align-items: center; gap: 12px; min-height: 48px; border-top: 1px solid var(--rule); color: var(--body-text); }
	.excluded-row small { color: var(--muted); font-size: 0.8125rem; }
	.add { width: 44px; height: 44px; border: 0; background: none; color: var(--green); font: 400 1.5rem/1 var(--text-font); cursor: pointer; }
	.action-bar { position: sticky; bottom: 0; padding: 12px 0 4px; background: var(--canvas); }
	.exports { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; }
	.exports .text-button { min-height: 48px; }
	.all-removed { margin: 0 0 8px; color: var(--body-text); font-size: 0.875rem; }
	.sheet-note { margin: 8px 0 12px; color: var(--body-text); font-size: 0.875rem; }
	textarea { width: 100%; padding: 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 0.875rem/1.5 var(--text-font); resize: vertical; }
	.wide { width: 100%; margin: 12px 0 4px; }
	.bring-items { margin: 0; padding: 0; list-style: none; }
	.bring-items li { padding: 8px 0; border-bottom: 1px solid var(--rule); }
	.print-only { display: none; }
	@media print {
		@page { margin: 12mm; }
		.print-only { display: block; }
		.print-title { margin: 0 0 8px; font: 400 1.125rem/1.3 var(--heading-font); }
		.no-print, .removed, .shopping-item input { display: none !important; }
		.row { grid-template-columns: 1fr; border-top: 0; }
		.shopping-group { margin: 0 0 4px; padding: 0 0 4px; }
		.shopping-group h2 { margin: 0 0 2px; font-size: 0.875rem; }
		.shopping-items { columns: 3; column-gap: 20px; }
		.shopping-items li { break-inside: avoid; }
		.shopping-item { grid-template-columns: minmax(0, 1fr) auto; gap: 6px; min-height: 0; padding: 2px 0; border-top: 0; font-size: 0.75rem; line-height: 1.4; }
		.shopping-quantity { max-width: none; }
	}
</style>
