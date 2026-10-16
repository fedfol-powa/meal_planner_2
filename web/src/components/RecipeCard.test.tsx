import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RecipeSummary } from '../api/types';
import { setOnline } from '../test/connectivity';
import { renderWithProviders } from '../test/renderWithProviders';
import { RecipeCard, type CardActions, type RecipeCardProps } from './RecipeCard';

const recipe: RecipeSummary = {
  id: 'r1', name: 'Spaghetti al pomodoro', description: 'Semplici.', durationMinutes: 20,
  sourceType: 'web', sourceUrl: 'https://ricette.giallozafferano.it/spaghetti', bookTitle: null, bookPages: null, mealType: 'both', proteinGroup: 'vegetarian'
};
const base: RecipeCardProps = {
  cardKey: 's1', label: 'Pranzo', kind: 'recipe', recipe, freeText: null, servings: 4,
  ingredients: [{ ingredientId: 'pasta', name: 'Spaghetti', amount: '320 g', preparation: null, optional: false }, { ingredientId: 'pasta', name: 'Spaghetti', amount: '10 g', preparation: null, optional: false }],
  note: null, rating: { familyAverage: 4, familyCount: 2, myStars: null }, lastChange: null,
  detailSearch: { from: 'menu', day: '2026-10-08', slot: '2026-10-08-lunch' }, familyId: 'family-main'
};

describe('RecipeCard', () => {
  it('links the title to the source and truncates the source line', async () => {
    renderWithProviders(<RecipeCard {...base} />);
    const title = await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    expect(title.getAttribute('href')).toBe('https://ricette.giallozafferano.it/spaghetti');
    expect(title.getAttribute('target')).toBe('_blank');
    expect(screen.getByTitle('ricette.giallozafferano.it')).toBeTruthy();
    expect(screen.getByText('ricette.giallozaffera…')).toBeTruthy();
    expect(screen.getByText(/4 porzioni/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Scheda ricetta' }).getAttribute('href')).toBe('/recipes/r1?from=menu&day=2026-10-08&slot=2026-10-08-lunch');
  });
  it('opens rating and ingredients one at a time', async () => {
    renderWithProviders(<RecipeCard {...base} />);
    const ratingButton = await screen.findByRole('button', { name: 'Voto della famiglia 4,0: apri per votare' });
    const ingredientsButton = screen.getByRole('button', { name: '2 ingredienti: mostra o nascondi' });
    fireEvent.click(ratingButton);
    expect(ratingButton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Dai 5 stelle a Spaghetti al pomodoro')).toBeTruthy();
    fireEvent.click(ingredientsButton);
    expect(ratingButton.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('320 g')).toBeTruthy();
    expect(screen.queryByLabelText('Dai 5 stelle a Spaghetti al pomodoro')).toBeNull();
  });
  it('shows free meals, empty slots, changes by former members and missing ingredients', async () => {
    const { unmount } = renderWithProviders(<RecipeCard {...base} kind="free" recipe={null} freeText="Pizza" rating={null} ingredients={null} />);
    expect(await screen.findByText('Pasto libero')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pizza' })).toBeTruthy();
    unmount();
    const empty = renderWithProviders(<RecipeCard {...base} kind="empty" recipe={null} rating={null} ingredients={null} />);
    expect(await screen.findByRole('heading', { name: 'Nessuna ricetta adatta' })).toBeTruthy();
    empty.unmount();
    renderWithProviders(<RecipeCard {...base} rating={null} ingredients={null} detailSearch={null} lastChange={{ userName: null, at: '2026-10-01T20:40', actionId: null, undoable: false, slotIds: [] }} />);
    expect(await screen.findByText('Cambiato da ex membro, giovedì 20:40')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Voto della famiglia/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Scheda ricetta' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ingredienti: mostra o nascondi/ }));
    expect(screen.getByText('Ingredienti non ancora disponibili per questa ricetta.')).toBeTruthy();
  });
  it('shows a never-published recipe from the real payload: name only, no image, source, time, rating or lines', async () => {
    // The summary W6 sends for a recipe cited by an imported meal that was never published.
    const neverPublished: RecipeSummary = {
      id: 'd1', name: 'Vecchia ricetta', description: null, durationMinutes: null, sourceType: null, sourceUrl: null,
      bookTitle: null, bookPages: null, mealType: null, proteinGroup: null
    };
    const { container } = renderWithProviders(<RecipeCard {...base} recipe={neverPublished} servings={2} rating={null} ingredients={null} detailSearch={null} />);
    expect(await screen.findByRole('heading', { name: 'Vecchia ricetta' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.meal-source')).toBeNull();
    expect(container.querySelector('.description')).toBeNull();
    expect(screen.queryByRole('button', { name: /Voto della famiglia/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /ingredienti: mostra o nascondi/ }));
    expect(screen.getByText('Ingredienti non ancora disponibili per questa ricetta.')).toBeTruthy();
  });
  it('without a photo the card is unchanged', async () => {
    const { container } = renderWithProviders(<RecipeCard {...base} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.meal-media')).toBeNull();
    // The markup of the cards without a photo, as before the photos (W12).
    expect(container.querySelector('article')!.firstElementChild!.outerHTML).toBe('<div class="meal-heading"><span class="meal-label">Pranzo</span></div>');
  });
  it('without a photo the card is unchanged also with a null or a missing photoUrl', async () => {
    const withNull = renderWithProviders(<RecipeCard {...base} recipe={{ ...recipe, photoUrl: null }} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    const markup = withNull.container.innerHTML;
    withNull.unmount();
    const withUndefined = renderWithProviders(<RecipeCard {...base} recipe={{ ...recipe, photoUrl: undefined }} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    expect(withUndefined.container.innerHTML).toBe(markup);
  });
  it('shows the photo banner with the label on it', async () => {
    const { container } = renderWithProviders(<RecipeCard {...base} recipe={{ ...recipe, photoUrl: '/photos/abc.webp' }} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    const media = container.querySelector('.meal-media') as HTMLElement;
    expect(media.style.aspectRatio).toBe('3 / 1');
    const img = media.querySelector('img.meal-photo')!;
    expect(img.getAttribute('src')).toBe('/photos/abc.webp');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(media.querySelector('.meal-label')!.textContent).toBe('Pranzo');
    expect(container.querySelector('.meal-heading')).toBeNull();
  });
  it('falls back to the plain card when the image fails', async () => {
    const { container } = renderWithProviders(<RecipeCard {...base} recipe={{ ...recipe, photoUrl: '/photos/gone.webp' }} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    act(() => {
      fireEvent.error(container.querySelector('img')!);
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.meal-media')).toBeNull();
    expect(container.querySelector('.meal-heading .meal-label')!.textContent).toBe('Pranzo');
  });
  it('back online, a photo that failed offline is tried again', async () => {
    const { container } = renderWithProviders(<RecipeCard {...base} recipe={{ ...recipe, photoUrl: '/photos/abc.webp' }} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    act(() => setOnline(false));
    act(() => {
      fireEvent.error(container.querySelector('img')!);
    });
    expect(container.querySelector('img')).toBeNull();
    act(() => setOnline(true));
    expect(container.querySelector('img.meal-photo')).not.toBeNull();
  });
  it('a past meal shows the photo desaturated', async () => {
    const { container } = renderWithProviders(<RecipeCard {...base} isPast recipe={{ ...recipe, photoUrl: '/photos/abc.webp' }} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    expect(container.querySelector('article')!.className).toMatch(/past/);
    expect(container.querySelector('article img.meal-photo')).not.toBeNull();
  });
  it('a free meal or an empty slot has no photo', async () => {
    const { container } = renderWithProviders(<RecipeCard {...base} kind="free" recipe={{ ...recipe, photoUrl: '/photos/abc.webp' }} freeText="Pizza" />);
    await screen.findByText('Pasto libero');
    expect(container.querySelector('img')).toBeNull();
  });
});

describe('RecipeCard with the meal actions of the menu', () => {
  const actions = (extra: Partial<CardActions> = {}): CardActions => ({ label: 'Modifica il pasto', disabled: false, panel: <p>pannello</p>, ...extra });

  it('a recipe shows details, rating, ingredients and the pencil; the pencil opens its panel', async () => {
    const onToggle = vi.fn();
    renderWithProviders(<RecipeCard {...base} actions={actions({ onToggle })} />);
    const edit = await screen.findByRole('button', { name: 'Modifica il pasto' });
    expect(screen.getByRole('link', { name: 'Scheda ricetta' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Voto della famiglia/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ingredienti/ })).toBeTruthy();
    fireEvent.click(edit);
    expect(screen.getByText('pannello')).toBeTruthy();
    expect(onToggle).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: /ingredienti/ }));
    expect(screen.queryByText('pannello')).toBeNull();
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('a free meal and an empty slot show only the pencil; the empty slot also «Scegli una ricetta»', async () => {
    const onChooseRecipe = vi.fn();
    const free = renderWithProviders(<RecipeCard {...base} kind="free" recipe={null} freeText="Pizza" rating={null} ingredients={null} actions={actions()} />);
    expect(await screen.findByRole('button', { name: 'Modifica il pasto' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ingredienti|Voto/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Scheda ricetta' })).toBeNull();
    free.unmount();
    renderWithProviders(<RecipeCard {...base} kind="empty" recipe={null} rating={null} ingredients={null} actions={actions({ onChooseRecipe })} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Scegli una ricetta' }));
    expect(onChooseRecipe).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /ingredienti|Voto/ })).toBeNull();
  });

  it('without actions (recipe book) there is no pencil', async () => {
    renderWithProviders(<RecipeCard {...base} />);
    await screen.findByRole('link', { name: /Spaghetti al pomodoro/ });
    expect(screen.queryByRole('button', { name: 'Modifica il pasto' })).toBeNull();
  });

  it('a meal that becomes free closes the ingredients panel; disabled actions close their panel', async () => {
    let show: (props: Partial<RecipeCardProps>) => void = () => {};
    function Changing() {
      const [extra, setExtra] = useState<Partial<RecipeCardProps>>({});
      show = setExtra;
      return <RecipeCard {...base} actions={actions()} {...extra} />;
    }
    renderWithProviders(<Changing />);
    fireEvent.click(await screen.findByRole('button', { name: /ingredienti/ }));
    expect(screen.getByText('320 g')).toBeTruthy();
    const free = { kind: 'free', recipe: null, freeText: 'Pizza', rating: null, ingredients: null } as const;
    act(() => show(free));
    expect(screen.queryByText('320 g')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Modifica il pasto' }));
    expect(screen.getByText('pannello')).toBeTruthy();
    act(() => show({ ...free, actions: actions({ disabled: true }) }));
    expect(screen.queryByText('pannello')).toBeNull();
  });
});
