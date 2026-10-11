import { SHOPPING_LIST_READS } from '@app/contract';
import type { Tx } from '../db.ts';
import { mealPassedCount } from '../menu/versions.ts';
import type { OperationContext, Prepare } from '../pipeline.ts';
import { readVersion } from '../versions.ts';
import { findWeek } from './read.ts';

/**
 * The meals already past at the request's instant, the same instant as the R1 versions of the
 * view: when a meal passes the list is no longer «unchanged» (decision «R1 e risposta invariato»).
 */
async function passedPart(tx: Tx, familyId: string, weekId: string, at: Date): Promise<string> {
	return `p${await mealPassedCount(tx, familyId, weekId, at)}`;
}

interface WeekInput {
	familyId: string;
	weekStartsOn: string;
}

/** Before the version: a missing week is not_found, never «unchanged». */
export const shoppingPrepare: Record<string, Prepare> = {
	'shopping.getWeekList': async (context, input) => {
		const { familyId, weekStartsOn } = input as WeekInput;
		const { weekId } = await findWeek(context.tx, familyId, weekStartsOn);
		return { versionPart: await passedPart(context.tx, familyId, weekId, context.now) };
	},
};

/** The version a read of the list gets from the request path, for the answers of the mutations. */
export async function listVersion(context: OperationContext, input: WeekInput, weekId: string): Promise<string> {
	const counters = await readVersion(context.tx, [...SHOPPING_LIST_READS], input, context.locale, context.deployId);
	return `${counters}.${await passedPart(context.tx, input.familyId, weekId, context.now)}`;
}
