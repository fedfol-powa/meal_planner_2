import { isBusy } from './busy';
import { claimReload, settleReload, type StorageLike } from './update-rules';

interface WorkerLike { postMessage(message: unknown, transfer: MessagePort[]): void }
interface RegistrationLike { update(): Promise<unknown> }
export interface ContainerLike extends EventTarget {
  readonly controller: WorkerLike | null;
  register(url: string, options: { updateViaCache: 'none' }): Promise<RegistrationLike>;
  getRegistration(): Promise<RegistrationLike | undefined>;
}
export interface DocumentLike extends EventTarget { readonly visibilityState: DocumentVisibilityState }
export interface UpdateEnv {
  container: ContainerLike;
  document: DocumentLike;
  /** Resolves at the window's load: registration waits for it, listeners do not. */
  loaded: Promise<void>;
  storage: StorageLike | null;
  reload: () => void;
  pageVersion: string;
  isBusy: () => boolean;
  askTimeoutMs?: number;
}

/** The version of the worker in control, or null without an answer within the timeout. */
function askVersion(worker: WorkerLike, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => done(null), timeoutMs);
    function done(version: string | null) {
      clearTimeout(timer);
      channel.port1.close();
      resolve(version);
    }
    channel.port1.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; version?: unknown } | null;
      done(data?.type === 'version' && typeof data.version === 'string' ? data.version : null);
    };
    try {
      worker.postMessage({ type: 'version' }, [channel.port2]);
    } catch {
      done(null);
    }
  });
}

/**
 * The page follows the worker in control (spec W8): at load, at every return to the foreground and
 * at every controllerchange it asks the worker's version. Aligned: the reload attempt is over.
 * Different: it reloads, only if the page is visible, untouched since the last return and not
 * busy, checked after the answer, and never twice for an attempt without progress. Back in the
 * foreground it also makes sure of the registration and asks the browser to check /sw.js.
 */
export async function startUpdates(env: UpdateEnv): Promise<void> {
  let interacted = false;
  let generation = 0;
  let registration: RegistrationLike | undefined;
  const free = () => env.document.visibilityState === 'visible' && !interacted && !env.isBusy();
  const ensureRegistration = async () => {
    if (registration) return;
    try {
      registration = await env.container.register('/sw.js', { updateViaCache: 'none' });
    } catch {
      registration = await env.container.getRegistration().catch(() => undefined);
    }
  };
  const update = async () => {
    await ensureRegistration();
    await registration?.update().catch(() => undefined);
  };
  const check = async () => {
    const started = generation;
    const controller = env.container.controller;
    if (!controller) return;
    const workerVersion = await askVersion(controller, env.askTimeoutMs ?? 1000);
    if (started !== generation || workerVersion === null) return;
    if (workerVersion === env.pageVersion) return settleReload(env.storage);
    if (!free()) return;
    if (claimReload(env.storage, env.pageVersion, workerVersion)) env.reload();
  };
  const touched = () => {
    interacted = true;
  };
  env.document.addEventListener('pointerdown', touched, true);
  env.document.addEventListener('keydown', touched, true);
  env.document.addEventListener('visibilitychange', () => {
    generation += 1;
    if (env.document.visibilityState !== 'visible') return;
    interacted = false;
    void check();
    void update();
  });
  env.container.addEventListener('controllerchange', () => {
    generation += 1;
    void check();
  });
  await env.loaded;
  await update();
  await check();
}

function sessionStore(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Production only, and only where the browser allows it (HTTPS or localhost). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const loaded = new Promise<void>((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', () => resolve(), { once: true });
  });
  void startUpdates({
    container: navigator.serviceWorker as unknown as ContainerLike,
    document,
    loaded,
    storage: sessionStore(),
    reload: () => location.reload(),
    pageVersion: __BUILD_VERSION__,
    isBusy: () => isBusy()
  }).catch(() => undefined);
}
