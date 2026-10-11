import { missingData } from '@app/domain/recipe';
import { appError } from '../errors.ts';
import { fresh, type Implementer, type OperationContext } from '../pipeline.ts';
import { publicationCheck } from './check.ts';
import { CURATOR_GUIDE } from './guide.ts';
import {
	ingredientViewOf,
	knownVarieties,
	listBooks,
	removeEquivalence,
	searchCatalogueIngredients,
	setEquivalence,
	updateIngredient,
	varietyCheck,
} from './ingredients.ts';
import { loadDraftRow } from './load.ts';
import { draftViewOf, overview, searchCatalogueRecipes, versionDetail, versionList } from './views.ts';
import {
	actorOf,
	createBook,
	createDraft,
	createIngredient,
	discardDraft,
	publishDraft,
	restoreVersion,
	saveDraft,
	setArchived,
	startRevision,
} from './write.ts';

async function draftView(context: OperationContext, draftId: string) {
	const row = await loadDraftRow(context.tx, draftId);
	if (!row) throw appError('not_found');
	return draftViewOf(context.tx, row, context.locale);
}

export function catalogueRouter(os: Implementer) {
	return {
		getGuide: os.catalogue.getGuide.handler(() => ({ guide: CURATOR_GUIDE })),
		overview: os.catalogue.overview.handler(({ context }) => overview(context.tx, context.locale)),
		getDraft: os.catalogue.getDraft.handler(({ context, input }) => draftView(context, input.draftId)),
		createDraft: os.catalogue.createDraft.handler(async ({ context, input }) => {
			const { draftId } = await createDraft(context.tx, actorOf(context), { draftId: input.id, content: input.content });
			return draftView(context, draftId);
		}),
		startRevision: os.catalogue.startRevision.handler(async ({ context, input }) => {
			const { draftId } = await startRevision(context.tx, actorOf(context), { recipeId: input.recipeId, draftId: input.id });
			return draftView(context, draftId);
		}),
		saveDraft: os.catalogue.saveDraft.handler(async ({ context, input }) => draftView(context, (await saveDraft(context.tx, actorOf(context), input)).draftId)),
		discardDraft: os.catalogue.discardDraft.handler(({ context, input }) => discardDraft(context.tx, actorOf(context), input)),
		checkDraft: os.catalogue.checkDraft.handler(async ({ context, input }) => {
			const row = await loadDraftRow(context.tx, input.draftId);
			if (!row) throw appError('not_found');
			const { issues, conversions } = await publicationCheck(context.tx, row.content);
			return { revision: row.revision, issues, missing: missingData(issues), conversions };
		}),
		publish: os.catalogue.publish.handler(async ({ context, input }) => {
			const { recipeId, version, conversions } = await publishDraft(context.tx, actorOf(context), input);
			return { recipeId, version, conversions };
		}),
		searchRecipes: os.catalogue.searchRecipes.handler(async ({ context, input }) =>
			fresh(context, await searchCatalogueRecipes(context.tx, { text: input.text, status: input.status }, context.locale)),
		),
		setArchived: os.catalogue.setArchived.handler(({ context, input }) => setArchived(context.tx, actorOf(context), input)),
		listVersions: os.catalogue.listVersions.handler(async ({ context, input }) => fresh(context, await versionList(context.tx, input.recipeId, context.locale))),
		getVersion: os.catalogue.getVersion.handler(async ({ context, input }) =>
			fresh(context, await versionDetail(context.tx, input.recipeId, input.version, context.locale)),
		),
		restoreVersion: os.catalogue.restoreVersion.handler(({ context, input }) => restoreVersion(context.tx, actorOf(context), input)),
		searchIngredients: os.catalogue.searchIngredients.handler(async ({ context, input }) =>
			fresh(context, await searchCatalogueIngredients(context.tx, input.text, context.locale)),
		),
		getIngredient: os.catalogue.getIngredient.handler(async ({ context, input }) => fresh(context, await ingredientViewOf(context.tx, input.ingredientId))),
		listVarieties: os.catalogue.listVarieties.handler(async ({ context, input }) => fresh(context, await knownVarieties(context.tx, input.ingredientId))),
		checkVariety: os.catalogue.checkVariety.handler(({ context, input }) => varietyCheck(context.tx, input.ingredientId, input.text, input.locale)),
		createIngredient: os.catalogue.createIngredient.handler(async ({ context, input }) => {
			const { ingredientId } = await createIngredient(context.tx, actorOf(context), {
				ingredientId: input.id,
				name: input.name,
				department: input.department,
				isPantry: input.isPantry,
				synonyms: input.synonyms,
			});
			return ingredientViewOf(context.tx, ingredientId);
		}),
		updateIngredient: os.catalogue.updateIngredient.handler(({ context, input }) => updateIngredient(context.tx, actorOf(context), input)),
		setEquivalence: os.catalogue.setEquivalence.handler(({ context, input }) => setEquivalence(context.tx, actorOf(context), input)),
		removeEquivalence: os.catalogue.removeEquivalence.handler(({ context, input }) => removeEquivalence(context.tx, actorOf(context), input)),
		listBooks: os.catalogue.listBooks.handler(async ({ context }) => fresh(context, await listBooks(context.tx))),
		createBook: os.catalogue.createBook.handler(async ({ context, input }) => {
			const { bookId, slug, title } = await createBook(context.tx, actorOf(context), { bookId: input.id, title: input.title });
			return { bookId, slug, title };
		}),
	};
}
