import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op } from '../op.ts';
import { ratingSummaryView } from './views.ts';

export const ratingsContract = {
	set: op({ mcp: { readOnly: false }, offline: false, role: 'familyMember' })
		.route({
			method: 'PUT',
			path: '/families/{familyId}/ratings/{recipeId}',
			summary: "Set the caller's stars (1-5) for a recipe, or remove them with stars: null; answers the family's rating summary",
		})
		.errors({ not_found: errorDefinitions.not_found })
		.input(z.object({ familyId: z.uuid(), recipeId: z.uuid(), stars: z.number().int().min(1).max(5).nullable() }))
		.output(ratingSummaryView),
};
