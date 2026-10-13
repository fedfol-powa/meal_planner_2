import { expect, it } from 'vitest';
import { resolveTimeZone } from './time-zone.ts';

it('keeps a valid IANA zone and falls back to Europe/Rome', () => {
	expect(resolveTimeZone('Europe/London')).toBe('Europe/London');
	expect(resolveTimeZone('Etc/GMT+1')).toBe('Etc/GMT+1');
	for (const value of [undefined, '', 'Mars/Base', 'Etc/Unknown', '+01:00', '-0500', '+01']) expect(resolveTimeZone(value), String(value)).toBe('Europe/Rome');
});
