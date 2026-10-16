-- Recipe photos: one current photo per recipe, curator writes, the public lookup (W12, wave 3).
begin;
\ir helpers/setup.psql
\ir helpers/fixtures.psql
select no_plan();

-- Keys of the right shape: photos/ + 22 base64url characters + .webp.
create function tests.photo_key(p_tag text)
returns text language sql immutable as $$
	select 'photos/' || rpad(p_tag, 22, 'A') || '.webp';
$$;
grant execute on function tests.photo_key(text) to authenticated, anon;

create function tests.insert_photo(p_id uuid, p_recipe uuid, p_key text, p_user text)
returns void language sql as $$
	insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, created_by, channel)
	values (p_id, p_recipe, p_key, 'image/webp', 1600, 1067, 200000, tests.uid(p_user), 'web');
$$;
grant execute on function tests.insert_photo(uuid, uuid, text, text) to authenticated;

-- Curators insert photos of a published recipe and of a draft.
reset role;
select tests.login('dario');
select lives_ok(
	format('select tests.insert_photo(%L, %L, %L, %L)', 'f0f0f0f0-0000-4000-8000-000000000001', tests.recipe('pasta-al-pomodoro'), tests.photo_key('pasta1'), 'dario'),
	'a curator adds a photo to a published recipe');
select lives_ok(
	format('select tests.insert_photo(%L, %L, %L, %L)', 'f0f0f0f0-0000-4000-8000-000000000002', tests.recipe('new-draft'), tests.photo_key('draft1'), 'dario'),
	'a curator adds a photo to a draft');

-- One current photo per recipe.
select throws_ok(
	format('select tests.insert_photo(%L, %L, %L, %L)', 'f0f0f0f0-0000-4000-8000-000000000003', tests.recipe('pasta-al-pomodoro'), tests.photo_key('pasta2'), 'dario'),
	'23505', null, 'a second current photo of the same recipe is refused');
select is(
	tests.affected(format('update app.recipe_photos set removed_at = clock_timestamp(), removed_by = %L where id = %L', tests.uid('dario'), 'f0f0f0f0-0000-4000-8000-000000000001')),
	1::bigint, 'a curator marks the photo removed');
select lives_ok(
	format('select tests.insert_photo(%L, %L, %L, %L)', 'f0f0f0f0-0000-4000-8000-000000000003', tests.recipe('pasta-al-pomodoro'), tests.photo_key('pasta2'), 'dario'),
	'after the removal a new photo becomes current');

-- Checks.
select throws_ok(
	format('select tests.insert_photo(%L, %L, %L, %L)', gen_random_uuid(), tests.recipe('old-minestrone'), 'photos/x.webp', 'dario'),
	'23514', null, 'a key of the wrong shape is refused');
select throws_ok(
	format($$insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel)
		values (%L, %L, %L, 'image/jpeg', 10, 10, 10, 'web')$$, gen_random_uuid(), tests.recipe('old-minestrone'), tests.photo_key('jpeg')),
	'23514', null, 'only image/webp is stored');
select throws_ok(
	format($$insert into app.recipe_photos (id, recipe_id, storage_key, content_type, width, height, bytes, channel, removed_by)
		values (%L, %L, %L, 'image/webp', 10, 10, 10, 'web', %L)$$, gen_random_uuid(), tests.recipe('old-minestrone'), tests.photo_key('rmby'), tests.uid('dario')),
	'23514', null, 'removed_by needs removed_at');

-- Column privileges and no delete.
select throws_ok(
	format('update app.recipe_photos set storage_key = %L where id = %L', tests.photo_key('other'), 'f0f0f0f0-0000-4000-8000-000000000003'),
	'42501', null, 'the key cannot be changed');
select throws_ok(
	format('delete from app.recipe_photos where id = %L', 'f0f0f0f0-0000-4000-8000-000000000003'),
	'42501', null, 'photos are never deleted');

-- Members who are not curators.
reset role;
select tests.login('bruno');
select throws_ok(
	format('select tests.insert_photo(%L, %L, %L, %L)', gen_random_uuid(), tests.recipe('old-minestrone'), tests.photo_key('bruno'), 'bruno'),
	'42501', null, 'a member who is not a curator cannot add a photo');
select is(
	(select count(*) from app.recipe_photos where recipe_id = tests.recipe('pasta-al-pomodoro')),
	2::bigint, 'a member sees the photos of a published recipe');
select is(
	(select count(*) from app.recipe_photos where recipe_id = tests.recipe('new-draft')),
	1::bigint, 'a member of a family whose meal cites the draft sees its photo, like the draft');
reset role;
select tests.login('franco');
select is(
	(select count(*) from app.recipe_photos where recipe_id = tests.recipe('new-draft')),
	0::bigint, 'a member who cannot see the draft does not see its photo');
select is(
	tests.affected(format('update app.recipe_photos set removed_at = clock_timestamp() where id = %L', 'f0f0f0f0-0000-4000-8000-000000000003')),
	0::bigint, 'a member cannot remove a photo');

-- The public lookup.
reset role;
select tests.become('anon');
select is(
	(select array_agg(content_type || ':' || bytes) from app.served_photo(tests.photo_key('pasta2'))),
	array['image/webp:200000'], 'the current photo of a published recipe is served');
select is(
	(select count(*) from app.served_photo(tests.photo_key('draft1'))),
	1::bigint, 'the current photo of a draft is served');
select is(
	(select count(*) from app.served_photo(tests.photo_key('pasta1'))),
	0::bigint, 'a removed photo is not served');
select is(
	(select count(*) from app.served_photo(tests.photo_key('unknown'))),
	0::bigint, 'an unknown key is not served');
select throws_ok('select count(*) from app.recipe_photos', '42501', null, 'anon cannot read the table');
reset role;
select ok(has_function_privilege('anon', 'app.served_photo(text)', 'execute'), 'anon executes served_photo');
select ok(not has_function_privilege('authenticated', 'app.served_photo(text)', 'execute'), 'authenticated does not');
select ok(not has_function_privilege('public', 'app.served_photo(text)', 'execute'), 'public does not');
select ok(has_table_privilege('app_backup', 'app.recipe_photos', 'select'), 'the export reads the photos');

-- The catalogue counter, bumped once per transaction: forget the bumps of this one first.
update app.catalogue_state set version_xid = null;
select tests.catalogue_version() as before_version \gset
select tests.login('dario');
select tests.insert_photo(gen_random_uuid(), tests.recipe('old-minestrone'), tests.photo_key('soup'), 'dario');
reset role;
select ok(tests.catalogue_version() > :before_version, 'a new photo bumps the catalogue version');
update app.catalogue_state set version_xid = null;
select tests.catalogue_version() as before_update \gset
select tests.login('dario');
update app.recipe_photos set removed_at = clock_timestamp(), removed_by = tests.uid('dario') where storage_key = tests.photo_key('soup');
reset role;
select ok(tests.catalogue_version() > :before_update, 'removing a photo bumps the catalogue version');

-- An update that changes no row (a removal without a current photo) does not bump it.
update app.catalogue_state set version_xid = null;
select tests.catalogue_version() as before_noop \gset
select tests.login('dario');
update app.recipe_photos set removed_at = clock_timestamp(), removed_by = tests.uid('dario')
	where recipe_id = tests.recipe('old-minestrone') and removed_at is null;
reset role;
select is(tests.catalogue_version(), :before_noop::bigint, 'an update of no row leaves the catalogue version');

-- Authors become null when the account is deleted.
delete from auth.users where id = tests.uid('dario');
select is(
	(select count(*) from app.recipe_photos where created_by is not null or removed_by is not null),
	0::bigint, 'authors are null after the account is deleted');

select * from finish();
rollback;
