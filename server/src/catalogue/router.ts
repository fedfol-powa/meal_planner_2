import { missingData } from '@app/domain/recipe';
import { appError } from '../errors.ts';
import { fresh, type Implementer, type OperationContext } from '../pipeline.ts';
import { publicationCheck } from './check.ts';
import { CURATOR_GUIDE } from './guide.ts';
import { loadDraftRow } from './load.ts';
import { draftViewOf, overview, searchCatalogueRecipes, versionDetail, versionList } from './views.ts';
import { actorOf, createDraft, discardDraft, publishDraft, restoreVersion, saveDraft, setArchived, startRevision } from './write.ts';

const notYet = () => {
	throw appError('not_found');
};

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
		// Task 9
		searchIngredients: os.catalogue.searchIngredients.handler(notYet),
		getIngredient: os.catalogue.getIngredient.handler(notYet),
		listVarieties: os.catalogue.listVarieties.handler(notYet),
		checkVariety: os.catalogue.checkVariety.handler(notYet),
		createIngredient: os.catalogue.createIngredient.handler(notYet),
		updateIngredient: os.catalogue.updateIngredient.handler(notYet),
		setEquivalence: os.catalogue.setEquivalence.handler(notYet),
		removeEquivalence: os.catalogue.removeEquivalence.handler(notYet),
		listBooks: os.catalogue.listBooks.handler(notYet),
		createBook: os.catalogue.createBook.handler(notYet),
	};
}
