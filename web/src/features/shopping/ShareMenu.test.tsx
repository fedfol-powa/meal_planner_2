import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { DEMO_FAMILY_ID } from '../../api/fake/seed';
import { DEMO_USER } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';
import { createStubBackend } from '../../test/stubBackend';
import { MONDAY } from './fixtures';
import { createShoppingServer } from './testServer';

const URL = 'https://api.getbring.com/rest/bringrecipes/deeplink?url=x&source=web';

async function open() {
  const server = createShoppingServer(undefined, DEMO_FAMILY_ID);
  renderApp(`/shopping/${MONDAY}`, { createApi: () => (locale) => server.api(locale), backend: createStubBackend(DEMO_USER) });
  await screen.findByRole('heading', { level: 1 });
  return server;
}
const menu = () => fireEvent.click(screen.getByRole('button', { name: 'Azioni della lista' }));
const item = (name: RegExp) => screen.getByRole('menuitem', { name });
const tick = (name: string) => fireEvent.click(screen.getByRole('checkbox', { name: `Preso o già in casa: ${name}` }));

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('list actions', () => {
  it('shares the text of the list as shown, queued ticks included', async () => {
    await open();
    const share = vi.fn(async (_data: ShareData) => {});
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    setOnline(false);
    tick('Pomodori');
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Preso o già in casa: Pomodori' }) as HTMLInputElement).checked).toBe(true));
    menu();
    fireEvent.click(item(/^Condividi/));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const text = share.mock.calls[0]![0].text!;
    expect(text).toContain('Lista della spesa · 3 pasti');
    expect(text).toContain('• 3 Mele');
    expect(text).toContain('• Detersivo');
    expect(text).not.toContain('Pomodori');
  });

  it('copies the text where sharing is missing, and says so', async () => {
    await open();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    menu();
    fireEvent.click(item(/^Condividi/));
    await screen.findByText('Copiata');
    expect(writeText.mock.calls[0]![0]).toContain('Pomodori');
  });

  it('offline: sharing works, Bring! needs the network', async () => {
    await open();
    setOnline(false);
    menu();
    expect((item(/^Condividi/) as HTMLButtonElement).disabled).toBe(false);
    const bring = item(/^Bring!/) as HTMLButtonElement;
    expect(bring.disabled).toBe(true);
    expect(bring.textContent).toContain('Serve la rete');
  });

  it('blocks Bring! until the changes are synced, and a tap starts the sync', async () => {
    const server = await open();
    setOnline(false);
    tick('Pomodori');
    setOnline(true);
    server.failNext(new ApiError('network'));
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked']));
    menu();
    const bring = item(/^Bring!/);
    expect(bring.getAttribute('aria-disabled')).toBe('true');
    expect(bring.textContent).toContain('Prima si sincronizzano le modifiche');
    fireEvent.click(bring);
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked', 'setItemChecked']));
    await waitFor(() => expect(screen.queryByText('Modifiche salvate su questo telefono, da sincronizzare')).toBeNull());
    expect(server.createLink).not.toHaveBeenCalled();
    menu();
    expect(item(/^Bring!/).getAttribute('aria-disabled')).toBeNull();
  });

  it('opens Bring! in two steps: the link appears once ready', async () => {
    const server = await open();
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null);
    menu();
    fireEvent.click(item(/^Bring!/));
    const link = await screen.findByRole('link', { name: 'Apri in Bring!' });
    expect(server.createLink).toHaveBeenCalledWith({ familyId: DEMO_FAMILY_ID, weekStartsOn: MONDAY }, expect.anything());
    expect(link.getAttribute('href')).toBe(URL);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(windowOpen).not.toHaveBeenCalled();
    windowOpen.mockRestore();
  });

  it('drops the link when the list changes while it is prepared', async () => {
    const server = await open();
    let answer: () => void = () => {};
    server.createLink.mockImplementationOnce(() => new Promise((resolve) => (answer = () => resolve({ url: URL, expiresAt: new Date().toISOString() }))));
    server.holdNextWrite();
    menu();
    fireEvent.click(item(/^Bring!/));
    await screen.findByText('Preparazione per Bring!…');
    tick('Mele');
    await waitFor(() => expect(server.calls).toEqual(['setItemChecked']));
    await act(async () => answer());
    expect(screen.queryByRole('link', { name: 'Apri in Bring!' })).toBeNull();
    menu();
    expect(item(/^Bring!/).getAttribute('aria-disabled')).toBe('true');
    act(() => server.releaseWrite());
  });

  it('explains an empty list and offers «Riprova» for other errors', async () => {
    const server = await open();
    server.createLink.mockRejectedValueOnce(new ApiError('invalid', { issues: [{ path: [], code: 'empty_list' }] }));
    menu();
    fireEvent.click(item(/^Bring!/));
    await screen.findByText('Niente da mandare a Bring!');
    server.createLink.mockRejectedValueOnce(new ApiError('internal'));
    menu();
    fireEvent.click(item(/^Bring!/));
    await screen.findByText('Non è stato possibile preparare la lista per Bring!');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    await screen.findByRole('link', { name: 'Apri in Bring!' });
  });

  it('has no PDF yet', async () => {
    await open();
    menu();
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Condividi', 'Bring!']);
  });
});
