import { hashTokenHex } from '../app-invitations/tokens.ts';
import { appError } from '../errors.ts';
import { fresh, type Implementer } from '../pipeline.ts';
import { profileView } from '../profile/views.ts';
import { mapFamilyError } from './db-errors.ts';
import { familyView } from './views.ts';

/**
 * Members, roles, leaving and deletion of a family (spec W11, section 2). The functions lock the
 * family row and check the caller again: the last administrator is safe under concurrency.
 */
export function familyMembersRouter(os: Implementer) {
	return {
		/** With an existing account: the family becomes the one shown. */
		join: os.family.join.handler(async ({ context, input }) => {
			await context.tx`select app.join_family(decode(${await hashTokenHex(input.token)}, 'hex'))`.catch(mapFamilyError);
			return profileView(context.tx, context.locale);
		}),
		setMemberRole: os.family.setMemberRole.handler(async ({ context, input }) => {
			await context.tx`select app.set_family_member_role(${input.familyId}::uuid, ${input.userId}::uuid, ${input.role})`.catch(mapFamilyError);
			return familyView(context.tx, input.familyId, context.locale);
		}),
		removeMember: os.family.removeMember.handler(async ({ context, input }) => {
			await context.tx`select app.remove_family_member(${input.familyId}::uuid, ${input.userId}::uuid)`.catch((error) => {
				// Oneself: leaving is the way out.
				if ((error as { code?: string }).code === '22023') throw appError('invalid', { issues: [{ path: ['userId'], code: 'self' }] });
				return mapFamilyError(error);
			});
			return familyView(context.tx, input.familyId, context.locale);
		}),
		/** A repeat after a successful leave answers forbidden (no longer a member): the web treats it as done. */
		leave: os.family.leave.handler(async ({ context, input }) => {
			await context.tx`select app.leave_family(${input.familyId}::uuid, ${input.successorId ?? null}::uuid)`.catch((error) =>
				mapFamilyError(error, 'successorId'),
			);
			return profileView(context.tx, context.locale);
		}),
		getDeletion: os.family.getDeletion.handler(async ({ context, input }) => {
			const [row] = await context.tx<{ name: string; member_names: string[]; week_count: number; can_delete: boolean }[]>`
				select * from app.family_deletion_view(${input.familyId}::uuid)`.catch(mapFamilyError);
			if (!row) throw appError('forbidden');
			return fresh(context, { name: row.name, memberNames: row.member_names, weekCount: row.week_count, canDelete: row.can_delete });
		}),
		/** Web only (the pipeline answers web_only to agents before the role check). */
		delete: os.family.delete.handler(async ({ context, input }) => {
			await context.tx`select app.delete_family(${input.familyId}::uuid)`.catch(mapFamilyError);
			return profileView(context.tx, context.locale);
		}),
	};
}
