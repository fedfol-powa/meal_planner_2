import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Two branches can pick the same timestamp; Supabase then refuses to start (schema_migrations_pkey).
describe('supabase migrations', () => {
	it('have unique versions', () => {
		const files = readdirSync(join(import.meta.dirname, '../supabase/migrations')).filter((f) => f.endsWith('.sql'));
		const versions = files.map((f) => f.split('_')[0]);
		const duplicates = versions.filter((v, i) => versions.indexOf(v) !== i);
		expect(duplicates).toEqual([]);
	});
});
