import type { SessionChannel, SessionMessage } from '../session/channel';

/** Tabs linked in memory, as BroadcastChannel does: each channel hears the others, not itself. */
export function createMemoryHub() {
  const channels = new Set<Set<(message: SessionMessage) => void>>();
  const sent: SessionMessage[] = [];
  return {
    sent,
    channel(): SessionChannel {
      const listeners = new Set<(message: SessionMessage) => void>();
      channels.add(listeners);
      return {
        post(message) {
          sent.push(message);
          for (const other of channels) if (other !== listeners) other.forEach((listener) => listener(structuredClone(message)));
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => void listeners.delete(listener);
        }
      };
    }
  };
}
