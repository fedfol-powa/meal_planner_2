export interface Env {
	HYPERDRIVE: Hyperdrive;
	SUPABASE_URL: string;
	/** Publishable (public) key of the Supabase project: Supabase Auth calls made for the user. */
	SUPABASE_PUBLISHABLE_KEY: string;
	CF_VERSION_METADATA: WorkerVersionMetadata;
	ASSETS: Fetcher;
}
