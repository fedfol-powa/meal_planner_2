import type { ShoppingListView } from '@app/contract';
import { shoppingExport } from '@app/domain/shopping';
import { appError } from '../errors.ts';
import type { OperationContext } from '../pipeline.ts';
import type { ShoppingDeps } from './deps.ts';
import { readListView } from './read.ts';

interface WeekInput {
	familyId: string;
	weekStartsOn: string;
}

/** What exports contain (spec section 6): ticked items left out, unticked free items under «Altro». */
export const exportLines = (view: ShoppingListView) =>
	// Skipped meals are not exported; their names may be null in the view, not in the domain.
	shoppingExport({ ...view, skipped: [] }, view.freeItems.map(({ text, checked }) => ({ text, checked })));

export const bringDeeplink = (origin: string, token: string) =>
	`https://api.getbring.com/rest/bringrecipes/deeplink?url=${encodeURIComponent(`${origin}/shopping-lists/${token}`)}&source=web`;

export async function exportList(context: OperationContext, deps: ShoppingDeps, input: WeekInput) {
	return exportLines(await readListView(context.tx, deps, { ...input, locale: context.locale }));
}

/**
 * Saves the lines in a temporary list (token and 30 minutes from the schema defaults) and
 * answers the Bring! deeplink. A Recipe without ingredients makes Bring! fail: refused.
 */
export async function createBringLink(context: OperationContext, deps: ShoppingDeps, input: WeekInput) {
	const { lines } = await exportList(context, deps, input);
	if (lines.length === 0) throw appError('invalid', { issues: [{ path: [], code: 'empty_list' }] });
	const [row] = await context.tx<{ token: string; expiresAt: Date }[]>`
		insert into app.temporary_lists (family_id, items, created_by)
		values (${input.familyId}, ${context.tx.json(lines)}, ${context.userId})
		returning token, expires_at as "expiresAt"`;
	return { url: bringDeeplink(context.origin, row!.token), expiresAt: row!.expiresAt.toISOString() };
}
