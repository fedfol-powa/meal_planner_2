import { withInvalidOn } from '../db-errors.ts';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { fresh } from '../pipeline.ts';
import { familyView, searchIngredients, settingsView } from './views.ts';

/** No row: the family is gone or the caller is no longer one of its administrators. */
async function updated(rows: PromiseLike<readonly unknown[]>): Promise<void> {
	if ((await rows).length === 0) throw appError('forbidden');
}

function identityHandlers(os: Implementer) {
	const update = (tx: Tx, familyId: string, column: 'name' | 'measurement_system' | 'time_zone', value: string) =>
		updated(tx`update app.families set ${tx({ [column]: value })} where id = ${familyId} returning id`);
	return {
		rename: os.family.rename.handler(async ({ context, input }) => {
			await update(context.tx, input.familyId, 'name', input.name);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		setMeasurementSystem: os.family.setMeasurementSystem.handler(async ({ context, input }) => {
			await update(context.tx, input.familyId, 'measurement_system', input.measurementSystem);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		setTimeZone: os.family.setTimeZone.handler(async ({ context, input }) => {
			// The database knows the IANA names (pg_timezone_names): an unknown one is the caller's input.
			await withInvalidOn(['timeZone'], () => update(context.tx, input.familyId, 'time_zone', input.timeZone));
			return familyView(context.tx, input.familyId, context.locale);
		}),
	};
}

export function familyRouter(os: Implementer) {
	return {
		...identityHandlers(os),
		get: os.family.get.handler(async ({ context, input }) => fresh(context, await familyView(context.tx, input.familyId, context.locale))),
		getSettings: os.family.getSettings.handler(async ({ context, input }) =>
			fresh(context, await settingsView(context.tx, input.familyId, context.locale)),
		),
		searchIngredients: os.family.searchIngredients.handler(({ context, input }) =>
			searchIngredients(context.tx, input.familyId, input.text, context.locale),
		),
	};
}
