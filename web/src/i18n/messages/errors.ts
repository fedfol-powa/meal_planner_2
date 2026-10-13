export const it = {
  'errors.forbidden': 'Non hai accesso a questa famiglia.',
  'errors.not_found': 'Contenuto non trovato.',
  'errors.invalid': 'Dati non validi.',
  'errors.conflict': 'Qualcun altro l’ha cambiato nel frattempo.',
  'errors.not_allowed': 'Non si può fare nello stato attuale.',
  'errors.unauthorized': 'La sessione è scaduta: accedi di nuovo.',
  'errors.network': 'Sei offline o il servizio non risponde: riprova quando torni in linea.',
  'errors.unknown': 'Qualcosa non ha funzionato: riprova.',
  'errors.internal': 'Il servizio ha avuto un problema: riprova tra poco.',
  'errors.last_admin': 'Serve almeno un altro amministratore della famiglia.',
  'errors.last_app_admin': 'Serve almeno un altro amministratore dell’app.',
  'errors.sole_member': 'Sei l’unico membro della famiglia.',
  'errors.web_only': 'Questa operazione si fa dall’app.',
  'errors.invitation_unavailable': 'Questo invito non vale più. Chiedi un link nuovo a chi ti ha invitato.',
  'errors.rate_limited': 'Troppi tentativi. Riprova tra un minuto.'
};

export const en = {
  'errors.forbidden': 'You do not have access to this family.',
  'errors.not_found': 'Not found.',
  'errors.invalid': 'Invalid data.',
  'errors.conflict': 'Someone else changed it in the meantime.',
  'errors.not_allowed': 'This cannot be done in the current state.',
  'errors.unauthorized': 'Your session has expired: please sign in again.',
  'errors.network': 'You are offline or the service is not responding: try again when you are back online.',
  'errors.unknown': 'Something went wrong: please try again.',
  'errors.internal': 'The service had a problem: please try again shortly.',
  'errors.last_admin': 'The family needs at least one other administrator.',
  'errors.last_app_admin': 'The app needs at least one other administrator.',
  'errors.sole_member': 'You are the only member of the family.',
  'errors.web_only': 'This can only be done in the app.',
  'errors.invitation_unavailable': 'This invitation is no longer valid. Ask whoever invited you for a new link.',
  'errors.rate_limited': 'Too many attempts. Try again in a minute.'
} satisfies Record<keyof typeof it, string>;
