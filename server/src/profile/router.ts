import type { Locale } from '@app/contract';
import { appError } from '../errors.ts';
import type { Implementer } from '../pipeline.ts';
import { profileView } from './views.ts';

export function profileRouter(os: Implementer) {
	return {
		get: os.profile.get.handler(({ context }) => profileView(context.tx, context.locale)),

		/** The new language applies to this answer and, through the session, to every next request. */
		update: os.profile.update.handler(async ({ context, input }) => {
			// Only the given columns: naming display_name would bump every family of the user
			// (their views show the name) even for a change of language.
			const changes = {
				...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
				...(input.locale !== undefined ? { locale: input.locale } : {}),
				updated_at: new Date(),
			};
			const rows = await context.tx<{ locale: Locale }[]>`
				update app.profiles set ${context.tx(changes)}
				where user_id = auth.uid()
				returning locale`;
			if (!rows[0]) throw appError('unauthorized');
			return profileView(context.tx, rows[0].locale);
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
