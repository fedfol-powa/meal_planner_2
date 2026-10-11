import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setOnline } from '../test/connectivity';
import { createStubBackend } from '../test/stubBackend';
import { AuthProvider, useAuth } from './AuthProvider';

let auth: ReturnType<typeof useAuth> | null = null;

function Probe() {
  const value = useAuth();
  auth = value;
  const { state, markSignedOut } = value;
  const text = state.status === 'signedIn' ? `in:${state.user.id}:${state.verified ? 'verified' : 'unverified'}` : state.status;
  return <><p>{text}</p><button onClick={() => state.status === 'signedIn' && markSignedOut(state.user.id)}>out</button></>;
}

const anna = { id: 'anna', email: 'anna@example.com' };
const bruno = { id: 'bruno', email: 'bruno@example.com' };

describe('auth state', () => {
  it('keeps an unverifiable session for reading and checks it again when the network is back', async () => {
    const backend = createStubBackend(null);
    backend.setCheck({ status: 'unverified', user: anna });
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    expect(await screen.findByText('in:anna:unverified')).toBeTruthy();
    backend.setCheck({ status: 'signedIn', user: anna });
    act(() => setOnline(true));
    expect(await screen.findByText('in:anna:verified')).toBeTruthy();
  });
  it('ends an unverifiable session when the renewal is refused after reconnecting', async () => {
    const backend = createStubBackend(null);
    backend.setCheck({ status: 'unverified', user: anna });
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await screen.findByText('in:anna:unverified');
    backend.setCheck({ status: 'signedOut' });
    act(() => setOnline(true));
    expect(await screen.findByText('signedOut')).toBeTruthy();
  });
  it('follows sign-outs from elsewhere and forced local sign-outs', async () => {
    const backend = createStubBackend(anna);
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await screen.findByText('in:anna:verified');
    act(() => backend.setUser(null));
    expect(await screen.findByText('signedOut')).toBeTruthy();
    act(() => backend.setUser(anna));
    await screen.findByText('in:anna:verified');
    act(() => screen.getByText('out').click());
    expect(await screen.findByText('signedOut')).toBeTruthy();
  });
});

describe('identity events (second review, C2)', () => {
  it('stays loading until the identity is known', async () => {
    const backend = createStubBackend(anna);
    const answer = backend.holdCheck();
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByText('loading')).toBeTruthy();
    await act(async () => answer({ status: 'unverified', user: anna }));
    expect(await screen.findByText('in:anna:unverified')).toBeTruthy();
  });
  it('drops a pending check overtaken by a sign-out or another identity', async () => {
    const backend = createStubBackend(anna);
    const answer = backend.holdCheck();
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    act(() => backend.setUser(null));
    await screen.findByText('signedOut');
    await act(async () => answer({ status: 'signedIn', user: anna }));
    expect(screen.getByText('signedOut')).toBeTruthy();

    const other = createStubBackend(anna);
    const late = other.holdCheck();
    render(<AuthProvider backend={other}><Probe /></AuthProvider>);
    act(() => other.setUser(bruno));
    await screen.findByText('in:bruno:verified');
    await act(async () => late({ status: 'signedIn', user: anna }));
    expect(screen.getByText('in:bruno:verified')).toBeTruthy();
  });
  it('never signs out an identity that is not the one asked for', async () => {
    const backend = createStubBackend(bruno);
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await screen.findByText('in:bruno:verified');
    const cleanup = vi.fn(async () => undefined);
    await act(async () => auth!.signOut('anna', cleanup));
    expect(cleanup).not.toHaveBeenCalled();
    expect(backend.signOutCalls).toBe(0);
    expect(screen.getByText('in:bruno:verified')).toBeTruthy();
  });
  it('signs out after the local cleanup, and leaves alone an identity arrived meanwhile', async () => {
    const backend = createStubBackend(anna);
    render(<AuthProvider backend={backend}><Probe /></AuthProvider>);
    await screen.findByText('in:anna:verified');
    await act(async () => auth!.signOut('anna', async () => undefined));
    expect(screen.getByText('signedOut')).toBeTruthy();
    expect(backend.signOutCalls).toBe(1);

    act(() => backend.setUser(anna));
    await screen.findByText('in:anna:verified');
    await act(async () =>
      auth!.signOut('anna', async () => {
        // Bruno signs in from another tab while Anna's data are being removed.
        backend.setUser(bruno);
      })
    );
    expect(screen.getByText('in:bruno:verified')).toBeTruthy();
    expect(backend.signOutCalls).toBe(1);
  });
});
