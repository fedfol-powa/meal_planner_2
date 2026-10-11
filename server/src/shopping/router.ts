import type { shoppingContract } from '@app/contract';
import { createImplementer, fresh } from '../pipeline.ts';
import type { ShoppingDeps } from './deps.ts';
import { createBringLink, exportList } from './exports.ts';
import { addFreeItem, removeFreeItem, setAddedBack, setFreeItemChecked, setItemChecked } from './mutations.ts';
import { readListView } from './read.ts';

export type ShoppingImplementer = Pick<ReturnType<typeof createImplementer<typeof shoppingContract>>, 'shopping'>;

/** Handlers of the `shopping` area (spec «Spesa, anche offline»). */
export function createShoppingRouter(os: ShoppingImplementer, deps: ShoppingDeps) {
	return {
		getWeekList: os.shopping.getWeekList.handler(async ({ context, input }) =>
			fresh(context, await readListView(context.tx, deps, { ...input, locale: context.locale })),
		),
		setItemChecked: os.shopping.setItemChecked.handler(({ context, input }) => setItemChecked(context, deps, input)),
		setAddedBack: os.shopping.setAddedBack.handler(({ context, input }) => setAddedBack(context, deps, input)),
		addFreeItem: os.shopping.addFreeItem.handler(({ context, input }) => addFreeItem(context, deps, input)),
		setFreeItemChecked: os.shopping.setFreeItemChecked.handler(({ context, input }) => setFreeItemChecked(context, deps, input)),
		removeFreeItem: os.shopping.removeFreeItem.handler(({ context, input }) => removeFreeItem(context, deps, input)),
		exportList: os.shopping.exportList.handler(({ context, input }) => exportList(context, deps, input)),
		createBringLink: os.shopping.createBringLink.handler(({ context, input }) => createBringLink(context, deps, input)),
	};
}
