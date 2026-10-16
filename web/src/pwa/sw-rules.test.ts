import { describe, expect, it } from 'vitest';
import { cacheName, PHOTO_CACHE, staleCaches, strategyFor } from './sw-rules';

const origin = 'https://cosasimangia.example';
const req = (path: string, mode = 'cors', method = 'GET', base = origin) => ({ url: `${base}${path}`, method, mode, origin });

describe('service worker rules', () => {
  it('serves navigations with the app shell', () => {
    expect(strategyFor(req('/menu?day=2026-10-08', 'navigate'))).toBe('shell');
    expect(strategyFor(req('/recipes/wok', 'navigate'))).toBe('shell');
  });
  it('caches hashed assets, fonts and photos', () => {
    expect(strategyFor(req('/assets/index-abc123.js'))).toBe('asset');
    expect(strategyFor(req('/assets/fonts/roboto-regular.woff2'))).toBe('asset');
  });
  it('never touches server routes, other origins or writes', () => {
    expect(strategyFor(req('/api/rpc/menu/getWeek', 'cors', 'POST'))).toBe('passthrough');
    expect(strategyFor(req('/api/rpc/menu/getWeek'))).toBe('passthrough');
    expect(strategyFor(req('/api/openapi.json', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/mcp', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/shopping-lists/abc', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/internal/jobs/weekly', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/sw.js'))).toBe('passthrough');
    expect(strategyFor(req('/assets/x.js', 'cors', 'GET', 'https://cdn.example'))).toBe('passthrough');
  });
  it('names caches by build and keeps the current one plus the two most recent others', () => {
    expect(cacheName('2026-10-11T10:00:00.000Z')).toBe('cosasimangia-2026-10-11T10:00:00.000Z');
    const c = (day: string) => `cosasimangia-2026-10-${day}T00:00:00.000Z`;
    const names = [c('01'), c('05'), c('07'), c('09'), 'other'];
    // Current 09: 07 and 05 stay for the pages still open (a busy page may skip a version), 01 goes.
    expect(staleCaches(names, '2026-10-09T00:00:00.000Z')).toEqual([c('01')]);
  });
  it('after a rollback keeps the newer caches, which pages still open may need', () => {
    const c = (day: string) => `cosasimangia-2026-10-${day}T00:00:00.000Z`;
    // Rolled back to 05: 09 (the page still open) and 07 stay, 01 goes.
    expect(staleCaches([c('01'), c('05'), c('07'), c('09')], '2026-10-05T00:00:00.000Z')).toEqual([c('01')]);
    expect(staleCaches(['cosasimangia-a', 'cosasimangia-b'], 'b')).toEqual([]);
  });
  it('photos of the same origin have their own strategy (W12)', () => {
    expect(strategyFor(req('/photos/AAAAAAAAAAAAAAAAAAAAAA.webp'))).toBe('photo');
    expect(strategyFor(req('/photos/AAAAAAAAAAAAAAAAAAAAAA.webp', 'no-cors'))).toBe('photo');
    // Opened as a page, a write, or of another origin: the network.
    expect(strategyFor(req('/photos/AAAAAAAAAAAAAAAAAAAAAA.webp', 'navigate'))).toBe('passthrough');
    expect(strategyFor(req('/photos/AAAAAAAAAAAAAAAAAAAAAA.webp', 'cors', 'HEAD'))).toBe('passthrough');
    expect(strategyFor(req('/photos/AAAAAAAAAAAAAAAAAAAAAA.webp', 'cors', 'GET', 'https://cdn.example'))).toBe('passthrough');
  });
  it('the photo cache is never one of the stale caches', () => {
    const c = (day: string) => `cosasimangia-2026-10-${day}T00:00:00.000Z`;
    expect(PHOTO_CACHE).toBe('cosasimangia-photos-v1');
    expect(staleCaches([c('01'), c('05'), c('07'), c('09'), PHOTO_CACHE], '2026-10-09T00:00:00.000Z')).toEqual([c('01')]);
    expect(staleCaches([PHOTO_CACHE, c('01')], '2026-10-01T00:00:00.000Z')).toEqual([]);
  });
});
