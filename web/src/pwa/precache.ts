/** The shell the worker installs: index, hashed scripts and styles, fonts (not the photos, cached on use). */
export function precacheList(bundleFiles: string[], fontFiles: string[]): string[] {
  const bundle = bundleFiles.filter((file) => file.startsWith('assets/') && /\.(js|css)$/.test(file)).map((file) => `/${file}`);
  const fonts = fontFiles.filter((file) => file.endsWith('.woff2')).map((file) => `/assets/fonts/${file}`);
  return ['/index.html', ...bundle, ...fonts];
}

const PLACEHOLDER = /\[\s*(["'`])__PRECACHE_LIST__\1\s*\]/g;

/**
 * Puts the precache list into the built sw.js in place of `['__PRECACHE_LIST__']`: the worker
 * carries its own list, never one read from the network at install (spec W8). Fails the build
 * when the placeholder is missing or repeated.
 */
export function injectPrecache(code: string, list: string[]): string {
  const found = code.match(PLACEHOLDER)?.length ?? 0;
  if (found !== 1) throw new Error(`sw.js: expected one precache placeholder, found ${found}`);
  return code.replace(PLACEHOLDER, JSON.stringify(list));
}
