// Deleting one's own account (W11): texts of the round 4 prototype, spec «Cancellazione dell'account».
export const it = {
  'account.delete': 'Cancella l’account',
  'account.lastAppAdmin': 'Non puoi ancora cancellare l’account',
  'account.lastAppAdminBody': 'Sei l’unico amministratore dell’app: nomina prima un altro amministratore dall’amministrazione.',
  'account.families': 'Le tue famiglie',
  'account.outcome.stays': 'La famiglia continua senza di te.',
  'account.outcome.needs_successor': 'Sei l’unico amministratore: prima scegli chi lo diventa.',
  'account.outcome.deleted': 'Sei l’unico membro: la famiglia e tutti i suoi dati vengono eliminati.',
  'account.successor': 'Nuovo amministratore',
  'account.whatGoes': 'Cosa viene cancellato',
  'account.whatGoesBody': 'Nome, email, voti e accessi, compresi quelli degli agenti collegati.',
  'account.agents.one': 'Si scollega anche il tuo agente.',
  'account.agents.other': 'Si scollegano anche i tuoi {count} agenti.',
  'account.invitations.one': 'Il tuo invito ancora attivo smette di funzionare.',
  'account.invitations.other': 'I tuoi {count} inviti ancora attivi smettono di funzionare.',
  'account.whatStays': 'Restano le ricette pubblicate e le modifiche ai menu, mostrate come «ex membro».',
  'account.conflict': 'Qualcosa è cambiato nelle tue famiglie: controlla di nuovo',
  // Told by the sign-in page (spec W11, decision 13).
  'account.notice.accountDeleted': 'Account cancellato.',
  'account.notice.accountGone': 'Questo account è stato cancellato.'
};

export const en: Record<keyof typeof it, string> = {
  'account.delete': 'Delete the account',
  'account.lastAppAdmin': 'You cannot delete the account yet',
  'account.lastAppAdminBody': 'You are the only app administrator: first appoint another administrator from the administration.',
  'account.families': 'Your families',
  'account.outcome.stays': 'The family carries on without you.',
  'account.outcome.needs_successor': 'You are the only administrator: first choose who takes over.',
  'account.outcome.deleted': 'You are the only member: the family and all its data are deleted.',
  'account.successor': 'New administrator',
  'account.whatGoes': 'What is deleted',
  'account.whatGoesBody': 'Name, email, ratings and access, including that of connected agents.',
  'account.agents.one': 'Your agent is disconnected too.',
  'account.agents.other': 'Your {count} agents are disconnected too.',
  'account.invitations.one': 'Your invitation still active stops working.',
  'account.invitations.other': 'Your {count} invitations still active stop working.',
  'account.whatStays': 'Published recipes and menu changes remain, shown as “former member”.',
  'account.conflict': 'Something changed in your families: check again',
  'account.notice.accountDeleted': 'Account deleted.',
  'account.notice.accountGone': 'This account has been deleted.'
};
