import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { createFakeApi, createFakeData, DEMO_FAMILY_ID, fakeClients } from '../api/fake/fakeApi';
import type { RecipeDetailView } from '../api/types';
import { setOnline } from '../test/connectivity';
import type { CreateApi } from '../session/SessionScope';
import { LanguageSwitch } from '../test/LanguageSwitch';
import { renderApp } from '../test/renderApp';

const WOK = 'wok-pollo-peperoni-riso-basmati';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('recipe page', () => {
  it('shows source, rating, servings and ingredients, with a way back to the menu day', async () => {
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-08`);
    const title = await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(title.getAttribute('href')).toBe('https://ricetta.it/riso-basmati-con-pollo-e-verdure');
    // The back link, not the navbar item with the same name.
    const back = screen.getAllByRole('link', { name: 'Menu' }).find((link) => link.classList.contains('page-back'));
    expect(back?.getAttribute('href')).toBe('/menu?day=2026-10-08');
    expect(screen.getByText('Dosi della fonte per 6 porzioni')).toBeTruthy();
    expect(row('Riso basmati').textContent).toContain('300 g');
    expect(screen.getByRole('group', { name: 'Il tuo voto' })).toBeTruthy();
  });
  it('scales the ingredients with the servings and keeps them in the address', async () => {
    const { history } = renderApp(`/recipes/${WOK}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(history.location.search).toContain('servings=7'));
    await waitFor(() => expect(row('Riso basmati').textContent).toContain('350 g'));
  });
  it('does not go below one serving', async () => {
    renderApp(`/recipes/${WOK}?servings=1`);
    expect(((await screen.findByRole('button', { name: 'Una porzione in meno' })) as HTMLButtonElement).disabled).toBe(true);
  });
  it('lists the last times the family had it', async () => {
    renderApp('/recipes/omelette-spinaci-montasio');
    expect(await screen.findByText('lunedì 21 settembre, Cena')).toBeTruthy();
  });
  it('names the book and its pages under the title', async () => {
    renderApp('/recipes/burrito-vegan');
    expect(await screen.findByText(/^Libro: .+, pp\. 110-111$/)).toBeTruthy();
  });
  it('passes the meal reference to the read when opened from a meal', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.spyOn(api.recipes, 'get');
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-05&slot=2026-10-05-dinner`, { api });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ recipeId: WOK, slotId: '2026-10-05-dinner' }), expect.anything());
  });
  it('opened from a meal, starts from its servings; the stepper and servings in the address still win', async () => {
    // Sunday 4 dinner: the wok for 4, while the source is for 6 (user's decision, 11 October 2026).
    const { history } = renderApp(`/recipes/${WOK}?from=menu&day=2026-10-04&slot=2026-10-04-dinner`);
    expect(await screen.findByText('4 porzioni')).toBeTruthy();
    expect(screen.getByText('Dosi della fonte per 6 porzioni')).toBeTruthy();
    expect(row('Riso basmati').textContent).toContain('200 g');
    fireEvent.click(screen.getByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(history.location.search).toContain('servings=5'));
    await waitFor(() => expect(row('Riso basmati').textContent).toContain('250 g'));
  });
  it('opened from a meal with servings in the address, shows those', async () => {
    renderApp(`/recipes/${WOK}?from=menu&day=2026-10-04&slot=2026-10-04-dinner&servings=3`);
    expect(await screen.findByText('3 porzioni')).toBeTruthy();
    expect(row('Riso basmati').textContent).toContain('150 g');
  });
  it('says when a recipe does not exist', async () => {
    renderApp('/recipes/nope');
    expect(await screen.findByRole('heading', { name: 'Ricetta non disponibile' })).toBeTruthy();
  });
});

describe('recipe page from the Worker (W6)', () => {
  const detail = (patch: Partial<RecipeDetailView> = {}): RecipeDetailView => ({
    recipe: {
      id: 'r1', name: 'Frittata', description: null, durationMinutes: 15, sourceType: 'home', sourceUrl: null,
      bookTitle: null, bookPages: null, mealType: 'both', proteinGroup: 'eggs'
    },
    status: 'published', baseServings: 2, servings: 2, ingredients: [],
    rating: { familyAverage: null, familyCount: 0, myStars: null }, history: [], upcoming: [],
    ...patch
  });
  const withDetail = (view: RecipeDetailView) => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.fn(() => Promise.resolve({ unchanged: false as const, version: 'v1', data: view }));
    api.recipes.get = get;
    return { api, get };
  };

  it('reads again with the servings chosen', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const get = vi.spyOn(api.recipes, 'get');
    renderApp(`/recipes/${WOK}`, { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(expect.objectContaining({ recipeId: WOK, servings: 7 }), expect.anything()));
  });
  it('adds a planned meal that passes while the page is open to the last five times, without reading again', async () => {
    const history = ['2026-10-01', '2026-09-24', '2026-09-17', '2026-09-10', '2026-09-03'].map((date) => ({ date, mealType: 'dinner' as const }));
    // Now is 2026-10-08T10:00:00Z: today's lunch passes 50 ms later.
    const { api, get } = withDetail(detail({ history, upcoming: [{ date: '2026-10-08', mealType: 'lunch', passesAt: '2026-10-08T10:00:00.050Z' }] }));
    renderApp('/recipes/r1', { api });
    const list = () => screen.getByRole('heading', { name: 'Le ultime volte' }).parentElement!.querySelectorAll('li');
    await screen.findByText('giovedì 1 ottobre, Cena');
    expect(list()).toHaveLength(5);
    act(() => vi.setSystemTime(new Date('2026-10-08T10:01:00Z')));
    await waitFor(() => expect(list()[0]?.textContent).toBe('giovedì 8 ottobre, Pranzo'));
    expect(list()).toHaveLength(5);
    expect(screen.queryByText('giovedì 3 settembre, Cena')).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('shows time and food group under the description, in Italian and British English', async () => {
    const first = renderApp('/recipes/r1', { api: withDetail(detail()).api });
    expect((await screen.findByText(/Uova/)).textContent).toBe('15 min · Uova');
    first.unmount();
    renderApp('/recipes/r1', { api: withDetail(detail()).api, extra: <LanguageSwitch /> });
    await screen.findByText(/Uova/);
    fireEvent.click(screen.getByText('test: english'));
    expect((await screen.findByText(/Eggs/)).textContent).toBe('15 min · Eggs');
  });
  it('shows the group alone without a time, and no line without either', async () => {
    const view = withDetail(detail({ recipe: { ...detail().recipe, durationMinutes: null } }));
    const first = renderApp('/recipes/r1', { api: view.api });
    expect((await screen.findByText(/Uova/)).textContent).toBe('Uova');
    first.unmount();
    const bare = withDetail(detail({ recipe: { ...detail().recipe, durationMinutes: null, proteinGroup: null } }));
    const { container } = renderApp('/recipes/r1', { api: bare.api });
    await screen.findByRole('heading', { name: 'Frittata' });
    expect(container.querySelector('.meal-meta')).toBeNull();
  });
  it('shows no empty paragraph without a description', async () => {
    const { api } = withDetail(detail());
    const { container } = renderApp('/recipes/r1', { api });
    await screen.findByRole('heading', { name: 'Frittata' });
    expect(container.querySelector('.description')).toBeNull();
  });
  it('says the recipe is not available when the Worker answers not_found', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    api.recipes.get = () => Promise.reject(new ApiError('not_found'));
    renderApp('/recipes/r1', { api });
    expect(await screen.findByRole('heading', { name: 'Ricetta non disponibile' })).toBeTruthy();
  });
  it('refuses a rating offline at once and sends nothing', async () => {
    const data = createFakeData();
    const before = structuredClone(data.ratings);
    renderApp(`/recipes/${WOK}`, { api: createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0, data }) });
    const star = await screen.findByLabelText(/Dai 1 stella a Wok/);
    act(() => setOnline(false));
    fireEvent.click(star);
    expect((await screen.findByRole('alert')).textContent).toBe('Sei offline o il servizio non risponde: riprova quando torni in linea.');
    act(() => setOnline(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(data.ratings).toEqual(before);
    expect(data.revision).toBe(1);
  });
  it('sends the rating online and shows the answer', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const set = vi.spyOn(api.ratings, 'set');
    renderApp(`/recipes/${WOK}`, { api });
    fireEvent.click(await screen.findByLabelText(/Dai 1 stella a Wok/));
    await waitFor(() => expect(set).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, recipeId: WOK, stars: 1 }, expect.anything()));
    expect(await screen.findByLabelText(/Il tuo voto: 1 stella\./)).toBeTruthy();
  });
});

describe('previous data only within the same view (second review, C7)', () => {
  type GetInput = Parameters<ReturnType<typeof createFakeApi>['recipes']['get']>[0];
  /** Fake client whose recipe reads matching `held` never answer. */
  const holding = (held: (input: GetInput, locale: string) => boolean): CreateApi => (user) => (locale) => {
    const api = createFakeApi({ getLocale: () => locale, user: user ?? undefined, latencyMs: 0 });
    const get = api.recipes.get;
    api.recipes.get = (input) => (held(input, locale) ? new Promise(() => {}) : get(input));
    return api;
  };
  const wokTitle = () => screen.queryByRole('link', { name: /Wok di pollo/ });

  it('shows no data of the previous recipe while another one loads', async () => {
    const { history } = renderApp(`/recipes/${WOK}`, { createApi: holding((input) => input.recipeId !== WOK) });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    history.push('/recipes/omelette-spinaci-montasio');
    await screen.findByText('Caricamento…');
    expect(wokTitle()).toBeNull();
  });
  it('shows no data of the previous meal while the recipe of another meal loads', async () => {
    const { history } = renderApp(`/recipes/${WOK}?from=menu&day=2026-10-08&slot=2026-10-08-lunch`, {
      createApi: holding((input) => input.slotId === '2026-10-08-dinner')
    });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    history.push(`/recipes/${WOK}?from=menu&day=2026-10-08&slot=2026-10-08-dinner`);
    await screen.findByText('Caricamento…');
    expect(wokTitle()).toBeNull();
  });
  it('never shows the recipe in the previous language while the new one loads', async () => {
    renderApp(`/recipes/${WOK}`, { createApi: holding((_input, locale) => locale === 'en-GB'), extra: <LanguageSwitch /> });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    // A first round trip puts both profiles in cache: the page stays mounted on the last switch.
    fireEvent.click(screen.getByText('test: english'));
    await screen.findByText('Loading…');
    fireEvent.click(screen.getByText('test: italiano'));
    await screen.findByRole('link', { name: /Wok di pollo/ });
    fireEvent.click(screen.getByText('test: english'));
    await screen.findByText('Loading…');
    expect(wokTitle()).toBeNull();
  });
  it('keeps the recipe while only the servings change, with the ingredients marked as updating', async () => {
    renderApp(`/recipes/${WOK}`, { createApi: holding((input) => input.servings === 7) });
    fireEvent.click(await screen.findByRole('button', { name: 'Una porzione in più' }));
    await waitFor(() => expect(screen.getByLabelText('Ingredienti').getAttribute('aria-busy')).toBe('true'));
    expect(wokTitle()).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Porzioni' }).textContent).toContain('7 porzioni');
  });
});

describe('recipe photo (W12)', () => {
  const PHOTO_RECIPE = 'pasta-crema-peperoni';
  /** The browser resize: a decoded bitmap and a canvas that encodes a small JPEG. */
  function stubCanvas() {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4032, height: 3024, close: () => undefined })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => undefined } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done) {
      done(new Blob(['jpeg'], { type: 'image/jpeg' }));
    });
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const choose = (input: HTMLInputElement) => fireEvent.change(input, { target: { files: [new File(['raw'], 'IMG_0001.JPG', { type: 'image/jpeg' })] } });
  const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

  it('a member who is not a curator sees the photo and no command', async () => {
    renderApp(`/recipes/${PHOTO_RECIPE}`, { createApi: fakeClients({ latencyMs: 0, globalRoles: [] }) });
    await screen.findByRole('heading', { name: /Pasta alla crema di peperoni/ });
    const media = document.querySelector('.meal-media') as HTMLElement;
    expect(media.style.aspectRatio).toBe('16 / 9');
    expect(media.querySelector('img')!.getAttribute('src')).toBe(`/assets/recipe-images/${PHOTO_RECIPE}.jpg`);
    expect(screen.queryByRole('button', { name: 'Foto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aggiungi foto' })).toBeNull();
    expect(fileInput()).toBeNull();
  });

  it('without a photo a member sees nothing, a curator «Aggiungi foto»', async () => {
    const { unmount } = renderApp(`/recipes/${WOK}`, { createApi: fakeClients({ latencyMs: 0, globalRoles: [] }) });
    await screen.findByRole('link', { name: /Wok di pollo/ });
    expect(document.querySelector('.meal-media')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aggiungi foto' })).toBeNull();
    unmount();
    renderApp(`/recipes/${WOK}`);
    expect(await screen.findByRole('button', { name: 'Aggiungi foto' })).toBeTruthy();
    expect(fileInput().getAttribute('accept')).toBe('image/*');
    expect(screen.queryByRole('button', { name: 'Foto' })).toBeNull();
  });

  it('a curator adds a photo: resized, uploaded, shown after the read again', async () => {
    stubCanvas();
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const held: { release?: () => void } = {};
    const original = api.catalogue.uploadPhoto;
    const upload = vi.spyOn(api.catalogue, 'uploadPhoto').mockImplementation(async (input, options) => {
      await new Promise<void>((resolve) => (held.release = resolve));
      return original(input, options);
    });
    renderApp(`/recipes/${WOK}`, { api });
    await screen.findByRole('button', { name: 'Aggiungi foto' });
    choose(fileInput());
    const busy = (await screen.findByRole('button', { name: 'Caricamento…' })) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    await waitFor(() => expect(upload).toHaveBeenCalled());
    const sent = upload.mock.calls[0]![0];
    expect(sent.recipeId).toBe(WOK);
    expect(sent.file.type).toBe('image/jpeg');
    expect(await sent.file.text()).toBe('jpeg');
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.85);
    act(() => held.release!());
    await waitFor(() => expect(document.querySelector('.meal-media img')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'Aggiungi foto' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Foto' })).toBeTruthy();
  });

  it('the sheet replaces or, after a confirmation, removes the photo', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const remove = vi.spyOn(api.catalogue, 'removePhoto');
    renderApp(`/recipes/${PHOTO_RECIPE}`, { api });
    fireEvent.click(await screen.findByRole('button', { name: 'Foto' }));
    const sheet = await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: 'Sostituisci la foto' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Togli la foto' }));
    expect(sheet.textContent).toContain('Togliere la foto?');
    fireEvent.click(screen.getByRole('button', { name: 'Indietro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Togli la foto' }));
    fireEvent.click(screen.getByRole('button', { name: 'Togli' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ recipeId: PHOTO_RECIPE }, expect.anything()));
    await waitFor(() => expect(document.querySelector('.meal-media')).toBeNull());
    expect(await screen.findByRole('button', { name: 'Aggiungi foto' })).toBeTruthy();
  });

  it('shows the translated error of a refused photo', async () => {
    stubCanvas();
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.catalogue, 'uploadPhoto').mockRejectedValue(new ApiError('invalid', { issues: [{ path: ['file'], code: 'photo_too_small' }] }));
    renderApp(`/recipes/${WOK}`, { api });
    await screen.findByRole('button', { name: 'Aggiungi foto' });
    choose(fileInput());
    expect((await screen.findByRole('alert')).textContent).toBe('La foto è troppo piccola.');
  });

  it('an image the browser cannot read is not uploaded', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new DOMException('decode'); }));
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const upload = vi.spyOn(api.catalogue, 'uploadPhoto');
    renderApp(`/recipes/${WOK}`, { api });
    await screen.findByRole('button', { name: 'Aggiungi foto' });
    choose(fileInput());
    expect((await screen.findByRole('alert')).textContent).toBe('Non riesco a leggere questa immagine.');
    expect(upload).not.toHaveBeenCalled();
  });

  it('offline the commands are disabled', async () => {
    renderApp(`/recipes/${PHOTO_RECIPE}`);
    const button = (await screen.findByRole('button', { name: 'Foto' })) as HTMLButtonElement;
    act(() => setOnline(false));
    expect(button.disabled).toBe(true);
    act(() => setOnline(true));
  });

  it('in English', async () => {
    renderApp(`/recipes/${WOK}`, { extra: <LanguageSwitch /> });
    await screen.findByRole('button', { name: 'Aggiungi foto' });
    fireEvent.click(screen.getByText('test: english'));
    expect(await screen.findByRole('button', { name: 'Add photo' })).toBeTruthy();
  });

  it('the cards of the recipe book have no photo command, also for a curator', async () => {
    renderApp('/recipes');
    await waitFor(() => expect(document.querySelectorAll('.meal-media img').length).toBeGreaterThan(0));
    expect(screen.queryByRole('button', { name: 'Foto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aggiungi foto' })).toBeNull();
  });
});
