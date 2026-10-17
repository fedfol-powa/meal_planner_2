import type { Locale, VersionScope } from '@app/contract';
import type { Tx } from './db.ts';
import { appError } from './errors.ts';

/**
 * Version of a read: the counters it depends on, the language and the deployed Worker.
 * The family id is part of it because every family counter starts from zero. Counters
 * are read before the view in the same transaction, so a version is never newer than
 * the data sent with it.
 */
export async function readVersion(tx: Tx, scopes: VersionScope[], input: unknown, locale: Locale, deployId: string): Promise<string> {
	const parts: string[] = [];
	if (scopes.includes('family')) {
		const familyId = (input as { familyId: string }).familyId;
		const rows = await tx<{ version: string }[]>`select data_version::text as version from app.families where id = ${familyId}`;
		if (!rows[0]) throw appError('forbidden');
		parts.push(`f${familyId}:${rows[0].version}`);
	}
	if (scopes.includes('emailUnconfirmed')) {
		// A fingerprint of the members' labels: Auth confirms an email without touching the family (spec W15).
		const familyId = (input as { familyId: string }).familyId;
		const [row] = await tx<{ version: string }[]>`select app.family_email_unconfirmed_version(${familyId}::uuid) as version`;
		parts.push(`e${row!.version}`);
	}
	if (scopes.includes('catalogue')) {
		const rows = await tx<{ version: string }[]>`select version::text as version from app.catalogue_state`;
		parts.push(`c${rows[0]?.version ?? '0'}`);
	}
	parts.push(locale, deployId);
	return parts.join('.');
}
