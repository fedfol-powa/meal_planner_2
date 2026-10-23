import type postgres from 'postgres';
import { withDbOn } from '../db.ts';

/**
 * The address check before each send (spec W24, sections 4.4 and 5.5): the address only while the
 * person is still a member, keeps the option on and has a confirmed email; null otherwise. A module
 * of its own: the tests replace it to let time pass between the claim and the request.
 */
export async function emailAddressOf(sql: postgres.Sql, familyId: string, userId: string): Promise<string | null> {
	const [row] = await withDbOn(sql, { kind: 'job' }, (tx) =>
		tx<{ address: string | null }[]>`select app.menu_email_address(${familyId}::uuid, ${userId}::uuid) as address`,
	);
	return row?.address ?? null;
}
