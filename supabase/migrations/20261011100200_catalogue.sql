-- Catalogue: recipes as documents (drafts, versions) with projections of the current
-- version used to search, plan and shop. Spec sections 2 and 8. Nothing here is ever
-- deleted by users: drafts are closed, ingredients and books archived.

-- Dimension of a unit code for the equivalence constraint (W4): every mass unit is
-- 'mass', every volume unit is 'volume'; tbsp, tsp, each counted unit and us_cup are
-- each a dimension of their own. Codes as in domain/src/units/codes.ts: a new unit
-- code needs a migration updating this function. Unknown codes give null.
create function app.unit_dimension(p_unit text)
returns text language sql immutable set search_path = '' as $$
	select case
		when p_unit in ('g', 'kg', 'oz', 'lb') then 'mass'
		when p_unit in ('ml', 'l', 'uk_fl_oz', 'uk_pint') then 'volume'
		when p_unit in ('tbsp', 'tsp', 'piece', 'clove', 'slice', 'pinch', 'sprig', 'bunch', 'leaf', 'us_cup') then p_unit
	end;
$$;
revoke execute on function app.unit_dimension(text) from public;
grant execute on function app.unit_dimension(text) to authenticated, app_job;

create table app.books (
	id uuid primary key default gen_random_uuid(),
	-- The import recognises books by slug (W3).
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	title text not null check (btrim(title) <> ''),
	archived_at timestamptz,
	archived_by uuid references auth.users (id) on delete set null,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now()
);

create table app.ingredients (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	name jsonb not null check (app.is_localized_text(name)),
	synonyms jsonb not null default '{"it-IT": [], "en-GB": []}' check (app.is_localized_list(synonyms)),
	department text not null check (department in (
		'produce', 'butcher', 'fish', 'chilled', 'bakery', 'pasta_grains', 'tinned', 'frozen', 'condiments', 'other'
	)),
	is_pantry boolean not null default false,
	version integer not null default 1 check (version >= 1),
	archived_at timestamptz,
	archived_by uuid references auth.users (id) on delete set null,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now()
);

-- Append-only: full content of each ingredient version, equivalences included.
create table app.ingredient_versions (
	ingredient_id uuid not null references app.ingredients (id),
	version integer not null check (version >= 1),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	changed_by uuid references auth.users (id) on delete set null,
	changed_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import')),
	primary key (ingredient_id, version)
);

create table app.ingredient_unit_equivalences (
	id uuid primary key default gen_random_uuid(),
	ingredient_id uuid not null references app.ingredients (id),
	from_unit text not null,
	to_unit text not null check (app.unit_dimension(to_unit) is not null),
	from_dimension text not null generated always as (app.unit_dimension(from_unit)) stored,
	factor numeric not null check (factor > 0),
	scope text not null check (scope in ('recipe', 'shopping')),
	-- Normalised Italian preparation (as for varieties, computed by the domain): the
	-- equivalence applies only to lines with that preparation; null = any line. The
	-- domain prefers the specific one over the generic one.
	preparation text check (btrim(preparation) <> ''),
	source text,
	-- At most one equivalence per ingredient, scope, dimension and preparation or none.
	unique nulls not distinct (ingredient_id, scope, from_dimension, preparation)
);

create table app.recipes (
	id uuid primary key default gen_random_uuid(),
	slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	-- Identity in the origin project (W3): the import recognises its recipes by
	-- origin_slug only; origin_type is the type as it was there.
	origin_slug text unique,
	origin_type text check (origin_type in ('web', 'youtube', 'libro', 'casa')),
	status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
	version integer not null default 0 check (version >= 0),
	-- Projection of the current RecipeDocument (W3 interface). A never-published
	-- recipe has only name and description, from its draft.
	name jsonb check (app.is_localized_text(name)),
	description jsonb check (app.is_localized_text(description)),
	source_type text check (source_type in ('web', 'youtube', 'book', 'home')),
	source_url text,
	book_id uuid references app.books (id),
	book_pages text,
	duration_minutes integer check (duration_minutes > 0),
	base_servings integer check (base_servings > 0),
	protein_group text check (protein_group in (
		'fish', 'white_meat', 'red_meat', 'cured_meat', 'legumes', 'eggs', 'cheese', 'vegetarian'
	)),
	is_fresh_fish boolean,
	carbohydrate_group text check (carbohydrate_group in ('pasta', 'rice', 'potatoes', 'bread', 'cereals', 'none')),
	has_vegetables boolean,
	category text check (category in (
		'wok', 'skottle', 'oven_bake', 'grill', 'pan', 'soup', 'salad', 'savoury_pie', 'wrap_sandwich', 'burger', 'other'
	)),
	meal_type text check (meal_type in ('lunch', 'dinner', 'both')),
	seasons text[] not null default '{}' check (seasons <@ array['spring', 'summer', 'autumn', 'winter']),
	is_heavy boolean,
	tags text[] not null default '{}',
	archived_at timestamptz,
	archived_by uuid references auth.users (id) on delete set null,
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),
	constraint recipes_draft_never_published check ((status = 'draft') = (version = 0)),
	-- Required to publish (user decision of 11 October 2026): all planner attributes
	-- except seasons and the primary ingredient.
	constraint recipes_published_complete check (version = 0 or (
		name is not null and description is not null and source_type is not null
		and duration_minutes is not null and base_servings is not null
		and protein_group is not null and is_fresh_fish is not null
		and carbohydrate_group is not null and has_vegetables is not null
		and category is not null and meal_type is not null and is_heavy is not null
	))
);

-- Projection of the ingredient lines of the current RecipeDocument (W3 interface).
-- Rewritten (delete and insert) at every publication or restore.
create table app.recipe_ingredients (
	recipe_id uuid not null references app.recipes (id) on delete cascade,
	position smallint not null check (position >= 0),
	ingredient_id uuid not null references app.ingredients (id),
	variety jsonb check (app.is_localized_text(variety)),
	-- varietyKey(variety['it-IT']) of the domain (W4); empty without variety.
	variety_key text not null default '',
	quantity_kind text not null check (quantity_kind in ('amount', 'to_taste', 'text')),
	quantity numeric check (quantity > 0),
	unit text,
	quantity_text jsonb check (app.is_localized_text(quantity_text)),
	source_text text not null check (btrim(source_text) <> '' and char_length(source_text) <= 200),
	preparation jsonb check (app.is_localized_text(preparation)),
	is_optional boolean not null default false,
	is_primary boolean not null default false,
	primary key (recipe_id, position),
	unique (recipe_id, ingredient_id, variety_key),
	constraint recipe_ingredients_quantity check (
		(quantity_kind = 'amount' and quantity is not null and unit is not null and quantity_text is null)
		or (quantity_kind = 'to_taste' and quantity is null and unit is null and quantity_text is null)
		or (quantity_kind = 'text' and quantity is null and unit is null and quantity_text is not null)
	)
);
create unique index recipe_ingredients_one_primary on app.recipe_ingredients (recipe_id) where is_primary;
create index recipe_ingredients_ingredient on app.recipe_ingredients (ingredient_id);

-- Drafts are closed (published or discarded), never deleted.
create table app.recipe_drafts (
	id uuid primary key default gen_random_uuid(),
	recipe_id uuid not null references app.recipes (id),
	kind text not null check (kind in ('new', 'revision')),
	base_version integer,
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	revision integer not null check (revision >= 1),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default now(),
	updated_by uuid references auth.users (id) on delete set null,
	updated_at timestamptz not null default now(),
	closed_at timestamptz,
	closed_by uuid references auth.users (id) on delete set null,
	outcome text check (outcome in ('published', 'discarded')),
	check ((kind = 'new') = (base_version is null)),
	check ((closed_at is null) = (outcome is null))
);
create unique index recipe_drafts_one_open on app.recipe_drafts (recipe_id) where closed_at is null;

-- A closed draft keeps content, revision, identity and outcome. Only its author
-- references may be cleared, and only by the foreign keys (on delete set null) when a
-- user is deleted: that update runs nested in the referential trigger.
create function app.prevent_closed_draft_update()
returns trigger language plpgsql set search_path = '' as $$
begin
	if pg_catalog.pg_trigger_depth() > 1
		and (new.id, new.recipe_id, new.kind, new.base_version, new.content, new.revision,
				new.created_at, new.updated_at, new.closed_at, new.outcome)
			is not distinct from (old.id, old.recipe_id, old.kind, old.base_version, old.content, old.revision,
				old.created_at, old.updated_at, old.closed_at, old.outcome)
		and (new.created_by is null or new.created_by = old.created_by)
		and (new.updated_by is null or new.updated_by = old.updated_by)
		and (new.closed_by is null or new.closed_by = old.closed_by)
	then
		return new;
	end if;
	raise exception 'draft % is closed', old.id using errcode = '55000';
end;
$$;

create trigger recipe_drafts_closed
	before update on app.recipe_drafts
	for each row when (old.closed_at is not null)
	execute function app.prevent_closed_draft_update();

-- Kept for ever; an overwritten save stays recoverable.
create table app.recipe_draft_saves (
	draft_id uuid not null references app.recipe_drafts (id),
	revision integer not null check (revision >= 1),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	saved_by uuid references auth.users (id) on delete set null,
	saved_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import')),
	overwritten boolean not null default false,
	primary key (draft_id, revision)
);

create table app.recipe_versions (
	recipe_id uuid not null references app.recipes (id),
	version integer not null check (version >= 1),
	content jsonb not null check (jsonb_typeof(content) = 'object'),
	published_by uuid references auth.users (id) on delete set null,
	published_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import')),
	restored_from integer,
	-- Set when the version comes from a whole-catalogue restore: the instant restored.
	restored_instant timestamptz,
	primary key (recipe_id, version)
);

create table app.recipe_status_changes (
	id uuid primary key default gen_random_uuid(),
	recipe_id uuid not null references app.recipes (id),
	status text not null check (status in ('draft', 'published', 'archived')),
	changed_by uuid references auth.users (id) on delete set null,
	changed_at timestamptz not null default now(),
	channel text not null check (channel in ('web', 'mcp', 'import'))
);
create index recipe_status_changes_recipe on app.recipe_status_changes (recipe_id, changed_at);

-- Names of the people who wrote drafts, saves, versions and status changes, for the
-- curators only (attribution of shared drafts and of conflicts): id and name, nothing
-- else of the profile; empty for everybody else.
create function app.catalogue_author_names()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
	select p.user_id, p.display_name
	from app.profiles p
	where app.has_role('recipe_curator')
		and p.user_id in (
			select d.created_by from app.recipe_drafts d
			union select d.updated_by from app.recipe_drafts d
			union select d.closed_by from app.recipe_drafts d
			union select s.saved_by from app.recipe_draft_saves s
			union select v.published_by from app.recipe_versions v
			union select c.changed_by from app.recipe_status_changes c
		);
$$;

revoke execute on function app.prevent_closed_draft_update(), app.catalogue_author_names() from public;
grant execute on function app.catalogue_author_names() to authenticated;

alter table app.books enable row level security;
alter table app.ingredients enable row level security;
alter table app.ingredient_versions enable row level security;
alter table app.ingredient_unit_equivalences enable row level security;
alter table app.recipes enable row level security;
alter table app.recipe_ingredients enable row level security;
alter table app.recipe_drafts enable row level security;
alter table app.recipe_draft_saves enable row level security;
alter table app.recipe_versions enable row level security;
alter table app.recipe_status_changes enable row level security;

grant select, insert on app.books, app.ingredients, app.ingredient_unit_equivalences, app.recipes,
	app.recipe_ingredients, app.recipe_drafts, app.recipe_draft_saves, app.recipe_versions,
	app.recipe_status_changes, app.ingredient_versions to authenticated;
grant update (title, archived_at, archived_by) on app.books to authenticated;
grant update (name, synonyms, department, is_pantry, version, archived_at, archived_by, updated_by, updated_at)
	on app.ingredients to authenticated;
grant update (to_unit, factor, source), delete on app.ingredient_unit_equivalences to authenticated;
grant update (
	slug, origin_slug, origin_type, status, version, name, description, source_type, source_url, book_id,
	book_pages, duration_minutes, base_servings, protein_group, is_fresh_fish, carbohydrate_group,
	has_vegetables, category, meal_type, seasons, is_heavy, tags, archived_at, archived_by, updated_by, updated_at
) on app.recipes to authenticated;
grant delete on app.recipe_ingredients to authenticated;
grant update (content, revision, updated_by, updated_at, closed_at, closed_by, outcome) on app.recipe_drafts to authenticated;
grant update (overwritten) on app.recipe_draft_saves to authenticated;

-- Everyone signed in reads the published catalogue.
create policy books_read on app.books for select to authenticated using (true);
create policy ingredients_read on app.ingredients for select to authenticated using (true);
create policy equivalences_read on app.ingredient_unit_equivalences for select to authenticated using (true);
create policy recipe_ingredients_read on app.recipe_ingredients for select to authenticated using (true);
create policy recipe_versions_read on app.recipe_versions for select to authenticated using (true);
create policy recipes_read on app.recipes for select to authenticated
	using (status <> 'draft' or (select app.has_role('recipe_curator')));

-- Curators write the whole catalogue; the grants limit what "write" means per table.
create policy books_curate on app.books for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy ingredients_curate on app.ingredients for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy equivalences_curate on app.ingredient_unit_equivalences for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipes_curate on app.recipes for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_ingredients_curate on app.recipe_ingredients for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_drafts_curate on app.recipe_drafts for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_draft_saves_curate on app.recipe_draft_saves for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy recipe_versions_insert on app.recipe_versions for insert to authenticated
	with check ((select app.has_role('recipe_curator')));
create policy recipe_status_changes_curate on app.recipe_status_changes for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
create policy ingredient_versions_curate on app.ingredient_versions for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
