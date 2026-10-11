import { onlineManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { rememberMenuDay } from '../routes/menu/lastDay';
import { setBrowserLanguages } from './browserLanguages';
import { setOnline } from './connectivity';

// The service worker tests run in Node, without a DOM.
const hasDom = typeof window !== 'undefined';

// jsdom has no layout: scrolling is a no-op.
if (hasDom) Element.prototype.scrollIntoView = function scrollIntoView() {};

// Each test starts with a clean Italian device: storage, network, languages, remembered menu day.
beforeEach(() => {
  if (!hasDom) return;
  localStorage.clear();
  setOnline(true);
  // TanStack's manager keeps its last state while no app listens: a test that went offline must not leak.
  onlineManager.setOnline(true);
  setBrowserLanguages(['it-IT', 'it']);
  rememberMenuDay(undefined);
});
afterEach(() => {
  if (hasDom) cleanup();
});
