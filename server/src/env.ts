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
}
