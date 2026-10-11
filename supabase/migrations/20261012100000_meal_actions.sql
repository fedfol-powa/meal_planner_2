-- Revision of the meals (W1, wave 2): every write is an action with a client id, one row per
-- request, never changed. The meal_changes rows of an action carry its id; each slot points
-- to the last action that changed it, written under the row lock: the real order of the
-- serialised writes. Spec of the revision, section 3.

create table app.meal_actions (
	id uuid primary key,
	week_id uuid not null references app.weeks (id) on delete cascade,
	actor_id uuid references auth.users (id) on delete set null,
	channel text not null check (channel in ('web', 'mcp')),
	kind text not null check (kind in ('set_servings', 'set_recipe', 'set_free', 'set_note', 'swap', 'undo')),
	slot_ids uuid[] not null check (cardinality(slot_ids) between 1 and 2),
	undoes uuid,
	created_at timestamptz not null default clock_timestamp(),
	unique (id, week_id),
	foreign key (undoes, week_id) references app.meal_actions (id, week_id) on delete cascade,
	check ((kind = 'undo') = (undoes is not null))
);
create index meal_actions_week on app.meal_actions (week_id);

alter table app.meal_changes add column action_id uuid references app.meal_actions (id) on delete cascade;
create index meal_changes_action on app.meal_changes (action_id);
-- The moment of the save, after the lock: not the start of the transaction.
alter table app.meal_changes alter column created_at set default clock_timestamp();

alter table app.meal_slots add column last_action_id uuid;
alter table app.meal_slots add constraint meal_slots_last_action
	foreign key (last_action_id, week_id) references app.meal_actions (id, week_id) on delete set null (last_action_id);

alter table app.meal_actions enable row level security;
grant select, insert on app.meal_actions to authenticated;
grant update (last_action_id) on app.meal_slots to authenticated;

create policy meal_actions_read on app.meal_actions for select to authenticated
	using (app.can_access_week(week_id));
create policy meal_actions_insert on app.meal_actions for insert to authenticated
	with check (
		actor_id = (select auth.uid())
		and app.can_access_week(week_id)
		and not exists (
			select 1 from unnest(slot_ids) x (id)
			where not exists (select 1 from app.meal_slots s where s.id = x.id and s.week_id = meal_actions.week_id)
		)
	);

-- Rule 1: a change of an action states the slot's real content as `before`, belongs to the
-- user's action on that slot, and an undo row points to a row of the undone action. Rows
-- without an action (import, older tests) stay as before and prove nothing to rule 3.
-- Security invoker: the user's RLS applies; another family's slot is simply not found.
create function app.check_meal_change()
returns trigger language plpgsql set search_path = '' as $$
declare
	v_action app.meal_actions;
	v_content jsonb;
begin
	if new.action_id is null then
		return new;
	end if;
	select * into v_action from app.meal_actions where id = new.action_id;
	select jsonb_build_object('recipeId', recipe_id, 'freeText', free_text, 'servings', servings, 'note', note)
		into v_content from app.meal_slots where id = new.meal_slot_id;
	if v_action.id is null or v_content is null
		or v_action.actor_id is distinct from auth.uid()
		or not (new.meal_slot_id = any (v_action.slot_ids))
		or new.before is distinct from v_content
		or (new.undoes is null) <> (v_action.undoes is null)
		or (new.undoes is not null and not exists (
			select 1 from app.meal_changes c where c.id = new.undoes and c.action_id = v_action.undoes))
	then
		raise exception 'meal change does not match its action or the meal' using errcode = '42501';
	end if;
	return new;
end;
$$;
create trigger meal_changes_check before insert on app.meal_changes
	for each row when (current_user = 'authenticated') execute function app.check_meal_change();

-- Rule 2: the last action of a slot is one of the user's actions that changed it.
create function app.check_meal_slot_last_action()
returns trigger language plpgsql set search_path = '' as $$
begin
	if new.last_action_id is not null and not exists (
		select 1 from app.meal_actions a join app.meal_changes c on c.action_id = a.id and c.meal_slot_id = new.id
		where a.id = new.last_action_id and a.actor_id = auth.uid() and new.id = any (a.slot_ids)
	) then
		raise exception 'last action % did not change meal %', new.last_action_id, new.id using errcode = '42501';
	end if;
	return new;
end;
$$;
create trigger meal_slots_check_last_action before update of last_action_id on app.meal_slots
	for each row when (current_user = 'authenticated' and new.last_action_id is distinct from old.last_action_id)
	execute function app.check_meal_slot_last_action();

-- Rule 3: a never-published recipe reaches a meal of a user only (a) when another slot of the
-- family cites it (unchanged), or, while its draft is open, (b) when the same action moves it
-- from another slot of the week or (c) when the action undoes a change of this slot that took
-- it away. The evidence is the change log of the action in progress, truthful by rule 1.
create or replace function app.check_meal_slot_recipe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
	if app.can_access_week(new.week_id)
		and exists (select 1 from app.recipes r where r.id = new.recipe_id and r.status = 'draft')
		and not exists (
			select 1 from app.meal_slots s join app.weeks w on w.id = s.week_id
			where s.recipe_id = new.recipe_id and s.id <> new.id
				and w.family_id = (select family_id from app.weeks where id = new.week_id)
		)
		and not (
			new.last_action_id is not null
			and exists (select 1 from app.recipe_drafts d where d.recipe_id = new.recipe_id and d.closed_at is null)
			and exists (
				select 1 from app.meal_actions a
				where a.id = new.last_action_id and a.actor_id = auth.uid() and a.week_id = new.week_id
			)
			and (
				exists (
					select 1 from app.meal_changes c join app.meal_slots o on o.id = c.meal_slot_id
					where c.action_id = new.last_action_id and c.meal_slot_id <> new.id and o.week_id = new.week_id
						and c.before ->> 'recipeId' = new.recipe_id::text
				)
				or exists (
					select 1 from app.meal_changes u join app.meal_changes c on c.id = u.undoes and c.meal_slot_id = new.id
					where u.action_id = new.last_action_id and u.meal_slot_id = new.id
						and c.before ->> 'recipeId' = new.recipe_id::text
				)
			)
		)
	then
		raise exception 'recipe % cannot be linked to a meal', new.recipe_id using errcode = '42501';
	end if;
	return new;
end;
$$;

-- Whether undoing an action would bring back a never-published recipe whose draft was closed
-- without publication (meals.undo answers draft_closed). Reads only the rows of that action,
-- truthful by rule 1, and only for actions of weeks the caller can access: it does not depend on
-- the recipe being visible now (the last citation may be gone) and reveals nothing else.
-- First it locks the recipes the undo would bring back (for share, until the commit): the
-- curator's discard and publication lock the same row (for no key update) before checking the
-- citations, so either the discard waits and then sees the meal citing the recipe again
-- (cited_by_meals), or the undo waits and then sees the draft closed. Volatile: the check after
-- the wait reads with a new snapshot.
create function app.meal_action_restores_closed_draft(p_action_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
	if not exists (select 1 from app.meal_actions a where a.id = p_action_id and app.can_access_week(a.week_id)) then
		return false;
	end if;
	perform 1 from app.recipes r
	where r.id in (
		select (c.before ->> 'recipeId')::uuid from app.meal_changes c where c.action_id = p_action_id and c.before ->> 'recipeId' is not null
	)
	order by r.id
	for share of r;
	return exists (
		select 1
		from app.meal_changes c
		join app.recipes r on r.id = (c.before ->> 'recipeId')::uuid
		where c.action_id = p_action_id
			and r.status = 'draft'
			and not exists (select 1 from app.recipe_drafts d where d.recipe_id = r.id and d.closed_at is null)
	);
end;
$$;

revoke execute on function app.check_meal_change(), app.check_meal_slot_last_action(), app.meal_action_restores_closed_draft(uuid) from public;
grant execute on function app.meal_action_restores_closed_draft(uuid) to authenticated;
