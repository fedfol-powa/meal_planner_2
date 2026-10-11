/** One JSON line with chosen fields: never error messages, data or secrets. */
export function logEvent(event: string, fields: Record<string, string | number | null>, level: 'info' | 'error' = 'info'): void {
	const line = JSON.stringify({ event, ...fields });
	if (level === 'error') console.error(line);
	else console.log(line);
}
