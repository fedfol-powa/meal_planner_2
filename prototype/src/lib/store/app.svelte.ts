import { browser } from '$app/env';
import type { IsoDate, Locale } from '#lib/domain/types.ts';
import type { MessageKey } from '#lib/i18n/messages.ts';
import { translate, type MessageParams } from '#lib/i18n/translate.ts';
import type { OperationContext } from '#lib/operations/context.ts';
import { createInitial, loadPersisted, savePersisted, type Persisted, type ScenarioId } from './persistence';
import { applyScenario } from './scenarios';

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

	get db() { return this.#state.db; }
	get settings() { return this.#state.settings; }
	get user() { return this.db.users.find((u) => u.id === this.settings.userId) ?? this.db.users[0]; }
	get family() { return this.db.families.find((f) => f.id === this.settings.familyId) ?? null; }
	get locale(): Locale { return this.user.locale; }
	get ctx(): OperationContext {
		return { userId: this.settings.userId, familyId: this.settings.familyId, channel: 'web', now: this.settings.now, offline: this.settings.offline };
	}

	t = (key: MessageKey, params?: MessageParams) => translate(this.locale, key, params);

	update(change: (state: Persisted) => void) {
		change(this.#state);
		this.#save();
	}

	switchUser(userId: string) {
		this.update((s) => {
			s.settings.userId = userId;
			const family = s.db.families.find((f) => f.members.some((m) => m.userId === userId));
			if (family) s.settings.familyId = family.id;
		});
		this.selectedDate = null;
	}

	reset() {
		this.#state = createInitial();
		this.selectedDate = null;
		this.#save();
	}

	setScenario(id: ScenarioId) {
		this.#state = applyScenario(id);
		this.selectedDate = null;
		this.#save();
	}

	#save() {
		savePersisted(safeStorage(), $state.snapshot(this.#state) as Persisted);
	}
}

export const app = new AppState();
