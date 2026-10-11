const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const env = {
  /** null: fake mode, with the demo user and no sign-in (spec "Accesso e sessione"). */
  supabase: url && publishableKey ? { url, publishableKey } : null,
  buildVersion: __BUILD_VERSION__
};
