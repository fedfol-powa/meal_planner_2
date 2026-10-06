import type { Locale } from '#lib/domain/types.ts';
import { messages, type MessageKey } from './messages';

export type MessageParams = Record<string, string | number>;

export function translate(locale: Locale, key: MessageKey, params: MessageParams = {}): string {
	const template = messages[locale][key];
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in params ? String(params[name]) : match
	);
}
