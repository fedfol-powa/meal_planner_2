/** The shell the worker installs: index, hashed scripts and styles, fonts (not the photos, cached on use). */
export function precacheList(bundleFiles: string[], fontFiles: string[]): string[] {
  const bundle = bundleFiles.filter((file) => file.startsWith('assets/') && /\.(js|css)$/.test(file)).map((file) => `/${file}`);
  const fonts = fontFiles.filter((file) => file.endsWith('.woff2')).map((file) => `/assets/fonts/${file}`);
  return ['/index.html', ...bundle, ...fonts];
}
