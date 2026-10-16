import { normalizeRules, resolveFamilySettings, sameRule } from '@app/domain/family';
import type { Locale } from '../../i18n/translate';
import { ApiError } from '../errors';
import type { Api, ExclusionsView, FamilyDetailView, FamilyRole, ProfileView, Read, SettingsView } from '../types';
import { DEMO_FAMILY, DEMO_PEOPLE } from './seed';
import type { Translated } from './quantity';

type FamilyApi = Omit<Api['family'], 'create' | 'join'>;
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
  /** Members and roles (W11): changed by roles, removals, leaving, links and deletions. */
  members: FakeMember[];
  /** People already seen by this backend: a person who left is not added back. */
  known: Set<string>;
  removals: { userId: string; at: string }[];
  /** The family was deleted: nobody reads it any more. */
  deleted: boolean;
  links: FakeLink[];
  joins: FakeJoin[];
}

export interface FakeMember { id: string; displayName?: string; role: FamilyRole; joinedAt: string }
export interface FakeLink {
  id: string; token: string; createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null;
  /** Emails that started to register from the link, in any state: the cap counter. */
  registrations: { email: string; status: 'reserved' | 'joined' | 'closed' }[];
}
export interface FakeJoin { joinedAt: string; mode: 'new_account' | 'existing_account'; userId: string; invitationId: string }

const DAY = 24 * 60 * 60 * 1000;
/** Valid link of the fake mode: /invite#famiglia…x shows the family invitation without the stack. */
export const FAKE_FAMILY_INVITE_TOKEN = 'famiglia'.padEnd(43, 'x');
export const FAKE_FAMILY_EXPIRED_TOKEN = 'scaduto'.padEnd(43, 'x');
export const FAKE_FAMILY_REVOKED_TOKEN = 'revocato'.padEnd(43, 'x');

/** Revokes the open links (expired or not) of a person, as the server does when the author leaves the role. */
export function revokeLinksOf(data: FakeFamilyData, userId: string): void {
  const at = new Date().toISOString();
  for (const link of data.links) if (link.createdBy === userId && !link.revokedAt) link.revokedAt = at;
}
/** Open links of a person: what the confirmations count. */
export const openLinksOf = (data: FakeFamilyData, userId: string) => data.links.filter((l) => l.createdBy === userId && !l.revokedAt).length;

const JOINED: Record<string, string> = { 'user-federico': '2026-09-01T10:00:00+02:00', 'user-anna': '2026-09-01T10:05:00+02:00', 'user-tom': '2026-09-20T18:30:00+02:00' };

/** A family made with the wizard (W9) in this session: only its creator, the planner defaults, no menus. */
export function createNewFamilyData(
  family: { name: string; timeZone: string; measurementSystem: 'metric' | 'uk_imperial' },
  creatorId: string
): FakeFamilyData {
  const { weights: _weights, ...settings } = resolveFamilySettings({}) as SettingsView['settings'] & { weights: unknown };
  return {
    name: family.name,
    timeZone: family.timeZone,
    measurementSystem: family.measurementSystem,
    members: [{ id: creatorId, role: 'family_admin', joinedAt: new Date().toISOString() }],
    known: new Set([creatorId]),
    removals: [],
    deleted: false,
    links: [],
    joins: [],
    settings,
    ownedBooks: new Set(),
    restrictions: new Map(),
    exclusions: []
  };
}

export function createFakeFamilyData(): FakeFamilyData {
  // The planner defaults; their time limits are among TIME_LIMITS.
  const { weights: _weights, ...settings } = resolveFamilySettings({}) as SettingsView['settings'] & { weights: unknown };
  const now = Date.now();
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  return {
    members: DEMO_PEOPLE.map((p) => ({ id: p.id, role: p.role, joinedAt: JOINED[p.id] ?? at(-30) })),
    known: new Set([...DEMO_PEOPLE.map((p) => p.id), 'user-marco']),
    // Marco joined with the valid link, then was removed: that link no longer lets him in.
    removals: [{ userId: 'user-marco', at: at(-1) }],
    deleted: false,
    links: [
      { id: '00000000-0000-4000-8000-00000000f101', token: FAKE_FAMILY_INVITE_TOKEN, createdBy: 'user-federico', createdAt: at(-5), expiresAt: at(2), revokedAt: null, registrations: [] },
      {
        id: '00000000-0000-4000-8000-00000000f102', token: FAKE_FAMILY_EXPIRED_TOKEN, createdBy: 'user-federico', createdAt: at(-10), expiresAt: at(-3), revokedAt: null,
        registrations: [{ email: 'in-sospeso@example.com', status: 'reserved' }]
      },
      { id: '00000000-0000-4000-8000-00000000f103', token: FAKE_FAMILY_REVOKED_TOKEN, createdBy: 'user-federico', createdAt: at(-20), expiresAt: at(-13), revokedAt: at(-15), registrations: [] }
    ],
    joins: [{ joinedAt: at(-4), mode: 'new_account', userId: 'user-marco', invitationId: '00000000-0000-4000-8000-00000000f101' }],
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
  familyId: string;
  userId: string;
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
  /** The profile of the person, for the answers that return it. */
  profile: () => ProfileView;
  weekCount: () => number;
}

/** The name of a member: the person's own as the profile shows it, a seed person's, or the one given when joining. */
export function memberName(member: FakeMember, self: { id: string; displayName: () => string }): string {
  if (member.id === self.id) return self.displayName();
  return member.displayName ?? DEMO_PEOPLE.find((p) => p.id === member.id)?.displayName ?? member.id;
}

const localized = (text: Translated, locale: Locale) => text[locale] ?? text['it-IT'];
const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** The `family` area of the contract on the demo data, with the same shapes and refusals. */
export function createFakeFamily(deps: FamilyDeps): FamilyApi {
  const { data } = deps;
  const self = { id: deps.userId, displayName: deps.displayName };
  const roleOf = (userId: string) => data.members.find((m) => m.id === userId)?.role ?? null;
  const isAdmin = () => roleOf(deps.userId) === 'family_admin';
  const admin = (familyId: string) => {
    deps.checkFamily(familyId);
    if (!isAdmin()) throw new ApiError('forbidden');
  };
  const people = () => data.members.map((m) => ({ id: m.id, displayName: memberName(m, self), role: m.role, joinedAt: m.joinedAt }));
  const nameOf = (userId: string) => people().find((p) => p.id === userId)?.displayName ?? null;

  function familyView(): FamilyDetailView {
    const members = people()
      .map((p) => ({ userId: p.id, displayName: p.displayName, role: p.role, isMe: p.id === deps.userId, joinedAt: p.joinedAt }))
      .sort((a, b) => (a.role === b.role ? a.displayName.localeCompare(b.displayName) : a.role === 'family_admin' ? -1 : 1));
    return { id: deps.familyId, name: data.name, measurementSystem: data.measurementSystem, timeZone: data.timeZone, myRole: roleOf(deps.userId) ?? 'member', members };
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
    },
    // Members and roles (W11): the rules of the database functions.
    async setMemberRole({ familyId, userId, role }) {
      admin(familyId);
      const member = data.members.find((m) => m.id === userId);
      if (!member) throw new ApiError('not_found');
      if (member.role !== role) {
        if (role === 'member') {
          if (!data.members.some((m) => m.id !== userId && m.role === 'family_admin')) throw new ApiError('last_admin');
          revokeLinksOf(data, userId);
        }
        member.role = role;
      }
      return changed(familyView);
    },
    async removeMember({ familyId, userId }) {
      admin(familyId);
      if (userId === deps.userId) throw new ApiError('invalid', { issues: [{ path: ['userId'], code: 'self' }] });
      if (data.members.some((m) => m.id === userId)) {
        data.removals.push({ userId, at: new Date().toISOString() });
        revokeLinksOf(data, userId);
        data.members = data.members.filter((m) => m.id !== userId);
      }
      return changed(familyView);
    },
    async leave({ familyId, successorId }) {
      deps.checkFamily(familyId);
      const others = data.members.filter((m) => m.id !== deps.userId);
      if (others.length === 0) throw new ApiError('sole_member');
      const successorRefused = new ApiError('invalid', { issues: [{ path: ['successorId'], code: 'successor' }] });
      if (isAdmin() && !others.some((m) => m.role === 'family_admin')) {
        const successor = others.find((m) => m.id === successorId);
        if (!successor) throw successorRefused;
        successor.role = 'family_admin';
      } else if (successorId) throw successorRefused;
      revokeLinksOf(data, deps.userId);
      data.members = others;
      deps.bump();
      return deps.delayed(deps.profile());
    },
    async getDeletion({ familyId }) {
      deps.checkFamily(familyId);
      const memberNames = people().map((p) => p.displayName).sort((a, b) => a.localeCompare(b));
      return deps.respond({ name: data.name, memberNames, weekCount: deps.weekCount(), canDelete: isAdmin() });
    },
    async delete({ familyId }) {
      admin(familyId);
      data.deleted = true;
      data.members = [];
      deps.bump();
      return deps.delayed(deps.profile());
    }
  };
  return family;
}
