import type { Implementer } from '../pipeline.ts';
import { fresh } from '../pipeline.ts';
import { familyView, searchIngredients, settingsView } from './views.ts';

export function familyRouter(os: Implementer) {
	return {
		get: os.family.get.handler(async ({ context, input }) => fresh(context, await familyView(context.tx, input.familyId, context.locale))),
		getSettings: os.family.getSettings.handler(async ({ context, input }) =>
			fresh(context, await settingsView(context.tx, input.familyId, context.locale)),
		),
		searchIngredients: os.family.searchIngredients.handler(({ context, input }) =>
			searchIngredients(context.tx, input.familyId, input.text, context.locale),
		),
	};
}
