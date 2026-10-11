export const it = {
  'errors.forbidden': 'Non hai accesso a questa famiglia.',
  'errors.not_found': 'Contenuto non trovato.',
  'errors.invalid': 'Dati non validi.',
  'errors.conflict': 'Qualcun altro l’ha cambiato nel frattempo.',
  'errors.unauthorized': 'La sessione è scaduta: accedi di nuovo.',
  'errors.network': 'Sei offline o il servizio non risponde: riprova quando torni in linea.',
  'errors.unknown': 'Qualcosa non ha funzionato: riprova.'
};

export const en = {
  'errors.forbidden': 'You do not have access to this family.',
  'errors.not_found': 'Not found.',
  'errors.invalid': 'Invalid data.',
  'errors.conflict': 'Someone else changed it in the meantime.',
  'errors.unauthorized': 'Your session has expired: please sign in again.',
  'errors.network': 'You are offline or the service is not responding: try again when you are back online.',
  'errors.unknown': 'Something went wrong: please try again.'
} satisfies Record<keyof typeof it, string>;
