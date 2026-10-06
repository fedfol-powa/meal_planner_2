import { browser } from '$app/env';
import type { IsoDate, Locale, User } from '#lib/domain/types.ts';
import type { MessageKey } from '#lib/i18n/messages.ts';
import { translate, type MessageParams } from '#lib/i18n/translate.ts';
import type { OperationContext, OpResult } from '#lib/operations/context.ts';
import { errorKey } from '#lib/i18n/errors.ts';
import type { RevisionResult } from '#lib/operations/revision.ts';
import { undoMealChanges } from '#lib/operations/revision.ts';
import { syncShoppingLists } from '#lib/operations/shopping-lists.ts';
import { createInitial, loadPersisted, savePersisted, type Persisted, type ScenarioId } from './persistence';
import { applyScenario, familyForUser } from './scenarios';

function safeStorage(): Storage | null {
	try {
		return browser ? window.localStorage : null;
	} catch {
		return null;
	}
}

class AppState {
	#state = $state<Persisted>(loadPersisted(safeStorage()));
	/** Day chosen in the menu, kept while switching views (design.md, navigation). */
	selectedDate = $state<IsoDate | null>(null);
	/** Short-lived notice after a change, with "Annulla" when the change can be undone. */
	toast = $state<{ id: number; message: string; undo: (() => void) | null } | null>(null);
	#toastId = 0;

	get db() { return this.#state.db; }
	get settings() { return this.#state.settings; }
	/** The signed-in user, or a guest placeholder (empty id) before signing in. */
	get user(): User {
		return this.db.users.find((u) => u.id === this.settings.userId) ?? { id: '', displayName: '', email: '', locale: this.settings.guestLocale, globalRoles: [] };
	}
	get signedIn() { return this.user.id !== ''; }
	get family() { return this.db.families.find((f) => f.id === this.settings.familyId) ?? null; }
	get locale(): Locale { return this.user.locale; }
	get ctx(): OperationContext {
		return { userId: this.settings.userId ?? '', familyId: this.settings.familyId ?? '', channel: 'web', now: this.settings.now, offline: this.settings.offline };
	}
	get variants() { return this.settings.variants; }

	/** Shows another of the user's families (or none), keeping the rest of the session. */
	switchFamily(familyId: string | null) {
		this.update((s) => (s.settings.familyId = familyId));
		this.selectedDate = null;
	}

	signIn(userId: string) {
		this.update((s) => {
			s.settings.userId = userId;
			s.settings.familyId = familyForUser(s.db, userId, s.settings.familyId);
		});
		this.selectedDate = null;
	}

	signOut() {
		this.update((s) => {
			s.settings.guestLocale = this.locale;
			s.settings.userId = null;
			s.settings.familyId = null;
		});
		this.selectedDate = null;
	}

	t = (key: MessageKey, params?: MessageParams) => translate(this.locale, key, params);

	update(change: (state: Persisted) => void) {
		change(this.#state);
		// Back online: shopping list changes kept on the device are sent.
		syncShoppingLists(this.#state.db, this.ctx);
		this.#save();
	}

	notify(message: string, undo: (() => void) | null = null) {
		this.toast = { id: ++this.#toastId, message, undo };
	}

	/** Saves a meal change and offers to undo it; errors become the notice. */
	applyRevision(result: OpResult<RevisionResult>, message: string): boolean {
		if (!result.ok) {
			this.notify(this.t(errorKey(result.error)));
			return false;
		}
		this.update(() => {});
		const { changeIds } = result.value;
		this.notify(message, () => {
			const undone = undoMealChanges(this.db, this.ctx, changeIds);
			if (undone.ok) this.update(() => {});
			this.notify(this.t(undone.ok ? 'toast.undone' : 'toast.undoFailed'));
		});
		return true;
	}

	reset() {
		const variants = this.settings.variants;
		this.#state = createInitial();
		this.#state.settings.variants = variants;
		this.selectedDate = null;
		this.#save();
	}

	setScenario(id: ScenarioId) {
		this.#state = applyScenario(id, { variants: this.settings.variants, guestLocale: this.settings.guestLocale });
		this.selectedDate = null;
		this.#save();
	}

	#save() {
		savePersisted(safeStorage(), $state.snapshot(this.#state) as Persisted);
	}
}

export const app = new AppState();
