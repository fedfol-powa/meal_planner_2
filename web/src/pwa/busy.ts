import { useEffect, useRef } from 'react';

/**
 * Whether reloading into a new version now would interrupt something (spec W8, «Pagina
 * occupata»): operations in progress outside TanStack Query (password, language, sign-out,
 * shopping queue writes), registered checks (mutations, «Annulla», queue), open sheets and the
 * focus in a text field.
 */
let running = 0;
const checks = new Set<() => boolean>();

/** Counts `work` from now until it settles; call it where the operation starts. */
export function trackBusy<T>(work: Promise<T>): Promise<T> {
  running += 1;
  return work.finally(() => {
    running -= 1;
  });
}

export function registerBusyCheck(check: () => boolean): () => void {
  const entry = () => check();
  checks.add(entry);
  return () => void checks.delete(entry);
}

/** Registers `check` while the component is mounted; the latest render's check is the one asked. */
export function useBusyCheck(check: () => boolean): void {
  const latest = useRef(check);
  latest.current = check;
  useEffect(() => registerBusyCheck(() => latest.current()), []);
}

/** Operations in progress and registered checks, without the DOM. */
export function registeredBusy(): boolean {
  if (running > 0) return true;
  for (const check of checks) {
    try {
      if (check()) return true;
    } catch {
      return true;
    }
  }
  return false;
}

const NOT_TEXT = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']);

function isTextField(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return !NOT_TEXT.has(element.type);
  return element.closest('[contenteditable=""], [contenteditable="true"]') !== null;
}

export function isBusy(doc: Document = document): boolean {
  if (doc.querySelector('dialog[open]')) return true;
  if (isTextField(doc.activeElement)) return true;
  return registeredBusy();
}

/** Tests only. */
export function resetBusy(): void {
  running = 0;
  checks.clear();
}
