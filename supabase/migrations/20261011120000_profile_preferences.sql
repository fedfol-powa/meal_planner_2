-- Family shown in the app, remembered on the server (spec of profile and family, wave 2).
-- Private: profiles are readable by co-members, and row level security filters rows, not
-- columns. The composite key keeps the choice among the user's own families; leaving,
-- being removed or deleting the family clears it. No version counter moves: the choice
-- changes no family data.

create table app.profile_preferences (
	user_id uuid primary key references app.profiles (user_id) on delete cascade,
	current_family_id uuid,
	updated_at timestamptz not null default now(),
	constraint profile_preferences_current_family_member
		foreign key (current_family_id, user_id)
		references app.family_members (family_id, user_id)
		on delete set null (current_family_id)
);

alter table app.profile_preferences enable row level security;

grant select, insert on app.profile_preferences to authenticated;
grant update (current_family_id, updated_at) on app.profile_preferences to authenticated;

create policy profile_preferences_own on app.profile_preferences for all to authenticated
	using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
