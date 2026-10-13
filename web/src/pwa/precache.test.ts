import { expect, it } from 'vitest';
import { injectPrecache, precacheList } from './precache';

it('lists the shell: index, hashed scripts and styles, fonts; never the worker or the list itself', () => {
  expect(precacheList(['index.html', 'assets/index-a1.js', 'assets/index-b2.css', 'sw.js', 'precache.json', 'assets/logo-c3.svg', '.vite/manifest.json'], ['roboto-regular.woff2']))
    .toEqual(['/index.html', '/assets/index-a1.js', '/assets/index-b2.css', '/assets/fonts/roboto-regular.woff2']);
});
it('puts the precache list into the built worker in place of its one placeholder', () => {
  const list = ['/index.html', '/assets/main-a1.js'];
  expect(injectPrecache('const p=["__PRECACHE_LIST__"];run(p)', list)).toBe('const p=["/index.html","/assets/main-a1.js"];run(p)');
  expect(injectPrecache("const p = [ '__PRECACHE_LIST__' ];", list)).toBe('const p = ["/index.html","/assets/main-a1.js"];');
  // The minifier writes the string as a template literal.
  expect(injectPrecache('var h=[`__PRECACHE_LIST__`],g=self', list)).toBe('var h=["/index.html","/assets/main-a1.js"],g=self');
});
it('fails the build without the placeholder or with more than one', () => {
  expect(() => injectPrecache('const p=[];', ['/index.html'])).toThrow(/placeholder/);
  expect(() => injectPrecache('a=["__PRECACHE_LIST__"];b=["__PRECACHE_LIST__"]', ['/index.html'])).toThrow(/placeholder/);
});
