import type { Locale } from '@app/contract';
import { updateAccountLocale } from '../accounts/index.ts';
import { appError } from '../errors.ts';
import { logEvent } from '../log.ts';
import { afterCommit, type Implementer } from '../pipeline.ts';
import { profileView } from './views.ts';

export function profileRouter(os: Implementer) {
	return {
		get: os.profile.get.handler(({ context }) => profileView(context.tx, context.locale)),

		/**
		 * The new language applies to this answer and, through the session, to every next request.
		 * Spec W15: after the commit, also to the metadata of Auth, the language of the "forgotten
		 * password" email; a failure is only logged.
		 */
		update: os.profile.update.handler(async ({ context, input }) => {
			// Only the given columns: naming display_name would bump every family of the user
			// (their views show the name) even for a change of language.
			const changes = {
				...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
				...(input.locale !== undefined ? { locale: input.locale } : {}),
			};
			const rows = Object.keys(changes).length
				? await context.tx<{ locale: Locale }[]>`
					update app.profiles set ${context.tx({ ...changes, updated_at: new Date() })}
					where user_id = auth.uid()
					returning locale`
				: await context.tx<{ locale: Locale }[]>`select locale from app.profiles where user_id = auth.uid()`;
			if (!rows[0]) throw appError('unauthorized');
			// A preference, not part of the profile: the menu email (spec W24, section 4.1).
			if (input.menuEmails !== undefined) {
				await context.tx`
					insert into app.profile_preferences (user_id, menu_emails) values (auth.uid(), ${input.menuEmails})
					on conflict (user_id) do update set menu_emails = excluded.menu_emails, updated_at = now()`;
			}
			const view = await profileView(context.tx, rows[0].locale);
			const locale = input.locale;
			if (locale === undefined) return view;
			const { env, userId } = context;
			return afterCommit(async () => {
				await updateAccountLocale(env, userId, locale).catch((error: unknown) =>
					logEvent('auth_locale_sync_failed', { status: (error as { status?: number | null }).status ?? null }, 'error'));
				return view;
			});
		}),

		/** Remembered on the server, private to the user; a family the user is not in is forbidden. */
		setCurrentFamily: os.profile.setCurrentFamily.handler(async ({ context, input }) => {
			const [member] = await context.tx<{ ok: boolean }[]>`select app.is_member(${input.familyId}::uuid) as ok`;
			if (!member?.ok) throw appError('forbidden');
			await context.tx`
				insert into app.profile_preferences (user_id, current_family_id) values (auth.uid(), ${input.familyId})
				on conflict (user_id) do update set current_family_id = excluded.current_family_id, updated_at = now()`;
			return profileView(context.tx, context.locale);
		}),
	};
}
