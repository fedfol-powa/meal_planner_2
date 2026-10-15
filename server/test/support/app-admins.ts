import type postgres from 'postgres';

/**
 * Leaves `keep` as the only app admins of the shared test database and returns how to put the
 * others back. Callers restore in `finally` or `afterEach`, also when the test fails (spec W10).
 */
export async function onlyAppAdmins(admin: postgres.Sql, keep: string[]): Promise<() => Promise<void>> {
	const removed = await admin<{ user_id: string; granted_by: string | null; granted_at: Date }[]>`
		delete from app.user_roles where role = 'app_admin' and not (user_id = any(${keep}::uuid[]))
		returning user_id, granted_by, granted_at`;
	return async () => {
		for (const row of removed) {
			await admin`insert into app.user_roles (user_id, role, granted_by, granted_at)
				values (${row.user_id}, 'app_admin', ${row.granted_by}, ${row.granted_at})
				on conflict (user_id, role) do nothing`;
		}
	};
}
