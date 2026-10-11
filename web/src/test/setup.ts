import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { setOnline } from './connectivity';

beforeEach(() => {
  localStorage.clear();
  setOnline(true);
});
afterEach(() => cleanup());
