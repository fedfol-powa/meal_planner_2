-- Was the first app week made by the Wednesday cron? (detail spec, section 5, «Evidenza della prima
-- generazione»). Read only. The job creates the week and marks itself done in one transaction, and now()
-- is the start of the transaction: generated_at equals the job's updated_at only when that transaction
-- made the week. A lazy generation leaves either no job row or a different instant; the window, Wednesday
-- 20:00–21:00 in the family's time zone before week_start, excludes a late catch-up.
-- Run: node scripts/prod-sql.ts --preview check-first-generation --set family_id=<uuid> --set week_start=<monday>
select w.starts_on, w.generated_at at time zone f.time_zone as generated_local,
	j.status, j.attempts, j.updated_at at time zone f.time_zone as job_local,
	coalesce(
		j.status = 'done'
		and w.generated_at = j.updated_at
		and w.generated_at at time zone f.time_zone >= (w.starts_on - 5) + time '20:00'
		and w.generated_at at time zone f.time_zone < (w.starts_on - 5) + time '21:00',
		false) as cron_generated
from app.families f
join app.weeks w on w.family_id = f.id and w.starts_on = :'week_start'::date
left join app.weekly_jobs j on j.family_id = f.id and j.target_week = w.starts_on
where f.id = :'family_id'::uuid;
