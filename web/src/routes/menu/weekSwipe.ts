/** Move, in CSS pixels, after which the gesture takes an axis; below it a touch stays a tap. */
export const AXIS_SLOP = 10;
/** Share of the row's width past which the release changes week. */
export const COMMIT_FRACTION = 1 / 3;
/** A quick flick, in pixels per millisecond, changes week even when short… */
export const FLICK_VELOCITY = 0.5;
/** …if it moved at least this far. */
export const FLICK_DISTANCE = 20;
/** The velocity is measured over the last part of the gesture. */
const VELOCITY_WINDOW = 100;

export interface Sample {
  t: number;
  x: number;
}

/** +1 for the next week (leftwards), -1 for the previous one (rightwards), 0 to go back. */
export function releaseStep(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (dx === 0) return 0;
  const step = dx < 0 ? 1 : -1;
  const quick = Math.abs(velocity) >= FLICK_VELOCITY;
  // A quick flick back cancels the drag, as on iOS pages.
  if (quick && Math.sign(velocity) !== Math.sign(dx)) return 0;
  if (Math.abs(dx) >= width * COMMIT_FRACTION) return step;
  return quick && Math.abs(dx) >= FLICK_DISTANCE ? step : 0;
}

/** The finger's move towards a week that does not exist: less and less, as at the end of an iOS list. */
export function resist(dx: number, width: number): number {
  if (dx === 0 || width <= 0) return 0;
  return Math.sign(dx) * (1 - 1 / ((Math.abs(dx) * 0.55) / width + 1)) * width;
}

/** Pixels per millisecond over the last samples, the release being the last one. */
export function velocityOf(samples: Sample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  let first = samples.findIndex((s) => s.t >= last.t - VELOCITY_WINDOW);
  if (samples[first]?.t === last.t) first -= 1;
  const from = samples[first];
  if (!from || from.t === last.t) return 0;
  return (last.x - from.x) / (last.t - from.t);
}

// One running animation per element: a new one replaces it, unmounting stops it.
const running = new WeakMap<Element, Animation>();

export function stopMotion(element: Element | null | undefined) {
  if (!element) return;
  running.get(element)?.cancel();
  running.delete(element);
}

/**
 * Moves the strip to `to` pixels, then calls `done`: animated, or at once with reduced motion or
 * without the Web Animations API. The strip keeps the final position as an inline style.
 */
export function moveStrip(element: HTMLElement, from: number, to: number, duration: number, done?: () => void) {
  stopMotion(element);
  const transform = (x: number) => (x === 0 ? '' : `translateX(${x}px)`);
  element.style.transform = transform(to);
  if (typeof element.animate !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || from === to) {
    done?.();
    return;
  }
  const animation = element.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  running.set(element, animation);
  animation.onfinish = () => {
    if (running.get(element) !== animation) return;
    running.delete(element);
    done?.();
  };
}

/** Where the strip is now, also halfway through an animation. */
export function stripOffset(element: HTMLElement): number {
  // Browsers give a matrix; jsdom keeps the translateX written by the drag.
  const transform = getComputedStyle(element).transform;
  const values = /\(([^)]*)\)/.exec(transform)?.[1]?.split(',').map(parseFloat) ?? [];
  const x = transform.startsWith('matrix(') ? values[4] : transform.startsWith('translateX(') ? values[0] : undefined;
  return x !== undefined && Number.isFinite(x) ? x : 0;
}
