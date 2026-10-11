-- Local development data only. Never applied to the real project.
-- Password of every user: password123. No catalogue: it comes from the import (W3).
do $$
declare
	v_person record;
	v_id uuid;
begin
	for v_person in
		select * from (values
			('anna@example.test', 'Anna', 'it-IT'),
			('bruno@example.test', 'Bruno', 'it-IT'),
			('carla@example.test', 'Carla', 'en-GB'),
			('dario@example.test', 'Dario', 'it-IT')
		) as p (email, display_name, locale)
	loop
		v_id := gen_random_uuid();
		insert into auth.users (
			instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
			raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
			confirmation_token, recovery_token, email_change_token_new, email_change
		) values (
			'00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_person.email,
			extensions.crypt('password123', extensions.gen_salt('bf')), now(),
			'{"provider": "email", "providers": ["email"]}',
			jsonb_build_object('display_name', v_person.display_name, 'locale', v_person.locale),
			now(), now(), '', '', '', ''
		);
		insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
		values (gen_random_uuid(), v_id, v_id::text,
			jsonb_build_object('sub', v_id::text, 'email', v_person.email), 'email', now(), now(), now());
	end loop;
end;
$$;

insert into app.user_roles (user_id, role)
	select id, 'recipe_curator' from auth.users where email = 'dario@example.test';

insert into app.families (id, name) values ('5eed0000-0000-4000-8000-000000000001', 'Famiglia Rossi');
insert into app.family_members (family_id, user_id, role)
	select '5eed0000-0000-4000-8000-000000000001', u.id,
		case u.email when 'anna@example.test' then 'family_admin' else 'member' end
	from auth.users u where u.email in ('anna@example.test', 'bruno@example.test');

insert into app.families (id, name, measurement_system, time_zone)
	values ('5eed0000-0000-4000-8000-000000000002', 'Carla''s family', 'uk_imperial', 'Europe/London');
insert into app.family_members (family_id, user_id, role)
	select '5eed0000-0000-4000-8000-000000000002', id, 'family_admin' from auth.users where email = 'carla@example.test';
