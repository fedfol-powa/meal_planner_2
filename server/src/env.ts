/** Workers `ratelimit` binding (spec W9): per-location counters, a brake not a guarantee. */
import type { PhotoImages } from './catalogue/photos/process.ts';

export interface RateLimiter {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	/** Publishable (public) key of the Supabase project: Supabase Auth calls made for the user. */
	SUPABASE_PUBLISHABLE_KEY: string;
	CF_VERSION_METADATA: WorkerVersionMetadata;
	ASSETS: Fetcher;
	/** Nightly export (spec 2026-10-11-esportazione-r2): private bucket, EU jurisdiction. */
	BACKUPS?: R2Bucket;
	/** Secret: base64 of 32 bytes; a copy lives in the owner's password manager. */
	BACKUP_ENCRYPTION_KEY?: string;
	BACKUP_KEY_ID?: string;
	/** Secret: Supabase secret API key for the Auth admin API, read only by server/src/accounts/. */
	SUPABASE_SECRET_KEY?: string;
	INVITE_READ_LIMIT: RateLimiter;
	INVITE_ACCEPT_LIMIT: RateLimiter;
	/** Recipe photos (W12): private bucket, EU jurisdiction. Without it or IMAGES the photo writes are `internal`. */
	PHOTOS?: R2Bucket;
	/** Images binding: one WebP per upload. */
	IMAGES?: PhotoImages;
	/** Per-IP limiter of the public route /photos/<key>. */
	PHOTO_READ_LIMIT: RateLimiter;
	/** Secret: Resend API key, sending access for the domain only, distinct from Supabase's SMTP key (spec W15). */
	RESEND_API_KEY?: string;
	/** Secret: address of the operations contact for the alerts; never stored. */
	OPS_ALERT_EMAIL?: string;
	/** Local stack and CI only, never in production: send emails to Mailpit's API instead of Resend. */
	MAILPIT_API_URL?: string;
	/** Tests only: replaces the global fetch of setPhotoFromUrl. */
	PHOTO_FETCH?: typeof fetch;
}
