-- Agents (OAuth clients of Supabase Auth) the caller has allowed: active grants, with the
-- last token issue or renewal of their live sessions. Authorisations live in Supabase
-- Auth; disconnecting goes through its API, never through this schema.
create function app.connected_agents()
returns table (client_id uuid, name text, connected_at timestamptz, last_renewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
	select c.client_id, coalesce(oc.client_name, ''), c.granted_at, max(s.updated_at)
	from auth.oauth_consents c
	join auth.oauth_clients oc on oc.id = c.client_id
	left join auth.sessions s
		on s.user_id = c.user_id and s.oauth_client_id = c.client_id
		and (s.not_after is null or s.not_after > now())
	where c.user_id = auth.uid() and c.revoked_at is null and oc.deleted_at is null
	group by c.client_id, oc.client_name, c.granted_at
$$;

revoke execute on function app.connected_agents() from public;
grant execute on function app.connected_agents() to authenticated;
