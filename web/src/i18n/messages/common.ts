export const it = {
  appName: 'Cosa si mangia',
  skip: 'Vai al contenuto',
  'nav.main': 'Navigazione principale',
  'nav.menu': 'Menu',
  'nav.recipes': 'Ricettario',
  'nav.profile': 'Profilo',
  'common.back': 'Indietro',
  'common.close': 'Chiudi',
  'common.retry': 'Riprova',
  'common.loading': 'Caricamento…',
  'common.soon': 'In arrivo',
  'family.none.title': 'Non fai parte di nessuna famiglia',
  'family.none.body': 'Chiedi a un amministratore della famiglia di invitarti.',
  'offline.banner': 'Sei offline: puoi consultare i dati già caricati.',
  'offline.bannerShopping': 'Sei offline: le modifiche alla lista restano su questo telefono e si sincronizzano quando torni in linea.',
  'notFound.title': 'Contenuto non trovato',
  'notFound.action': 'Vai al menu'
};

export const en = {
  appName: 'Cosa si mangia',
  skip: 'Skip to content',
  'nav.main': 'Main navigation',
  'nav.menu': 'Menu',
  'nav.recipes': 'Recipes',
  'nav.profile': 'Profile',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.retry': 'Try again',
  'common.loading': 'Loading…',
  'common.soon': 'Coming soon',
  'family.none.title': 'You are not in a family',
  'family.none.body': 'Ask a family administrator to invite you.',
  'offline.banner': 'You are offline: you can browse what is already loaded.',
  'offline.bannerShopping': 'You are offline: changes to the list stay on this phone and sync when you are back online.',
  'notFound.title': 'Not found',
  'notFound.action': 'Go to the menu'
} satisfies Record<keyof typeof it, string>;
