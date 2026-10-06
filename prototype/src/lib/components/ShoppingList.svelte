<script lang="ts">
	import { goto } from '$app/navigation';
	import BottomSheet from './BottomSheet.svelte';
	import { formatDayNumber, formatDayShort } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { OpResult } from '#lib/operations/context.ts';
	import { shoppingExport, type ShoppingSource } from '#lib/operations/shopping.ts';
	import {
		MAX_MANUAL_TEXT,
		addManualItem,
		closeShoppingList,
		deleteShoppingList,
		removeManualItem,
		reopenShoppingList,
		restoreShoppingList,
		toggleAddedBack,
		toggleManualItem,
		toggleShoppingItem,
		type ShoppingListDetail
	} from '#lib/operations/shopping-lists.ts';
	import { app } from '#lib/store/app.svelte.ts';

	// A saved family list (round 3 revision): ticks and items are shared, quantities follow the meals.
	let { list }: { list: ShoppingListDetail } = $props();

	let expanded = $state<Set<string>>(new Set());
	let sheet = $state<'text' | 'bring' | null>(null);
	let copied = $state(false);
	let newItem = $state('');
	let menuOpen = $state(false);
	let menuButton: HTMLButtonElement | undefined = $state();
	let menuPanel: HTMLDivElement | undefined = $state();

	// Every list action lives in the "…" menu (prova su iPhone): it closes before acting.
	function run(action: () => unknown) {
		menuOpen = false;
		action();
	}

	$effect(() => {
		if (!menuOpen) return;
		const onPointer = (e: PointerEvent) => {
			const target = e.target as Node;
			if (!menuPanel?.contains(target) && !menuButton?.contains(target)) menuOpen = false;
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				menuOpen = false;
				menuButton?.focus();
			}
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	});

	const open = $derived(list.status === 'open');
	const canEdit = $derived(open && !app.settings.offline);
	const ticked = $derived(new Set(list.departments.flatMap((d) => d.items.filter((i) => i.checked).map((i) => i.id))));
	const manualLeft = $derived(list.departments.flatMap((d) => d.manual.filter((m) => !m.checked).map((m) => m.text)));
	const exported = $derived(shoppingExport(list.view, ticked, app.locale, manualLeft));
	const nothingLeft = $derived(exported.bringItems.length === 0);
	const title = $derived(list.name);
	// "Altro" is always there on an editable list: it holds the field that adds a free item.
	const groups = $derived(
		canEdit && !list.departments.some((d) => d.department === 'other')
			? [...list.departments, { department: 'other' as const, items: [], manual: [] }]
			: list.departments
	);

	const flip = (set: Set<string>, id: string) => {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	};

	/** Saves a write; errors become the notice. */
	function act<T>(result: OpResult<T>): T | null {
		if (!result.ok) {
			app.notify(app.t(errorKey(result.error)));
			return null;
		}
		app.update(() => {});
		return result.value;
	}

	function reopen() {
		if (act(reopenShoppingList(app.db, app.ctx, list.id)) !== null) app.notify(app.t('shopping.reopenedToast'));
	}

	// Closing (by hand or at the last tick) offers "Annulla", which reopens the list.
	function closed() {
		app.notify(app.t('shopping.closedToast'), () => reopen());
	}

	function tick(ingredientId: string) {
		if (act(toggleShoppingItem(app.db, app.ctx, list.id, ingredientId))?.closed) closed();
	}

	function tickManual(itemId: string) {
		if (act(toggleManualItem(app.db, app.ctx, list.id, itemId))?.closed) closed();
	}

	function add(event: SubmitEvent) {
		event.preventDefault();
		if (act(addManualItem(app.db, app.ctx, list.id, newItem))) newItem = '';
	}

	function done() {
		if (act(closeShoppingList(app.db, app.ctx, list.id)) !== null) closed();
	}

	function remove() {
		const removed = act(deleteShoppingList(app.db, app.ctx, list.id));
		if (!removed) return;
		goto('/shopping');
		app.notify(app.t('shopping.deletedToast'), () => {
			if (act(restoreShoppingList(app.db, app.ctx, removed)) !== null) goto(`/shopping/${removed.id}`);
		});
	}

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

	const sourceLabel = (s: ShoppingSource) =>
		`${formatDayShort(app.locale, s.date)} ${formatDayNumber(app.locale, s.date)} · ${app.t(`meal.${s.mealType}`)} · ${s.recipeName}`;
</script>

<header class="page-header">
	<div class="title-row no-print">
		<a class="page-back" href="/shopping">‹ {app.t('shopping.back')}</a>
		<div class="menu-wrap">
			<button bind:this={menuButton} type="button" class="menu-toggle" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={app.t('shopping.actions')} onclick={() => (menuOpen = !menuOpen)}>
				<span aria-hidden="true">…</span>
			</button>
			{#if menuOpen}
				<div class="menu" role="menu" bind:this={menuPanel}>
					{#if open}
						<button type="button" role="menuitem" disabled={app.settings.offline} onclick={() => run(() => goto(`/shopping/new?list=${list.id}`))}>{app.t('shopping.editMeals')}</button>
					{/if}
					<button type="button" role="menuitem" disabled={nothingLeft} onclick={() => run(share)}>{app.t('shopping.share')}</button>
					<button type="button" role="menuitem" disabled={nothingLeft} onclick={() => run(() => window.print())}>{app.t('shopping.pdf')}</button>
					<button type="button" role="menuitem" disabled={nothingLeft || app.settings.offline} onclick={() => run(() => (sheet = 'bring'))}>{app.t('shopping.bring')}{#if app.settings.offline}<small> · {app.t('shopping.bringOffline')}</small>{/if}</button>
					{#if open}
						<button type="button" role="menuitem" disabled={app.settings.offline} onclick={() => run(done)}>{app.t('shopping.done')}</button>
					{:else}
						<button type="button" role="menuitem" disabled={app.settings.offline} onclick={() => run(reopen)}>{app.t('shopping.reopen')}</button>
					{/if}
					<button type="button" role="menuitem" class="danger" disabled={app.settings.offline} onclick={() => run(remove)}>{app.t('shopping.delete')}</button>
				</div>
			{/if}
		</div>
	</div>
	{#if list.weekly}<span class="label-chip no-print">{app.t('shopping.weekly')}</span>{/if}
	<h1 class="page-title" id="list-title">{title}</h1>
</header>

{#if !open}
	<p class="notice no-print">{app.t('shopping.closedNotice')}</p>
{/if}

{#if list.skipped.length}
	<p class="notice">{app.t('shopping.skipped', { names: list.skipped.map((s) => s.recipeName).join(', ') })}</p>
{/if}

{#each groups as group (group.department)}
	<section class="shopping-group" class:no-print={group.items.length + group.manual.length === 0} aria-labelledby="dep-{group.department}">
		<h2 id="dep-{group.department}">{app.t(`department.${group.department}`)}</h2>
		<ul class="shopping-items">
			{#each group.items as item (item.id)}
				{@const isOpen = expanded.has(item.id)}
				<li class:done={item.checked}>
					<div class="row">
						<label class="shopping-item">
							<input type="checkbox" checked={item.checked} disabled={!canEdit} aria-label={app.t('shopping.check', { name: item.name })} onchange={() => tick(item.id)} />
							<span class="shopping-name">
								{item.name}{#if item.isOptional}<small class="hint"> · {app.t('shopping.optional')}</small>{/if}
								{#if item.previousQuantity}<small class="previous">{app.t('shopping.previous', { quantity: item.previousQuantity })}</small>{/if}
							</span>
							<span class="shopping-quantity">{item.quantity}</span>
						</label>
						<button type="button" class="icon-button no-print" aria-expanded={isOpen} aria-label={app.t('shopping.sources', { name: item.name })} onclick={() => (expanded = flip(expanded, item.id))}>
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
			{#each group.manual as item (item.id)}
				<li class:done={item.checked}>
					<div class="row">
						<label class="shopping-item">
							<input type="checkbox" checked={item.checked} disabled={!canEdit} aria-label={app.t('shopping.check', { name: item.text })} onchange={() => tickManual(item.id)} />
							<span class="shopping-name">{item.text}</span>
							<span></span>
						</label>
						{#if canEdit}
							<button type="button" class="icon-button remove no-print" aria-label={app.t('shopping.removeItem', { name: item.text })} onclick={() => act(removeManualItem(app.db, app.ctx, list.id, item.id))}>×</button>
						{/if}
					</div>
				</li>
			{/each}
			{#if group.department === 'other' && canEdit}
				<li class="no-print">
					<form class="add-item" onsubmit={add}>
						<span class="plus" aria-hidden="true">+</span>
						<label class="visually-hidden" for="new-item">{app.t('shopping.addItem')}</label>
						<input id="new-item" type="text" bind:value={newItem} maxlength={MAX_MANUAL_TEXT} placeholder={app.t('shopping.addItemPlaceholder')} autocomplete="off" enterkeyhint="done" />
						{#if newItem.trim()}<button type="submit" class="text-button">{app.t('shopping.addItemButton')}</button>{/if}
					</form>
				</li>
			{/if}
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
					{#if canEdit}
						<button type="button" class="add" aria-label={app.t('shopping.addBack', { name: item.name })} onclick={() => act(toggleAddedBack(app.db, app.ctx, list.id, item.id))}>+</button>
					{:else}<span></span>{/if}
				</li>
			{/each}
		</ul>
	</details>
{/if}

{#if nothingLeft}<p class="notice no-print" role="status">{app.t('shopping.allRemoved')}</p>{/if}

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
	.title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.menu-wrap { position: relative; }
	.menu-toggle { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--ink); font: 700 1.5rem/1 var(--text-font); cursor: pointer; }
	.menu-toggle[aria-expanded='true'] { color: var(--green); }
	.menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 15; display: flex; flex-direction: column; min-width: 220px; padding: 6px 0; background: var(--paper); border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 15%); }
	.menu button { min-height: 44px; padding: 10px 16px; border: 0; background: none; color: var(--ink); font: 400 1rem/1.3 var(--text-font); text-align: left; cursor: pointer; }
	.menu button:hover:not(:disabled) { background: var(--canvas); }
	.menu button:disabled { color: var(--muted); cursor: not-allowed; }
	.menu small { font-size: 0.75rem; }
	.menu .danger { color: #a3261b; border-top: 1px solid var(--rule); }
	.label-chip { margin-top: 4px; }
	.shopping-group h2 { margin: 0 0 12px; }
	.row { display: grid; grid-template-columns: minmax(0, 1fr) 44px; align-items: start; border-top: 1px solid var(--rule); }
	.row .shopping-item { border-top: 0; }
	.shopping-quantity { max-width: 16ch; }
	.shopping-name { display: flex; flex-wrap: wrap; column-gap: 4px; }
	.done .shopping-quantity { color: var(--muted); text-decoration: line-through; font-weight: 400; }
	.hint { color: var(--muted); font-size: 0.8125rem; }
	.previous { flex-basis: 100%; color: var(--green); font-size: 0.8125rem; font-weight: 700; }
	.icon-button { display: grid; place-items: center; width: 44px; height: 48px; padding: 0; border: 0; background: none; color: var(--ink); cursor: pointer; }
	.remove { color: var(--muted); font: 400 1.5rem/1 var(--text-font); }
	.chevron { width: 8px; height: 8px; border: solid currentColor; border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); }
	.icon-button[aria-expanded='true'] .chevron { transform: translateY(2px) rotate(225deg); }
	.sources { margin: -4px 0 0; padding: 0 44px 10px 32px; list-style: none; color: var(--muted); font-size: 0.8125rem; }
	.sources li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 3px 0; }
	.source-quantity { font-weight: 700; }
	.notice { margin: 0 0 16px; color: var(--body-text); font-size: 0.875rem; }
	.add-item { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 48px; padding: 4px 0; border-top: 1px solid var(--rule); }
	.plus { color: var(--green); font: 400 1.5rem/1 var(--text-font); text-align: center; }
	.add-item input { min-width: 0; min-height: 40px; padding: 6px 0; border: 0; border-bottom: 1px dashed var(--rule); background: transparent; color: var(--ink); font-size: 1rem; }
	.add-item input:focus { outline: none; border-bottom-color: var(--green); }
	.add-item .text-button { min-height: 40px; padding: 6px 12px; }
	.excluded summary { min-height: 44px; display: flex; align-items: center; font: 400 1.25rem/1.3 var(--heading-font); cursor: pointer; }
	.excluded[open] summary { margin-bottom: 8px; }
	.excluded-row { display: grid; grid-template-columns: minmax(0, 1fr) auto 44px; align-items: center; gap: 12px; min-height: 48px; border-top: 1px solid var(--rule); color: var(--body-text); }
	.excluded-row small { color: var(--muted); font-size: 0.8125rem; }
	.add { width: 44px; height: 44px; border: 0; background: none; color: var(--green); font: 400 1.5rem/1 var(--text-font); cursor: pointer; }
	.sheet-note { margin: 8px 0 12px; color: var(--body-text); font-size: 0.875rem; }
	textarea { width: 100%; padding: 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 0.875rem/1.5 var(--text-font); resize: vertical; }
	.wide { width: 100%; margin: 12px 0 4px; }
	.bring-items { margin: 0; padding: 0; list-style: none; }
	.bring-items li { padding: 8px 0; border-bottom: 1px solid var(--rule); }
	@media print {
		@page { margin: 12mm; }
		.page-header { padding: 0; }
		.page-title { margin: 0 0 8px; font-size: 1.125rem; }
		.no-print, .done, .previous, .shopping-item input { display: none !important; }
		.row { grid-template-columns: 1fr; border-top: 0; }
		.shopping-group { margin: 0 0 4px; padding: 0 0 4px; }
		.shopping-group h2 { margin: 0 0 2px; font-size: 0.875rem; }
		.shopping-items { columns: 3; column-gap: 20px; }
		.shopping-items li { break-inside: avoid; }
		.shopping-item { grid-template-columns: minmax(0, 1fr) auto; gap: 6px; min-height: 0; padding: 2px 0; border-top: 0; font-size: 0.75rem; line-height: 1.4; }
		.shopping-quantity { max-width: none; }
	}
</style>
