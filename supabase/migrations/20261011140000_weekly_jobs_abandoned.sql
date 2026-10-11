-- Weekly job: a job whose week is over is closed as abandoned (menu activity, spec
-- section 4.3 of 2026-10-11-menu-pianificatore). Only the status vocabulary changes.
alter table app.weekly_jobs drop constraint weekly_jobs_status_check;
alter table app.weekly_jobs add constraint weekly_jobs_status_check
	check (status in ('pending', 'running', 'done', 'failed', 'abandoned'));
