/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Development and preview only: where the /api proxy sends requests (default http://localhost:8787). */
  readonly VITE_API_TARGET?: string;
}
