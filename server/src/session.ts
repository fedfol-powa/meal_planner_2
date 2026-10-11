import { localeSchema, type Locale } from '@app/contract';
import type { Tx } from './db.ts';
import { appError } from './errors.ts';

/**
 * Profile language and session check in one query. No profile (account deleted: the
 * profile goes with the user) or an ended session (logout, expiry, agent disconnected)
 * refuse the still-valid token.
 */
export async function loadSession(tx: Tx): Promise<Locale> {
	const rows = await tx<{ locale: string; active: boolean }[]>`
		select p.locale, app.session_is_active() as active
		from app.profiles p where p.user_id = auth.uid()`;
	const row = rows[0];
	if (!row || !row.active) throw appError('unauthorized');
	return localeSchema.parse(row.locale);
}
