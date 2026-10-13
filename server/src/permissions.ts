import type { Role } from '@app/contract';
import type { Tx } from './db.ts';
import { appError } from './errors.ts';

const familyIdOf = (input: unknown) => (input as { familyId: string }).familyId;

/**
 * Clear errors before the handler, through the W2 helper functions (security definer,
 * based on auth.uid()); row level security stays the real guarantee. A family that does
 * not exist and one the user is not in look the same: forbidden.
 */
export async function checkRole(tx: Tx, role: Role, input: unknown): Promise<void> {
	if (role === 'user') return;
	let rows: { ok: boolean }[];
	switch (role) {
		case 'familyMember':
			rows = await tx`select app.is_member(${familyIdOf(input)}::uuid) as ok`;
			break;
		case 'familyAdmin':
			rows = await tx`select app.is_family_admin(${familyIdOf(input)}::uuid) as ok`;
			break;
		case 'curator':
			rows = await tx`select app.has_role('recipe_curator') as ok`;
			break;
		case 'appAdmin':
			rows = await tx`select app.has_role('app_admin') as ok`;
			break;
		case 'public':
			// Public operations leave the pipeline before the role check: reaching it is a bug.
			throw new Error('public operation reached the signed-in role check');
	}
	if (!rows[0]?.ok) throw appError('forbidden');
}
