import type { OriginRecipe } from '../../planner-data/origin.ts';

// Preferences in the origin notes that are not a global exclusion (detail spec, section 6, decision
// of the coordinator): never turned into exclusions, listed for the family to settle by hand.
export interface ConditionalPreference { originSlug: string; name: string; note: string }

const PHRASES = [/non propor(la|lo|re)/i, /non (gli |le )?piac(e|ciono)/i, /solo per/i, /bambin/i, /evitar/i];

export function conditionalPreferences(origin: OriginRecipe[]): ConditionalPreference[] {
	return origin
		.filter((r) => typeof r.note === 'string' && PHRASES.some((p) => p.test(r.note!)))
		.map((r) => ({ originSlug: r.id, name: r.nome, note: r.note! }));
}
