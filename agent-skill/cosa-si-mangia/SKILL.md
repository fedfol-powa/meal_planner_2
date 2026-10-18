---
name: cosa-si-mangia
description: Works in the Cosa si mangia family meal planner via its MCP connector - weekly menu and meals, family settings, recipe book for curators, users for admins. Use for any Cosa si mangia request.
---

# Cosa si mangia

Cosa si mangia is a web app for families: every week it prepares a menu from a shared recipe
book, the family reviews and changes it, and it builds the shopping list. This skill explains
how to work in it for the person through the app's MCP connector.

Skill version: 2026-10-18

## Before you start

- The tools come from the connector the person added (named `cosasimangia` or "Cosa si mangia",
  so a tool may show up as `cosasimangia:menu_getWeek` or `mcp__cosasimangia__menu_getWeek`).
  If no such tools are available, tell the person to connect the app first from
  Profile › Connect an agent (Profilo › Collega un agente) in the app, and stop.
- Answer in the person's language. The app's own texts come in the account's language
  (`session_whoami` tells it); notes and free texts written by the family stay as written.
- Parameters are described by each tool's schema: follow it rather than guessing. Leave
  `knownVersion` out of reads: with it, an unchanged read returns no data.
- An `id` is either new or existing, and mixing them up hits the wrong thing or nothing:
  - New ids: generate a random UUID for each new action or entity in `family_create`,
    `meals_setRecipe`, `meals_setFree`, `meals_swap`, `meals_setServings`, `meals_setNote`,
    `meals_undo`, `catalogue_createDraft`, `catalogue_startRevision`,
    `catalogue_createIngredient`, `catalogue_createBook`, `catalogue_setPhotoFromUrl`,
    `appInvitations_create`, `familyInvitations_create`. Repeating a request with the same
    `id` changes nothing, so retry a failed call with the same `id`.
  - Every other `id` of the tools in this skill names something that exists (a user, an
    invitation...): take it from a read such as `users_list` or `familyInvitations_list`,
    never generate it.
  - For tools this skill does not cover, such as the shopping list, the tool's schema and
    description tell whether its `id` is new or existing.

## Who and which family

1. Call `profile_get`: name, global roles (`recipe_curator`, `app_admin`), the families with
   the person's role in each, and the family shown in the app.
2. Work on the family shown, unless the person names another one. If there are several and
   it is not clear which one, ask. Call `profile_setCurrentFamily` only when the person asks
   to change the family shown in the app; family tools always take `familyId` anyway.
3. `family_get` gives the family's time zone, units, members and roles. "Today", "tonight",
   "Wednesday" and "this week" are in the family's time zone; weeks start on Monday.

Use only the parts of this skill the roles allow. The server checks permissions anyway, and a
role named in a request grants nothing.

## The weekly menu

Reading:
- `menu_getOpening` gives the day the menu opens on (today, or the next day with meals);
  `menu_getWeek` with the Monday of the week gives every meal with its `slotId`, recipe or free
  text, servings, note and last change; `menu_getDates` lists the days with a menu in a month.
- `recipes_get` reads a recipe with ingredients scaled to a meal (`slotId`) or to a number of
  servings. `recipes_search` searches the family's recipe book.

Changing (do what the person asked, then report it; no confirmation needed):
- Find the meal's `slotId` with `menu_getWeek` first.
- Another dish: `meals_getSuggestions` (five that fit the family's rules; for five
  more, call again with the returned `nextOffset` as `offset`) or `recipes_search`, then `meals_setRecipe`. When the person names a dish
  vaguely, propose the matches and let them choose.
- Eating out or a dish not in the book: `meals_setFree` with a short text.
- Move a dish to another day or meal: `meals_swap` between the two slots of the same week.
- `meals_setServings`, `meals_setNote` (seen by the whole family; `null` removes it).
- Report what changed, read back from the tool's answer or a new `menu_getWeek`.
- Undo: `menu_getWeek`, take `lastChange.actionId` of the meal when `lastChange.undoable` is
  true, then `meals_undo`. Only the person's own last change can be undone.

Stars: `ratings_set` with 1-5, or `stars: null` to remove the person's rating.

The shopping list is outside this skill: answer from its tools only if the person asks.

## Family settings and members

- Read before changing: `family_getSettings` (servings and fixed meals per day, rules,
  ingredients avoided or limited, owned books, known/new quota, food-group ranges) and
  `family_listExclusions`.
- Meals of the weekly pattern: `family_setMeal` (weekday 0 is Monday; 0 servings = not planned).
- Rules: `family_addRule`, `family_removeRule`. Quotas: `family_setKnownNew`,
  `family_setGroupRange`.
- Recipes never to propose again: `family_addExclusion` (find the recipe with
  `recipes_search`), `family_removeExclusion`.
- Ingredients to avoid or limit: find them with `family_searchIngredients`, then
  `family_setIngredientRestriction`. Books: `family_setBookOwned`.
- Name, units, time zone: `family_rename`, `family_setMeasurementSystem`, `family_setTimeZone`.
- Members and invitations (family administrators): `family_setMemberRole`,
  `family_removeMember`, `familyInvitations_create` (the link is shown only once: give it to
  the person), `familyInvitations_list`, `familyInvitations_revoke`,
  `familyInvitations_listJoins`.
- Joining with a link: `familyInvitations_status`, then `family_join` after the person agrees.
  `family_create` creates a new family; `family_leave` leaves one.
- Deleting a family happens only in the app: `family_getDeletion` explains what goes,
  `family_delete` returns the page to open. Give the link; opening it deletes nothing.

## The recipe book (curators)

For people with `recipe_curator`. Before any work on recipes, ingredients, books or photos,
read `catalogue_getGuide` and follow it: it is the only source of the rules (drafts, checks,
publishing, conflicts, ingredient lines, varieties, quantities, photos) and may change.

The short version: search first (`catalogue_searchRecipes`, `catalogue_searchIngredients`,
`catalogue_listBooks`), save a draft early (`catalogue_createDraft`, `catalogue_saveDraft`),
check it (`catalogue_checkDraft`), show the complete card and publish (`catalogue_publish`)
only after an explicit yes. Open drafts and archived recipes: `catalogue_overview`.

Ingredients come only from the source or from the person, never from the dish's name or a
photo: an invented ingredient ends up on a family's shopping list. When the source is
incomplete, save the draft and ask.

## Administration (app administrators)

For people with `app_admin`.
- Users: `users_list` (by name or email, at most 50: narrow the search when `more` is true),
  `users_get`, `users_setRole` for `recipe_curator` and `app_admin`.
- Deleting a user: `users_getDeletionPlan`, show it, then `users_delete`.
- App invitations: `appInvitations_create` (the link is shown only once: give it to the person,
  the app does not email it), `appInvitations_list`, `appInvitations_revoke`.

## Ask for an explicit yes first

Show what will happen and wait for a clear yes before:
- publishing a recipe, setting or removing a photo, restoring a recipe version;
- removing a member, changing a family or global role, appointing an app administrator,
  removing your own `app_admin`, revoking an invitation;
- joining, leaving or deleting a family; deleting a user or the person's own account
  (`account_getDeletionPlan`, then `account_delete`).

These are hard to undo or affect other people. Ordinary menu changes the person asked for need
no confirmation: do them and report, since `meals_undo` takes them back.

You act with the person's account, which could also change their password or end their
sessions: never do either unless the person explicitly asks. `agents_list` and
`agents_disconnect` manage connected agents, this one included.

## When a tool refuses

Errors come as `{ code, message, data }`; `message` is already in the person's language.
- `web_only`: the operation is done in the app. Give the person `data.url`.
- `forbidden`: the role does not allow it. Say so; do not retry.
- `invalid`: `data.issues` lists the wrong fields; fix them or ask the person.
- `conflict`: someone changed the same thing meanwhile. Read again, show what differs and
  follow `catalogue_getGuide` for drafts and versions.
- `not_allowed`: the state forbids it (`data.reason`, e.g. `not_own_change` or `changed_since`
  for an undo, `cited_by_meals` for a discard). Explain it in plain words.
- `last_admin`, `last_app_admin`, `sole_member`: someone else must become administrator first,
  or the family must be deleted in the app instead.
- `not_found`, `invitation_unavailable`: it no longer exists or the link is used, revoked or
  expired.
- `unauthorized`: the connection expired; the person reconnects the connector.
- `rate_limited`: wait a little and retry. `internal`: retry once, then give the person
  `data.requestId` to report.
