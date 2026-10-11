import type { shoppingContract } from '@app/contract';
import { SHOPPING_LIST_READS } from '@app/contract';
import { createImplementer } from '../pipeline.ts';
import { readVersion } from '../versions.ts';
import type { ShoppingDeps } from './deps.ts';
import { createBringLink, exportList } from './exports.ts';
import { addFreeItem, removeFreeItem, setAddedBack, setFreeItemChecked, setItemChecked } from './mutations.ts';
import { findWeek, readListView } from './read.ts';

export type ShoppingImplementer = Pick<ReturnType<typeof createImplementer<typeof shoppingContract>>, 'shopping'>;

/** Handlers of the `shopping` area (spec «Spesa, anche offline»). */
export function createShoppingRouter(os: ShoppingImplementer, deps: ShoppingDeps) {
	return {
		// The week is checked before the version: a current version never answers for a missing week.
		getWeekList: os.shopping.getWeekList.handler(async ({ context, input }) => {
			await findWeek(context.tx, input.familyId, input.weekStartsOn);
			const version = await readVersion(context.tx, [...SHOPPING_LIST_READS], input, context.locale, context.deployId);
			if (input.knownVersion === version) return { unchanged: true as const, version };
			return { unchanged: false as const, version, data: await readListView(context.tx, deps, { ...input, locale: context.locale }) };
		}),
		setItemChecked: os.shopping.setItemChecked.handler(({ context, input }) => setItemChecked(context, deps, input)),
		setAddedBack: os.shopping.setAddedBack.handler(({ context, input }) => setAddedBack(context, deps, input)),
		addFreeItem: os.shopping.addFreeItem.handler(({ context, input }) => addFreeItem(context, deps, input)),
		setFreeItemChecked: os.shopping.setFreeItemChecked.handler(({ context, input }) => setFreeItemChecked(context, deps, input)),
		removeFreeItem: os.shopping.removeFreeItem.handler(({ context, input }) => removeFreeItem(context, deps, input)),
		exportList: os.shopping.exportList.handler(({ context, input }) => exportList(context, deps, input)),
		createBringLink: os.shopping.createBringLink.handler(({ context, input }) => createBringLink(context, deps, input)),
	};
}
