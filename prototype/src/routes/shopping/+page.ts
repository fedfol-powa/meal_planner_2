import { redirect } from '@sveltejs/kit';

// The shopping list opens from the menu on the week being viewed (/shopping/<monday>).
export function load() {
	redirect(307, '/menu');
}
