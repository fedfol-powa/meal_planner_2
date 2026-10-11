/** The part of the Web Locks API the queue uses (`navigator.locks`). */
export interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** The browser's lock manager; null where Web Locks are missing (Safari before 15.4). */
export function browserLocks(): LockManagerLike | null {
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
}

/**
 * Runs `run` holding the lock, waiting for it (not `ifAvailable`): a tab that arrives while another
 * one ends its round reads the queue again afterwards. Without Web Locks it runs at once, a declared
 * limitation: operations are absolute and carry their quantity, so a double send changes nothing.
 */
export function withLock<T>(locks: LockManagerLike | null, name: string, run: () => Promise<T>): Promise<T> {
  return locks ? locks.request(name, run) : run();
}
