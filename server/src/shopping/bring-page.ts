import { z } from 'zod';
import { withDb } from '../db.ts';
import type { Env } from '../env.ts';

/** `<` written as the literal escape `<`: no line can close the script tag. */
const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** Only the JSON-LD Recipe Bring! reads (spec section 6): no family name, no days. */
export function renderBringPage(lines: string[]): string {
	const recipe = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Cosa si mangia', recipeIngredient: lines };
	return (
		'<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Cosa si mangia</title>' +
		`<script type="application/ld+json">${safeJson(recipe)}</script></head><body></body></html>`
	);
}

/** The schema's tokens: 24 random bytes in hex. Anything else never reaches the database. */
const TOKEN = /^[0-9a-f]{48}$/;
const linesSchema = z.array(z.string());

/** Public page of a temporary list, read as anon through the token resolver of W2. */
export async function serveBringPage(request: Request, env: Env, token: string): Promise<Response> {
	if (request.method !== 'GET') return new Response(null, { status: 405, headers: { allow: 'GET' } });
	const headers = { 'x-robots-tag': 'noindex', 'cache-control': 'no-store' };
	const items = TOKEN.test(token)
		? await withDb(env.HYPERDRIVE.connectionString, { kind: 'anon' }, async (tx) =>
				(await tx<{ items: unknown }[]>`select app.temporary_list_by_token(${token}) as items`)[0]?.items,
			)
		: null;
	const lines = linesSchema.safeParse(items);
	if (!lines.success) return new Response('Not found', { status: 404, headers });
	return new Response(renderBringPage(lines.data), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } });
}
