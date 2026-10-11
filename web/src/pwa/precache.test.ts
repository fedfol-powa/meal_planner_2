import { expect, it } from 'vitest';
import { precacheList } from './precache';

it('lists the shell: index, hashed scripts and styles, fonts; never the worker or the list itself', () => {
  expect(precacheList(['index.html', 'assets/index-a1.js', 'assets/index-b2.css', 'sw.js', 'precache.json', 'assets/logo-c3.svg', '.vite/manifest.json'], ['roboto-regular.woff2']))
    .toEqual(['/index.html', '/assets/index-a1.js', '/assets/index-b2.css', '/assets/fonts/roboto-regular.woff2']);
});
