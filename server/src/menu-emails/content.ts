import type { Locale } from '@app/contract';

export interface MenuEmailMeal {
	date: string;
	mealType: 'lunch' | 'dinner';
	name: string | null;
	freeText: string | null;
	thumbnailUrl: string | null;
}

export interface MenuEmailInput {
	locale: Locale;
	familyName: string;
	familyCount: number;
	weekStart: string;
	meals: MenuEmailMeal[];
	menuUrl: string;
	preferencesUrl: string;
}

const texts = {
	'it-IT': {
		subject: (range: string) => `Il menu della settimana ${range} è pronto`,
		preheader: (family: string) => `Pranzi e cene della famiglia ${family}, da rivedere insieme nell'app.`,
		title: 'Il menu della settimana prossima è pronto',
		button: 'Apri il menu',
		note: "Il menu si può ancora cambiare nell'app: qui lo vedi com'era quando è stato preparato.",
		reason: (family: string) => `Ricevi questa email perché fai parte della famiglia ${family} su Cosa si mangia.`,
		unsubscribe: 'Non ricevere più queste email',
		lunch: 'Pranzo',
		dinner: 'Cena',
		free: 'Pasto libero',
	},
	'en-GB': {
		subject: (range: string) => `The menu for ${range} is ready`,
		preheader: (family: string) => `Lunches and dinners for the ${family} family, to review together in the app.`,
		title: "Next week's menu is ready",
		button: 'Open the menu',
		note: 'The menu can still be changed in the app: this is how it looked when it was prepared.',
		reason: (family: string) => `You get this email because you belong to the ${family} family on Cosa si mangia.`,
		unsubscribe: 'Stop these emails',
		lunch: 'Lunch',
		dinner: 'Dinner',
		free: 'Free meal',
	},
} satisfies Record<Locale, unknown>;

const escapeHtml = (value: string) =>
	value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const dayMs = 24 * 60 * 60 * 1000;
const parseDay = (date: string) => new Date(`${date}T00:00:00Z`);

/** Dates are plain calendar days: format them in UTC so the server's zone never shifts them. */
const formatDate = (locale: Locale, date: Date, options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(date);

const capitalise = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1);

interface Row {
	label: string;
	title: string;
	free: boolean;
	thumbnailUrl: string | null;
}

/**
 * The "next week's menu is ready" email (spec W24, section 5.3): HTML with tables, inline styles and
 * the colours of design/design.md, plus a plain-text version. Names arrive already in the person's
 * language; meals with neither a name nor a free text are skipped; every value is escaped in the HTML.
 */
export function menuEmail(input: MenuEmailInput): { subject: string; html: string; text: string } {
	const { locale } = input;
	const t = texts[locale];
	const start = parseDay(input.weekStart);
	const monthDay: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
	const range = `${formatDate(locale, start, monthDay)} – ${formatDate(locale, new Date(start.getTime() + 6 * dayMs), monthDay)}`;
	const subject = t.subject(range) + (input.familyCount > 1 ? ` · ${input.familyName}` : '');

	const days = new Map<string, Row[]>();
	const ordered = [...input.meals].sort((a, b) => a.date.localeCompare(b.date) || (a.mealType === b.mealType ? 0 : a.mealType === 'lunch' ? -1 : 1));
	for (const meal of ordered) {
		const free = meal.name === null;
		const title = meal.name ?? meal.freeText;
		if (title === null) continue;
		const slot = meal.mealType === 'lunch' ? t.lunch : t.dinner;
		const rows = days.get(meal.date) ?? [];
		rows.push({ label: free ? `${slot} · ${t.free}` : slot, title, free, thumbnailUrl: free ? null : meal.thumbnailUrl });
		days.set(meal.date, rows);
	}
	const dayTitle = (date: string) => capitalise(formatDate(locale, parseDay(date), { weekday: 'long', ...monthDay }));

	const button = `<tr><td style="padding:0 0 12px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:#232323;">
<a href="${escapeHtml(input.menuUrl)}" style="display:inline-block;padding:13px 28px;font:700 16px/1.3 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(t.button)}</a></td></tr></table></td></tr>`;
	const row = (r: Row) => {
		const picture = r.thumbnailUrl !== null
			? `<img src="${escapeHtml(r.thumbnailUrl)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;object-fit:cover;border-radius:6px;">`
			: `<div style="width:72px;height:72px;border-radius:6px;background:${r.free ? '#dce4d2' : '#eef5e8'};"></div>`;
		return `<tr><td style="padding:0 0 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${r.free ? '#f0f3ea' : '#ffffff'};border-radius:8px;border:1px solid ${r.free ? '#dce4d2' : '#ececec'};">
<tr><td width="72" style="padding:8px;vertical-align:middle;">${picture}</td>
<td style="padding:8px 12px 8px 4px;vertical-align:middle;"><div style="font:700 12px/1.4 ${FONT};color:#067a46;text-transform:uppercase;letter-spacing:0.03em;">${escapeHtml(r.label)}</div>
<div style="padding-top:2px;font:400 17px/1.3 ${FONT};color:#232323;">${escapeHtml(r.title)}</div></td></tr></table></td></tr>`;
	};
	const dayBlocks = [...days].map(
		([date, rows]) => `<tr><td style="padding:20px 0 10px;font:700 20px/1.3 ${FONT};color:#232323;">${escapeHtml(dayTitle(date))}</td></tr>\n${rows.map(row).join('\n')}`,
	);

	const html = `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#faf8f3;">
<div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(t.preheader(input.familyName))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f3;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
<tr><td style="padding:0 0 8px;font:700 13px/1.4 ${FONT};color:#067a46;letter-spacing:0.06em;">COSA SI MANGIA?</td></tr>
<tr><td style="padding:0 0 6px;font:700 26px/1.25 ${FONT};color:#232323;">${escapeHtml(t.title)}</td></tr>
<tr><td style="padding:0 0 20px;font:400 15px/1.5 ${FONT};color:#676767;">${escapeHtml(input.familyName)} · ${escapeHtml(range)}</td></tr>
${button}
<tr><td style="padding:0 0 4px;font:400 14px/1.5 ${FONT};color:#676767;text-align:center;">${escapeHtml(t.note)}</td></tr>
${dayBlocks.join('\n')}
<tr><td style="padding:16px 0 24px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr><td style="border-radius:8px;background:#232323;">
<a href="${escapeHtml(input.menuUrl)}" style="display:inline-block;padding:13px 28px;font:700 16px/1.3 ${FONT};color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(t.button)}</a></td></tr></table></td></tr>
<tr><td style="padding:16px 0 0;border-top:1px solid #e4e4e4;font:400 13px/1.5 ${FONT};color:#676767;">${escapeHtml(t.reason(input.familyName))}<br><a href="${escapeHtml(input.preferencesUrl)}" style="color:#067a46;">${escapeHtml(t.unsubscribe)}</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	const lines = [...days].flatMap(([date, rows]) => rows.map((r) => `${dayTitle(date)} – ${r.label}: ${r.title}`));
	const text = `${t.title}\n${input.familyName} · ${range}\n\n${t.button}: ${input.menuUrl}\n${t.note}\n\n${lines.join('\n')}\n\n${t.button}: ${input.menuUrl}\n\n${t.reason(input.familyName)}\n${t.unsubscribe}: ${input.preferencesUrl}\n`;
	return { subject, html, text };
}
