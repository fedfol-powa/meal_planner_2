import { describe, expect, it } from 'vitest';
import worker from './index.ts';

describe('worker skeleton', () => {
	it('answers 404', async () => {
		const response = await worker.fetch();
		expect(response.status).toBe(404);
	});
});
