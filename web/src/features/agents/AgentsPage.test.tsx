import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/errors';
import { createFakeApi } from '../../api/fake/fakeApi';
import { setOnline } from '../../test/connectivity';
import { renderApp } from '../../test/renderApp';

describe('«Collega un agente»', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setOnline(true);
  });

  it('gives the address, the four clients with commands, sign-in with the agent powers, examples and the family note', async () => {
    renderApp('/profile/agents');
    expect(await screen.findByRole('heading', { name: 'Collega un agente' })).toBeTruthy();
    // In tests (and in production) the service is on the page origin; only the Vite dev server points elsewhere.
    expect(screen.getByText(`${window.location.origin}/mcp`)).toBeTruthy();
    for (const name of ['Claude Code', 'Codex CLI', 'Claude Desktop', 'ChatGPT']) expect(screen.getByText(name, { selector: 'summary' })).toBeTruthy();
    expect(screen.getByText(`claude mcp add --transport http --scope user cosasimangia ${window.location.origin}/mcp`)).toBeTruthy();
    expect(screen.getAllByText('Passaggi non ancora provati con questo servizio.')).toHaveLength(2);
    expect(screen.getByText(/l’agente agisce con il tuo account e può anche cambiare la password e chiudere le tue sessioni/)).toBeTruthy();
    expect(screen.getByText(/revoca la sua autorizzazione e le sue sessioni/)).toBeTruthy();
    expect(screen.getByText('«Cosa mangiamo stasera?»')).toBeTruthy();
    expect(screen.getByText(/Eliminare una famiglia si fa solo nell’app/)).toBeTruthy();
    expect(screen.queryByText(/finché non lo autorizzi di nuovo|quando vuoi/)).toBeNull();
  });

  it('copies the address', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderApp('/profile/agents');
    const address = (await screen.findByText(`${window.location.origin}/mcp`)).closest('div')!;
    fireEvent.click(within(address).getByRole('button', { name: 'Copia' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/mcp`));
    expect(await within(address).findByRole('button', { name: 'Copiato' })).toBeTruthy();
  });

  it('without the clipboard: never «Copiato», the text is selected and the page says to copy it by hand', async () => {
    const writeText = vi.fn(async () => Promise.reject(new Error('denied')));
    Object.assign(navigator, { clipboard: { writeText } });
    renderApp('/profile/agents');
    const value = `${window.location.origin}/mcp`;
    const address = (await screen.findByText(value)).closest('div')!;
    fireEvent.click(within(address).getByRole('button', { name: 'Copia' }));
    expect(await screen.findByText('Non è stato possibile copiare: il testo è selezionato, copialo tu.')).toBeTruthy();
    expect(within(address).queryByRole('button', { name: 'Copiato' })).toBeNull();
    expect(getSelection()?.toString()).toBe(value);
  });

  it('lists the connected agents and disconnects one after confirmation, then reads the list again', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const disconnect = vi.spyOn(api.agents, 'disconnect');
    const list = vi.spyOn(api.agents, 'list');
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Claude Code', { selector: '.row-main' })).closest('li')!;
    expect(within(row).getByText(/Collegato il .* · ultimo rinnovo dell’accesso /)).toBeTruthy();
    expect(screen.getByText('L’ultimo rinnovo è l’ultima volta che l’agente ha rinnovato il suo accesso: non dice quando ha usato l’app.')).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    const sheet = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    expect(within(sheet).getByText(/Revoca l’autorizzazione di Claude Code e chiude le sue sessioni/)).toBeTruthy();
    expect(within(sheet).getByText(/Non chiude accessi ottenuti in altro modo: se l’agente ha cambiato la password, cambiala/)).toBeTruthy();
    expect(within(sheet).getByText(/claude mcp remove cosasimangia/)).toBeTruthy();
    const confirm = within(sheet).getByRole('button', { name: 'Scollega' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
    expect(disconnect.mock.calls[0]![0]).toEqual({ clientId: expect.any(String) });
    expect(await screen.findByText('Claude Code scollegato.')).toBeTruthy();
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByText('Claude Code', { selector: '.row-main' })).toBeNull();
  });

  it('shows a fallback name and the generic removal for an unknown client', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.agents, 'list').mockResolvedValue([
      { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7', name: '', connectedAt: '2026-10-01T10:00:00Z', lastRenewedAt: null, current: false }
    ]);
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Agente senza nome', { selector: '.row-main' })).closest('li')!;
    expect(within(row).queryByText(/ultimo rinnovo/)).toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText(/togli il servizio dalle impostazioni del tuo agente/)).toBeTruthy();
  });

  it('keeps the sheet open with the error when Supabase Auth fails: the agent stays connected', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.agents, 'disconnect').mockRejectedValue(new ApiError('internal'));
    renderApp('/profile/agents', { api });
    const row = (await screen.findByText('Claude Code', { selector: '.row-main' })).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Scollega' }));
    const sheet = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Scollega' }));
    expect(await within(sheet).findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Claude Code scollegato.')).toBeNull();
    expect(screen.getByText('Claude Code', { selector: '.row-main' })).toBeTruthy();
  });

  it('opens the sheet again without the error of the previous attempt, and drops an old «scollegato»', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    vi.spyOn(api.agents, 'list').mockResolvedValue([
      { clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7', name: 'Claude Code', connectedAt: '2026-10-01T10:00:00Z', lastRenewedAt: null, current: false },
      { clientId: '7b046a4a-3adc-4818-b1b1-47c5966d7fa7', name: 'Codex', connectedAt: '2026-10-01T10:00:00Z', lastRenewedAt: null, current: false }
    ]);
    const disconnect = vi.spyOn(api.agents, 'disconnect').mockResolvedValueOnce({ clientId: '7b046a4a-3adc-4818-b1b1-47c5966d7fa7' }).mockRejectedValueOnce(new ApiError('internal'));
    renderApp('/profile/agents', { api });
    const rowOf = async (name: string) => (await screen.findByText(name, { selector: '.row-main' })).closest('li')!;
    fireEvent.click(within(await rowOf('Codex')).getByRole('button', { name: 'Scollega' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Scollegare Codex?' })).getByRole('button', { name: 'Scollega' }));
    expect(await screen.findByText('Codex scollegato.')).toBeTruthy();
    fireEvent.click(within(await rowOf('Claude Code')).getByRole('button', { name: 'Scollega' }));
    const sheet = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    expect(screen.queryByText('Codex scollegato.')).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Scollega' }));
    expect(await within(sheet).findByRole('alert')).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Annulla' }));
    fireEvent.click(within(await rowOf('Claude Code')).getByRole('button', { name: 'Scollega' }));
    const again = await screen.findByRole('dialog', { name: 'Scollegare Claude Code?' });
    expect(within(again).queryByRole('alert')).toBeNull();
    expect(disconnect).toHaveBeenCalledTimes(2);
  });

  it('says when no agent is connected, and disables «Scollega» offline', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    renderApp('/profile/agents', { api });
    const button = await screen.findByRole('button', { name: 'Scollega' });
    setOnline(false);
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
    setOnline(true);
    vi.spyOn(api.agents, 'list').mockResolvedValue([]);
    renderApp('/profile/agents', { api });
    expect(await screen.findByText('Nessun agente collegato.')).toBeTruthy();
  });

  it('shows the curator example only to curators', async () => {
    const api = createFakeApi({ getLocale: () => 'it-IT', latencyMs: 0 });
    const profile = await api.profile.get({});
    vi.spyOn(api.profile, 'get').mockResolvedValue({ ...profile, user: { ...profile.user, globalRoles: ['recipe_curator'] } });
    renderApp('/profile/agents', { api });
    expect(await screen.findByText('Le istruzioni sugli ingredienti l’agente le legge dal servizio.')).toBeTruthy();
  });
});
