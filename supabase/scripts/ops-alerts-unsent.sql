-- Alerts closed without being sent (spec W15, section 9, point 10): expired after 24 hours or
-- closed as ambiguous by an idempotency 409. Read only. Handled by hand from the details and the
-- Worker logs: never resent, never reset.
-- Run: node scripts/prod-sql.ts --preview ops-alerts-unsent
select event, key, details, attempts, closed_reason, created_at, closed_at
from app.ops_alerts
where closed_reason in ('expired', 'ambiguous')
order by created_at desc;
