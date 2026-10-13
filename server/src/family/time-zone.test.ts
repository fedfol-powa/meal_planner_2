import { expect, it } from 'vitest';
import { resolveTimeZone } from './time-zone.ts';

it('keeps a valid IANA zone and falls back to Europe/Rome', () => {
	expect(resolveTimeZone('Europe/London')).toBe('Europe/London');
	for (const value of [undefined, '', 'Mars/Base', 'Etc/Unknown']) expect(resolveTimeZone(value), String(value)).toBe('Europe/Rome');
});
