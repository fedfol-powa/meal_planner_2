import { prepareDatabase } from './support/db.ts';

export default async function setup(): Promise<void> {
	await prepareDatabase();
}
