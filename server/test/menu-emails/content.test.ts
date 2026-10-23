import { describe, expect, it } from 'vitest';
import { menuEmail, type MenuEmailInput } from '../../src/menu-emails/content.ts';

const input = (overrides: Partial<MenuEmailInput> = {}): MenuEmailInput => ({
	locale: 'it-IT',
	familyName: 'Folloni',
	familyCount: 1,
	weekStart: '2026-10-26',
	meals: [
		{ date: '2026-10-26', mealType: 'lunch', name: 'Pasta con crema di peperoni', freeText: null, thumbnailUrl: 'https://app.test/photos/email/abc.jpg' },
		{ date: '2026-10-26', mealType: 'dinner', name: 'Couscous', freeText: null, thumbnailUrl: null },
		{ date: '2026-10-27', mealType: 'dinner', name: null, freeText: 'Cena fuori', thumbnailUrl: null },
	],
	menuUrl: 'https://app.test/menu?day=2026-10-26&family=f1',
	preferencesUrl: 'https://app.test/profile/preferences',
	...overrides,
});

describe('menuEmail', () => {
	it('builds the subject with the week range, and the family name when the person has several', () => {
		expect(menuEmail(input()).subject).toBe('Il menu della settimana 26 ottobre – 1 novembre è pronto');
		expect(menuEmail(input({ locale: 'en-GB' })).subject).toBe('The menu for 26 October – 1 November is ready');
		expect(menuEmail(input({ familyCount: 2 })).subject).toBe('Il menu della settimana 26 ottobre – 1 novembre è pronto · Folloni');
		expect(menuEmail(input({ locale: 'en-GB', familyCount: 2 })).subject).toBe('The menu for 26 October – 1 November is ready · Folloni');
	});

	it('renders the Italian HTML with day titles, thumbnails, free meals and links', () => {
		const { html } = menuEmail(input());
		expect(html).toContain('lang="it-IT"');
		expect(html).toContain('Lunedì 26 ottobre');
		expect(html).toContain('Martedì 27 ottobre');
		expect(html).toContain('Pranzo');
		expect(html).toContain('text-transform:uppercase');
		expect(html).toContain('src="https://app.test/photos/email/abc.jpg" width="72" height="72" alt=""');
		expect(html.match(/<img /g)).toHaveLength(1);
		expect(html).toContain('#f0f3ea');
		expect(html).toContain('Cena · Pasto libero');
		expect(html).toContain('Cena fuori');
		expect(html.split('href="https://app.test/menu?day=2026-10-26&amp;family=f1"')).toHaveLength(3);
		expect(html).toContain('href="https://app.test/profile/preferences"');
		expect(html).toContain('Non ricevere più queste email');
		expect(html).toContain('role="presentation"');
	});

	it('renders the English HTML', () => {
		const { html } = menuEmail(input({ locale: 'en-GB' }));
		expect(html).toContain('lang="en-GB"');
		expect(html).toContain('Monday 26 October');
		expect(html).toContain('Lunch');
		expect(html).toContain('Dinner · Free meal');
		expect(html).toContain('Open the menu');
	});

	it('escapes database values in the HTML and keeps the plain text intact', () => {
		const freeText = '<script>alert(1)</script> & "x"';
		const { html, text } = menuEmail(input({ familyName: '<b>F</b>', meals: [{ date: '2026-10-26', mealType: 'lunch', name: null, freeText, thumbnailUrl: null }] }));
		expect(html).not.toContain('<script>');
		expect(html).not.toContain('<b>F</b>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
		expect(text).toContain(freeText);
	});

	it('skips meals with neither a name nor a free text', () => {
		const { html, text } = menuEmail(input({ meals: [{ date: '2026-10-28', mealType: 'lunch', name: null, freeText: null, thumbnailUrl: null }] }));
		expect(html).not.toContain('Mercoledì 28 ottobre');
		expect(text).not.toContain('Mercoledì 28 ottobre');
	});

	it('writes one plain-text line per meal and both links', () => {
		const { text } = menuEmail(input());
		expect(text).toContain('Lunedì 26 ottobre – Pranzo: Pasta con crema di peperoni');
		expect(text).toContain('Martedì 27 ottobre – Cena · Pasto libero: Cena fuori');
		expect(text).toContain('https://app.test/menu?day=2026-10-26&family=f1');
		expect(text).toContain('https://app.test/profile/preferences');
	});
});
