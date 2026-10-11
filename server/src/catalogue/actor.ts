import type { Tx } from '../db.ts';
import type { OperationContext } from '../pipeline.ts';

export type Channel = 'web' | 'mcp' | 'import';
/** Who writes and through which channel; the instant comes from the database (writeInstant). */
export interface Actor {
	userId: string;
	channel: Channel;
}
export const actorOf = (context: OperationContext): Actor => ({ userId: context.userId, channel: context.channel });

/**
 * Creations of the catalogue wait for one another (few curators): the same id twice, or two
 * names giving the same slug, never race into a unique violation.
 */
export async function lockCreations(tx: Tx): Promise<void> {
	await tx`select pg_advisory_xact_lock(hashtext('app.catalogue_create'))`;
}

/** The instant of the writes, read after the waits: a wait never backdates a version (R1). */
export async function writeInstant(tx: Tx): Promise<Date> {
	const [row] = await tx<{ at: Date }[]>`select clock_timestamp() as at`;
	return row!.at;
}
