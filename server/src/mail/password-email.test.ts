import { describe, expect, it } from 'vitest';
import { passwordEmail } from './password-email.ts';

const url = 'https://cosasimangia.app/password#token_hash=abc&type=recovery';

describe('passwordEmail (spec W15, section 4)', () => {
	it('Italian, first email of a family: the family text, the link in the button and in the text version', () => {
		const mail = passwordEmail({ url, email: 'nuova@x.it', locale: 'it-IT', familyName: 'Rossi' });
		expect(mail.subject).toBe('Scegli la password per Cosa si mangia');
		expect(mail.html).toContain('Scegli la tua password');
		expect(mail.html).toContain(
			'Per entrare nella famiglia Rossi su Cosa si mangia, scegli una password per nuova@x.it. Poi entrerai con la tua email e questa password, anche nell&#39;app.',
		);
		expect(mail.html).toContain(`href="${url.replace('&', '&amp;')}"`);
		expect(mail.html).toContain('>Scegli la password</a>');
		expect(mail.html).toContain('Il link vale 24 ore. Se non ti aspettavi questa email, ignorala: non cambia nulla.');
		expect(mail.text).toContain(url);
		expect(mail.text).toContain('Per entrare nella famiglia Rossi su Cosa si mangia');
	});

	it('Italian without a family (and every resend): the generic text, no family', () => {
		const mail = passwordEmail({ url, email: 'nuova@x.it', locale: 'it-IT', familyName: null });
		expect(mail.html).toContain('Per cominciare a usare Cosa si mangia, scegli una password per nuova@x.it.');
		expect(mail.html).not.toContain('famiglia');
		expect(mail.text).not.toContain('famiglia');
	});

	it('British English, with and without a family', () => {
		const family = passwordEmail({ url, email: 'new@x.it', locale: 'en-GB', familyName: 'Smith' });
		expect(family.subject).toBe('Choose your password for Cosa si mangia');
		expect(family.html).toContain('Choose your password');
		expect(family.html).toContain(
			'To join the Smith family on Cosa si mangia, choose a password for new@x.it. You will then sign in with your email and this password, in the app too.',
		);
		expect(family.html).toContain('The link is valid for 24 hours. If you were not expecting this email, ignore it: nothing changes.');
		const generic = passwordEmail({ url, email: 'new@x.it', locale: 'en-GB', familyName: null });
		expect(generic.text).toContain('To start using Cosa si mangia, choose a password for new@x.it.');
		expect(generic.text).toContain(url);
	});

	it('escapes the family name and the email in the HTML', () => {
		const mail = passwordEmail({ url, email: 'a<b>@x.it', locale: 'it-IT', familyName: '<b>Rossi & figli</b>' });
		expect(mail.html).toContain('&lt;b&gt;Rossi &amp; figli&lt;/b&gt;');
		expect(mail.html).not.toContain('<b>Rossi');
		expect(mail.html).toContain('a&lt;b&gt;@x.it');
		expect(mail.text).toContain('<b>Rossi & figli</b>');
	});

	it('uses the colours of the design', () => {
		const { html } = passwordEmail({ url, email: 'a@x.it', locale: 'it-IT', familyName: null });
		for (const colour of ['#FAF8F3', '#232323', '#067A46', '#676767']) expect(html).toContain(colour);
	});
});
