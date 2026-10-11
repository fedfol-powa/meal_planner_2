-- Version counters for the "unchanged" reads (spec section 1): one per family, one
-- for the catalogue. Contract with W1: at most one bump per transaction; a write with
-- no effect (zero rows, same values) may bump anyway: one extra invalidation, never
-- stale data. Triggers deduplicated by transaction id; a rollback undoes the bump with
-- the rest.

create table app.catalogue_state (
	id boolean primary key default true check (id),
	version bigint not null default 1,
	version_xid xid8
);
insert into app.catalogue_state default values;
alter table app.catalogue_state enable row level security;
grant select (id, version) on app.catalogue_state to authenticated, app_job;
create policy catalogue_state_read on app.catalogue_state for select to authenticated, app_job using (true);

create function app.bump_family_version(p_family_id uuid)
returns void language sql security definer set search_path = '' as $$
	update app.families
	set data_version = data_version + 1, data_version_xid = pg_catalog.pg_current_xact_id()
	where id = p_family_id and data_version_xid is distinct from pg_catalog.pg_current_xact_id();
$$;

create function app.bump_families_of_user(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
	select app.bump_family_version(family_id) from app.family_members where user_id = p_user_id;
$$;

create function app.bump_catalogue_version()
returns void language sql security definer set search_path = '' as $$
	update app.catalogue_state
	set version = version + 1, version_xid = pg_catalog.pg_current_xact_id()
	where version_xid is distinct from pg_catalog.pg_current_xact_id();
$$;

-- Family of a changed row, whatever the table; old and new rows alike.
create function app.touch_family_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
	v_row jsonb;
	v_family_id uuid;
begin
	foreach v_row in array array[
		case when tg_op <> 'INSERT' then to_jsonb(old) end,
		case when tg_op <> 'DELETE' then to_jsonb(new) end
	] loop
		continue when v_row is null;
		v_family_id := case tg_table_name
			when 'families' then (v_row ->> 'id')::uuid
			when 'meal_slots' then app.week_family_id((v_row ->> 'week_id')::uuid)
			when 'meal_changes' then app.slot_family_id((v_row ->> 'meal_slot_id')::uuid)
			when 'shopping_list_checks' then app.list_family_id((v_row ->> 'shopping_list_id')::uuid)
			when 'shopping_list_added_back' then app.list_family_id((v_row ->> 'shopping_list_id')::uuid)
			when 'shopping_list_items' then app.list_family_id((v_row ->> 'shopping_list_id')::uuid)
			else (v_row ->> 'family_id')::uuid
		end;
		if v_family_id is not null then
			perform app.bump_family_version(v_family_id);
		end if;
	end loop;
	return null;
end;
$$;

create function app.touch_families_of_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	if tg_op = 'DELETE' then
		perform app.bump_families_of_user(old.user_id);
	else
		perform app.bump_families_of_user(new.user_id);
	end if;
	return null;
end;
$$;

-- Name or description of a never-published recipe cited by meals: the families
-- citing it show the new name.
create function app.touch_families_citing_recipe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	perform app.bump_family_version(w.family_id)
	from app.meal_slots s
	join app.weeks w on w.id = s.week_id
	where s.recipe_id = new.id
	group by w.family_id;
	return null;
end;
$$;

create function app.touch_catalogue_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	perform app.bump_catalogue_version();
	return null;
end;
$$;

revoke execute on function app.bump_family_version(uuid), app.bump_families_of_user(uuid),
	app.bump_catalogue_version(), app.touch_family_version(), app.touch_families_of_user(),
	app.touch_families_citing_recipe(), app.touch_catalogue_version() from public;

-- Family data
create trigger families_version after update of name, settings, measurement_system, time_zone on app.families
	for each row execute function app.touch_family_version();
create trigger family_members_version after insert or update or delete on app.family_members
	for each row execute function app.touch_family_version();
create trigger family_books_version after insert or update or delete on app.family_books
	for each row execute function app.touch_family_version();
create trigger family_ingredients_version after insert or update or delete on app.family_ingredients
	for each row execute function app.touch_family_version();
create trigger recipe_exclusions_version after insert or update or delete on app.recipe_exclusions
	for each row execute function app.touch_family_version();
create trigger family_tried_recipes_version after insert or update or delete on app.family_tried_recipes
	for each row execute function app.touch_family_version();
create trigger weeks_version after insert or update or delete on app.weeks
	for each row execute function app.touch_family_version();
create trigger meal_slots_version after insert or update or delete on app.meal_slots
	for each row execute function app.touch_family_version();
create trigger meal_changes_version after insert on app.meal_changes
	for each row execute function app.touch_family_version();
create trigger shopping_lists_version after insert or update or delete on app.shopping_lists
	for each row execute function app.touch_family_version();
create trigger shopping_list_checks_version after insert or update or delete on app.shopping_list_checks
	for each row execute function app.touch_family_version();
create trigger shopping_list_added_back_version after insert or update or delete on app.shopping_list_added_back
	for each row execute function app.touch_family_version();
create trigger shopping_list_items_version after insert or update or delete on app.shopping_list_items
	for each row execute function app.touch_family_version();

-- Personal data shown to every family of the user
create trigger ratings_version after insert or update or delete on app.ratings
	for each row execute function app.touch_families_of_user();
create trigger profiles_version after update of display_name on app.profiles
	for each row execute function app.touch_families_of_user();

-- Never-published recipes cited by meals
create trigger recipes_cited_draft_version after update of name, description on app.recipes
	for each row when (new.status = 'draft') execute function app.touch_families_citing_recipe();

-- Catalogue: published content only; drafts and their history never bump it.
create trigger recipes_version_insert after insert on app.recipes
	for each row when (new.status <> 'draft') execute function app.touch_catalogue_version();
create trigger recipes_version_update after update on app.recipes
	for each row when (old.status <> 'draft' or new.status <> 'draft') execute function app.touch_catalogue_version();
create trigger recipes_version_delete after delete on app.recipes
	for each row when (old.status <> 'draft') execute function app.touch_catalogue_version();
create trigger recipe_ingredients_version after insert or update or delete on app.recipe_ingredients
	for each statement execute function app.touch_catalogue_version();
create trigger ingredients_version after insert or update or delete on app.ingredients
	for each statement execute function app.touch_catalogue_version();
create trigger equivalences_version after insert or update or delete on app.ingredient_unit_equivalences
	for each statement execute function app.touch_catalogue_version();
create trigger books_version after insert or update or delete on app.books
	for each statement execute function app.touch_catalogue_version();
