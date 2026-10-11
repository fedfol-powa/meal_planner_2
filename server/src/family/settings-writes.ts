import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

/**
 * Writes one key of `families.settings` in a single UPDATE: the row lock makes the read and
 * the write atomic, so concurrent writes to other keys survive. Each parent along the path
 * (slots, slots.lunch, groupRanges) becomes an object when it is missing or malformed (null,
 * a string, an array); an object parent keeps its other keys. The reader shows defaults for
 * malformed data, so the next save must land.
 */
/**
 * Postgres array literal of a path. The client runs without fetch_types, so it cannot send JS
 * arrays as text[]; the keys are fixed codes (meal types, weekdays, groups, setting names).
 */
function pathLiteral(keys: string[]): string {
	for (const key of keys) if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error(`unexpected settings key: ${key}`);
	return `{${keys.join(',')}}`;
}

export async function writeSettingsKey(tx: Tx, familyId: string, path: string[], value: unknown): Promise<void> {
	if (path.length < 1 || path.length > 3) throw new Error('settings paths have one to three keys');
	let expression = tx`settings`;
	for (let depth = 1; depth < path.length; depth++) {
		const parent = pathLiteral(path.slice(0, depth));
		// Read from the original column: under a parent just made `{}` the child is null, so it becomes `{}` too.
		expression = tx`jsonb_set(${expression}, ${parent}::text[],
			case when jsonb_typeof(settings #> ${parent}::text[]) = 'object' then settings #> ${parent}::text[] else '{}'::jsonb end,
			true)`;
	}
	const rows = await tx`
		update app.families
		set settings = jsonb_set(${expression}, ${pathLiteral(path)}::text[], ${tx.json(value as never)}, true)
		where id = ${familyId}
		returning id`;
	if (rows.length === 0) throw appError('forbidden');
}
