/** Slugs of the catalogue (recipes, ingredients, books): kebab case, as the schema checks. */
export function slugify(text: string, fallback: string): string {
	const slug = text
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60)
		.replace(/-$/, '');
	return slug || fallback;
}

export async function uniqueSlug(base: string, taken: (slug: string) => Promise<boolean>): Promise<string> {
	let slug = base;
	for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
	return slug;
}
