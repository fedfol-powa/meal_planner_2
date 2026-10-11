import { act, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { LocaleProvider, useLocale, useT } from './LocaleProvider';

function Probe() {
  const t = useT();
  const { setLocale } = useLocale();
  return (
    <>
      <p>{t('nav.recipes')}</p>
      <button onClick={() => setLocale('en-GB')}>en</button>
    </>
  );
}

it('switches language and sets the document language, without storing anything', () => {
  render(<LocaleProvider initial="it-IT"><Probe /></LocaleProvider>);
  expect(screen.getByText('Ricettario')).toBeTruthy();
  expect(document.documentElement.lang).toBe('it');
  act(() => screen.getByText('en').click());
  expect(screen.getByText('Recipes')).toBeTruthy();
  expect(document.documentElement.lang).toBe('en-GB');
  expect(localStorage.length).toBe(0);
});
