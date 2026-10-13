/** iOS (iPhone, iPad also when it says Macintosh) in Safari, not the installed app (spec W9). */
export function needsHomeScreenHint(
  nav: Navigator & { standalone?: boolean } = navigator,
  media: (query: string) => { matches: boolean } = (query) => matchMedia(query)
): boolean {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1);
  if (!ios) return false;
  return !(nav.standalone === true || media('(display-mode: standalone)').matches);
}
