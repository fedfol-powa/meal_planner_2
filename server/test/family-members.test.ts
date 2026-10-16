import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorOf, setupActors, type Actor, type Actors } from './support/actors.ts';
import { hasDatabase } from './support/db.ts';
import { mcp, toolBody } from './support/requests.ts';

describe.skipIf(!hasDatabase)('family members, roles, leaving and deletion', () => {
	let actors: Actors;
	beforeAll(async () => {
		actors = await setupActors();
	});
	afterAll(() => actors?.close());

	/** Administrator first, then the plain members. */
	const family = async (members = 2) => {
		const people: Actor[] = [];
		for (let i = 0; i <= members; i++) people.push(await actors.user());
		const familyId = await actors.db.createFamily(people.map((p, i) => ({ userId: p.userId, role: i === 0 ? 'family_admin' : 'member' })));
		return { familyId, admin: people[0]!, members: people.slice(1) };
	};
	const role = async (familyId: string, userId: string) =>
		(await actors.db.admin<{ role: string }[]>`select role from app.family_members where family_id = ${familyId} and user_id = ${userId}`)[0]?.role;
	const linksOf = async (userId: string) =>
		(await actors.db.admin<{ reason: string | null }[]>`select revoke_reason as reason from app.family_invitations where created_by = ${userId}`).map((r) => r.reason);
	const recipe = async () =>
		(await actors.db.admin<{ id: string }[]>`select id from app.recipes where status = 'published' limit 1`)[0]!.id;

	describe('setMemberRole', () => {
		it('promotes and demotes; the last administrator stays', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			const view = await admin.client.family.setMemberRole({ familyId, userId: b!.userId, role: 'family_admin' });
			expect(view.members.find((m) => m.userId === b!.userId)?.role).toBe('family_admin');
			await admin.client.family.setMemberRole({ familyId, userId: admin.userId, role: 'member' });
			expect(await role(familyId, admin.userId)).toBe('member');
			expect((await errorOf(b!.client.family.setMemberRole({ familyId, userId: b!.userId, role: 'member' }))).code).toBe('last_admin');
		});

		it('answers not_found for a non member and forbidden for a plain member', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			const outsider = await actors.user();
			expect((await errorOf(admin.client.family.setMemberRole({ familyId, userId: outsider.userId, role: 'member' }))).code).toBe('not_found');
			expect((await errorOf(b!.client.family.setMemberRole({ familyId, userId: admin.userId, role: 'member' }))).code).toBe('forbidden');
		});

		it('revokes the links of a demoted person', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			await admin.client.family.setMemberRole({ familyId, userId: b!.userId, role: 'family_admin' });
			await b!.client.familyInvitations.create({ familyId, id: crypto.randomUUID() });
			await admin.client.family.setMemberRole({ familyId, userId: b!.userId, role: 'member' });
			expect(await linksOf(b!.userId)).toEqual(['creator_demoted']);
		});
	});

	describe('removeMember', () => {
		it('removes, revokes the links, repeats without effect; removing oneself is invalid', async () => {
			const { familyId, admin, members: [b, c] } = await family(2);
			await admin.client.family.setMemberRole({ familyId, userId: b!.userId, role: 'family_admin' });
			await b!.client.familyInvitations.create({ familyId, id: crypto.randomUUID() });
			const view = await admin.client.family.removeMember({ familyId, userId: b!.userId });
			expect(view.members.map((m) => m.userId)).not.toContain(b!.userId);
			expect(await linksOf(b!.userId)).toEqual(['creator_removed']);
			await admin.client.family.removeMember({ familyId, userId: b!.userId });
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_removals where family_id = ${familyId} and user_id = ${b!.userId}`;
			expect(n).toBe(1);
			const self = await errorOf(admin.client.family.removeMember({ familyId, userId: admin.userId }));
			expect([self.code, self.data]).toEqual(['invalid', { issues: [{ path: ['userId'], code: 'self' }] }]);
			expect((await errorOf(c!.client.family.removeMember({ familyId, userId: admin.userId }))).code).toBe('forbidden');
		});

		it('the removed member gets forbidden on the next read with the same token, web and MCP', async () => {
			const { familyId, admin } = await family(0);
			const agent = await actors.user({ agent: true });
			await actors.db.addMember(familyId, agent.userId, 'member');
			expect((await agent.client.family.get({ familyId })).unchanged).toBe(false);
			await admin.client.family.removeMember({ familyId, userId: agent.userId });
			expect((await errorOf(agent.client.family.get({ familyId }))).code).toBe('forbidden');
			const call = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'family_get', arguments: { familyId } });
			expect(call.body.result.isError).toBe(true);
			expect(toolBody(call).code).toBe('forbidden');
		});

		it('the average leaves out the removed member and the rating stays; a new link brings it back', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			const recipeId = await recipe();
			await actors.db.admin`insert into app.ratings (user_id, recipe_id, stars) values (${admin.userId}, ${recipeId}, 5), (${b!.userId}, ${recipeId}, 1)`;
			const average = async () =>
				(await actors.db.admin<{ average: string }[]>`select average::text from app.family_scores where family_id = ${familyId} and recipe_id = ${recipeId}`)[0]?.average;
			expect(await average()).toBe('3.00');
			await admin.client.family.removeMember({ familyId, userId: b!.userId });
			expect(await average()).toBe('5.00');
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.ratings where user_id = ${b!.userId}`;
			expect(n).toBe(1);
			const { url } = await admin.client.familyInvitations.create({ familyId, id: crypto.randomUUID() });
			await b!.client.family.join({ token: url.split('#')[1]! });
			expect(await average()).toBe('3.00');
		});
	});

	describe('leave', () => {
		it('the only member must delete the family', async () => {
			const { familyId, admin } = await family(0);
			expect((await errorOf(admin.client.family.leave({ familyId }))).code).toBe('sole_member');
		});

		it('the last administrator names a successor, who becomes administrator', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			await admin.client.familyInvitations.create({ familyId, id: crypto.randomUUID() });
			const missing = await errorOf(admin.client.family.leave({ familyId }));
			expect([missing.code, missing.data]).toEqual(['invalid', { issues: [{ path: ['successorId'], code: 'successor' }] }]);
			const profile = await admin.client.family.leave({ familyId, successorId: b!.userId });
			expect(profile.families.map((f) => f.id)).not.toContain(familyId);
			expect(await role(familyId, b!.userId)).toBe('family_admin');
			expect(await linksOf(admin.userId)).toEqual(['creator_left']);
		});

		it('a plain member leaves without a successor; naming one is invalid; leaving again is forbidden', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			expect((await errorOf(b!.client.family.leave({ familyId, successorId: admin.userId }))).code).toBe('invalid');
			await b!.client.family.leave({ familyId });
			expect(await role(familyId, b!.userId)).toBeUndefined();
			expect((await errorOf(b!.client.family.leave({ familyId }))).code).toBe('forbidden');
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.family_removals where family_id = ${familyId}`;
			expect(n).toBe(0);
		});

		it('answers invalid on successorId when the other administrator left meanwhile', async () => {
			const { familyId, admin, members: [b, c] } = await family(2);
			await admin.client.family.setMemberRole({ familyId, userId: b!.userId, role: 'family_admin' });
			await b!.client.family.leave({ familyId });
			const error = await errorOf(admin.client.family.leave({ familyId }));
			expect([error.code, error.data]).toEqual(['invalid', { issues: [{ path: ['successorId'], code: 'successor' }] }]);
			await admin.client.family.leave({ familyId, successorId: c!.userId });
			expect(await role(familyId, c!.userId)).toBe('family_admin');
		});
	});

	describe('deletion', () => {
		it('getDeletion summarises for members, with canDelete only for administrators', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			await actors.db.admin`insert into app.weeks (family_id, starts_on) values (${familyId}, '2031-01-06')`;
			const read = await admin.client.family.getDeletion({ familyId });
			if (read.unchanged) throw new Error('expected data');
			expect(read.data).toMatchObject({ name: 'Test', weekCount: 1, canDelete: true });
			expect(read.data.memberNames).toHaveLength(2);
			const member = await b!.client.family.getDeletion({ familyId });
			expect(!member.unchanged && member.data.canDelete).toBe(false);
			expect((await admin.client.family.getDeletion({ familyId, knownVersion: read.version })).unchanged).toBe(true);
		});

		it('family_delete over MCP answers web_only with the page URL and keeps the family', async () => {
			const { familyId } = await family(0);
			const agent = await actors.user({ agent: true });
			await actors.db.addMember(familyId, agent.userId, 'family_admin');
			const call = await mcp(actors.app, actors.env, agent.token, 'tools/call', { name: 'family_delete', arguments: { familyId } });
			expect(toolBody(call)).toMatchObject({ code: 'web_only', data: { url: `https://app.test/profile/family/delete?family=${familyId}` } });
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.families where id = ${familyId}`;
			expect(n).toBe(1);
		});

		it('delete from the web removes the family and returns the profile without it', async () => {
			const { familyId, admin, members: [b] } = await family(1);
			expect((await errorOf(b!.client.family.delete({ familyId }))).code).toBe('forbidden');
			const profile = await admin.client.family.delete({ familyId });
			expect(profile.families.map((f) => f.id)).not.toContain(familyId);
			expect(profile.currentFamilyId).not.toBe(familyId);
			const [{ n }] = await actors.db.admin<{ n: number }[]>`select count(*)::int as n from app.families where id = ${familyId}`;
			expect(n).toBe(0);
			expect((await errorOf(b!.client.family.get({ familyId }))).code).toBe('forbidden');
		});
	});

	it('MCP tools describe the effects of removing and leaving', async () => {
		const agent = await actors.user({ agent: true });
		const tools: { name: string; description: string }[] = (await mcp(actors.app, actors.env, agent.token, 'tools/list')).body.result.tools;
		const describe = (name: string) => tools.find((t) => t.name === name)?.description ?? '';
		for (const name of ['family_setMemberRole', 'family_removeMember', 'family_leave', 'family_getDeletion', 'family_delete', 'family_join']) {
			expect(tools.map((t) => t.name)).toContain(name);
		}
		expect(describe('family_removeMember')).toMatch(/average/);
		expect(describe('family_leave')).toMatch(/successor/);
	});
});
