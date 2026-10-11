import { describe, expect, it } from 'vitest';
import { cacheName, staleCaches, strategyFor } from './sw-rules';

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
    expect(strategyFor(req('/precache.json'))).toBe('passthrough');
    expect(strategyFor(req('/assets/x.js', 'cors', 'GET', 'https://cdn.example'))).toBe('passthrough');
  });
  it('names caches by build and finds the old ones', () => {
    expect(cacheName('2026-10-11T10:00:00.000Z')).toBe('cosasimangia-2026-10-11T10:00:00.000Z');
    expect(staleCaches(['cosasimangia-a', 'cosasimangia-b', 'other'], 'b')).toEqual(['cosasimangia-a']);
  });
});
