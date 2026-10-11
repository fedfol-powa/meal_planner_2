import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Locale } from '@app/contract';
import postgres from 'postgres';

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const inCi = Boolean(env.CI);
const databaseUrl = env.TEST_DATABASE_URL;

// In CI an integration suite must never be skipped: no database is a failure.
if (inCi && !databaseUrl) throw new Error('TEST_DATABASE_URL is required in CI (see .github/workflows/ci.yml)');
export const hasDatabase = Boolean(databaseUrl);

const APP_SERVER_PASSWORD = 'app_server_test';

export interface TestDatabase {
	admin: postgres.Sql;
	/** Connection as the server's technical user, like Hyperdrive in production. */
	appServerUrl: string;
	createUser(options?: { locale?: Locale }): Promise<{ userId: string; sessionId: string }>;
	endSession(sessionId: string): Promise<void>;
	deleteUser(userId: string): Promise<void>;
	createFamily(members: { userId: string; role: 'family_admin' | 'member' }[]): Promise<string>;
	addMember(familyId: string, userId: string, role: 'family_admin' | 'member'): Promise<void>;
	grantGlobalRole(userId: string, role: 'recipe_curator' | 'app_admin'): Promise<void>;
	bumpFamily(familyId: string): Promise<void>;
	close(): Promise<void>;
}

async function ensureSchema(admin: postgres.Sql): Promise<void> {
	const [{ present }] = await admin<{ present: boolean }[]>`select to_regclass('app.profiles') is not null as present`;
	if (present) return;
	if (inCi || env.TEST_DB_FIXTURE !== '1') {
		throw new Error(
			'Schema app is missing: start the local database with the migrations of supabase/ ' +
				'(supabase db start), or set TEST_DB_FIXTURE=1 to use the provisional fixture before the schema is merged.',
		);
	}
	await admin.unsafe(await readFile(fileURLToPath(new URL('./schema.sql', import.meta.url).href), 'utf8'));
}

export async function setupDatabase(): Promise<TestDatabase> {
	if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set');
	const admin = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	await ensureSchema(admin);
	await admin.unsafe(`alter role app_server password '${APP_SERVER_PASSWORD}'`);
	const url = new URL(databaseUrl);
	url.username = 'app_server';
	url.password = APP_SERVER_PASSWORD;

	const addMember = async (familyId: string, userId: string, role: 'family_admin' | 'member') => {
		await admin`insert into app.family_members (family_id, user_id, role) values (${familyId}, ${userId}, ${role})`;
	};

	return {
		admin,
		appServerUrl: url.toString(),
		async createUser(options = {}) {
			const userId = crypto.randomUUID();
			const sessionId = crypto.randomUUID();
			const metadata = { display_name: `Test ${userId.slice(0, 8)}`, locale: options.locale ?? 'it-IT' };
			// The W2 trigger on auth.users creates the profile from the metadata.
			await admin`
				insert into auth.users (id, email, aud, role, raw_user_meta_data)
				values (${userId}, ${`${userId}@test.local`}, 'authenticated', 'authenticated', ${admin.json(metadata)})`;
			await admin`insert into auth.sessions (id, user_id) values (${sessionId}, ${userId})`;
			return { userId, sessionId };
		},
		async endSession(sessionId) {
			await admin`delete from auth.sessions where id = ${sessionId}`;
		},
		async deleteUser(userId) {
			await admin`delete from auth.users where id = ${userId}`;
		},
		async createFamily(members) {
			const [{ id }] = await admin<{ id: string }[]>`
				insert into app.families (name, measurement_system) values ('Test', 'metric') returning id`;
			for (const member of members) await addMember(id, member.userId, member.role);
			return id;
		},
		addMember,
		async grantGlobalRole(userId, role) {
			await admin`insert into app.user_roles (user_id, role) values (${userId}, ${role})`;
		},
		async bumpFamily(familyId) {
			await admin`update app.families set data_version = data_version + 1 where id = ${familyId}`;
		},
		async close() {
			await admin.end();
		},
	};
}
