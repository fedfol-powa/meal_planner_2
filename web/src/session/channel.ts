/**
 * What a tab tells the other tabs of the same browser (second review, C4). `extension` carries
 * the messages of a feature (topic `shopping-queue` for W4's queue); receivers ignore unknown types.
 */
export type SessionMessage =
  | { type: 'signedOut'; userId: string }
  /** `revokedAt`: the device instant of the revocation (spec W11); absent from tabs of the previous version. */
  | { type: 'revoked'; userId: string; familyId: string; revokedAt?: number }
  /** The server confirmed the family to a request started at `startedAt` (decision 23). */
  | { type: 'restored'; userId: string; familyId: string; startedAt: number }
  | { type: 'extension'; userId: string; topic: string; payload: unknown };

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

/** Listener for one topic of extension messages; unknown types are ignored by every receiver. */
export function subscribeExtension(channel: SessionChannel, topic: string, listener: (userId: string, payload: unknown) => void): () => void {
  return channel.subscribe((message) => {
    if (message.type === 'extension' && message.topic === topic) listener(message.userId, message.payload);
  });
}
