/** Shortest horizontal move, in CSS pixels, that changes week. */
export const SWIPE_DISTANCE = 48;
/** The horizontal move must be at least this many times the vertical one. */
export const SWIPE_RATIO = 2;

/** +1 for the next week (leftwards), -1 for the previous one (rightwards), 0 for no swipe. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

function animate(element: Element | null | undefined, keyframes: Keyframe[], duration: number) {
  if (!element || typeof element.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  element.animate(keyframes, { duration, easing: 'ease-out' });
}

/** A short nudge towards the swipe and back: there is no week that way. */
export function bounce(element: Element | null | undefined, step: -1 | 1) {
  const offset = `${-step * 12}px`;
  animate(element, [{ transform: 'translateX(0)' }, { transform: `translateX(${offset})` }, { transform: 'translateX(0)' }], 200);
}

/** The new week's days come in from the side the finger moved away from. */
export function slideIn(element: Element | null | undefined, step: -1 | 1) {
  animate(element, [{ transform: `translateX(${step * 24}px)`, opacity: 0.4 }, { transform: 'translateX(0)', opacity: 1 }], 180);
}
