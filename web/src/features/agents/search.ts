export interface AuthorizeSearch { authorization_id?: string }

/** The id Supabase appends to the consent URL; anything else is dropped. */
export function validateAuthorizeSearch(raw: Record<string, unknown>): AuthorizeSearch {
  const id = raw.authorization_id;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id) ? { authorization_id: id } : {};
}
