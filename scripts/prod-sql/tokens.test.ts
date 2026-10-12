// The defence on the text of the service SQL (detail spec, section 8): transaction control, psql
// meta-commands and unquoted variables refused wherever they stand outside strings, comments and
// dollar-quoted bodies, not only at the start of a line (review of PR #34, finding 1).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSqlText, SqlTextError } from './tokens.ts';

describe('checkSqlText', () => {
	it('refuses the bypasses of the review and their variants', () => {
		for (const text of [
			'select 1; COMMIT;\ndelete from app.families;',
			'/* comment */ COMMIT;',
			'select 1; \\connect other',
			'select 1;\n\\! rm -rf /tmp/x',
			'END;',
			'select 1; end',
			'savepoint a;',
			'release savepoint a;',
			'start transaction;',
			'begin;',
			'abort;',
			'rollback;',
			'prepare transaction \'x\';',
			'commit prepared \'x\';',
			'select :name;',
			'select :"name";',
			'select \'a\'; commit -- after a string',
			'select $$ body $$; commit;',
		])
			expect(() => checkSqlText(text), text).toThrow(SqlTextError);
	});
	it('says where the refused token stands', () => {
		expect(() => checkSqlText('select 1;\n  select 2; COMMIT;')).toThrow(/line 2, column 13/);
	});
	it('accepts the same words inside strings, identifiers, comments and bodies, case expressions and casts', () => {
		for (const text of [
			"select 'commit;';",
			"select E'it\\'s commit; \\\\connect';",
			"select 'it''s commit';",
			'select "commit" from x;',
			'-- commit; \\connect\nselect 1;',
			'/* outer /* commit */ still comment; rollback */ select 1;',
			'do $$ begin perform 1; end $$;',
			'do $fn$ begin commit; end $fn$;',
			"select case when true then 1 else 2 end, case 1 when 1 then 'a' end;",
			"select :'family_id'::uuid, x::text, a[1:2] from t;",
			'select $1;',
			'create temporary table t (a int) on commit drop;',
		])
			expect(() => checkSqlText(text), text).not.toThrow();
	});
	it('returns the variables the text interpolates', () => {
		expect(checkSqlText("select :'family_id', :'week_start'::date, ':''not_a_var';")).toEqual(['family_id', 'week_start']);
	});
	it('accepts every service script of supabase/scripts', () => {
		for (const file of readdirSync('supabase/scripts').filter((f) => f.endsWith('.sql')))
			expect(() => checkSqlText(readFileSync(`supabase/scripts/${file}`, 'utf8')), file).not.toThrow();
	});
});
