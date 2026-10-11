export const it = {
  'auth.brand': 'Cosa si mangia?',
  'auth.title': 'Accedi',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.submit': 'Accedi',
  'auth.submitting': 'Accesso in corso…',
  'auth.error.invalid_credentials': 'Email o password non corrette.',
  'auth.error.network': 'Non riesco a raggiungere il servizio: controlla la connessione.',
  'auth.error.unknown': 'Accesso non riuscito: riprova tra poco.'
};

export const en = {
  'auth.brand': 'Cosa si mangia?',
  'auth.title': 'Sign in',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.submit': 'Sign in',
  'auth.submitting': 'Signing in…',
  'auth.error.invalid_credentials': 'Wrong email or password.',
  'auth.error.network': 'The service cannot be reached: check your connection.',
  'auth.error.unknown': 'Sign-in failed: please try again shortly.'
} satisfies Record<keyof typeof it, string>;
