import type { RecipeSummary } from '../api/types';
import type { MessageKey, MessageParams } from '../i18n/translate';

export const SOURCE_MAX_CHARS = 22;

/** Only http(s) addresses become links: data from imports and agents are not trusted. */
export function safeSourceUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function sourceLine(recipe: RecipeSummary, t: (key: MessageKey, params?: MessageParams) => string): string | null {
  // A never-published recipe has no source yet.
  if (!recipe.sourceType) return null;
  if (recipe.sourceType === 'book' && recipe.bookTitle) return t('source.book', { title: recipe.bookTitle, pages: recipe.bookPages ?? '—' });
  if (recipe.sourceType === 'youtube') return t('source.youtube');
  if (recipe.sourceType === 'home') return t('source.home');
  const url = safeSourceUrl(recipe.sourceUrl);
  return url ? new URL(url).hostname.replace(/^www\./, '') : null;
}
