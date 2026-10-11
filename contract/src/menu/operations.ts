import { z } from 'zod';
import { errorDefinitions } from '../errors.ts';
import { op, type OperationMeta } from '../op.ts';
import { isoDateSchema } from '../recipes/views.ts';
import { versionedInput, versionedOutput } from '../versioned.ts';
import { monday, openingView, weekView } from './views.ts';

const read: OperationMeta = { mcp: { readOnly: true }, offline: false, role: 'familyMember', reads: ['family', 'catalogue'] };

export const menuContract = {
	getOpening: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/opening', summary: 'Day the menu opens on: today, else the next day with meals' })
		.input(versionedInput(z.object({ familyId: z.uuid(), today: isoDateSchema.optional() })))
		.output(versionedOutput(openingView)),
	getWeek: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/weeks/{weekStartsOn}', summary: 'Meals of a week, ready to show' })
		.errors({ not_found: errorDefinitions.not_found })
		.input(versionedInput(z.object({ familyId: z.uuid(), weekStartsOn: monday })))
		.output(versionedOutput(weekView)),
	getDates: op(read)
		.route({ method: 'GET', path: '/families/{familyId}/menu/dates/{month}', summary: 'Days with a menu in a month' })
		.input(versionedInput(z.object({ familyId: z.uuid(), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) })))
		.output(versionedOutput(z.array(isoDateSchema))),
};
