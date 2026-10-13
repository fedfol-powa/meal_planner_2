import { describe, expect, it, vi } from 'vitest';
import { startUpdates, type ContainerLike, type DocumentLike } from './update';

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/** A worker whose answers to «version» wait until the test delivers them. */
function heldWorker(version: string) {
  const pending: (() => void)[] = [];
  return {
    version,
    pending,
    postMessage: vi.fn((message: unknown, transfer: MessagePort[]) => {
      if ((message as { type?: string }).type === 'version') pending.push(() => transfer[0]!.postMessage({ type: 'version', version }));
    }),
    /** Delivers the oldest held answer and lets the page react. */
    async answerFirst() {
      pending.shift()?.();
      await tick();
    },
    /** Delivers every held answer and lets the page react. */
    async answer() {
      pending.splice(0).forEach((send) => send());
      await tick();
    }
  };
}

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    items
  };
}

type Options = {
  page?: string;
  worker?: ReturnType<typeof heldWorker> | null;
  storage?: ReturnType<typeof memoryStorage>;
  busy?: boolean;
  updateFails?: boolean;
  /** How many register() calls fail before one succeeds. */
  registerFailures?: number;
  existing?: boolean;
};

function world(options: Options = {}) {
  const page = options.page ?? 'v-page';
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState }) as EventTarget & DocumentLike & { visibilityState: DocumentVisibilityState };
  const update = vi.fn(async () => {
    if (options.updateFails) throw new TypeError('Failed to fetch');
  });
  let failures = options.registerFailures ?? 0;
  let worker: ReturnType<typeof heldWorker> | null = options.worker === undefined ? heldWorker(page) : options.worker;
  const container = Object.assign(new EventTarget(), {
    register: vi.fn(async () => {
      if (failures > 0) {
        failures -= 1;
        throw new TypeError('Failed to fetch');
      }
      return { update };
    }),
    getRegistration: vi.fn(async () => (options.existing ? { update } : undefined))
  }) as unknown as EventTarget & ContainerLike;
  Object.defineProperty(container, 'controller', { get: () => worker });
  let markLoaded!: () => void;
  const loaded = new Promise<void>((resolve) => (markLoaded = resolve));
  const state = { busy: options.busy ?? false };
  const reload = vi.fn();
  const storage = options.storage ?? memoryStorage();
  const env = { container, document: doc, loaded, storage, reload, pageVersion: page, isBusy: () => state.busy, askTimeoutMs: 1000 };
  return {
    env, doc, container, update, state, reload, storage,
    get worker() {
      return worker!;
    },
    begin() {
      return startUpdates(env);
    },
    load() {
      markLoaded();
    },
    start() {
      const run = this.begin();
      this.load();
      return run;
    },
    visible() {
      doc.visibilityState = 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    hidden() {
      doc.visibilityState = 'hidden';
      doc.dispatchEvent(new Event('visibilitychange'));
    },
    touch() {
      doc.dispatchEvent(new Event('pointerdown'));
    },
    takeOver(version: string) {
      worker = heldWorker(version);
      container.dispatchEvent(new Event('controllerchange'));
      return worker;
    }
  };
}

/** Starts a world and delivers the answer of the start check. */
async function started(w: ReturnType<typeof world>) {
  const run = w.start();
  await tick();
  await w.worker.answer();
  await run;
}

describe('page updates', () => {
  it('registers bypassing the HTTP cache, checks for updates at start, stays on the same version', async () => {
    const w = world();
    await started(w);
    expect(w.container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    expect(w.update).toHaveBeenCalledTimes(1);
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a new worker taking over a free, untouched page reloads it once', async () => {
    const w = world();
    await started(w);
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a busy page waits; back in the foreground and free, it checks for updates and reloads', async () => {
    const w = world({ worker: heldWorker('v-new'), busy: true });
    await started(w);
    expect(w.reload).not.toHaveBeenCalled();
    w.state.busy = false;
    w.hidden();
    w.visible();
    await tick();
    expect(w.update).toHaveBeenCalledTimes(2);
    await w.worker.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a touch while waiting for the answer stops the reload, at start and back in the foreground', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const run = w.start();
    await tick();
    w.touch();
    await w.worker.answer();
    await run;
    expect(w.reload).not.toHaveBeenCalled();
    w.hidden();
    w.visible();
    await tick();
    w.touch();
    await w.worker.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a touch on controllerchange stops the reload until the next return', async () => {
    const w = world();
    await started(w);
    w.touch();
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
    w.hidden();
    w.visible();
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('a touch before the page finished loading counts', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const run = w.begin();
    w.touch();
    await tick();
    expect(w.container.register).not.toHaveBeenCalled();
    w.load();
    await tick();
    await w.worker.answer();
    await run;
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a page hidden while waiting for the answer does not reload', async () => {
    const w = world();
    await started(w);
    const next = w.takeOver('v-new');
    await tick();
    w.doc.visibilityState = 'hidden'; // hidden without the event: the check must look again
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a page that became busy while waiting for the answer does not reload', async () => {
    const w = world();
    await started(w);
    const next = w.takeOver('v-new');
    await tick();
    w.state.busy = true;
    await next.answer();
    expect(w.reload).not.toHaveBeenCalled();
  });
  it('a check overtaken by controllerchange is dropped, and the new check decides', async () => {
    const w = world();
    await started(w);
    const first = w.takeOver('v-1');
    await tick();
    const second = w.takeOver('v-2');
    await tick();
    await first.answer();
    expect(w.reload).not.toHaveBeenCalled();
    await second.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
    expect(w.storage.items.get('pwa-reload')).toBe('v-page>v-2');
  });
  it('a check overtaken by a new return to the foreground is dropped', async () => {
    const w = world({ worker: heldWorker('v-new') });
    const run = w.start();
    await tick();
    w.hidden();
    w.visible();
    await tick();
    expect(w.worker.pending).toHaveLength(2);
    // The start check's answer arrives first: overtaken, dropped even though the page is free.
    await w.worker.answerFirst();
    expect(w.reload).not.toHaveBeenCalled();
    await w.worker.answerFirst();
    await run;
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('B → C → B → C across documents with the same sessionStorage: every step happens', async () => {
    const storage = memoryStorage();
    // Document 1: page B, worker C takes over.
    const one = world({ page: 'B', storage });
    await started(one);
    const c = one.takeOver('C');
    await tick();
    await c.answer();
    expect(one.reload).toHaveBeenCalledTimes(1);
    // Document 2: page C under C (aligned), then the rollback to B takes over.
    const two = world({ page: 'C', worker: heldWorker('C'), storage });
    await started(two);
    expect(storage.items.has('pwa-reload')).toBe(false);
    const b = two.takeOver('B');
    await tick();
    await b.answer();
    expect(two.reload).toHaveBeenCalledTimes(1);
    // Document 3: page B under B, then C is published again.
    const three = world({ page: 'B', worker: heldWorker('B'), storage });
    await started(three);
    const again = three.takeOver('C');
    await tick();
    await again.answer();
    expect(three.reload).toHaveBeenCalledTimes(1);
  });
  it('a reload without progress is not repeated', async () => {
    const storage = memoryStorage();
    const one = world({ page: 'B', worker: heldWorker('C'), storage });
    await started(one);
    expect(one.reload).toHaveBeenCalledTimes(1);
    // The reload brought B again under C (no convergence): no second reload, at start or back.
    const two = world({ page: 'B', worker: heldWorker('C'), storage });
    await started(two);
    two.hidden();
    two.visible();
    await tick();
    await two.worker.answer();
    expect(two.reload).not.toHaveBeenCalled();
  });
  it('a failed first registration is recovered back in the foreground, and the update arrives', async () => {
    const w = world({ registerFailures: 1 });
    await started(w);
    expect(w.update).not.toHaveBeenCalled();
    // The network is back; the app returns to the foreground.
    w.hidden();
    w.visible();
    await tick();
    await w.worker.answer();
    expect(w.container.register).toHaveBeenCalledTimes(2);
    expect(w.update).toHaveBeenCalledTimes(1);
    const next = w.takeOver('v-new');
    await tick();
    await next.answer();
    expect(w.reload).toHaveBeenCalledTimes(1);
  });
  it('uses the existing registration when register fails', async () => {
    const w = world({ registerFailures: 1, existing: true });
    await started(w);
    expect(w.container.getRegistration).toHaveBeenCalled();
    expect(w.update).toHaveBeenCalledTimes(1);
  });
  it('does nothing without a worker in control or without an answer', async () => {
    const none = world({ worker: null });
    await none.start();
    expect(none.reload).not.toHaveBeenCalled();
    const silent = world({ worker: heldWorker('v-new') });
    silent.env.askTimeoutMs = 20;
    await silent.start();
    expect(silent.reload).not.toHaveBeenCalled();
  });
  it('offline: failing registration and update checks leave no unhandled error and no reload', async () => {
    const w = world({ updateFails: true });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    await started(w);
    w.hidden();
    w.visible();
    await tick();
    await w.worker.answer();
    const failing = world({ registerFailures: 5 });
    await started(failing);
    failing.hidden();
    failing.visible();
    await tick();
    await failing.worker.answer();
    await tick();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(w.reload).not.toHaveBeenCalled();
    expect(failing.reload).not.toHaveBeenCalled();
  });
});
