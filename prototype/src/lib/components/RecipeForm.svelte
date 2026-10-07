<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import ActionMenu from './ActionMenu.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import ConfirmDanger from './ConfirmDanger.svelte';
	import IngredientPicker from './IngredientPicker.svelte';
	import PageHeader from './PageHeader.svelte';
	import { changedFields, contentOf, plainCopy } from '#lib/domain/recipe-content.ts';
	import { DESCRIPTION_MAX, NAME_MAX, QUANTITY_TEXT_MAX, type ValidationIssue } from '#lib/domain/recipe-validation.ts';
	import { LOCALES, type Translated, type Locale, type ProteinGroup, type Quantity, type RecipeContent, type RecipeContentField, type RecipeIngredient, type RecipeMealType, type SourceType, type UnitCode } from '#lib/domain/types.ts';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import {
		createDraft,
		discardDraft,
		emptyContent,
		checkVariety,
		getDraft,
		getIngredientVarieties,
		publishDraft,
		saveDraft,
		checkDraft,
		type DraftDetail,
		type SaveOutcome
	} from '#lib/operations/curation.ts';
	import type { VarietyHint } from '#lib/domain/ingredient-variety.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import { formatQuantity } from '#lib/units/format.ts';

	// Manual curation path (spec section 8, round 5): a shared draft edited without AI, saved on purpose
	// (conflicts are checked at every save) and published when it passes the shared rules: no separate
	// verification step (round 5 review).
	let { initial }: { initial: DraftDetail | null } = $props();

	const draftId = $derived(initial?.draft.id ?? null);
	// The live draft, refreshed when someone else saves it (pannello Prova).
	const live = $derived.by(() => {
		if (!draftId) return null;
		const r = getDraft(app.db, app.ctx, draftId);
		return r.ok ? r.value : null;
	});

	// svelte-ignore state_referenced_locally
	let content = $state<RecipeContent>(contentOf(initial?.draft.content ?? emptyContent()));
	// svelte-ignore state_referenced_locally
	let saved = $state<RecipeContent>(contentOf(initial?.draft.content ?? emptyContent()));
	// svelte-ignore state_referenced_locally
	let baseRevision = $state(initial?.draft.revision ?? 0);
	let issues = $state<ValidationIssue[]>([]);
	let conflict = $state<Extract<SaveOutcome, { status: 'conflict' }> | null>(null);
	let stale = $state<{ byName: string; at: string; version: number } | null>(null);
	let picker = $state<{ line: number | null } | null>(null);
	let confirmDiscard = $state(false);
	let leaving = $state<URL | null>(null);
	let allowLeave = false;

	let lang = $state<Locale>(app.locale);
	const dirty = $derived(changedFields(saved, normalized(content)).length > 0);
	const isNew = $derived(!initial || initial.draft.kind === 'new');
	const title = $derived(nameIn(content) || app.t('curation.new'));
	const back = $derived(initial?.draft.kind === 'revision' ? `/recipes/${initial.draft.recipeId}` : '/recipes');
	const backLabel = $derived(initial?.draft.kind === 'revision' ? app.t('curation.backToRecipe') : app.t('nav.recipes'));

	function nameIn(c: RecipeContent): string {
		return (c.name[app.locale] || c.name['it-IT'] || c.name['en-GB'] || '').trim();
	}

	// ---- Sections ----
	const SECTIONS = ['names', 'source', 'meal', 'ingredients'] as const;

	function goToIssue(issue: ValidationIssue) {
		if (issue.locale) lang = issue.locale;
		const id = issue.line !== undefined ? `ingredient-${issue.line}` : `field-${issue.field}`;
		requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
	}

	// ---- Issues ----
	const FIELD_KEYS: Record<ValidationIssue['field'], MessageKey> = {
		name: 'curation.field.name',
		description: 'curation.field.description',
		sourceUrl: 'curation.field.sourceUrl',
		bookId: 'curation.field.book',
		bookPages: 'curation.field.bookPages',
		durationMinutes: 'curation.field.duration',
		baseServings: 'curation.field.baseServings',
		ingredients: 'curation.field.ingredients'
	};
	const langName = (l: Locale) => app.t(l === 'it-IT' ? 'curation.lang.it' : 'curation.lang.en');

	function issueText(issue: ValidationIssue): string {
		let where = app.t(FIELD_KEYS[issue.field]);
		if (issue.line !== undefined) {
			const line = content.ingredients[issue.line];
			where = app.t('curation.issue.line', { number: issue.line + 1, name: line ? ingredientName(line.ingredientId) : '' });
			if (issue.part === 'quantity') where += ` · ${app.t('curation.ingredient.quantity')}`;
			if (issue.part === 'variety') where += ` · ${app.t('curation.issue.variety')}`;
		}
		if (issue.locale) where += ` (${langName(issue.locale)})`;
		return `${where}: ${problemOf(issue)}`;
	}

	/** Next to the field only the problem, capitalised; the full text is in the summary. */
	function problemOf(issue: ValidationIssue): string {
		return issue.line === undefined && issue.field === 'ingredients' && issue.code === 'required' ? app.t('curation.issue.noIngredients') : app.t(`curation.issue.${issue.code}` as MessageKey);
	}
	const inline = (issue: ValidationIssue) => {
		const text = issue.line !== undefined && issue.part ? `${app.t(issue.part === 'quantity' ? 'curation.ingredient.quantity' : issue.part === 'variety' ? 'curation.issue.variety' : 'curation.issue.ingredient')}${issue.locale ? ` (${langName(issue.locale)})` : ''}: ${problemOf(issue)}` : problemOf(issue);
		return text.charAt(0).toUpperCase() + text.slice(1);
	};
	const issuesFor = (field: ValidationIssue['field'], locale?: Locale) => issues.filter((i) => i.field === field && i.line === undefined && (!locale || !i.locale || i.locale === locale));
	const lineIssues = (line: number) => issues.filter((i) => i.line === line);

	// ---- Content helpers ----
	function ingredientName(id: string): string {
		const ingredient = app.db.ingredients.find((i) => i.id === id);
		return ingredient ? ingredient.name[app.locale] || ingredient.name['it-IT'] : id;
	}

	/** Trimmed copy: empty optional texts become null, unused source fields are cleared. */
	function normalized(c: RecipeContent): RecipeContent {
		const n = plainCopy(c);
		const clean = (t: string | null) => (t && t.trim() ? t.trim() : null);
		n.name = { 'it-IT': n.name['it-IT']?.trim() ?? '', 'en-GB': clean(n.name['en-GB']) };
		n.description = { 'it-IT': n.description['it-IT']?.trim() ?? '', 'en-GB': clean(n.description['en-GB']) };
		n.sourceUrl = n.sourceType === 'web' || n.sourceType === 'youtube' ? clean(n.sourceUrl) : null;
		n.bookId = n.sourceType === 'book' ? n.bookId : null;
		n.bookPages = n.sourceType === 'book' ? clean(n.bookPages) : null;
		n.ingredients = n.ingredients.map((line) => {
			const text = line.quantity.kind === 'text' ? { 'it-IT': line.text?.['it-IT']?.trim() ?? '', 'en-GB': clean(line.text?.['en-GB'] ?? null) } : null;
			const written =
				line.quantity.kind === 'amount' && Number.isFinite(line.quantity.value) ? formatQuantity(line.quantity, '', 'metric', 'it-IT')
				: line.quantity.kind === 'to_taste' ? 'q.b.'
				: text?.['it-IT'] ?? '';
			const variety = line.variety && (line.variety['it-IT']?.trim() || line.variety['en-GB']?.trim())
				? { 'it-IT': line.variety['it-IT']?.trim().replace(/\s+/g, ' ') ?? '', 'en-GB': clean(line.variety['en-GB']?.replace(/\s+/g, ' ') ?? null) }
				: null;
			return { ...line, text, variety, sourceText: line.sourceText.trim() || written };
		});
		return n;
	}

	const UNITS: UnitCode[] = ['g', 'kg', 'ml', 'l', 'piece', 'clove', 'tbsp', 'tsp', 'slice', 'pinch', 'us_cup', 'oz'];
	const GROUPS: ProteinGroup[] = ['fish', 'white_meat', 'meat', 'legumes', 'eggs', 'vegetarian'];
	const SOURCE_TYPES: SourceType[] = ['web', 'youtube', 'book', 'home'];
	const MEAL_TYPES: RecipeMealType[] = ['lunch', 'dinner', 'both'];

	function setKind(line: RecipeIngredient, kind: Quantity['kind']) {
		line.quantity = kind === 'amount' ? { kind, value: NaN, unit: 'g' } : { kind };
		line.text = kind === 'text' ? { 'it-IT': '', 'en-GB': null } : null;
	}

	function pick(ingredientId: string, variety: Translated | null) {
		const target = picker?.line;
		if (target === null || target === undefined) {
			content.ingredients.push({ ingredientId, quantity: { kind: 'amount', value: NaN, unit: 'g' }, sourceText: '', text: null, variety: variety ? { ...variety } : null, isOptional: false });
			const line = content.ingredients.length - 1;
			requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#ingredient-${line} input[inputmode]`)?.focus());
		} else {
			content.ingredients[target].ingredientId = ingredientId;
			if (variety) content.ingredients[target].variety = { ...variety };
		}
		picker = null;
	}

	// Variety (round 5): free text with the varieties already used as suggestions and non-blocking advice.
	// Shown only when the line has one or the curator asks for it: most lines have no variety.
	let varietyOpen = $state<Set<number>>(new Set());
	const showsVariety = (line: RecipeIngredient, index: number) => varietyOpen.has(index) || !!(line.variety?.['it-IT'] || line.variety?.['en-GB']);

	function setVariety(line: RecipeIngredient, locale: Locale, value: string) {
		const current = line.variety ?? { 'it-IT': '', 'en-GB': null };
		line.variety = { ...current, [locale]: value };
	}
	const knownFor = (ingredientId: string) => {
		const r = getIngredientVarieties(app.db, app.ctx, ingredientId);
		return r.ok ? r.value : [];
	};
	const hintsFor = (line: RecipeIngredient, locale: Locale): VarietyHint[] => {
		const text = line.variety?.[locale];
		if (!text?.trim()) return [];
		const r = checkVariety(app.db, app.ctx, line.ingredientId, text, locale);
		return r.ok ? r.value : [];
	};

	const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw.replace(',', '.')));
	const missingIn = (l: Locale) =>
		!content.name[l]?.trim() || !content.description[l]?.trim() || content.ingredients.some((i) => i.quantity.kind === 'text' && !i.text?.[l]?.trim());

	// ---- Save, verify, publish ----
	function save(overwrite = false, quiet = false): boolean {
		const c = normalized(content);
		if (!initial) {
			const created = createDraft(app.db, app.ctx, c);
			if (!created.ok) return (app.notify(app.t(errorKey(created.error))), false);
			if (created.value.status === 'invalid') return (showIssues(created.value.issues), false);
			app.update(() => {});
			saved = c;
			allowLeave = true;
			app.notify(app.t('curation.saved'));
			goto(`/recipes/drafts/${created.value.draftId}`, { replaceState: true });
			return false;
		}
		const result = saveDraft(app.db, app.ctx, initial.draft.id, c, baseRevision, overwrite);
		if (!result.ok) return (app.notify(app.t(errorKey(result.error))), false);
		const outcome = result.value;
		if (outcome.status === 'invalid') return (showIssues(outcome.issues), false);
		if (outcome.status === 'conflict') return ((conflict = outcome), false);
		app.update(() => {});
		baseRevision = outcome.revision;
		saved = c;
		content = contentOf(c);
		issues = [];
		conflict = null;
		if (!quiet) app.notify(app.t('curation.saved'));
		return true;
	}

	// Arriving from "Pubblica" on a new recipe that did not pass: show its problems at once.
	$effect(() => {
		if (!initial || page.url.searchParams.get('check') !== '1') return;
		const r = checkDraft(app.db, app.ctx, initial.draft.id);
		if (r.ok) showIssues(r.value.issues);
	});

	function showIssues(found: ValidationIssue[]) {
		issues = found;
		requestAnimationFrame(() => document.getElementById('issues')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	}


	/** Saves when needed, then publishes if the full check passes; otherwise shows what to fix. */
	function publish(overwrite = false) {
		let draftId = initial?.draft.id;
		if (!draftId) {
			const c = normalized(content);
			const created = createDraft(app.db, app.ctx, c);
			if (!created.ok) return app.notify(app.t(errorKey(created.error)));
			if (created.value.status === 'invalid') return showIssues(created.value.issues);
			app.update(() => {});
			saved = c;
			draftId = created.value.draftId;
		} else if (dirty && !save(false, true)) return;
		const result = publishDraft(app.db, app.ctx, draftId, overwrite);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		const outcome = result.value;
		if (outcome.status === 'invalid') {
			// A new recipe is now a draft: open it there, with the problems shown.
			if (!initial) {
				allowLeave = true;
				app.notify(app.t('curation.savedNotPublished'));
				return void goto(`/recipes/drafts/${draftId}?check=1`, { replaceState: true });
			}
			return showIssues(outcome.issues);
		}
		if (outcome.status === 'stale') return void (stale = outcome);
		app.update(() => {});
		allowLeave = true;
		app.notify(app.t('curation.published', { version: outcome.version }));
		goto(`/recipes/${outcome.recipeId}`, { replaceState: true });
	}

	function takeTheirs() {
		if (!conflict) return;
		content = contentOf(conflict.theirs);
		saved = contentOf(conflict.theirs);
		baseRevision = conflict.revision;
		conflict = null;
	}

	function discard() {
		if (!initial) return;
		const result = discardDraft(app.db, app.ctx, initial.draft.id);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		allowLeave = true;
		app.notify(app.t(result.value.kind === 'new' ? 'curation.deleted' : 'curation.discarded'));
		goto(result.value.kind === 'new' ? '/recipes' : `/recipes/${result.value.recipeId}`, { replaceState: true });
	}

	// Notices appear above the form bar instead of covering its buttons.
	$effect(() => {
		document.documentElement.style.setProperty('--toast-offset', '150px');
		return () => document.documentElement.style.removeProperty('--toast-offset');
	});

	beforeNavigate((nav) => {
		if (allowLeave || !dirty || !nav.to) return;
		if (nav.type === 'leave') return nav.cancel();
		nav.cancel();
		leaving = nav.to.url;
	});

	function leave(saveFirst: boolean) {
		const target = leaving;
		leaving = null;
		if (saveFirst && !save()) return;
		allowLeave = true;
		if (target) goto(target.pathname + target.search);
	}

	const fieldLabel = (f: RecipeContentField) => app.t(`curation.field.${f === 'bookId' ? 'book' : f === 'durationMinutes' ? 'duration' : f}` as MessageKey);
</script>

{#snippet translated(field: 'name' | 'description', label: string, max: number)}
	{#each [lang] as l (l)}
		<label class="field" id="field-{field}">
			<span>{label}</span>
			{#if field === 'description'}
				<textarea rows="3" maxlength={max} value={content[field][l] ?? ''} oninput={(e) => (content[field][l] = e.currentTarget.value)}></textarea>
			{:else}
				<input type="text" maxlength={max} value={content[field][l] ?? ''} oninput={(e) => (content[field][l] = e.currentTarget.value)} />
			{/if}
			{#each issuesFor(field, l) as issue (issue.code + issue.locale)}<span class="field-error">{inline(issue)}</span>{/each}
		</label>
	{/each}
{/snippet}

<section class="secondary-view app-view form-view" aria-labelledby="form-title">
	<div class="page-column narrow">
		<PageHeader {back} {backLabel} {title} titleId="form-title">
			{#snippet actions()}
				{#if initial && live}
					<ActionMenu label={app.t('curation.actions')}>
						{#snippet items(run)}
							<button type="button" role="menuitem" class="danger" disabled={app.settings.offline || !live.canDiscard} onclick={() => run(() => (confirmDiscard = true))}>
								{app.t(isNew ? 'curation.delete' : 'curation.discard')}{#if !live.canDiscard}<small> · {app.t('curation.usedByMeals')}</small>{/if}
							</button>
						{/snippet}
					</ActionMenu>
				{/if}
			{/snippet}
		</PageHeader>
		<p class="page-meta">
			<span class="label-chip neutral">{app.t(isNew ? 'curation.kind.new' : 'curation.kind.revision')}</span>
			{#if live}
				{app.t('curation.createdBy', { name: live.createdByName })} · {app.t('curation.savedBy', { name: live.updatedByName, time: formatDateTime(app.locale, live.draft.updatedAt) })}
			{:else}
				{app.t('curation.notSaved')}
			{/if}
		</p>
		{#if live && live.draft.kind === 'revision'}
			<p class="meta-line">{app.t('curation.revisionOf', { version: live.draft.baseVersion ?? 0 })}{#if live.publishedVersion !== live.draft.baseVersion} · <strong>{app.t('curation.movedOn', { version: live.publishedVersion ?? 0 })}</strong>{/if}</p>
		{/if}
		{#if live && live.draft.revision !== baseRevision}
			<p class="notice" role="status">{app.t('curation.changedMeanwhile', { name: live.updatedByName, time: formatDateTime(app.locale, live.draft.updatedAt) })}</p>
		{/if}

		<nav class="index" aria-label={app.t('curation.index')}>
			{#each SECTIONS as s (s)}<a href="#section-{s}">{app.t(`curation.section.${s}` as MessageKey)}</a>{/each}
		</nav>

		<!-- Languages behind a switch (chosen on 7 October 2026), with a dot on the one missing data. -->
		<div class="lang-switch" role="group" aria-label={app.t('curation.language')}>
			{#each LOCALES as l (l)}
				<button type="button" aria-pressed={lang === l} onclick={() => (lang = l)}>{langName(l)}{#if missingIn(l)}<span class="missing-dot" aria-label={app.t('curation.langMissing')}></span>{/if}</button>
			{/each}
		</div>

		{#if issues.length}
			<div class="issues" id="issues" role="alert">
				<p><strong>{app.t('curation.issuesTitle', { count: issues.length })}</strong></p>
				<ul>{#each issues as issue, i (i)}<li><button type="button" class="link-inline" onclick={() => goToIssue(issue)}>{issueText(issue)}</button></li>{/each}</ul>
			</div>
		{/if}

		<form class="recipe-form" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<section class="settings-card" id="section-names">
					<h2>{app.t('curation.section.names')}</h2>
					{@render translated('name', app.t('curation.field.name'), NAME_MAX)}
					{@render translated('description', app.t('curation.field.description'), DESCRIPTION_MAX)}
				</section>

				<section class="settings-card" id="section-source">
					<h2>{app.t('curation.section.source')}</h2>
					<fieldset>
						<legend>{app.t('curation.field.sourceType')}</legend>
						{#each SOURCE_TYPES as type (type)}
							<label class="choice"><input type="radio" name="source" value={type} bind:group={content.sourceType} />{app.t(`curation.source.${type}`)}</label>
						{/each}
					</fieldset>
					{#if content.sourceType === 'web' || content.sourceType === 'youtube'}
						<label class="field" id="field-sourceUrl">{app.t('curation.field.sourceUrl')}
							<input type="url" inputmode="url" placeholder="https://" value={content.sourceUrl ?? ''} oninput={(e) => (content.sourceUrl = e.currentTarget.value)} />
							{#each issuesFor('sourceUrl') as issue (issue.code)}<span class="field-error">{inline(issue)}</span>{/each}
						</label>
					{:else if content.sourceType === 'book'}
						<label class="field" id="field-bookId">{app.t('curation.field.book')}
							<select value={content.bookId ?? ''} onchange={(e) => (content.bookId = e.currentTarget.value || null)}>
								<option value="">—</option>
								{#each app.db.books as book (book.id)}<option value={book.id}>{book.title}</option>{/each}
							</select>
							{#each issuesFor('bookId') as issue (issue.code)}<span class="field-error">{inline(issue)}</span>{/each}
						</label>
						<label class="field" id="field-bookPages">{app.t('curation.field.bookPages')}
							<input type="text" maxlength={20} value={content.bookPages ?? ''} oninput={(e) => (content.bookPages = e.currentTarget.value)} />
							{#each issuesFor('bookPages') as issue (issue.code)}<span class="field-error">{inline(issue)}</span>{/each}
						</label>
					{:else}
						<p class="meta-line">{app.t('curation.homeHint')}</p>
					{/if}
				</section>

				<section class="settings-card" id="section-meal">
					<h2>{app.t('curation.section.meal')}</h2>
					<fieldset>
						<!-- The choices speak for themselves under the section title: the legend stays for screen readers. -->
						<legend class="visually-hidden">{app.t('curation.field.mealType')}</legend>
						{#each MEAL_TYPES as type (type)}
							<label class="choice"><input type="radio" name="meal" value={type} bind:group={content.mealType} />{app.t(`curation.mealType.${type}`)}</label>
						{/each}
					</fieldset>
					<label class="field">{app.t('curation.field.proteinGroup')}
						<select value={content.proteinGroup ?? ''} onchange={(e) => (content.proteinGroup = (e.currentTarget.value || null) as ProteinGroup | null)}>
							<option value="">—</option>
							{#each GROUPS as g (g)}<option value={g}>{app.t(`group.${g}` as const)}</option>{/each}
						</select>
					</label>
					<div class="two">
						<label class="field" id="field-durationMinutes">{app.t('curation.field.duration')}
							<input type="number" inputmode="numeric" min="1" value={content.durationMinutes ?? ''} oninput={(e) => (content.durationMinutes = numberOrNull(e.currentTarget.value))} />
							{#each issuesFor('durationMinutes') as issue (issue.code)}<span class="field-error">{inline(issue)}</span>{/each}
						</label>
						<label class="field" id="field-baseServings">{app.t('curation.field.baseServings')}
							<input type="number" inputmode="numeric" min="1" value={content.baseServings ?? ''} oninput={(e) => (content.baseServings = numberOrNull(e.currentTarget.value))} />
							{#each issuesFor('baseServings') as issue (issue.code)}<span class="field-error">{inline(issue)}</span>{/each}
						</label>
					</div>
				</section>

				<section class="settings-card" id="section-ingredients">
					<h2 id="field-ingredients">{app.t('curation.section.ingredients')}</h2>
					<p class="meta-line">{app.t('curation.ingredientsHint')}</p>
					{#each issuesFor('ingredients') as issue (issue.code)}<p class="field-error">{inline(issue)}</p>{/each}
					<ol class="lines">
						{#each content.ingredients as line, index (index)}
							<li class="line" id="ingredient-{index}" class:has-error={lineIssues(index).length > 0}>
								<div class="line-head">
									<button type="button" class="ingredient-name" onclick={() => (picker = { line: index })}>{ingredientName(line.ingredientId)}<svg class="icon" aria-hidden="true"><use href="#icon-edit" /></svg></button>
									<button type="button" class="remove" aria-label={app.t('curation.ingredient.remove', { name: ingredientName(line.ingredientId) })} onclick={() => content.ingredients.splice(index, 1)}>×</button>
								</div>
								{#if !showsVariety(line, index)}
									<button type="button" class="link-inline add-variety" onclick={() => (varietyOpen = new Set([...varietyOpen, index]))}>{app.t('curation.addVariety')}</button>
								{:else}
								{#each [lang] as l (l)}
									<label class="field small">{`${app.t('curation.variety')} · ${langName(l)}`}
										<input type="text" maxlength={40} list="varieties-{index}-{l}" placeholder={app.t('curation.varietyHint')} value={line.variety?.[l] ?? ''} oninput={(e) => setVariety(line, l, e.currentTarget.value)} />
										<datalist id="varieties-{index}-{l}">{#each knownFor(line.ingredientId) as v (v['it-IT'])}{#if v[l]}<option value={v[l]}></option>{/if}{/each}</datalist>
										{#each hintsFor(line, l) as hint (hint.kind)}
											<span class="hint">
												{#if hint.kind === 'existing_spelling'}
													{app.t('curation.hint.existing', { text: hint.suggestion[l] ?? hint.suggestion['it-IT'] })}
													<button type="button" class="link-inline" onclick={() => (line.variety = { ...hint.suggestion })}>{app.t('curation.hint.use')}</button>
												{:else if hint.kind === 'repeats_ingredient'}
													{app.t('curation.hint.repeats', { text: hint.suggestion })}
													<button type="button" class="link-inline" onclick={() => setVariety(line, l, hint.suggestion)}>{app.t('curation.hint.use')}</button>
												{:else}
													{app.t('curation.hint.preparation')}
												{/if}
											</span>
										{/each}
									</label>
								{/each}
								{/if}
								<div class="quantity-row">
									<select aria-label={app.t('curation.ingredient.kind')} value={line.quantity.kind} onchange={(e) => setKind(line, e.currentTarget.value as Quantity['kind'])}>
										<option value="amount">{app.t('curation.quantity.amount')}</option>
										<option value="to_taste">{app.t('curation.quantity.toTaste')}</option>
										<option value="text">{app.t('curation.quantity.text')}</option>
									</select>
									{#if line.quantity.kind === 'amount'}
										{@const q = line.quantity}
										<input class="amount" type="text" inputmode="decimal" aria-label={app.t('curation.ingredient.quantity')} value={Number.isFinite(q.value) ? String(q.value).replace('.', app.locale === 'it-IT' ? ',' : '.') : ''} oninput={(e) => (q.value = numberOrNull(e.currentTarget.value) ?? NaN)} />
										<select aria-label={app.t('curation.ingredient.unit')} value={q.unit} onchange={(e) => (q.unit = e.currentTarget.value as UnitCode)}>
											{#each UNITS as unit (unit)}<option value={unit}>{app.t(`curation.unit.${unit}` as MessageKey)}</option>{/each}
										</select>
									{/if}
								</div>
								{#if line.quantity.kind === 'text' && line.text}
									{@const text = line.text}
									{#each [lang] as l (l)}
										<label class="field small">{`${app.t('curation.quantity.textLabel')} · ${langName(l)}`}
											<input type="text" maxlength={QUANTITY_TEXT_MAX} value={text[l] ?? ''} oninput={(e) => (text[l] = e.currentTarget.value)} />
										</label>
									{/each}
								{/if}
								<label class="field small">{app.t('curation.ingredient.sourceText')}
									<input type="text" maxlength={60} placeholder={app.t('curation.ingredient.sourceTextHint')} bind:value={line.sourceText} />
								</label>
								<label class="choice"><input type="checkbox" bind:checked={line.isOptional} />{app.t('curation.ingredient.optional')}</label>
								{#each lineIssues(index) as issue (issue.code + issue.locale + issue.part)}<span class="field-error">{inline(issue)}</span>{/each}
							</li>
						{/each}
					</ol>
					<button type="button" class="text-button" onclick={() => (picker = { line: null })}><svg class="icon" aria-hidden="true"><use href="#icon-plus" /></svg>{app.t('curation.ingredient.addLine')}</button>
				</section>


			<div class="form-bar">
				<button type="submit" class="text-button" disabled={app.settings.offline || (!!initial && !dirty)}>{app.t('curation.save')}</button>
				<button type="button" class="text-button primary" disabled={app.settings.offline} onclick={() => publish()}>{app.t('curation.publish')}</button>
			</div>
		</form>
	</div>
</section>

<BottomSheet open={picker !== null} title={app.t(picker?.line === null ? 'curation.ingredient.addLine' : 'curation.ingredient.change')} onClose={() => (picker = null)}>
	<IngredientPicker onPick={pick} />
</BottomSheet>

<BottomSheet open={conflict !== null} title={app.t('curation.conflict.title')} onClose={() => (conflict = null)}>
	{#if conflict}
		<p>{app.t('curation.conflict.body', { name: conflict.byName, time: formatDateTime(app.locale, conflict.at) })}</p>
		<p><strong>{app.t('curation.conflict.theirs', { name: conflict.byName })}</strong> {conflict.theirFields.map(fieldLabel).join(', ') || '—'}</p>
		<p><strong>{app.t('curation.conflict.mine')}</strong> {conflict.myFields.map(fieldLabel).join(', ') || '—'}</p>
		<div class="sheet-actions">
			<button type="button" class="text-button" onclick={takeTheirs}>{app.t('curation.conflict.takeTheirs', { name: conflict.byName })}</button>
			<button type="button" class="text-button danger-outline" onclick={() => save(true)}>{app.t('curation.conflict.overwrite')}</button>
		</div>
		<p class="meta-line">{app.t('curation.conflict.kept')}</p>
	{/if}
</BottomSheet>

<BottomSheet open={stale !== null} title={app.t('curation.stale.title')} onClose={() => (stale = null)}>
	{#if stale && initial}
		<p>{app.t('curation.stale.body', { name: stale.byName, time: formatDateTime(app.locale, stale.at), version: stale.version })}</p>
		<div class="sheet-actions">
			<a class="text-button" href="/recipes/{initial.draft.recipeId}/versions">{app.t('curation.versions')}</a>
			<button type="button" class="text-button danger-outline" onclick={() => { stale = null; publish(true); }}>{app.t('curation.stale.publishAnyway')}</button>
		</div>
	{/if}
</BottomSheet>

<BottomSheet open={confirmDiscard} title={app.t(isNew ? 'curation.delete' : 'curation.discard')} onClose={() => (confirmDiscard = false)}>
	<p>{app.t(isNew ? 'curation.deleteBody' : 'curation.discardBody')}</p>
	<ConfirmDanger label={app.t(isNew ? 'curation.delete' : 'curation.discard')} disabled={app.settings.offline} onConfirm={() => { confirmDiscard = false; discard(); }} />
</BottomSheet>

<BottomSheet open={leaving !== null} title={app.t('curation.leave.title')} onClose={() => (leaving = null)}>
	<p>{app.t('curation.leave.body')}</p>
	<div class="sheet-actions">
		<button type="button" class="text-button primary" disabled={app.settings.offline} onclick={() => leave(true)}>{app.t('curation.leave.save')}</button>
		<button type="button" class="text-button danger-outline" onclick={() => leave(false)}>{app.t('curation.leave.discard')}</button>
		<button type="button" class="text-button" onclick={() => (leaving = null)}>{app.t('curation.leave.stay')}</button>
	</div>
</BottomSheet>

<style>
	.form-view { padding-bottom: 0; }
	.narrow { max-width: 640px; }
	.page-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 0 0 8px; }
	.notice { margin: 0 0 12px; padding: 10px 12px; background: var(--free-surface); border: 1px solid var(--free-border); font-size: 0.875rem; }
	.index { display: flex; gap: 6px; margin: 4px 0 16px; overflow-x: auto; scrollbar-width: none; }
	.index a { flex: none; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 999px; background: var(--paper); color: var(--ink); font-size: 0.875rem; text-decoration: none; }
	.lang-switch { display: inline-flex; margin: 0 0 16px; border: 1px solid var(--ink); border-radius: 8px; overflow: hidden; }
	.lang-switch button { position: relative; min-height: 40px; padding: 6px 16px; border: 0; background: var(--paper); color: var(--ink); font: 700 0.875rem/1.3 var(--text-font); cursor: pointer; }
	.lang-switch [aria-pressed='true'] { color: #fff; background: var(--ink); }
	.missing-dot { display: inline-block; width: 8px; height: 8px; margin-left: 6px; border-radius: 50%; background: #b3261e; vertical-align: middle; }
	.issues { margin: 0 0 16px; padding: 12px 16px; border-left: 4px solid #b3261e; background: var(--paper); box-shadow: var(--card-shadow); font-size: 0.875rem; }
	.issues p { margin: 0 0 6px; }
	.issues ul { margin: 0; padding: 0; list-style: none; }
	.issues li { margin: 4px 0; }
	.issues .link-inline { display: block; min-height: 32px; padding: 4px 0; border: 0; background: none; font: inherit; font-weight: 400; text-align: left; cursor: pointer; text-decoration: underline; }
	fieldset { margin: 0 0 12px; padding: 0; border: 0; }
	legend { margin-bottom: 4px; font-size: 0.875rem; font-weight: 700; }
	.field textarea, .field input[type='url'], .field input[type='number'] { min-height: 44px; padding: 8px 12px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 1rem/1.5 var(--text-font); }
	.field textarea { resize: vertical; }
	.field-error { display: block; color: #b3261e; font-size: 0.8125rem; font-weight: 400; }
	p.field-error { margin: 0 0 8px; }
	.two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
	.field input, .field select, .field textarea { width: 100%; min-width: 0; box-sizing: border-box; }
	.lines { margin: 0 0 12px; padding: 0; list-style: none; }
	.line { padding: 12px 0; border-top: 1px solid var(--rule); }
	.line.has-error { border-left: 3px solid #b3261e; padding-left: 10px; }
	.line-head { display: flex; align-items: center; gap: 8px; }
	.ingredient-name { display: inline-flex; flex: 1; align-items: center; gap: 6px; min-height: 44px; padding: 0; border: 0; background: none; color: var(--ink); font: 700 1rem/1.3 var(--text-font); text-align: left; cursor: pointer; }
	.ingredient-name .icon { width: 16px; height: 16px; color: var(--muted); }
	.remove { width: 44px; height: 44px; border: 0; background: none; color: var(--muted); font-size: 1.5rem; cursor: pointer; }
	.quantity-row { display: flex; gap: 8px; margin-bottom: 8px; }
	.quantity-row > * { flex: 1 1 0; }
	.quantity-row select, .quantity-row input { min-width: 0; min-height: 44px; padding: 8px; border: 1px solid var(--ink); border-radius: 8px; background: var(--paper); color: var(--ink); font: 400 1rem/1.5 var(--text-font); }
	.quantity-row .amount { width: 5.5em; flex: none; }
	.field.small { margin-bottom: 8px; font-weight: 400; }
	.add-variety { display: block; min-height: 36px; margin: -6px 0 6px; padding: 0; border: 0; background: none; font: inherit; font-size: 0.875rem; text-align: left; cursor: pointer; }
	.hint { display: block; color: var(--body-text); font-size: 0.8125rem; }
	.hint .link-inline { min-height: 32px; padding: 0 4px; border: 0; background: none; font: inherit; font-weight: 700; cursor: pointer; }
	.form-bar { position: sticky; bottom: 0; z-index: 5; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 -24px; padding: 12px 24px max(12px, env(safe-area-inset-bottom)); background: var(--canvas); border-top: 1px solid var(--rule); }
	.form-bar .text-button { padding-inline: 8px; }
	.sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
	@media (max-width: 767px) { .form-bar { margin-inline: -16px; padding-inline: 16px; } }
	@media (max-width: 359px) { .form-bar { margin-inline: -12px; padding-inline: 12px; } .two { grid-template-columns: 1fr; } }
</style>
