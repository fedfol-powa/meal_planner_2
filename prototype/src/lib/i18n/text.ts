/** Cuts a text to at most `max` characters, ellipsis included, without a dangling space. */
export function truncate(text: string, max: number): string {
	const chars = [...text];
	if (chars.length <= max) return text;
	return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}
