import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { LocaleProvider } from '../i18n/LocaleProvider';
import type { Locale } from '../i18n/translate';
import { describe, expect, it } from 'vitest';
import { IngredientList } from './IngredientList';

const show = (ui: ReactNode, locale: Locale = 'it-IT') => render(<LocaleProvider initial={locale}>{ui}</LocaleProvider>);

describe('IngredientList', () => {
  it('shows the preparation after the name, in the language of the view', () => {
    const { unmount } = show(
      <IngredientList ingredients={[{ ingredientId: 't', name: 'Pomodori Roma', amount: '200 g', preparation: 'a dadini', optional: false }]} />
    );
    expect(screen.getByText('Pomodori Roma')).toBeTruthy();
    expect(screen.getByText(/a dadini/)).toBeTruthy();
    unmount();
    show(<IngredientList ingredients={[{ ingredientId: 't', name: 'Roma tomatoes', amount: '7 oz', preparation: 'diced', optional: false }]} />);
    expect(screen.getByText(/diced/)).toBeTruthy();
  });
  it('adds nothing without a preparation', () => {
    show(<IngredientList ingredients={[{ ingredientId: 's', name: 'Sale', amount: 'q.b.', preparation: null, optional: false }]} />);
    const item = screen.getByRole('listitem');
    expect(item.textContent).toBe('Saleq.b.');
  });
  it('marks optional lines in the language of the user', () => {
    show(<IngredientList ingredients={[{ ingredientId: 'p', name: 'Prezzemolo', amount: 'q.b.', preparation: 'tritato', optional: true }]} />);
    expect(screen.getByRole('listitem').textContent).toBe('Prezzemolo, tritato (facoltativo)q.b.');
  });
  it('marks optional lines in British English too', () => {
    show(<IngredientList ingredients={[{ ingredientId: 'p', name: 'Parsley', amount: 'to taste', preparation: null, optional: true }]} />, 'en-GB');
    expect(screen.getByRole('listitem').textContent).toBe('Parsley (optional)to taste');
  });
});
