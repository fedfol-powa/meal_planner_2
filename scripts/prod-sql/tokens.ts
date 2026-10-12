// Defence on the text of the service SQL (detail spec, section 8; review of PR #34, finding 1). The files
// are versioned and reviewed, and prod-sql.ts decides the transaction; this walk refuses, outside strings,
// quoted identifiers, comments and dollar-quoted bodies: transaction control wherever it stands, any psql
// meta-command, and any variable interpolation other than the quoted :'name' (always a literal).
export class SqlTextError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'SqlTextError';
	}
}

const CONTROL = new Set(['begin', 'commit', 'rollback', 'abort', 'savepoint', 'release']);
const WORD_START = /[A-Za-z_]/;
const WORD = /[A-Za-z0-9_$]/;
const VARIABLE = /^[a-z_]+$/;
/** The start of a statement whose ON COMMIT is a table option: create [global|local] temp[orary] table. */
const TEMP_TABLE = /^create (?:(?:global|local) )?temp(?:orary)? table\b/;

/** Returns the variables interpolated as :'name', in order of first use. */
export function checkSqlText(text: string): string[] {
	const variables: string[] = [];
	let i = 0;
	// Both reset at every semicolon outside quotes: the context of a word is its own statement
	// (second review of PR #34, finding 4).
	let caseDepth = 0;
	let statement: string[] = [];
	const where = (at: number) => {
		const before = text.slice(0, at).split('\n');
		return `line ${before.length}, column ${before.at(-1)!.length + 1}`;
	};
	const refuse = (at: number, what: string): never => {
		throw new SqlTextError(`${what} at ${where(at)}: not allowed in a service script`);
	};
	const skipQuoted = (quote: string, backslashes: boolean) => {
		i++;
		while (i < text.length) {
			if (backslashes && text[i] === '\\') i += 2;
			else if (text[i] === quote && text[i + 1] === quote) i += 2;
			else if (text[i] === quote) {
				i++;
				return;
			} else i++;
		}
		refuse(i, 'unterminated quote');
	};
	while (i < text.length) {
		const c = text[i]!;
		const next = text[i + 1];
		if (c === '-' && next === '-') {
			const end = text.indexOf('\n', i);
			i = end < 0 ? text.length : end + 1;
		} else if (c === '/' && next === '*') {
			let depth = 0;
			while (i < text.length) {
				if (text[i] === '/' && text[i + 1] === '*') {
					depth++;
					i += 2;
				} else if (text[i] === '*' && text[i + 1] === '/') {
					depth--;
					i += 2;
					if (depth === 0) break;
				} else i++;
			}
			if (depth !== 0) refuse(i, 'unterminated comment');
		} else if (c === "'") skipQuoted("'", false);
		else if ((c === 'E' || c === 'e') && next === "'" && !WORD.test(text[i - 1] ?? ' ')) {
			i++;
			skipQuoted("'", true);
		} else if (c === '"') skipQuoted('"', false);
		else if (c === '$' && /[A-Za-z_$]/.test(next ?? '') && !WORD.test(text[i - 1] ?? ' ')) {
			const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(i));
			if (!tag) {
				i++;
				continue;
			}
			const close = text.indexOf(tag[0], i + tag[0].length);
			if (close < 0) refuse(i, 'unterminated dollar-quoted body');
			i = close + tag[0].length;
		} else if (c === '\\') refuse(i, 'psql meta-command');
		else if (c === ':') {
			if (next === ':') i += 2;
			else if (next === "'") {
				const match = /^:'([^']*)'/.exec(text.slice(i));
				if (!match || !VARIABLE.test(match[1]!)) refuse(i, 'malformed variable');
				if (!variables.includes(match![1]!)) variables.push(match![1]!);
				i += match![0].length;
			} else if (next === '"' || WORD_START.test(next ?? '')) refuse(i, 'unquoted psql variable');
			else i++;
		} else if (WORD_START.test(c) && !WORD.test(text[i - 1] ?? ' ')) {
			const start = i;
			while (i < text.length && WORD.test(text[i]!)) i++;
			const word = text.slice(start, i).toLowerCase();
			if (word === 'case') caseDepth++;
			else if (word === 'end') {
				if (caseDepth === 0) refuse(start, 'end of a transaction');
				caseDepth--;
			} else if (word === 'commit' && statement.at(-1) === 'on' && TEMP_TABLE.test(statement.join(' '))) {
				// create temporary table … on commit drop: a table option, not a transaction command
			} else if (CONTROL.has(word)) refuse(start, `transaction control "${word}"`);
			else if (word === 'transaction' && (statement.at(-1) === 'start' || statement.at(-1) === 'prepare')) refuse(start, `transaction control "${statement.at(-1)} transaction"`);
			statement.push(word);
		} else if (c === ';') {
			statement = [];
			caseDepth = 0;
			i++;
		} else i++;
	}
	return variables;
}
