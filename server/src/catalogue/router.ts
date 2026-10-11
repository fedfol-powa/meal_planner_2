import { appError } from '../errors.ts';
import type { Implementer, OperationContext } from '../pipeline.ts';
import { CURATOR_GUIDE } from './guide.ts';
import { loadDraftRow } from './load.ts';
import { draftViewOf, overview } from './views.ts';
import { actorOf, createDraft, discardDraft, saveDraft, startRevision } from './write.ts';

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
		// Task 7
		checkDraft: os.catalogue.checkDraft.handler(notYet),
		publish: os.catalogue.publish.handler(notYet),
		// Task 8
		searchRecipes: os.catalogue.searchRecipes.handler(notYet),
		setArchived: os.catalogue.setArchived.handler(notYet),
		listVersions: os.catalogue.listVersions.handler(notYet),
		getVersion: os.catalogue.getVersion.handler(notYet),
		restoreVersion: os.catalogue.restoreVersion.handler(notYet),
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
