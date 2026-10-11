-- Catalogue management (W3, wave 2): the startRevision requests answered with a revision
-- already open. A draft created by the request has the request id as its own id; a reused
-- one keeps the request id here, so repeating the request returns the same draft even after
-- it was closed or a later revision was opened (spec section 1, idempotent creations).
create table app.recipe_draft_requests (
	id uuid primary key,
	draft_id uuid not null references app.recipe_drafts (id),
	requested_by uuid references auth.users (id) on delete set null,
	requested_at timestamptz not null default now()
);
create index recipe_draft_requests_draft on app.recipe_draft_requests (draft_id);

alter table app.recipe_draft_requests enable row level security;
-- Written once, never changed nor deleted.
grant select, insert on app.recipe_draft_requests to authenticated;
create policy recipe_draft_requests_curate on app.recipe_draft_requests for all to authenticated
	using ((select app.has_role('recipe_curator'))) with check ((select app.has_role('recipe_curator')));
