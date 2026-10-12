-- Was the first app week made by the Wednesday cron? (detail spec, section 5). Read only.
-- The job inserts its weekly_jobs row only when the week is missing at dispatch: a lazy generation
-- leaves none. Run: scripts/prod-sql.sh --preview supabase/scripts/check-first-generation.sql --set family_id=<uuid> --set week_start=<monday>
begin;
select w.starts_on, w.generated_at at time zone f.time_zone as generated_local,
	j.status, j.attempts, j.updated_at at time zone f.time_zone as job_local,
	coalesce(j.status = 'done' and w.generated_at <= j.updated_at and w.generated_at >= date_trunc('hour', j.updated_at), false) as cron_generated
from app.families f
join app.weeks w on w.family_id = f.id and w.starts_on = :'week_start'::date
left join app.weekly_jobs j on j.family_id = f.id and j.target_week = w.starts_on
where f.id = :'family_id'::uuid;
commit;
