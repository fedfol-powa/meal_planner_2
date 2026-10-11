import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { CURATOR_GUIDE } from './guide.ts';
import { loadDraftRow } from './load.ts';
import { draftViewOf, overview } from './views.ts';

const notYet = () => {
	throw appError('not_found');
};

export function catalogueRouter(os: Implementer) {
	return {
		getGuide: os.catalogue.getGuide.handler(() => ({ guide: CURATOR_GUIDE })),
		overview: os.catalogue.overview.handler(({ context }) => overview(context.tx, context.locale)),
		getDraft: os.catalogue.getDraft.handler(async ({ context, input }) => {
			const row = await loadDraftRow(context.tx, input.draftId);
			if (!row) throw appError('not_found');
			return draftViewOf(context.tx, row, context.locale);
		}),
		// Task 6
		createDraft: os.catalogue.createDraft.handler(notYet),
		startRevision: os.catalogue.startRevision.handler(notYet),
		saveDraft: os.catalogue.saveDraft.handler(notYet),
		discardDraft: os.catalogue.discardDraft.handler(notYet),
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
