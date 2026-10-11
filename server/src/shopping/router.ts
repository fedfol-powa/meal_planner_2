import type { shoppingContract } from '@app/contract';
import { createImplementer, fresh } from '../pipeline.ts';
import type { ShoppingDeps } from './deps.ts';
import { readListView } from './read.ts';

export type ShoppingImplementer = Pick<ReturnType<typeof createImplementer<typeof shoppingContract>>, 'shopping'>;

/** Handlers of the `shopping` area (spec «Spesa, anche offline»). */
export function createShoppingRouter(os: ShoppingImplementer, deps: ShoppingDeps) {
	return {
		getWeekList: os.shopping.getWeekList.handler(async ({ context, input }) =>
			fresh(context, await readListView(context.tx, deps, { ...input, locale: context.locale })),
		),
	};
}
