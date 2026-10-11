import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MealActionResult } from '../../api/types';
import { DEMO_USER } from '../../auth/backend';
import { setOnline } from '../../test/connectivity';
import { renderSession } from '../../test/sessionHarness';
import { createStubBackend } from '../../test/stubBackend';
import { useMealMutation } from './useMealMutation';

type Mutation = ReturnType<typeof useMealMutation<Record<string, never>>>;

/** Mounts the hook inside the real session scope and hands it out (renderHook has no SessionScope). */
async function mountHook(call: (input: { id: string }) => Promise<MealActionResult>) {
  const ref: { current: Mutation | null } = { current: null };
  function Probe() {
    ref.current = useMealMutation<Record<string, never>>('meals.setNote', 'f', '2026-10-05', call);
    return <p>ready</p>;
  }
  renderSession(<Probe />, { backend: createStubBackend(DEMO_USER) });
  await screen.findByText('ready');
  return ref as { current: Mutation };
}

const answer = (actionId: string) => ({ week: { startsOn: '2026-10-05', days: [] }, actionId, changed: true }) as unknown as MealActionResult;

describe('useMealMutation', () => {
  it('offline: network at once, no call', async () => {
    const call = vi.fn(async ({ id }: { id: string }) => answer(id));
    const hook = await mountHook(call);
    act(() => setOnline(false));
    await act(() => hook.current.mutateAsync({}).catch(() => undefined));
    expect(call).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.current.error).toMatchObject({ code: 'network' }));
    act(() => setOnline(true));
  });

  it('a new uuid per call', async () => {
    const ids: string[] = [];
    const hook = await mountHook(async ({ id }) => {
      ids.push(id);
      return answer(id);
    });
    await act(() => hook.current.mutateAsync({}));
    await act(() => hook.current.mutateAsync({}));
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
