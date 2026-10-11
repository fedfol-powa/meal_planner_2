import { generateWeek, type PlannedWeek, type PlannerInput } from '@app/domain/planner';

/** The planner call, in its own module: the controlled point tests replace to simulate a failure. */
export function planWeek(input: PlannerInput): PlannedWeek {
	return generateWeek(input);
}
