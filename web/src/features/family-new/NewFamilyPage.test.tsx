import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';

const api = () => createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });

describe('/family/new', () => {
  afterEach(() => setOnline(true));

  it('creates the family once with the id made at opening, the browser time zone and the chosen units', async () => {
    const fake = api();
    const create = vi.spyOn(fake.family, 'create');
    const { history } = renderApp('/family/new', { api: fake });
    fireEvent.change(await screen.findByLabelText('Nome della famiglia'), { target: { value: 'Casa Giulia' } });
    fireEvent.click(screen.getByLabelText('Misure britanniche'));
    const button = screen.getByRole('button', { name: 'Crea la famiglia' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(history.location.pathname).toBe('/menu'));
    expect(history.location.search).toContain('welcome=true');
    const ids = create.mock.calls.map(([input]) => input.id);
    expect(ids.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ids).size).toBe(1);
    expect(create.mock.calls[0]![0]).toMatchObject({
      name: 'Casa Giulia',
      measurementSystem: 'uk_imperial',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
  });

  it('preselects UK units in English', async () => {
    renderApp('/family/new', { api: createFakeApi({ getLocale: () => 'en-GB', latencyMs: 0 }), locale: 'en-GB' });
    expect(((await screen.findByLabelText('UK imperial')) as HTMLInputElement).checked).toBe(true);
  });

  it('is disabled with an empty name or offline', async () => {
    renderApp('/family/new', { api: api() });
    const button = await screen.findByRole('button', { name: 'Crea la famiglia' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Nome della famiglia'), { target: { value: 'Casa' } });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    setOnline(false);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it('tells about the roles the invitation gave', async () => {
    renderApp('/family/new?granted=recipe_curator', { api: api() });
    expect(await screen.findByText('Ora sei anche curatore del ricettario')).toBeTruthy();
  });
});
