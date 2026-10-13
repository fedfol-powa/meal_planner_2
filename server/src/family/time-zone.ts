/**
 * IANA zone accepted by the runtime, otherwise Europe/Rome (spec section 2). Offsets such as
 * `+01:00`, which recent runtimes accept, are not zone names for Postgres: they fall back too.
 */
export function resolveTimeZone(value: string | undefined): string {
	if (!value) return 'Europe/Rome';
	try {
		const zone = new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
		return /^[+-]/.test(zone) ? 'Europe/Rome' : zone;
	} catch {
		return 'Europe/Rome';
	}
}
