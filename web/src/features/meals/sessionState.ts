import type { Session } from '../../session/session';

/** A save of servings refused after its card unmounted, or a meal or recipe gone while its sheet was open. */
export type NewNotice = { kind: 'servings'; mealLabel: string; date: string } | { kind: 'gone' };
export type SaveNotice = NewNotice & { id: string };

interface Notices {
  list(): SaveNotice[];
  add(notice: NewNotice): void;
  dismiss(id: string): void;
  subscribe(listener: () => void): () => void;
}

/** Notices of the Menu, kept per session until dismissed (spec of the revision, 5). */
const bySession = new WeakMap<Session, Notices>();

export function noticesOf(session: Session): Notices {
  let notices = bySession.get(session);
  if (!notices) {
    let items: SaveNotice[] = [];
    const listeners = new Set<() => void>();
    const emit = () => listeners.forEach((listener) => listener());
    notices = {
      list: () => items,
      add: (notice) => {
        items = [...items, { ...notice, id: crypto.randomUUID() }];
        emit();
      },
      dismiss: (id) => {
        items = items.filter((n) => n.id !== id);
        emit();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      }
    };
    // A new session object at each sign-in drops the old notices with it.
    bySession.set(session, notices);
  }
  return notices;
}

export interface UndoOffer { familyId: string; actionId: string; weekStartsOn: string; key: number; at: number }

interface UndoSlot { get(): UndoOffer | null; set(offer: UndoOffer | null): void; subscribe(listener: () => void): () => void }

const undoBySession = new WeakMap<Session, UndoSlot>();
let offers = 0;
export const nextOfferKey = () => ++offers;

/**
 * The last action the user can undo, per session: it outlives the Menu remounting (language
 * change, another week loading, a quick trip to another tab) and expires by its own clock.
 */
export function undoOf(session: Session): UndoSlot {
  let slot = undoBySession.get(session);
  if (!slot) {
    let current: UndoOffer | null = null;
    const listeners = new Set<() => void>();
    slot = {
      get: () => current,
      set: (offer) => {
        current = offer;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      }
    };
    undoBySession.set(session, slot);
  }
  return slot;
}
