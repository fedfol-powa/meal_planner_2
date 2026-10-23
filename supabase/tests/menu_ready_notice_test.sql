begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- W24: "next week's menu is ready" notice. The week to announce, the views of the green dot,
-- announcements, emails, their budget and the preference.
-- Spec: progetto/superpowers/specs/2026-10-23-avviso-menu-pronto.md, sections 3 and 4.

-- Families created on 1 October; Verdi in New York. Weeks of 26 October for Rossi and Verdi,
-- none for Bianchi. Rossi's meals: the published pasta (current version 2, named apart from
-- the recipe row), the never-published draft, a free meal and an empty slot.
update app.families set created_at = '2026-10-01 10:00+02' where name in ('test-Rossi', 'test-Bianchi', 'test-Verdi');
update app.families set time_zone = 'America/New_York' where name = 'test-Verdi';
update app.recipe_versions set content = '{"name": {"it-IT": "Pasta v2", "en-GB": "Pasta v2 GB"}}'
	where recipe_id = tests.recipe('pasta-al-pomodoro') and version = 2;
update auth.users set email_confirmed_at = now() where email in ('anna@test.local', 'bruno@test.local', 'carla@test.local', 'franco@test.local');
do $$
declare
	v_rossi_week uuid;
begin
	insert into app.weeks (family_id, starts_on) values (tests.family('Rossi'), '2026-10-26') returning id into v_rossi_week;
	insert into app.weeks (family_id, starts_on) values (tests.family('Verdi'), '2026-10-26');
	insert into app.meal_slots (week_id, date, meal_type, recipe_id, free_text, servings) values
		(v_rossi_week, '2026-10-26', 'lunch', tests.recipe('pasta-al-pomodoro'), null, 2),
		(v_rossi_week, '2026-10-26', 'dinner', tests.recipe('new-draft'), null, 2),
		(v_rossi_week, '2026-10-27', 'lunch', null, 'Pizza', 3),
		(v_rossi_week, '2026-10-27', 'dinner', null, null, 2);
	insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel) values
		(gen_random_uuid(), tests.recipe('pasta-al-pomodoro'), 'photos/aaaaaaaaaaaaaaaaaaaaaa.webp', 'image/webp', 800, 600, 1000, 'web');
	insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel, created_at, removed_at) values
		(gen_random_uuid(), tests.recipe('new-draft'), 'photos/bbbbbbbbbbbbbbbbbbbbbb.webp', 'image/webp', 800, 600, 1000, 'web',
			now() - interval '1 day', now());
end;
$$;

-- Meals of a week for the email, compact: date meal_type it-IT|en-GB|free|photo.
create function tests.email_week(p_family text, p_week date) returns text[]
language sql as $$
	select array(
		select m.date || ' ' || m.meal_type || ' ' || coalesce(m.recipe_name ->> 'it-IT', '-') || '|' || coalesce(m.recipe_name ->> 'en-GB', '-')
			|| '|' || coalesce(m.free_text, '-') || '|' || coalesce(m.photo_key, '-')
		from app.menu_email_week(tests.family(p_family), p_week) m);
$$;
grant execute on function tests.email_week(text, date) to app_job;

-- Shape, RLS and privileges
select has_column('app', 'profile_preferences', 'menu_emails', 'profile_preferences.menu_emails exists');
select col_not_null('app', 'profile_preferences', 'menu_emails', 'menu_emails is not null');
select col_default_is('app', 'profile_preferences', 'menu_emails', 'true', 'menu_emails is on by default');
select has_table('app', 'menu_week_views', 'menu_week_views exists');
select has_table('app', 'menu_announcements', 'menu_announcements exists');
select has_table('app', 'menu_emails', 'menu_emails exists');
select has_table('app', 'menu_email_budget', 'menu_email_budget exists');
select col_is_pk('app', 'menu_week_views', array['family_id', 'user_id', 'week_start'], 'menu_week_views: one row per family, person and week');
select col_is_pk('app', 'menu_announcements', array['family_id', 'week_start'], 'menu_announcements: one row per family and week');
select col_is_pk('app', 'menu_emails', array['family_id', 'week_start', 'user_id'], 'menu_emails: one row per family, week and person');
select col_is_pk('app', 'menu_email_budget', 'day', 'menu_email_budget: one row per day');
select is(
	array(select t from unnest(array['menu_week_views', 'menu_announcements', 'menu_emails', 'menu_email_budget']) t
		where not (select relrowsecurity from pg_class where oid = ('app.' || t)::regclass)),
	array[]::text[], 'the new tables have RLS');
select is(
	array(select r || ':' || t from unnest(array['authenticated', 'anon']) r,
		unnest(array['app.menu_announcements', 'app.menu_emails', 'app.menu_email_budget']) t
		where has_table_privilege(r, t, 'SELECT,INSERT,UPDATE,DELETE')),
	array[]::text[], 'announcements, emails and budget: nothing for users');
select ok(not has_table_privilege('authenticated', 'app.menu_week_views', 'UPDATE,DELETE'), 'views: no update or delete for users');
select is(
	array(select t from unnest(array['app.menu_week_views', 'app.menu_announcements', 'app.menu_emails', 'app.menu_email_budget']) t
		where not has_table_privilege('app_backup', t, 'SELECT')),
	array[]::text[], 'app_backup reads the new tables');
select ok(has_column_privilege('authenticated', 'app.profile_preferences', 'menu_emails', 'UPDATE'), 'users update menu_emails');
select throws_ok($$insert into app.menu_emails (family_id, week_start, user_id, subject, html, text, closed_at, closed_reason)
	values (tests.family('Rossi'), '2026-10-12', tests.uid('anna'), 's', 'h', 't', now(), 'lost')$$,
	'23514', null, 'unknown closing reason refused');
select throws_ok($$insert into app.menu_email_budget (day, reserved) values ('2026-10-22', -1)$$, '23514', null, 'negative reservation refused');

-- The week to announce (section 3). Rome is UTC+2 until 25 October, UTC+1 after.
select tests.become('app_job');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-21 18:59+00'), '2026-10-26'::date, 'Rome, Wednesday 20:59: announced');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-21 17:59+00'), null::date, 'Rome, Wednesday 19:59: not yet');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-21 18:00+00'), '2026-10-26'::date, 'Rome, Wednesday 20:00 exactly: announced');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-25 22:59+00'), '2026-10-26'::date, 'Rome, Sunday 23:59 (standard time): still announced');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-25 23:00+00'), null::date, 'Rome, Monday 00:00: the week of 2 November does not exist');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-19 10:00+00'), null::date, 'Rome, Monday of the week before: not yet');
select is(app.menu_week_to_announce(tests.family('Verdi'), '2026-10-21 23:59+00'), null::date, 'New York, Wednesday 19:59: not yet');
select is(app.menu_week_to_announce(tests.family('Verdi'), '2026-10-22 00:00+00'), '2026-10-26'::date, 'New York, Wednesday 20:00: announced');
select is(app.menu_week_to_announce(tests.family('Bianchi'), '2026-10-22 10:00+00'), null::date, 'no week: nothing to announce');
select is(app.menu_week_to_announce(gen_random_uuid(), '2026-10-22 10:00+00'), null::date, 'unknown family: nothing to announce');
reset role;
update app.families set created_at = '2026-10-22 08:00+02' where name = 'test-Rossi';
select tests.become('app_job');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-22 10:00+00'), null::date, 'family created after the Wednesday 20:00: not announced');
reset role;
update app.families set created_at = '2026-10-21 19:59+02' where name = 'test-Rossi';
select tests.become('app_job');
select is(app.menu_week_to_announce(tests.family('Rossi'), '2026-10-22 10:00+00'), '2026-10-26'::date, 'family created just before the Wednesday 20:00: announced');
reset role;
update app.families set created_at = '2026-10-01 10:00+02' where name = 'test-Rossi';

-- The green dot: the week until the person has seen it, members only
select tests.login('anna');
select is(app.new_menu_week(tests.family('Rossi'), '2026-10-22 10:00+00'), '2026-10-26'::date, 'member: the new week');
select is(app.new_menu_week(tests.family('Rossi'), '2026-10-21 17:59+00'), null::date, 'member, before Wednesday 20:00: nothing');
select lives_ok($$insert into app.menu_week_views (family_id, user_id, week_start) values (tests.family('Rossi'), tests.uid('anna'), '2026-10-26')$$,
	'a member records the view');
select is(app.new_menu_week(tests.family('Rossi'), '2026-10-22 10:00+00'), null::date, 'member, after the view: nothing');
select throws_ok($$insert into app.menu_week_views (family_id, user_id, week_start) values (tests.family('Rossi'), tests.uid('anna'), '2026-10-26')$$,
	'23505', null, 'the same view twice refused');
reset role;
select tests.login('bruno');
select is(app.new_menu_week(tests.family('Rossi'), '2026-10-22 10:00+00'), '2026-10-26'::date, 'another member still has the dot');
reset role;
select tests.login('franco');
select throws_ok($$select app.new_menu_week(tests.family('Rossi'), '2026-10-22 10:00+00')$$, '42501', null, 'non-member refused');
reset role;

-- Views: each person reads and writes only their own, in their families
insert into app.menu_week_views (family_id, user_id, week_start) values
	(tests.family('Rossi'), tests.uid('bruno'), '2026-10-12'),
	(tests.family('Bianchi'), tests.uid('carla'), '2026-10-12');
select tests.login('anna');
select is((select array_agg(user_id::text || '/' || week_start) from app.menu_week_views),
	array[tests.uid('anna') || '/2026-10-26'], 'a member sees only their own views');
select throws_ok($$insert into app.menu_week_views (family_id, user_id, week_start) values (tests.family('Rossi'), tests.uid('bruno'), '2026-10-19')$$,
	'42501', null, 'not for another person');
select throws_ok($$insert into app.menu_week_views (family_id, user_id, week_start) values (tests.family('Verdi'), tests.uid('anna'), '2026-10-26')$$,
	'42501', null, 'not for another family');
select throws_ok($$update app.menu_week_views set seen_at = now()$$, '42501', null, 'users do not update views');
select throws_ok($$delete from app.menu_week_views$$, '42501', null, 'users do not delete views');
select throws_ok($$select * from app.menu_announcements$$, '42501', null, 'users do not read announcements');
select throws_ok($$select * from app.menu_emails$$, '42501', null, 'users do not read emails');
select throws_ok($$select * from app.menu_email_budget$$, '42501', null, 'users do not read the budget');

-- The preference, as setCurrentFamily writes it
select lives_ok($$insert into app.profile_preferences (user_id, menu_emails) values (tests.uid('anna'), false)
	on conflict (user_id) do update set menu_emails = excluded.menu_emails, updated_at = now()$$, 'a person switches the emails off');
select lives_ok($$insert into app.profile_preferences (user_id, menu_emails) values (tests.uid('anna'), true)
	on conflict (user_id) do update set menu_emails = excluded.menu_emails, updated_at = now()$$, 'and on again');
select is((select menu_emails from app.profile_preferences where user_id = tests.uid('anna')), true, 'the preference is saved');
reset role;

-- Recipients: option on (also without a preferences row) and email confirmed
select tests.become('app_job');
select is(
	array(select r.locale || ':' || r.family_count from app.menu_email_recipients(tests.family('Rossi')) r order by r.user_id = tests.uid('anna') desc),
	array['it-IT:2', 'it-IT:1'], 'Rossi: Anna (two families) and Bruno (no preferences row)');
select is(
	array(select r.user_id from app.menu_email_recipients(tests.family('Verdi')) r),
	array[tests.uid('franco')], 'Verdi: Franco');
select is((select r.locale from app.menu_email_recipients(tests.family('Verdi')) r), 'en-GB', 'with the locale of the person');
reset role;
insert into app.profile_preferences (user_id, menu_emails) values (tests.uid('bruno'), false);
update auth.users set email_confirmed_at = null where email = 'carla@test.local';
select tests.become('app_job');
select is(
	array(select r.user_id from app.menu_email_recipients(tests.family('Rossi')) r),
	array[tests.uid('anna')], 'option off: Bruno left out');
select is(
	array(select r.user_id from app.menu_email_recipients(tests.family('Bianchi')) r),
	array[tests.uid('anna')], 'email not confirmed: Carla left out');

-- The address, checked again before each send
select is(app.menu_email_address(tests.family('Rossi'), tests.uid('anna')), 'anna@test.local', 'the address of a recipient');
select is(app.menu_email_address(tests.family('Rossi'), tests.uid('bruno')), null, 'option off: no address');
select is(app.menu_email_address(tests.family('Bianchi'), tests.uid('carla')), null, 'not confirmed: no address');
select is(app.menu_email_address(tests.family('Rossi'), tests.uid('carla')), null, 'not a member: no address');
reset role;
update app.profile_preferences set menu_emails = true where user_id = tests.uid('bruno');
select tests.become('app_job');
select is(app.menu_email_address(tests.family('Rossi'), tests.uid('bruno')), 'bruno@test.local', 'option on again: the address');
reset role;
delete from app.family_members where family_id = tests.family('Rossi') and user_id = tests.uid('bruno');
select tests.become('app_job');
select is(app.menu_email_address(tests.family('Rossi'), tests.uid('bruno')), null, 'left the family: no address');
select is(
	array(select r.user_id from app.menu_email_recipients(tests.family('Rossi')) r),
	array[tests.uid('anna')], 'left the family: not a recipient');
reset role;
select is((select count(*) from app.menu_week_views where user_id = tests.uid('bruno')), 0::bigint, 'leaving the family removes the views');

-- The meals of the email: current published name, draft name, free text, current photo only
select tests.become('app_job');
select is(tests.email_week('Rossi', '2026-10-26'), array[
	'2026-10-26 lunch Pasta v2|Pasta v2 GB|-|photos/aaaaaaaaaaaaaaaaaaaaaa.webp',
	'2026-10-26 dinner Bozza nuova|-|-|-',
	'2026-10-27 lunch -|-|Pizza|-',
	'2026-10-27 dinner -|-|-|-'], 'the meals of the week for the email');
select is(tests.email_week('Bianchi', '2026-10-26'), array[]::text[], 'no week: no meals');

-- Announcements, emails and budget: app_job writes them
select lives_ok($$insert into app.menu_announcements (family_id, week_start) values (tests.family('Verdi'), '2026-10-26')$$, 'app_job announces');
select lives_ok($$insert into app.menu_emails (family_id, week_start, user_id, subject, html, text)
	values (tests.family('Verdi'), '2026-10-26', tests.uid('franco'), 's', 'h', 't')$$, 'app_job adds an email');
select is(tests.affected($$update app.menu_emails set claimed_at = now(), attempts = attempts + 1 where family_id = tests.family('Verdi')$$), 1::bigint, 'app_job updates emails');
select throws_ok($$insert into app.menu_emails (family_id, week_start, user_id, subject, html, text)
	values (tests.family('Verdi'), '2026-11-02', tests.uid('franco'), 's', 'h', 't')$$, '23503', null, 'an email needs its announcement');
select lives_ok($$insert into app.menu_email_budget (day, reserved) values ('2026-10-22', 1)$$, 'app_job reserves the budget');
select is(tests.affected($$update app.menu_email_budget set reserved = reserved + 1 where day = '2026-10-22'$$), 1::bigint, 'app_job updates the budget');
select is((select reserved from app.menu_email_budget where day = '2026-10-22'), 2, 'app_job reads the budget');
select throws_ok($$select * from app.menu_week_views$$, '42501', null, 'app_job does not read views');
reset role;

-- Cascades: deleting the family removes announcements, emails and views
insert into app.menu_week_views (family_id, user_id, week_start) values (tests.family('Verdi'), tests.uid('franco'), '2026-10-26');
select lives_ok($$delete from app.families where name = 'test-Verdi'$$, 'the family is deleted');
select is(
	(select count(*) from app.menu_announcements a where not exists (select 1 from app.families f where f.id = a.family_id))
		+ (select count(*) from app.menu_emails e where e.user_id = tests.uid('franco'))
		+ (select count(*) from app.menu_week_views v where v.user_id = tests.uid('franco')),
	0::bigint, 'no announcements, emails or views left');

select * from finish();
rollback;
