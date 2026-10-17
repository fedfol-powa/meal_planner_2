// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('_headers', () => {
  it('serves /invite, /invite/*, /login, /password and /password/* (token in the fragment) with no-referrer', () => {
    const headers = readFileSync(new URL('../../../public/_headers', import.meta.url), 'utf8');
    const blocks = new Map<string, string[]>();
    let path = '';
    for (const line of headers.split('\n')) {
      if (!line.trim()) continue;
      if (!/^\s/.test(line)) blocks.set((path = line.trim()), []);
      else blocks.get(path)?.push(line.trim());
    }
    expect(blocks.get('/invite')).toContain('Referrer-Policy: no-referrer');
    expect(blocks.get('/invite/*')).toContain('Referrer-Policy: no-referrer');
    expect(blocks.get('/login')).toContain('Referrer-Policy: no-referrer');
    expect(blocks.get('/password')).toContain('Referrer-Policy: no-referrer');
    expect(blocks.get('/password/*')).toContain('Referrer-Policy: no-referrer');
  });
});
