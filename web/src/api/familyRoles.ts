// Not imported from the contract at run time: it would bring every schema into the bundle.
// familyRoles.test.ts keeps the list equal to the contract's `familyAdmin` operations.
/**
 * Operations reserved to the family administrators. Their `forbidden` can mean only a lost role
 * (a demotion, spec W11): the person may still be a member, so it is no reason to revoke.
 */
export const FAMILY_ADMIN_OPERATIONS: ReadonlySet<string> = new Set([
  'family.addRule',
  'family.delete',
  'family.removeMember',
  'family.removeRule',
  'family.rename',
  'family.setBookOwned',
  'family.setGroupRange',
  'family.setIngredientRestriction',
  'family.setKnownNew',
  'family.setMeal',
  'family.setMeasurementSystem',
  'family.setMemberRole',
  'family.setTimeZone',
  'familyInvitations.create',
  'familyInvitations.list',
  'familyInvitations.listJoins',
  'familyInvitations.revoke',
]);
