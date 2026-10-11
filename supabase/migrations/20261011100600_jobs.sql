-- Weekly job: dispatcher rows and the app_job role, which reads every family and
-- writes only weeks, meal contents and its own rows. Spec section 4.

create table app.weekly_jobs (
	family_id uuid not null references app.families (id) on delete cascade,
	target_week date not null check (extract(isodow from target_week) = 1),
	status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
	attempts integer not null default 0 check (attempts >= 0),
	error text,
	updated_at timestamptz not null default now(),
	primary key (family_id, target_week)
);
alter table app.weekly_jobs enable row level security;

grant select on app.families, app.family_members, app.family_books, app.family_ingredients,
	app.recipe_exclusions, app.family_tried_recipes, app.ratings, app.weeks, app.meal_slots, app.recipes,
	app.recipe_ingredients, app.ingredients, app.ingredient_unit_equivalences, app.books, app.recipe_versions
	to app_job;
grant insert on app.weeks, app.meal_slots, app.weekly_jobs to app_job;
grant update (generated_at) on app.weeks to app_job;
grant update (recipe_id, free_text, servings, note, updated_by, updated_at) on app.meal_slots to app_job;
grant select, update (status, attempts, error, updated_at) on app.weekly_jobs to app_job;

create policy families_job on app.families for select to app_job using (true);
create policy family_members_job on app.family_members for select to app_job using (true);
create policy family_books_job on app.family_books for select to app_job using (true);
create policy family_ingredients_job on app.family_ingredients for select to app_job using (true);
create policy recipe_exclusions_job on app.recipe_exclusions for select to app_job using (true);
create policy family_tried_recipes_job on app.family_tried_recipes for select to app_job using (true);
create policy ratings_job on app.ratings for select to app_job using (true);
create policy weeks_job on app.weeks for all to app_job using (true) with check (true);
create policy meal_slots_job on app.meal_slots for all to app_job using (true) with check (true);
create policy recipes_job on app.recipes for select to app_job using (status <> 'draft');
create policy recipe_ingredients_job on app.recipe_ingredients for select to app_job using (true);
create policy ingredients_job on app.ingredients for select to app_job using (true);
create policy equivalences_job on app.ingredient_unit_equivalences for select to app_job using (true);
create policy books_job on app.books for select to app_job using (true);
create policy recipe_versions_job on app.recipe_versions for select to app_job using (true);
create policy weekly_jobs_job on app.weekly_jobs for all to app_job using (true) with check (true);
