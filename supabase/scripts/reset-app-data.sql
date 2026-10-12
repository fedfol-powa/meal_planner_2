-- Empties the catalogue and every family's data, keeping schema, users, profiles and global roles
-- (detail spec of the production launch, section 8). Only when schema app is exactly at the last launch baseline.
-- Run: node scripts/prod-sql.ts --preview reset-app-data --set expected_fingerprint=<fp> (the tool opens the transaction).

select set_config('w6.expected_fingerprint', :'expected_fingerprint', true);

do $$
declare
	v_now text;
begin
	perform pg_temp.lock_app_tables('access exclusive');
	v_now := pg_temp.app_fingerprint();
	if v_now is distinct from current_setting('w6.expected_fingerprint') then
		raise exception 'app data changed since the launch baseline (fingerprint %, expected %): nothing reset', v_now, current_setting('w6.expected_fingerprint');
	end if;
end;
$$;

select 'families' as rows_removed, count(*) from app.families
union all select 'weeks', count(*) from app.weeks
union all select 'meal_slots', count(*) from app.meal_slots
union all select 'ratings', count(*) from app.ratings
union all select 'recipes', count(*) from app.recipes
union all select 'ingredients', count(*) from app.ingredients
union all select 'books', count(*) from app.books;

truncate app.families, app.recipes, app.ingredients, app.books cascade;
