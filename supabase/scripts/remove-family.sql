-- Removes a family nobody has used yet (detail spec of the production launch, sections 5 and 8):
-- only when schema app is exactly at the last launch baseline (bootstrap, or launch load). The
-- catalogue and the ratings stay.
-- Run: scripts/prod-sql.sh --preview supabase/scripts/remove-family.sql --set family_id=<uuid> --set expected_fingerprint=<fp>
begin;

select set_config('w6.expected_fingerprint', :'expected_fingerprint', true), set_config('w6.family_id', :'family_id', true);

do $$
declare
	v_now text;
begin
	-- Every table first: a concurrent write waits, and the fingerprint below cannot change before the delete.
	perform pg_temp.lock_app_tables('exclusive');
	v_now := pg_temp.app_fingerprint();
	if v_now is distinct from current_setting('w6.expected_fingerprint') then
		raise exception 'app data changed since the launch baseline (fingerprint %, expected %): nothing removed', v_now, current_setting('w6.expected_fingerprint');
	end if;
	if not exists (select 1 from app.families where id = current_setting('w6.family_id')::uuid) then
		raise exception 'family % not found: nothing removed', current_setting('w6.family_id');
	end if;
end;
$$;

select 'weeks' as rows_removed, count(*) from app.weeks where family_id = :'family_id'::uuid
union all select 'meal_slots', count(*) from app.meal_slots s join app.weeks w on w.id = s.week_id where w.family_id = :'family_id'::uuid
union all select 'family_members', count(*) from app.family_members where family_id = :'family_id'::uuid;

delete from app.families where id = :'family_id'::uuid;

commit;
