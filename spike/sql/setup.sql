-- Spike only: run in the Supabase SQL editor after creating the two test users
-- (Authentication > Users > Add user, with password and "Auto Confirm User").
create schema if not exists spike;
grant usage on schema spike to authenticated;

create table spike.recipes (
	id uuid primary key default gen_random_uuid(),
	owner uuid not null references auth.users (id) on delete cascade,
	title text not null
);
alter table spike.recipes enable row level security;
grant select on spike.recipes to authenticated;
create policy "owner reads own recipes" on spike.recipes
	for select to authenticated using (owner = (select auth.uid()));

insert into spike.recipes (owner, title)
select u.id, r.title
from auth.users u
join (values
	('spike-a@cosasimangia.test', 'Pasta al pomodoro'),
	('spike-a@cosasimangia.test', 'Risotto ai funghi'),
	('spike-b@cosasimangia.test', 'Vellutata di zucca')
) as r (email, title) on r.email = u.email;

select u.email, count(*) from spike.recipes s join auth.users u on u.id = s.owner group by 1;
