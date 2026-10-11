/** What a tab tells the other tabs of the same browser (second review, C4). */
export type SessionMessage = { type: 'signedOut'; userId: string } | { type: 'revoked'; userId: string; familyId: string };

export interface SessionChannel {
  post(message: SessionMessage): void;
  subscribe(listener: (message: SessionMessage) => void): () => void;
}

/** The browser's BroadcastChannel, no library; silent where it does not exist. */
export function createBroadcastChannel(name = 'cosasimangia-session'): SessionChannel {
  if (typeof BroadcastChannel === 'undefined') return { post: () => undefined, subscribe: () => () => undefined };
  const channel = new BroadcastChannel(name);
  return {
    post: (message) => channel.postMessage(message),
    subscribe(listener) {
      const onMessage = (event: MessageEvent<SessionMessage>) => listener(event.data);
      channel.addEventListener('message', onMessage);
      return () => channel.removeEventListener('message', onMessage);
    }
  };
}
