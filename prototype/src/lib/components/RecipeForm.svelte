<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import ActionMenu from './ActionMenu.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import ConfirmDanger from './ConfirmDanger.svelte';
	import IngredientPicker from './IngredientPicker.svelte';
	import PageHeader from './PageHeader.svelte';
	import { changedFields, contentOf, plainCopy } from '#lib/domain/recipe-content.ts';
	import { DESCRIPTION_MAX, NAME_MAX, QUANTITY_TEXT_MAX, type ValidationIssue } from '#lib/domain/recipe-validation.ts';
	import { LOCALES, type Locale, type ProteinGroup, type Quantity, type RecipeContent, type RecipeContentField, type RecipeIngredient, type RecipeMealType, type SourceType, type UnitCode } from '#lib/domain/types.ts';
	import { formatDateTime } from '#lib/i18n/dates.ts';
	import { errorKey } from '#lib/i18n/errors.ts';
	import type { MessageKey } from '#lib/i18n/messages.ts';
	import {
		createDraft,
		discardDraft,
		emptyContent,
		getDraft,
		publishDraft,
		saveDraft,
		verifyDraft,
		type DraftDetail,
		type SaveOutcome
	} from '#lib/operations/curation.ts';
	import { app } from '#lib/store/app.svelte.ts';
	import { formatQuantity } from '#lib/units/format.ts';

	// Manual curation path (spec section 8, round 5): a shared draft edited without AI, saved on purpose
	// (conflicts are checked at every save), verified with the shared rules, then published.
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
	let checked = $state(false);
	let conflict = $state<Extract<SaveOutcome, { status: 'conflict' }> | null>(null);
	let stale = $state<{ byName: string; at: string; version: number } | null>(null);
	let picker = $state<{ line: number | null } | null>(null);
	let confirmDiscard = $state(false);
	let leaving = $state<URL | null>(null);
	let allowLeave = false;

	const variant = $derived(app.settings.variants);
	let lang = $state<Locale>(app.locale);
	const dirty = $derived(changedFields(saved, normalized(content)).length > 0);
	const verified = $derived(!!live?.verified && !dirty);
	const isNew = $derived(!initial || initial.draft.kind === 'new');
	const title = $derived(nameIn(content) || app.t('curation.new'));
	const back = $derived(initial?.draft.kind === 'revision' ? `/recipes/${initial.draft.recipeId}` : '/recipes');
	const backLabel = $derived(initial?.draft.kind === 'revision' ? app.t('curation.backToRecipe') : app.t('nav.recipes'));

	function nameIn(c: RecipeContent): string {
		return (c.name[app.locale] || c.name['it-IT'] || c.name['en-GB'] || '').trim();
	}

	// ---- Steps (variant) and sections ----
	const SECTIONS = ['names', 'source', 'meal', 'ingredients', 'check'] as const;
	type Section = (typeof SECTIONS)[number];
	let step = $state<Section>('names');
	const stepIndex = $derived(SECTIONS.indexOf(step));
	const shows = (section: Section) => variant.recipeForm === 'sections' || step === section;
	const sectionOf = (issue: ValidationIssue): Section =>
		issue.field === 'name' || issue.field === 'description' ? 'names'
		: issue.field === 'sourceUrl' || issue.field === 'bookId' || issue.field === 'bookPages' ? 'source'
		: issue.field === 'ingredients' && issue.line !== undefined ? 'ingredients'
		: issue.field === 'ingredients' ? 'ingredients'
		: 'meal';

	function goToIssue(issue: ValidationIssue) {
		step = sectionOf(issue);
		if (issue.locale && variant.formLanguages === 'switch') lang = issue.locale;
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
		}
		if (issue.locale) where += ` (${langName(issue.locale)})`;
		return `${where}: ${problemOf(issue)}`;
	}

	/** Next to the field only the problem, capitalised; the full text is in the summary. */
	function problemOf(issue: ValidationIssue): string {
		return issue.line === undefined && issue.field === 'ingredients' && issue.code === 'required' ? app.t('curation.issue.noIngredients') : app.t(`curation.issue.${issue.code}` as MessageKey);
	}
	const inline = (issue: ValidationIssue) => {
		const text = issue.line !== undefined && issue.part ? `${app.t(issue.part === 'quantity' ? 'curation.ingredient.quantity' : 'curation.issue.ingredient')}${issue.locale ? ` (${langName(issue.locale)})` : ''}: ${problemOf(issue)}` : problemOf(issue);
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
			return { ...line, text, sourceText: line.sourceText.trim() || written };
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

	function pick(ingredientId: string) {
		const target = picker?.line;
		if (target === null || target === undefined) {
			content.ingredients.push({ ingredientId, quantity: { kind: 'amount', value: NaN, unit: 'g' }, sourceText: '', text: null, isOptional: false });
			const line = content.ingredients.length - 1;
			requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`#ingredient-${line} input[inputmode]`)?.focus());
		} else content.ingredients[target].ingredientId = ingredientId;
		picker = null;
	}

	const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw.replace(',', '.')));
	const missingIn = (l: Locale) =>
		!content.name[l]?.trim() || !content.description[l]?.trim() || content.ingredients.some((i) => i.quantity.kind === 'text' && !i.text?.[l]?.trim());

	// ---- Save, verify, publish ----
	function save(overwrite = false): boolean {
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
		checked = false;
		conflict = null;
		app.notify(app.t('curation.saved'));
		return true;
	}

	function showIssues(found: ValidationIssue[]) {
		issues = found;
		checked = true;
		if (variant.recipeForm === 'steps') step = 'check';
		requestAnimationFrame(() => document.getElementById('issues')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
	}

	function verify() {
		if (!initial) return void save();
		if (dirty && !save()) return;
		const result = verifyDraft(app.db, app.ctx, initial.draft.id);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		app.update(() => {});
		showIssues(result.value.issues);
		if (!result.value.issues.length) app.notify(app.t('curation.verifiedToast'));
	}

	function publish(overwrite = false) {
		if (!initial) return;
		const result = publishDraft(app.db, app.ctx, initial.draft.id, overwrite);
		if (!result.ok) return app.notify(app.t(errorKey(result.error)));
		const outcome = result.value;
		if (outcome.status === 'invalid') return showIssues(outcome.issues);
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
	{#each variant.formLanguages === 'stacked' ? LOCALES : [lang] as l (l)}
		<label class="field" id={l === LOCALES[0] || variant.formLanguages === 'switch' ? `field-${field}` : undefined}>
			<span>{label}{#if variant.formLanguages === 'stacked'}{` · ${langName(l)}`}{/if}</span>
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

		{#if variant.recipeForm === 'sections'}
			<nav class="index" aria-label={app.t('curation.index')}>
				{#each SECTIONS as s (s)}<a href="#section-{s}">{app.t(`curation.section.${s}` as MessageKey)}</a>{/each}
			</nav>
		{:else}
			<ol class="steps" aria-label={app.t('curation.index')}>
				{#each SECTIONS as s, i (s)}
					<li><button type="button" aria-current={step === s ? 'step' : undefined} class:has-issues={issues.some((x) => sectionOf(x) === s)} onclick={() => (step = s)}>
						<span class="dot">{i + 1}</span><span class="step-label">{app.t(`curation.section.${s}` as MessageKey)}</span>
					</button></li>
				{/each}
			</ol>
		{/if}

		{#if variant.formLanguages === 'switch'}
			<div class="lang-switch" role="group" aria-label={app.t('curation.language')}>
				{#each LOCALES as l (l)}
					<button type="button" aria-pressed={lang === l} onclick={() => (lang = l)}>{langName(l)}{#if missingIn(l)}<span class="missing-dot" aria-label={app.t('curation.langMissing')}></span>{/if}</button>
				{/each}
			</div>
		{/if}

		{#if issues.length && (variant.recipeForm === 'sections' || step !== 'check')}
			<div class="issues" id="issues" role="alert">
				<p><strong>{app.t('curation.issuesTitle', { count: issues.length })}</strong></p>
				<ul>{#each issues as issue, i (i)}<li><button type="button" class="link-inline" onclick={() => goToIssue(issue)}>{issueText(issue)}</button></li>{/each}</ul>
			</div>
		{/if}

		<form class="recipe-form" onsubmit={(e) => { e.preventDefault(); save(); }}>
			{#if shows('names')}
				<section class="settings-card" id="section-names">
					<h2>{app.t('curation.section.names')}</h2>
					{@render translated('name', app.t('curation.field.name'), NAME_MAX)}
					{@render translated('description', app.t('curation.field.description'), DESCRIPTION_MAX)}
				</section>
			{/if}

			{#if shows('source')}
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
			{/if}

			{#if shows('meal')}
				<section class="settings-card" id="section-meal">
					<h2>{app.t('curation.section.meal')}</h2>
					<fieldset>
						<legend>{app.t('curation.field.mealType')}</legend>
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
					<p class="meta-line">{app.t('curation.baseServingsHint')}</p>
				</section>
			{/if}

			{#if shows('ingredients')}
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
									{#each variant.formLanguages === 'stacked' ? LOCALES : [lang] as l (l)}
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
			{/if}

			{#if shows('check')}
				<section class="settings-card" id="section-check">
					<h2>{app.t('curation.section.check')}</h2>
					{#if dirty}
						<p>{app.t('curation.state.unsaved')}</p>
					{:else if verified}
						<p class="ok">{app.t('curation.state.verified')}</p>
					{:else if checked && issues.length}
						<p>{app.t('curation.state.issues')}</p>
						{#if variant.recipeForm === 'steps'}
							<ul class="issue-list">{#each issues as issue, i (i)}<li><button type="button" class="link-inline" onclick={() => goToIssue(issue)}>{issueText(issue)}</button></li>{/each}</ul>
						{/if}
					{:else}
						<p>{app.t('curation.state.toVerify')}</p>
					{/if}
					<p class="meta-line">{app.t('curation.checkHint')}</p>
				</section>
			{/if}

			{#if variant.recipeForm === 'steps'}
				<div class="step-nav">
					<button type="button" class="text-button" disabled={stepIndex === 0} onclick={() => (step = SECTIONS[stepIndex - 1])}>{app.t('curation.previous')}</button>
					{#if stepIndex < SECTIONS.length - 1}<button type="button" class="text-button" onclick={() => (step = SECTIONS[stepIndex + 1])}>{app.t('curation.next')}</button>{/if}
				</div>
			{/if}

			<div class="form-bar">
				<button type="submit" class="text-button" disabled={app.settings.offline || (!!initial && !dirty)}>{app.t('curation.save')}</button>
				<button type="button" class="text-button" disabled={app.settings.offline || !initial} onclick={verify}>{app.t('curation.verify')}</button>
				<button type="button" class="text-button primary" disabled={app.settings.offline || !verified} onclick={() => publish()}>{app.t('curation.publish')}</button>
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
	.steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; margin: 4px 0 16px; padding: 0; list-style: none; }
	.steps button { display: grid; justify-items: center; gap: 4px; width: 100%; min-height: 56px; padding: 4px 0; border: 0; background: none; color: var(--muted); font: 400 0.75rem/1.2 var(--text-font); cursor: pointer; }
	.steps .dot { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid currentColor; border-radius: 50%; font-weight: 700; }
	.steps [aria-current='step'] { color: var(--ink); font-weight: 700; }
	.steps [aria-current='step'] .dot { color: #fff; background: var(--ink); border-color: var(--ink); }
	.steps .has-issues .dot { border-color: #b3261e; color: #b3261e; }
	.steps [aria-current='step'].has-issues .dot { color: #fff; background: #b3261e; }
	.step-label { text-align: center; }
	@media (max-width: 479px) { .steps button:not([aria-current]) .step-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; } }
	.lang-switch { display: inline-flex; margin: 0 0 16px; border: 1px solid var(--ink); border-radius: 8px; overflow: hidden; }
	.lang-switch button { position: relative; min-height: 40px; padding: 6px 16px; border: 0; background: var(--paper); color: var(--ink); font: 700 0.875rem/1.3 var(--text-font); cursor: pointer; }
	.lang-switch [aria-pressed='true'] { color: #fff; background: var(--ink); }
	.missing-dot { display: inline-block; width: 8px; height: 8px; margin-left: 6px; border-radius: 50%; background: #b3261e; vertical-align: middle; }
	.issues { margin: 0 0 16px; padding: 12px 16px; border-left: 4px solid #b3261e; background: var(--paper); box-shadow: var(--card-shadow); font-size: 0.875rem; }
	.issues p { margin: 0 0 6px; }
	.issues ul, .issue-list { margin: 0; padding: 0; list-style: none; }
	.issues li, .issue-list li { margin: 4px 0; }
	.issues .link-inline, .issue-list .link-inline { display: block; min-height: 32px; padding: 4px 0; border: 0; background: none; font: inherit; font-weight: 400; text-align: left; cursor: pointer; text-decoration: underline; }
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
	.ok { color: var(--green); font-weight: 700; }
	.step-nav { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 16px; }
	.form-bar { position: sticky; bottom: 0; z-index: 5; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0 -24px; padding: 12px 24px max(12px, env(safe-area-inset-bottom)); background: var(--canvas); border-top: 1px solid var(--rule); }
	.form-bar .text-button { padding-inline: 8px; }
	.sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 8px; }
	@media (max-width: 767px) { .form-bar { margin-inline: -16px; padding-inline: 16px; } }
	@media (max-width: 359px) { .form-bar { margin-inline: -12px; padding-inline: 12px; } .two { grid-template-columns: 1fr; } }
</style>
