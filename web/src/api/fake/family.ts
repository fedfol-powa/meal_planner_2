import { normalizeRules, resolveFamilySettings, sameRule } from '@app/domain/family';
import type { Locale } from '../../i18n/translate';
import { ApiError } from '../errors';
import type { Api, ExclusionsView, FamilyDetailView, FamilyRole, Read, SettingsView } from '../types';
import { DEMO_FAMILY, DEMO_PEOPLE } from './seed';
import type { Translated } from './quantity';

type FamilyApi = Api['family'];
type Restriction = { restriction: 'avoid' | 'limit'; weeklyMax: number | null };

/** What the fake backend remembers of the demo family (W2): settings, books, restrictions, exclusions. */
export interface FakeFamilyData {
  name: string;
  timeZone: string;
  measurementSystem: 'metric' | 'uk_imperial';
  settings: SettingsView['settings'];
  ownedBooks: Set<string>;
  restrictions: Map<string, Restriction>;
  exclusions: { recipeId: string; reason: string | null; createdBy: string; createdAt: string }[];
}

const JOINED: Record<string, string> = { 'user-federico': '2026-09-01T10:00:00+02:00', 'user-anna': '2026-09-01T10:05:00+02:00', 'user-tom': '2026-09-20T18:30:00+02:00' };

export function createFakeFamilyData(): FakeFamilyData {
  // The planner defaults; their time limits are among TIME_LIMITS.
  const { weights: _weights, ...settings } = resolveFamilySettings({}) as SettingsView['settings'] & { weights: unknown };
  return {
    name: DEMO_FAMILY.name,
    timeZone: DEMO_FAMILY.timeZone,
    measurementSystem: DEMO_FAMILY.measurementSystem,
    settings,
    ownedBooks: new Set(['basta-un-wok']),
    restrictions: new Map([['cipolla-rossa-di-tropea-o-1-cipollotto', { restriction: 'avoid', weeklyMax: null }]]),
    // Marco is a former member: his exclusion stays, without a name.
    exclusions: [
      { recipeId: 'pasta-melanzane-pomodoro-ricotta', reason: null, createdBy: 'user-anna', createdAt: '2026-10-01T20:15:00+02:00' },
      { recipeId: 'frittata-forno-bietole-ricotta', reason: 'Non piace ai bambini', createdBy: 'user-marco', createdAt: '2026-09-12T12:40:00+02:00' }
    ]
  };
}

interface FamilyDeps {
  data: FakeFamilyData;
  userId: string;
  role: FamilyRole;
  /** The person's name as the profile shows it. */
  displayName: () => string;
  locale: () => Locale;
  books: { id: string; title: string }[];
  ingredients: { id: string; name: Translated }[];
  recipeName: (recipeId: string, locale: Locale) => string | null;
  checkFamily: (familyId: string) => void;
  respond: <T>(value: T) => Promise<Read<T>>;
  delayed: <T>(value: T) => Promise<T>;
  /** A write happened: the versions of the family change. */
  bump: () => void;
}

const localized = (text: Translated, locale: Locale) => text[locale] ?? text['it-IT'];
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** The `family` area of the contract on the demo data, with the same shapes and refusals. */
export function createFakeFamily(deps: FamilyDeps): FamilyApi {
  const { data } = deps;
  const isAdmin = () => deps.role === 'family_admin';
  const admin = (familyId: string) => {
    deps.checkFamily(familyId);
    if (!isAdmin()) throw new ApiError('forbidden');
  };
  const people = () => {
    const known = DEMO_PEOPLE.map((p) => ({ ...p, displayName: p.id === deps.userId ? deps.displayName() : p.displayName }));
    if (known.some((p) => p.id === deps.userId)) return known;
    return [...known, { id: deps.userId, displayName: deps.displayName(), role: deps.role }];
  };
  const nameOf = (userId: string) => people().find((p) => p.id === userId)?.displayName ?? null;

  function familyView(): FamilyDetailView {
    const members = people()
      .map((p) => ({ userId: p.id, displayName: p.displayName, role: p.role, isMe: p.id === deps.userId, joinedAt: JOINED[p.id] ?? '2026-10-01T09:00:00+02:00' }))
      .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'family_admin' ? -1 : 1));
    return { id: DEMO_FAMILY.id, name: data.name, measurementSystem: data.measurementSystem, timeZone: data.timeZone, myRole: deps.role, members };
  }
  function settingsView(): SettingsView {
    const locale = deps.locale();
    const ingredientName = (id: string) => localized(deps.ingredients.find((i) => i.id === id)?.name ?? { 'it-IT': id, 'en-GB': null }, locale);
    return {
      settings: structuredClone(data.settings),
      books: deps.books.map((b) => ({ id: b.id, title: b.title, owned: data.ownedBooks.has(b.id) })).sort((a, b) => a.title.localeCompare(b.title)),
      restrictions: [...data.restrictions.entries()]
        .map(([ingredientId, r]) => ({ ingredientId, name: ingredientName(ingredientId), ...r }))
        .sort((a, b) => a.name.localeCompare(b.name, locale)),
      canEdit: isAdmin()
    };
  }
  function exclusionsView(): ExclusionsView {
    const locale = deps.locale();
    return [...data.exclusions]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((e) => ({ recipe: { id: e.recipeId, name: deps.recipeName(e.recipeId, locale) ?? e.recipeId }, reason: e.reason, createdByName: nameOf(e.createdBy), createdAt: e.createdAt }));
  }
  const changed = <T,>(view: () => T) => {
    deps.bump();
    return deps.delayed(view());
  };

  const family: FamilyApi = {
    async get({ familyId }) {
      deps.checkFamily(familyId);
      return deps.respond(familyView());
    },
    async getSettings({ familyId }) {
      deps.checkFamily(familyId);
      return deps.respond(settingsView());
    },
    async searchIngredients({ familyId, text }) {
      deps.checkFamily(familyId);
      const needle = normalize(text);
      if (needle.length < 2) return deps.delayed([]);
      const locale = deps.locale();
      return deps.delayed(
        deps.ingredients
          .map((i) => ({ id: i.id, name: localized(i.name, locale) }))
          .filter((i) => normalize(i.name).includes(needle))
          .sort((a, b) => a.name.localeCompare(b.name, locale))
          .slice(0, 8)
      );
    },
    async rename({ familyId, name }) {
      admin(familyId);
      const trimmed = name.trim();
      if (trimmed.length < 1 || trimmed.length > 60) throw new ApiError('invalid');
      data.name = trimmed;
      return changed(familyView);
    },
    async setMeasurementSystem({ familyId, measurementSystem }) {
      admin(familyId);
      data.measurementSystem = measurementSystem;
      return changed(familyView);
    },
    async setTimeZone({ familyId, timeZone }) {
      admin(familyId);
      try {
        new Intl.DateTimeFormat('en', { timeZone });
      } catch {
        throw new ApiError('invalid');
      }
      data.timeZone = timeZone;
      return changed(familyView);
    },
    async setMeal({ familyId, mealType, weekday, servings, fixedText, maxMinutes }) {
      admin(familyId);
      data.settings.slots[mealType][weekday] = { servings, fixedText: fixedText?.trim() || null, maxMinutes };
      return changed(settingsView);
    },
    async addRule({ familyId, rule }) {
      admin(familyId);
      data.settings.rules = normalizeRules([...data.settings.rules, rule]);
      return changed(settingsView);
    },
    async removeRule({ familyId, rule }) {
      admin(familyId);
      data.settings.rules = data.settings.rules.filter((r) => !sameRule(r, rule));
      return changed(settingsView);
    },
    async setKnownNew({ familyId, known, new: fresh, tolerance }) {
      admin(familyId);
      data.settings.knownNew = { known, new: fresh, tolerance };
      return changed(settingsView);
    },
    async setGroupRange({ familyId, group, min, max }) {
      admin(familyId);
      if (min > max) throw new ApiError('invalid');
      data.settings.groupRanges[group] = { min, max };
      return changed(settingsView);
    },
    async setBookOwned({ familyId, bookId, owned }) {
      admin(familyId);
      if (!deps.books.some((b) => b.id === bookId)) throw new ApiError('not_found');
      if (owned) data.ownedBooks.add(bookId);
      else data.ownedBooks.delete(bookId);
      return changed(settingsView);
    },
    async setIngredientRestriction({ familyId, ingredientId, restriction, weeklyMax }) {
      admin(familyId);
      if (!deps.ingredients.some((i) => i.id === ingredientId)) throw new ApiError('not_found');
      if ((restriction === 'limit') !== (weeklyMax !== null)) throw new ApiError('invalid');
      if (restriction === null) data.restrictions.delete(ingredientId);
      else data.restrictions.set(ingredientId, { restriction, weeklyMax });
      return changed(settingsView);
    },
    async listExclusions({ familyId }) {
      deps.checkFamily(familyId);
      return deps.respond(exclusionsView());
    },
    async addExclusion({ familyId, recipeId, reason }) {
      deps.checkFamily(familyId);
      if (deps.recipeName(recipeId, deps.locale()) === null) throw new ApiError('not_found');
      if (!data.exclusions.some((e) => e.recipeId === recipeId)) {
        data.exclusions.push({ recipeId, reason: reason?.trim() || null, createdBy: deps.userId, createdAt: new Date().toISOString() });
      }
      return changed(exclusionsView);
    },
    async removeExclusion({ familyId, recipeId }) {
      deps.checkFamily(familyId);
      data.exclusions = data.exclusions.filter((e) => e.recipeId !== recipeId);
      return changed(exclusionsView);
    }
  };
  return family;
}
