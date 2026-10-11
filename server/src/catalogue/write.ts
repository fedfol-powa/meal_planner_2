import { blocksDraft, checkDraft, cleanDraft, projectDraftNames, recipeDraftSchema, toPublished, type RecipeDraftDocument } from '@app/domain/recipe';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import { lockCreations, writeInstant, type Actor } from './actor.ts';
import { publicationCheck } from './check.ts';
import type { Conversion } from './convert.ts';
import { versionConflict, writeVersion } from './recipe-writes.ts';
import { changedFields, sameDocument } from './fields.ts';
import { isCited, loadAuthors, loadDraftRow, loadLookup } from './load.ts';
import { slugify, uniqueSlug } from './slug.ts';

// Writes of the recipe book, reusable without the pipeline (the production import calls them
// with channel 'import'). Signatures fixed with the coordinator (spec, section 1).

export { actorOf, lockCreations, writeInstant, type Actor, type Channel } from './actor.ts';

export interface CreateDraftInput {
	draftId: string;
	content: RecipeDraftDocument;
	originSlug?: string | null;
	originType?: string | null;
}
export interface CreatedDraft {
	draftId: string;
	recipeId: string;
	created: boolean;
}
export interface SaveDraftInput {
	draftId: string;
	baseRevision: number;
	content: RecipeDraftDocument;
	overwriteRevision?: number;
}
export interface SavedDraft {
	draftId: string;
	revision: number;
}

/** Trimmed, then checked as a draft: only wrong data is refused (spec section 8). */
async function cleanAndCheck(tx: Tx, content: RecipeDraftDocument): Promise<RecipeDraftDocument> {
	const parsed = recipeDraftSchema.safeParse(content);
	const cleaned = parsed.success ? cleanDraft(parsed.data) : content;
	const blocking = checkDraft(cleaned, await loadLookup(tx, cleaned)).filter(blocksDraft);
	if (blocking.length) throw appError('invalid', { issues: blocking.map((i) => ({ path: ['content', ...i.path], code: i.code })) });
	return cleaned;
}

const recipeSlug = (tx: Tx, content: RecipeDraftDocument) =>
	uniqueSlug(slugify(content.name?.['it-IT'] || content.name?.['en-GB'] || '', 'recipe'), async (s) => (await tx`select 1 from app.recipes where slug = ${s}`).length > 0);

async function addSave(tx: Tx, actor: Actor, at: Date, draftId: string, revision: number, content: RecipeDraftDocument) {
	await tx`insert into app.recipe_draft_saves (draft_id, revision, content, saved_by, saved_at, channel)
		values (${draftId}, ${revision}, ${tx.json(content as never)}, ${actor.userId}, ${at}, ${actor.channel})`;
}

export async function createDraft(tx: Tx, actor: Actor, input: CreateDraftInput): Promise<CreatedDraft> {
	await lockCreations(tx);
	const [same] = await tx<{ recipe_id: string }[]>`select recipe_id from app.recipe_drafts where id = ${input.draftId}`;
	if (same) return { draftId: input.draftId, recipeId: same.recipe_id, created: false };
	if (input.originSlug) {
		const [known] = await tx<{ recipe_id: string; draft_id: string | null }[]>`
			select r.id as recipe_id,
				(select d.id from app.recipe_drafts d where d.recipe_id = r.id order by d.created_at desc limit 1) as draft_id
			from app.recipes r where r.origin_slug = ${input.originSlug}`;
		if (known?.draft_id) return { draftId: known.draft_id, recipeId: known.recipe_id, created: false };
		if (known) throw appError('invalid', { issues: [{ path: ['originSlug'], code: 'invalid_value' }] });
	}
	const content = await cleanAndCheck(tx, input.content);
	const names = projectDraftNames(content);
	const slug = await recipeSlug(tx, content);
	const at = await writeInstant(tx);
	const [recipe] = await tx<{ id: string }[]>`
		insert into app.recipes (slug, origin_slug, origin_type, name, description, created_by, created_at, updated_by, updated_at)
		values (${slug}, ${input.originSlug ?? null}, ${input.originType ?? null}, ${tx.json(names.name)}, ${tx.json(names.description)},
			${actor.userId}, ${at}, ${actor.userId}, ${at})
		returning id`;
	await tx`insert into app.recipe_drafts (id, recipe_id, kind, content, revision, created_by, created_at, updated_by, updated_at)
		values (${input.draftId}, ${recipe!.id}, 'new', ${tx.json(content as never)}, 1, ${actor.userId}, ${at}, ${actor.userId}, ${at})`;
	await addSave(tx, actor, at, input.draftId, 1, content);
	return { draftId: input.draftId, recipeId: recipe!.id, created: true };
}

/** Order of the spec (section 3): the creation already made, then the recipe, then the open revision. */
export async function startRevision(tx: Tx, actor: Actor, input: { recipeId: string; draftId: string }): Promise<{ draftId: string }> {
	await lockCreations(tx);
	const [same] = await tx<{ recipe_id: string }[]>`select recipe_id from app.recipe_drafts where id = ${input.draftId}`;
	if (same) {
		if (same.recipe_id !== input.recipeId) throw appError('invalid', { issues: [{ path: ['id'], code: 'invalid_value' }] });
		return { draftId: input.draftId };
	}
	const [recipe] = await tx<{ status: string; version: number }[]>`select status, version from app.recipes where id = ${input.recipeId} for update`;
	if (!recipe) throw appError('not_found');
	if (recipe.status === 'draft') throw appError('not_allowed', { reason: 'not_published' });
	const [open] = await tx<{ id: string }[]>`select id from app.recipe_drafts where recipe_id = ${input.recipeId} and closed_at is null`;
	if (open) return { draftId: open.id };
	const [current] = await tx<{ content: RecipeDraftDocument }[]>`
		select content from app.recipe_versions where recipe_id = ${input.recipeId} and version = ${recipe.version}`;
	if (!current) throw appError('not_found');
	const at = await writeInstant(tx);
	await tx`insert into app.recipe_drafts (id, recipe_id, kind, base_version, content, revision, created_by, created_at, updated_by, updated_at)
		values (${input.draftId}, ${input.recipeId}, 'revision', ${recipe.version}, ${tx.json(current.content as never)}, 1,
			${actor.userId}, ${at}, ${actor.userId}, ${at})`;
	await addSave(tx, actor, at, input.draftId, 1, current.content);
	return { draftId: input.draftId };
}

export async function saveDraft(tx: Tx, actor: Actor, input: SaveDraftInput): Promise<SavedDraft> {
	const row = await loadDraftRow(tx, input.draftId, { lock: true });
	if (!row) throw appError('not_found');
	const content = await cleanAndCheck(tx, input.content);
	// A repeated request (lost answer): the last save already holds this content.
	if (sameDocument(row.content, content)) return { draftId: row.id, revision: row.revision };
	if (row.closedAt) throw appError('not_found');
	if (input.baseRevision > row.revision) throw appError('invalid', { issues: [{ path: ['baseRevision'], code: 'invalid_value' }] });
	if (input.baseRevision < row.revision && input.overwriteRevision !== row.revision) {
		const [base] = await tx<{ content: RecipeDraftDocument }[]>`
			select content from app.recipe_draft_saves where draft_id = ${row.id} and revision = ${input.baseRevision}`;
		const from = base?.content ?? row.content;
		const authors = await loadAuthors(tx);
		throw appError('conflict', {
			kind: 'draft',
			revision: row.revision,
			by: row.updatedBy,
			byName: row.updatedBy ? (authors.get(row.updatedBy) ?? null) : null,
			at: row.updatedAt.toISOString(),
			theirFields: changedFields(from, row.content),
			myFields: changedFields(from, content),
			theirs: row.content,
		});
	}
	const revision = row.revision + 1;
	const at = await writeInstant(tx);
	if (input.baseRevision < row.revision) {
		await tx`update app.recipe_draft_saves set overwritten = true
			where draft_id = ${row.id} and revision > ${input.baseRevision} and revision <= ${row.revision}`;
	}
	await tx`update app.recipe_drafts set content = ${tx.json(content as never)}, revision = ${revision}, updated_by = ${actor.userId}, updated_at = ${at}
		where id = ${row.id}`;
	await addSave(tx, actor, at, row.id, revision, content);
	if (row.kind === 'new') {
		// Members read the names of meals citing a new draft without seeing drafts (W2 ↔ W3).
		const names = projectDraftNames(content);
		await tx`update app.recipes set name = ${tx.json(names.name)}, description = ${tx.json(names.description)}, updated_by = ${actor.userId}, updated_at = ${at}
			where id = ${row.recipeId}`;
	}
	return { draftId: row.id, revision };
}

export async function discardDraft(tx: Tx, actor: Actor, input: { draftId: string }): Promise<{ draftId: string; recipeId: string; kind: 'new' | 'revision' }> {
	const row = await loadDraftRow(tx, input.draftId, { lock: true });
	if (!row) throw appError('not_found');
	const answer = { draftId: row.id, recipeId: row.recipeId, kind: row.kind };
	if (row.outcome === 'discarded') return answer;
	if (row.closedAt) throw appError('not_found');
	if (row.kind === 'new' && (await isCited(tx, row.recipeId))) throw appError('not_allowed', { reason: 'cited_by_meals' });
	const at = await writeInstant(tx);
	await tx`update app.recipe_drafts set closed_at = ${at}, closed_by = ${actor.userId}, outcome = 'discarded' where id = ${row.id}`;
	return answer;
}

export interface PublishInput {
	draftId: string;
	confirmVersion?: number;
}
export interface Published {
	recipeId: string;
	version: number;
	publishedAt: Date;
	conversions: Conversion[];
}

export async function publishDraft(tx: Tx, actor: Actor, input: PublishInput): Promise<Published> {
	const row = await loadDraftRow(tx, input.draftId, { lock: true }); // locks the draft and its recipe
	if (!row) throw appError('not_found');
	if (row.outcome === 'published') {
		// Repeat after a lost answer: the version written when the draft was closed (same instant).
		const [v] = await tx<{ version: number; published_at: Date }[]>`
			select version, published_at from app.recipe_versions
			where recipe_id = ${row.recipeId} and published_at = ${row.closedAt} and published_by is not distinct from ${row.closedBy}
			order by version desc limit 1`;
		if (v) return { recipeId: row.recipeId, version: v.version, publishedAt: v.published_at, conversions: [] };
	}
	if (row.closedAt) throw appError('not_found');
	const { document, issues, conversions } = await publicationCheck(tx, row.content);
	if (issues.length) throw appError('invalid', { issues });
	if (row.kind === 'revision' && row.recipeVersion !== row.baseVersion && input.confirmVersion !== row.recipeVersion) {
		await versionConflict(tx, row.recipeId, row.recipeVersion);
	}
	const { version, at } = await writeVersion(tx, actor, { recipeId: row.recipeId, document: toPublished(document), restoredFrom: null });
	await tx`update app.recipe_drafts set closed_at = ${at}, closed_by = ${actor.userId}, outcome = 'published' where id = ${row.id}`;
	return { recipeId: row.recipeId, version, publishedAt: at, conversions };
}
