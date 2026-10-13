import { expect, it } from 'vitest';
import { needsHomeScreenHint } from './ios';

const media = (standalone: boolean) => () => ({ matches: standalone });
it('only on iOS outside the installed app', () => {
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: false } as never, media(false))).toBe(true);
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', standalone: true } as never, media(true))).toBe(false);
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 } as never, media(false))).toBe(true); // iPad
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 } as never, media(false))).toBe(false); // Mac
  expect(needsHomeScreenHint({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' } as never, media(false))).toBe(false);
});
