import type { Locale } from '@app/contract';
import type postgres from 'postgres';
import { withDbOn, type Tx } from '../db.ts';
import type { Env } from '../env.ts';
import { logEvent } from '../log.ts';
import { errorCode } from '../menu/generation.ts';
import { menuEmail } from './content.ts';
import { emailThumbnailPath, ensureEmailThumbnail } from './thumbnails.ts';

export type MenuEmailEnv = Pick<Env, 'APP_ORIGIN' | 'PHOTOS' | 'IMAGES'>;

export interface AnnounceOptions {
	/** Only these families; tests use it, the hourly run serves them all. */
	families?: readonly string[];
}

interface WeekMeal {
	date: string;
	mealType: 'lunch' | 'dinner';
	recipeName: Partial<Record<Locale, string>> | null;
	freeText: string | null;
	photoKey: string | null;
}

interface Recipient {
	userId: string;
	locale: Locale;
	familyCount: number;
}

const OTHER: Record<Locale, Locale> = { 'it-IT': 'en-GB', 'en-GB': 'it-IT' };

/** The meals to show: the empty slots (neither a recipe nor a free text) are left out. */
async function weekMeals(tx: Tx, familyId: string, weekStart: string): Promise<WeekMeal[]> {
	const rows = await tx<WeekMeal[]>`
		select date::text as date, meal_type as "mealType", recipe_name as "recipeName", free_text as "freeText", photo_key as "photoKey"
		from app.menu_email_week(${familyId}::uuid, ${weekStart}::date)`;
	return rows.filter((meal) => meal.recipeName !== null || meal.freeText !== null);
}

/**
 * The announcement of the hourly run (spec W24, section 5.2): for each family with a week to
 * announce, the thumbnails outside any transaction, then in one `job` transaction the announcement
 * row and one email row per recipient, composed once in their language. A family whose row already
 * exists was announced by another run and is skipped; a failing family never stops the others.
 */
export async function announceMenus(sql: postgres.Sql, env: MenuEmailEnv, now: Date, options: AnnounceOptions = {}): Promise<{ announced: number; emails: number }> {
	const result = { announced: 0, emails: 0 };
	const origin = env.APP_ORIGIN;
	// An email without a valid link must not leave (section 5.2).
	if (!origin) {
		logEvent('menu_email_no_origin', {}, 'error');
		return result;
	}
	// As text: the server's connections do not fetch the array types.
	const families = options.families ? options.families.join(',') : null;
	const job = <T>(fn: (tx: Tx) => Promise<T>) => withDbOn(sql, { kind: 'job' }, fn);
	const ids = await job((tx) => tx<{ id: string }[]>`
		select id from app.families where ${families}::text is null or id = any(string_to_array(${families}, ',')::uuid[]) order by id`);

	for (const { id: familyId } of ids) {
		try {
			// 1. Short read: the week to announce, unless a run already announced it, and its photos.
			const due = await job(async (tx) => {
				const [row] = await tx<{ week: string }[]>`
					select w.week::text as week from (select app.menu_week_to_announce(${familyId}::uuid, ${now}::timestamptz) as week) w
					where w.week is not null
						and not exists (select 1 from app.menu_announcements a where a.family_id = ${familyId} and a.week_start = w.week)`;
				if (!row) return null;
				const photos = await tx<{ key: string }[]>`
					select distinct photo_key as key from app.menu_email_week(${familyId}::uuid, ${row.week}::date) where photo_key is not null`;
				return { weekStart: row.week, photoKeys: photos.map((p) => p.key) };
			});
			if (!due) continue;
			const { weekStart } = due;

			// 2. Thumbnails, outside the transaction: they read and write R2 and call Images.
			const thumbnails = new Map<string, string>();
			for (const key of due.photoKeys) if (await ensureEmailThumbnail(env, key)) thumbnails.set(key, `${origin}${emailThumbnailPath(key)}`);

			// 3. The announcement, once: the row decides which run writes the emails.
			const recipients = await job(async (tx) => {
				const [announced] = await tx`
					insert into app.menu_announcements (family_id, week_start) values (${familyId}, ${weekStart}) on conflict do nothing returning 1`;
				if (!announced) return null;
				const [{ name }] = await tx<{ name: string }[]>`select name from app.families where id = ${familyId}`;
				const people = await tx<Recipient[]>`
					select user_id as "userId", locale, family_count as "familyCount" from app.menu_email_recipients(${familyId}::uuid)`;
				const meals = await weekMeals(tx, familyId, weekStart);
				for (const person of people) {
					const email = menuEmail({
						locale: person.locale,
						familyName: name,
						familyCount: person.familyCount,
						weekStart,
						meals: meals.map((meal) => ({
							date: meal.date,
							mealType: meal.mealType,
							// In the person's language, else in the other one (section 4.4).
							name: meal.recipeName?.[person.locale] ?? meal.recipeName?.[OTHER[person.locale]] ?? null,
							freeText: meal.freeText,
							thumbnailUrl: (meal.photoKey && thumbnails.get(meal.photoKey)) ?? null,
						})),
						menuUrl: `${origin}/menu?day=${weekStart}&family=${familyId}`,
						preferencesUrl: `${origin}/profile/preferences`,
					});
					await tx`
						insert into app.menu_emails (family_id, week_start, user_id, subject, html, text)
						values (${familyId}, ${weekStart}, ${person.userId}, ${email.subject}, ${email.html}, ${email.text})`;
				}
				return people.length;
			});
			if (recipients === null) continue;
			logEvent('menu_email_announced', { familyId, weekStart, recipients });
			result.announced++;
			result.emails += recipients;
		} catch (error) {
			// The family was deleted after the selection: nothing to announce. Any other violation is a failure.
			if (errorCode(error) === '23503' && (error as { constraint_name?: unknown }).constraint_name === 'menu_announcements_family_id_fkey') {
				logEvent('menu_email_family_gone', { familyId });
				continue;
			}
			logEvent('menu_email_announce_failed', { familyId, code: errorCode(error) }, 'error');
		}
	}
	return result;
}
