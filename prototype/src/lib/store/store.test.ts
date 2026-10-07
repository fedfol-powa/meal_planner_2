import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, createInitial, detectLocale, loadPersisted, savePersisted } from './persistence';
import { settingsProblem } from '#lib/domain/settings.ts';
import { applyScenario, familyForUser } from './scenarios';

const storageWith = (value: string | null) => ({ getItem: (key: string) => (key === STORAGE_KEY ? value : null) });

describe('seed', () => {
	it('starts as Federico in the main family on 6 October at noon', () => {
		const initial = createInitial();
		expect(initial.settings).not.toHaveProperty('photoLayout');
		expect(initial.settings).not.toHaveProperty('ratingVariant');
		expect(initial.settings).toMatchObject({ userId: 'user-federico', familyId: 'family-main', now: '2026-10-06T12:00', offline: false, scenario: 'standard' });
		expect(initial.db.users.map((u) => u.id)).toEqual(['user-federico', 'user-anna', 'user-tom', 'user-lucia', 'user-marco', 'user-giulia']);
	});
	it('records the Monday dinner change by Federico and a change by Anna', () => {
		const week = createInitial().db.weeks.find((w) => w.startsOn === '2026-10-05')!;
		expect(week.slots.find((s) => s.id === '2026-10-05-dinner')).toMatchObject({ updatedBy: 'user-federico', updatedAt: '2026-10-04T18:10' });
		expect(week.slots.find((s) => s.id === '2026-10-08-lunch')).toMatchObject({ updatedBy: 'user-anna', updatedAt: '2026-10-02T21:30' });
	});
});

describe('round 4 demo data', () => {
	it('gives every family an administrator and valid settings', () => {
		for (const family of createInitial().db.families) {
			expect(family.members.some((m) => m.role === 'family_admin')).toBe(true);
			expect(settingsProblem(family.settings)).toBeNull();
		}
	});
});

describe('loadPersisted', () => {
	it('falls back to the seed without storage', () => {
		expect(loadPersisted(null).settings.userId).toBe('user-federico');
	});
	it('falls back to the seed on corrupt JSON', () => {
		expect(loadPersisted(storageWith('{not json')).version).toBe(23);
	});
	it('discards data saved by the previous version', () => {
		const old = { ...createInitial(), version: 18 };
		expect(loadPersisted(storageWith(JSON.stringify(old))).version).toBe(23);
	});
	it('falls back to the seed on another version', () => {
		expect(loadPersisted(storageWith(JSON.stringify({ version: 0, db: {}, settings: {} }))).db.users.length).toBe(6);
	});
	it('falls back to the seed when getItem throws', () => {
		const throwing = { getItem: () => { throw new Error('SecurityError'); } };
		expect(loadPersisted(throwing).version).toBe(23);
	});
	it('falls back to the seed when settings point to unknown users or families', () => {
		const broken = { version: 23, db: { users: [], families: [], weeks: [] }, settings: { userId: 'x', familyId: 'y', now: '2026-10-06T12:00', offline: false, scenario: 'standard' } };
		expect(loadPersisted(storageWith(JSON.stringify(broken))).db.users.length).toBe(6);
	});
	it('falls back to the seed on a malformed time', () => {
		const other = createInitial();
		other.settings.now = 'yesterday';
		expect(loadPersisted(storageWith(JSON.stringify(other))).settings.now).toBe('2026-10-06T12:00');
	});
	it('round-trips a saved value', () => {
		let stored: string | null = null;
		const value = createInitial();
		value.settings.offline = true;
		savePersisted({ setItem: (_k: string, v: string) => { stored = v; } }, value);
		expect(loadPersisted(storageWith(stored)).settings.offline).toBe(true);
	});
	it('does not throw when setItem throws', () => {
		expect(() => savePersisted({ setItem: () => { throw new Error('QuotaExceeded'); } }, createInitial())).not.toThrow();
	});
});

describe('scenarios', () => {
	it('new_family selects the grandparents family without weeks', () => {
		const s = applyScenario('new_family');
		expect(s.settings.familyId).toBe('family-grandparents');
		expect(s.db.weeks.some((w) => w.familyId === 'family-grandparents')).toBe(false);
	});
	it('empty_today removes the slots of the simulated day', () => {
		const s = applyScenario('empty_today');
		expect(s.db.weeks.flatMap((w) => w.slots).some((slot) => slot.date === '2026-10-06')).toBe(false);
	});
});

describe('new_user scenario and locale (round 4)', () => {
	it('starts signed out', () => {
		expect(applyScenario('new_user').settings).toMatchObject({ userId: null, familyId: null });
	});
	it('accepts a signed-out session when loading', () => {
		const signedOut = applyScenario('new_user');
		expect(loadPersisted(storageWith(JSON.stringify(signedOut))).settings.userId).toBeNull();
	});
	it('detects Italian browsers, English otherwise', () => {
		expect(detectLocale(['it-IT', 'en'])).toBe('it-IT');
		expect(detectLocale(['it'])).toBe('it-IT');
		expect(detectLocale(['en-US'])).toBe('en-GB');
		expect(detectLocale(['fr-FR'])).toBe('en-GB');
		expect(detectLocale(undefined)).toBe('en-GB');
	});
});

describe('familyForUser', () => {
	it('keeps the current family when the new user belongs to it, else the first family of the user', () => {
		const db = createInitial().db;
		expect(familyForUser(db, 'user-federico', 'family-grandparents')).toBe('family-grandparents');
		expect(familyForUser(db, 'user-anna', 'family-grandparents')).toBe('family-main');
		expect(familyForUser(db, 'user-lucia', 'family-main')).toBe('family-grandparents');
		expect(familyForUser(db, 'user-giulia', 'family-main')).toBeNull();
	});
});
