/** `switched`: the person left with «Cambia account»; the request stayed with the previous account (PR #31 review, finding 3). */
export interface AuthorizeSearch { authorization_id?: string; switched?: true }

/** The id Supabase appends to the consent URL and the mark of «Cambia account»; anything else is dropped. */
export function validateAuthorizeSearch(raw: Record<string, unknown>): AuthorizeSearch {
  if (raw.switched === true || raw.switched === 'true') return { switched: true };
  const id = raw.authorization_id;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id) ? { authorization_id: id } : {};
}
