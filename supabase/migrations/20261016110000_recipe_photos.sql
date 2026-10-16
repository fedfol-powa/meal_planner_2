-- Recipe photos (W12, wave 3): one current photo per recipe, outside the recipe document and
-- its versions. Rows are never deleted: a replaced or removed photo keeps its row with
-- removed_at, and its object stays in the photo bucket (no automatic deletion).
create table app.recipe_photos (
	id uuid primary key,
	recipe_id uuid not null references app.recipes (id),
	storage_key text not null unique check (storage_key ~ '^photos/[A-Za-z0-9_-]{22}\.webp$'),
	content_type text not null check (content_type = 'image/webp'),
	width int not null check (width > 0),
	height int not null check (height > 0),
	bytes int not null check (bytes > 0),
	created_by uuid references auth.users (id) on delete set null,
	created_at timestamptz not null default clock_timestamp(),
	channel text not null check (channel in ('web', 'mcp')),
	removed_at timestamptz,
	removed_by uuid references auth.users (id) on delete set null,
	check (removed_by is null or removed_at is not null),
	check (removed_at is null or removed_at >= created_at)
);

-- At most one current photo per recipe.
create unique index recipe_photos_one_current on app.recipe_photos (recipe_id) where removed_at is null;

alter table app.recipe_photos enable row level security;

grant select, insert on app.recipe_photos to authenticated;
grant update (removed_at, removed_by) on app.recipe_photos to authenticated;
grant select on app.recipe_photos to app_backup;

-- Whoever cannot see the recipe (a draft, for members) does not see its photo.
create policy recipe_photos_read on app.recipe_photos for select to authenticated
	using (exists (select 1 from app.recipes r where r.id = recipe_id));
-- Curators write; the grants limit writes to insert and the removal columns, never delete.
create policy recipe_photos_curate on app.recipe_photos for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));

-- Per row: an update of no row (a removal without a current photo) writes nothing, not even the
-- counter. The counter moves once per transaction anyway.
create trigger recipe_photos_touch_catalogue after insert or update on app.recipe_photos
	for each row execute function app.touch_catalogue_version();

-- The public photo route: content type and size of a current photo, drafts included
-- (their URL reaches curators only). The only access of anon to the table.
create function app.served_photo(p_key text)
returns table (content_type text, bytes int)
language sql stable security definer set search_path = '' as $$
	select p.content_type, p.bytes from app.recipe_photos p
	where p.storage_key = p_key and p.removed_at is null;
$$;
revoke execute on function app.served_photo(text) from public;
grant execute on function app.served_photo(text) to anon;
