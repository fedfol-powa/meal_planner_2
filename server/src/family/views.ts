import { familyViewSchema, settingsViewSchema, type FamilyView, type Locale, type SettingsView } from '@app/contract';
import { resolveFamilySettings } from '@app/domain/family';
import type { Tx } from '../db.ts';
import { appError } from '../errors.ts';

const byId = (a: { id?: string; userId?: string }, b: { id?: string; userId?: string }) =>
	((a.id ?? a.userId)! < (b.id ?? b.userId)! ? -1 : 1);

/** Name, units, time zone, the caller's role and the members, administrators first. */
export async function familyView(tx: Tx, familyId: string, locale: Locale): Promise<FamilyView> {
	const [family] = await tx<{ id: string; name: string; measurementSystem: string; timeZone: string }[]>`
		select id, name, measurement_system as "measurementSystem", time_zone as "timeZone"
		from app.families where id = ${familyId}`;
	if (!family) throw appError('forbidden');
	const members = await tx<{ userId: string; displayName: string; role: 'family_admin' | 'member'; isMe: boolean; joinedAt: Date }[]>`
		select m.user_id as "userId", coalesce(p.display_name, '') as "displayName", m.role,
			m.user_id = auth.uid() as "isMe", m.joined_at as "joinedAt"
		from app.family_members m
		left join app.profiles p on p.user_id = m.user_id
		where m.family_id = ${familyId}`;
	const me = members.find((m) => m.isMe);
	if (!me) throw appError('forbidden');
	const collator = new Intl.Collator(locale);
	const sorted = [...members].sort(
		(a, b) =>
			Number(b.role === 'family_admin') - Number(a.role === 'family_admin') || collator.compare(a.displayName, b.displayName) || byId(a, b),
	);
	return familyViewSchema.parse({
		...family,
		myRole: me.role,
		members: sorted.map((m) => ({ ...m, joinedAt: m.joinedAt.toISOString() })),
	});
}

/** Resolved settings without the weights, books and restrictions in the caller's language. */
export async function settingsView(tx: Tx, familyId: string, locale: Locale): Promise<SettingsView> {
	const [family] = await tx<{ settings: unknown; canEdit: boolean }[]>`
		select settings, app.is_family_admin(id) as "canEdit" from app.families where id = ${familyId}`;
	if (!family) throw appError('forbidden');
	const { weights: _weights, ...settings } = resolveFamilySettings(family.settings);
	const books = await tx<{ id: string; title: string; owned: boolean }[]>`
		select b.id, b.title, fb.book_id is not null as owned
		from app.books b
		left join app.family_books fb on fb.book_id = b.id and fb.family_id = ${familyId}
		where b.archived_at is null or fb.book_id is not null`;
	const restrictions = await tx<{ ingredientId: string; name: string; restriction: 'avoid' | 'limit'; weeklyMax: number | null }[]>`
		select fi.ingredient_id as "ingredientId", i.name ->> ${locale}::text as name, fi.restriction, fi.weekly_max as "weeklyMax"
		from app.family_ingredients fi
		join app.ingredients i on i.id = fi.ingredient_id
		where fi.family_id = ${familyId}`;
	const collator = new Intl.Collator(locale);
	return settingsViewSchema.parse({
		settings,
		books: [...books].sort((a, b) => collator.compare(a.title, b.title) || byId(a, b)),
		restrictions: [...restrictions].sort((a, b) => collator.compare(a.name, b.name) || (a.ingredientId < b.ingredientId ? -1 : 1)),
		canEdit: family.canEdit,
	});
}

/** Lower case without accents: "Sedano rapa è" matches "rapa e". */
export const foldText = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-GB').trim();

export const SEARCH_LIMIT = 8;

/**
 * Catalogue ingredients matching `text` by name or synonym in `locale`, not archived and not
 * already restricted in the family. Filtered here: a few hundred rows, and folding accents in
 * JavaScript spares the `unaccent` extension. Names starting with the text come first.
 */
export async function searchIngredients(tx: Tx, familyId: string, text: string, locale: Locale) {
	const needle = foldText(text);
	if (needle.length < 2) return [];
	const rows = await tx<{ id: string; name: string; synonyms: string[] | null }[]>`
		select i.id, i.name ->> ${locale}::text as name, i.synonyms -> ${locale}::text as synonyms
		from app.ingredients i
		where i.archived_at is null
			and not exists (
				select 1 from app.family_ingredients fi where fi.family_id = ${familyId} and fi.ingredient_id = i.id
			)`;
	const collator = new Intl.Collator(locale);
	return rows
		.map((row) => {
			const name = foldText(row.name);
			const synonyms = (row.synonyms ?? []).map(foldText);
			const starts = name.startsWith(needle);
			const hit = starts || name.includes(needle) || synonyms.some((s) => s.includes(needle));
			return { id: row.id, name: row.name, starts, hit };
		})
		.filter((row) => row.hit)
		.sort((a, b) => Number(b.starts) - Number(a.starts) || collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1))
		.slice(0, SEARCH_LIMIT)
		.map(({ id, name }) => ({ id, name }));
}
