import { z } from 'zod';

/** Recipe photos (W12): one photo per recipe, outside the recipe document. */

/** Issue codes of `invalid` on the image field (`file` or `imageUrl`). */
export const PHOTO_ISSUE_CODES = [
	'photo_type',
	'photo_too_small',
	'photo_too_large',
	'photo_unreadable',
	'photo_url',
	'photo_unreachable',
] as const;
export type PhotoIssueCode = (typeof PHOTO_ISSUE_CODES)[number];

/** Input formats of the Images Free plan: no AVIF, no SVG, no GIF. */
export const PHOTO_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** At most 10 MiB in input, from the app or downloaded. */
export const PHOTO_MAX_INPUT_BYTES = 10 * 1024 * 1024;

export const photoView = z.object({
	recipeId: z.uuid(),
	/** null: no photo. The URL is relative in the app, absolute through MCP. */
	photo: z
		.object({ id: z.uuid(), url: z.string(), width: z.number().int().positive(), height: z.number().int().positive() })
		.nullable(),
});
export type PhotoView = z.infer<typeof photoView>;
