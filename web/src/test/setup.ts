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
  setBrowserLanguages(['it-IT', 'it']);
  rememberMenuDay(undefined);
});
afterEach(() => cleanup());
