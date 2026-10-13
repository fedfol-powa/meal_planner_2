/** IANA zone accepted by the runtime, otherwise Europe/Rome (spec section 2). */
export function resolveTimeZone(value: string | undefined): string {
	if (!value) return 'Europe/Rome';
	try {
		return new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
	} catch {
		return 'Europe/Rome';
	}
}
