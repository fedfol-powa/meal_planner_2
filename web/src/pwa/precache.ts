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

/**
 * sw.js is registered as a classic worker: an `import` of a chunk shared with the page makes its
 * evaluation fail and the app loses its worker. Fails the build instead (W12: the page side of the
 * photo cache once pulled a worker module into a shared chunk).
 */
export function assertSelfContained(chunk: { imports: readonly string[]; dynamicImports: readonly string[] }): void {
  const imported = [...chunk.imports, ...chunk.dynamicImports];
  if (imported.length) throw new Error(`sw.js imports ${imported.join(', ')}: the worker must not share modules with the page`);
}
