// Writes the approval line of a reviewed input file (detail spec, section 4). Run it only when the user
// says the review of that file is done: node scripts/import/approve.ts <file> <YYYY-MM-DD>
import { readFileSync, writeFileSync } from 'node:fs';
import { isValidIsoDate } from './family.ts';
import { approveText } from './inputs.ts';

const [file, date] = process.argv.slice(2);
if (!file || !date || !isValidIsoDate(date)) {
	console.error('Usage: node scripts/import/approve.ts <file> <YYYY-MM-DD>');
	process.exit(1);
}
writeFileSync(file, approveText(readFileSync(file, 'utf8'), date));
console.log(`Approved ${file} on ${date}.`);
