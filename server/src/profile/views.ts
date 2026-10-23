import { profileViewSchema, type Locale, type ProfileView } from '@app/contract';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

/** The caller's profile, read in the caller's transaction; families by name in `locale`. */
export async function profileView(tx: Tx, locale: Locale): Promise<ProfileView> {
	const [me] = await tx<{ id: string; displayName: string; email: string | null; locale: Locale; currentFamilyId: string | null; menuEmails: boolean; roles: string[] }[]>`
		select p.user_id as id, p.display_name as "displayName", auth.jwt() ->> 'email' as email, p.locale,
			(select pp.current_family_id from app.profile_preferences pp where pp.user_id = p.user_id) as "currentFamilyId",
			-- On unless switched off: the preferences row may be missing (spec W24, section 4.1).
			coalesce((select pp.menu_emails from app.profile_preferences pp where pp.user_id = p.user_id), true) as "menuEmails",
			-- jsonb, not an array: the client runs without fetch_types and would get array text.
			coalesce((select jsonb_agg(r.role order by r.role) from app.user_roles r where r.user_id = p.user_id), '[]'::jsonb) as roles
		from app.profiles p
		where p.user_id = auth.uid()`;
	// The session check already found the profile: a missing one means the account just went.
	if (!me) throw appError('unauthorized');
	const families = await tx<ProfileView['families']>`
		select f.id, f.name, m.role, f.time_zone as "timeZone", f.measurement_system as "measurementSystem"
		from app.family_members m
		join app.families f on f.id = m.family_id
		where m.user_id = auth.uid()`;
	const collator = new Intl.Collator(locale);
	const sorted = [...families].sort((a, b) => collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1));
	const current = sorted.some((f) => f.id === me.currentFamilyId) ? me.currentFamilyId : (sorted[0]?.id ?? null);
	return profileViewSchema.parse({
		user: { id: me.id, displayName: me.displayName, email: me.email ?? '', locale: me.locale, menuEmails: me.menuEmails, globalRoles: me.roles },
		families: sorted,
		currentFamilyId: current,
	});
}
