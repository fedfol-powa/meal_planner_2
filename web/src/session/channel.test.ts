import { describe, expect, it, vi } from 'vitest';
import { createMemoryHub } from '../test/memoryChannel';
import { subscribeExtension } from './channel';

describe('extension messages (second PR, W4 interface)', () => {
  it('reach only the listeners of their topic', () => {
    const hub = createMemoryHub();
    const receiver = hub.channel();
    const sender = hub.channel();
    const queue = vi.fn();
    const other = vi.fn();
    const off = subscribeExtension(receiver, 'shopping-queue', queue);
    subscribeExtension(receiver, 'other-topic', other);
    sender.post({ type: 'extension', userId: 'a', topic: 'shopping-queue', payload: { type: 'reread' } });
    sender.post({ type: 'revoked', userId: 'a', familyId: 'f' });
    sender.post({ type: 'signedOut', userId: 'a' });
    expect(queue).toHaveBeenCalledExactlyOnceWith('a', { type: 'reread' });
    expect(other).not.toHaveBeenCalled();
    off();
    sender.post({ type: 'extension', userId: 'a', topic: 'shopping-queue', payload: 2 });
    expect(queue).toHaveBeenCalledTimes(1);
  });
});
