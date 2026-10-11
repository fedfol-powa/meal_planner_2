import { onlineManager } from '@tanstack/react-query';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { rememberMenuDay } from '../routes/menu/lastDay';
import { setBrowserLanguages } from './browserLanguages';
import { setOnline } from './connectivity';

// jsdom has no layout: scrolling is a no-op.
Element.prototype.scrollIntoView = function scrollIntoView() {};

// Each test starts with a clean Italian device: storage, network, languages, remembered menu day.
beforeEach(() => {
  localStorage.clear();
  setOnline(true);
  // TanStack's manager keeps its last state while no app listens: a test that went offline must not leak.
  onlineManager.setOnline(true);
  setBrowserLanguages(['it-IT', 'it']);
  rememberMenuDay(undefined);
});
afterEach(() => cleanup());
