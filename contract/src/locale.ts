import { z } from 'zod';

export const locales = ['it-IT', 'en-GB'] as const;
export type Locale = (typeof locales)[number];
export const localeSchema = z.enum(locales);
