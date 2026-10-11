-- Catalogue management (W3, wave 2): citations of a recipe across families and the
-- authors of ingredient changes, for curators only.

-- A new draft can be discarded only when no meal of any family cites it; curators do not
-- see the meals of other families, so the answer comes from here, as a boolean only.
create function app.recipe_is_cited(p_recipe_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('recipe_curator') then
		raise exception 'curators only' using errcode = '42501';
	end if;
	return exists (select 1 from app.meal_slots where recipe_id = p_recipe_id);
end;
$$;

revoke execute on function app.recipe_is_cited(uuid) from public;
grant execute on function app.recipe_is_cited(uuid) to authenticated;

-- Same function, now also naming who changed an ingredient (conflicts and history).
create or replace function app.catalogue_author_names()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
	select p.user_id, p.display_name
	from app.profiles p
	where app.has_role('recipe_curator')
		and p.user_id in (
			select d.created_by from app.recipe_drafts d
			union select d.updated_by from app.recipe_drafts d
			union select d.closed_by from app.recipe_drafts d
			union select s.saved_by from app.recipe_draft_saves s
			union select v.published_by from app.recipe_versions v
			union select c.changed_by from app.recipe_status_changes c
			union select i.changed_by from app.ingredient_versions i
		);
$$;
