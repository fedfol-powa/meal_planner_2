import type { Locale } from '@app/contract';

const texts = {
	'it-IT': {
		subject: 'Scegli la password per Cosa si mangia',
		title: 'Scegli la tua password',
		family: (family: string, email: string) =>
			`Per entrare nella famiglia ${family} su Cosa si mangia, scegli una password per ${email}. Poi entrerai con la tua email e questa password, anche nell'app.`,
		generic: (email: string) =>
			`Per cominciare a usare Cosa si mangia, scegli una password per ${email}. Poi entrerai con la tua email e questa password, anche nell'app.`,
		button: 'Scegli la password',
		note: 'Il link vale 24 ore. Se non ti aspettavi questa email, ignorala: non cambia nulla.',
	},
	'en-GB': {
		subject: 'Choose your password for Cosa si mangia',
		title: 'Choose your password',
		family: (family: string, email: string) =>
			`To join the ${family} family on Cosa si mangia, choose a password for ${email}. You will then sign in with your email and this password, in the app too.`,
		generic: (email: string) =>
			`To start using Cosa si mangia, choose a password for ${email}. You will then sign in with your email and this password, in the app too.`,
		button: 'Choose your password',
		note: 'The link is valid for 24 hours. If you were not expecting this email, ignore it: nothing changes.',
	},
} satisfies Record<Locale, unknown>;

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * The "choose your password" email of an invitation (spec W15, section 4): HTML with inline styles
 * and the colours of design/design.md, plus a text version with the full link. The family name
 * only in the first email after a join; every value is escaped in the HTML.
 */
export function passwordEmail(input: { url: string; email: string; locale: Locale; familyName: string | null }): { subject: string; html: string; text: string } {
	const t = texts[input.locale];
	const body = (email: string, family: string | null) => (family === null ? t.generic(email) : t.family(family, email));
	const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#232323">
<div style="max-width:420px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<p style="margin:0 0 16px;font-weight:600;color:#067A46">Cosa si mangia?</p>
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(t.title)}</h1>
<p style="margin:0 0 16px">${escapeHtml(body(input.email, input.familyName))}</p>
<p style="margin:0 0 16px"><a href="${escapeHtml(input.url)}" style="display:inline-block;background:#232323;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px">${escapeHtml(t.button)}</a></p>
<p style="margin:0;font-size:13px;color:#676767">${escapeHtml(t.note)}</p>
</div>
</body>
</html>`;
	const text = `${t.title}\n\n${body(input.email, input.familyName)}\n\n${t.button}: ${input.url}\n\n${t.note}\n`;
	return { subject: t.subject, html, text };
}
