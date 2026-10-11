import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IngredientList } from './IngredientList';

describe('IngredientList', () => {
  it('shows the preparation after the name, in the language of the view', () => {
    const { unmount } = render(
      <IngredientList ingredients={[{ ingredientId: 't', name: 'Pomodori Roma', amount: '200 g', preparation: 'a dadini', optional: false }]} />
    );
    expect(screen.getByText('Pomodori Roma')).toBeTruthy();
    expect(screen.getByText(/a dadini/)).toBeTruthy();
    unmount();
    render(<IngredientList ingredients={[{ ingredientId: 't', name: 'Roma tomatoes', amount: '7 oz', preparation: 'diced', optional: false }]} />);
    expect(screen.getByText(/diced/)).toBeTruthy();
  });
  it('adds nothing without a preparation', () => {
    render(<IngredientList ingredients={[{ ingredientId: 's', name: 'Sale', amount: 'q.b.', preparation: null, optional: false }]} />);
    const item = screen.getByRole('listitem');
    expect(item.textContent).toBe('Saleq.b.');
  });
});
