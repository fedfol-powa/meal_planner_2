import type { ConnectedAgent } from '@app/contract';
import { ApiError } from '../errors';

export interface FakeAgent { clientId: string; name: string; connectedAt: string; lastRenewedAt: string | null }

/** Fake mode: one agent connected an hour ago, so the list and «Scollega» can be tried. */
export function createFakeAgentsData(now = new Date()): FakeAgent[] {
  return [
    {
      clientId: '6a046a4a-3adc-4818-b1b1-47c5966d7fa7',
      name: 'Claude Code',
      connectedAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
      lastRenewedAt: new Date(now.getTime() - 3_600_000).toISOString()
    }
  ];
}

export function createFakeAgents(agents: FakeAgent[], latencyMs?: number) {
  const wait = async () => {
    if (latencyMs) await new Promise((resolve) => setTimeout(resolve, latencyMs));
  };
  return {
    async list(): Promise<ConnectedAgent[]> {
      await wait();
      return agents.map((agent) => ({ ...agent, current: false }));
    },
    async disconnect({ clientId }: { clientId: string }): Promise<{ clientId: string }> {
      if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new ApiError('invalid');
      await wait();
      const index = agents.findIndex((agent) => agent.clientId === clientId);
      if (index !== -1) agents.splice(index, 1);
      return { clientId };
    }
  };
}
