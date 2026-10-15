-- App administration of users and global roles (spec W10, section 1). Additive: functions only.
-- Every function is for app admins: it reads auth.users (email) and never writes there.

-- Users with email and global roles, by name or email. Case only: no unaccent (spec W10, decision 2).
-- One row more than p_limit: the server answers `more` from it.
create function app.admin_users(p_query text, p_limit int)
returns table (id uuid, display_name text, email text, roles jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
	v_text text := coalesce(btrim(p_query), '');
	v_pattern text;
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	if p_limit is null or p_limit < 1 or p_limit > 200 then
		raise exception 'limit out of range' using errcode = '22023';
	end if;
	-- The person's \, % and _ are text, not wildcards.
	v_pattern := '%' || replace(replace(replace(v_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';
	return query
		select u.id,
			coalesce(p.display_name, nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'User'),
			coalesce(u.email, '')::text,
			coalesce((select jsonb_agg(r.role order by r.role) from app.user_roles r where r.user_id = u.id), '[]'::jsonb)
		from auth.users u
		left join app.profiles p on p.user_id = u.id
		where v_text = '' or p.display_name ilike v_pattern escape '\' or u.email ilike v_pattern escape '\'
		order by lower(coalesce(p.display_name, u.email, '')), u.id
		limit p_limit + 1;
end;
$$;

-- One user; last_app_admin is a hint for the interface, set_user_role is the guarantee.
create function app.admin_user(p_user_id uuid)
returns table (id uuid, display_name text, email text, roles jsonb, last_app_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select u.id,
			coalesce(p.display_name, nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'User'),
			coalesce(u.email, '')::text,
			coalesce((select jsonb_agg(r.role order by r.role) from app.user_roles r where r.user_id = u.id), '[]'::jsonb),
			exists (select 1 from app.user_roles r where r.user_id = u.id and r.role = 'app_admin')
				and not exists (select 1 from app.user_roles r where r.user_id <> u.id and r.role = 'app_admin')
		from auth.users u
		left join app.profiles p on p.user_id = u.id
		where u.id = p_user_id;
end;
$$;

-- The families of a user by name and role only: app admins never see family contents (spec, section 2).
create function app.admin_user_families(p_user_id uuid)
returns table (name text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	return query
		select f.name, m.role
		from app.family_members m
		join app.families f on f.id = m.family_id
		where m.user_id = p_user_id;
end;
$$;

-- Gives or removes a global role; idempotent. The last app admin keeps the role.
create function app.set_user_role(p_user_id uuid, p_role text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
	if not app.has_role('app_admin') then
		raise exception 'app admins only' using errcode = '42501';
	end if;
	if p_role is null or p_role not in ('recipe_curator', 'app_admin') or p_granted is null then
		raise exception 'unknown role' using errcode = '22023';
	end if;
	if not p_granted and p_role = 'app_admin' then
		-- RULE: every path that removes app_admin (this function, the account deletion of activity C,
		-- any future script) takes this same lock and, under it, checks again both the caller and
		-- the number of administrators. Otherwise two administrators removing each other at the
		-- same moment can leave the app without one. Assignments (here and in
		-- app.complete_app_invitation) do not take it: they can only add administrators.
		perform pg_advisory_xact_lock(hashtextextended('app_admin_roles', 0));
		-- New statements after the lock: under read committed they see what the previous holder
		-- committed. A caller demoted while waiting is refused.
		if not app.has_role('app_admin') then
			raise exception 'app admins only' using errcode = '42501';
		end if;
		if exists (select 1 from app.user_roles r where r.user_id = p_user_id and r.role = 'app_admin')
			and not exists (select 1 from app.user_roles r where r.user_id <> p_user_id and r.role = 'app_admin') then
			raise exception 'last app admin' using errcode = 'P0A08';
		end if;
	end if;
	if not exists (select 1 from auth.users u where u.id = p_user_id) then
		raise exception 'unknown user' using errcode = 'P0A07';
	end if;
	if p_granted then
		insert into app.user_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
			on conflict (user_id, role) do nothing;
	else
		delete from app.user_roles r where r.user_id = p_user_id and r.role = p_role;
	end if;
end;
$$;

revoke execute on function app.admin_users(text, int) from public;
revoke execute on function app.admin_user(uuid) from public;
revoke execute on function app.admin_user_families(uuid) from public;
revoke execute on function app.set_user_role(uuid, text, boolean) from public;
grant execute on function app.admin_users(text, int) to authenticated;
grant execute on function app.admin_user(uuid) to authenticated;
grant execute on function app.admin_user_families(uuid) to authenticated;
grant execute on function app.set_user_role(uuid, text, boolean) to authenticated;
