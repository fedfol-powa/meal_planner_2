// Round 4 texts (family and account), merged into messages.ts.
export const itFamily = {
	'error.lastAdmin': 'Serve almeno un altro amministratore: nominane uno prima.',
	'error.lastAppAdmin': 'Sei l’unico amministratore dell’app: nomina prima un successore.',
	'error.soleMember': 'Sei l’unico membro: per uscire elimina la famiglia.',
	'error.webOnly': 'Si può fare solo dall’app web.'
} as const;

export const enFamily: Record<keyof typeof itFamily, string> = {
	'error.lastAdmin': 'There must be another administrator: appoint one first.',
	'error.lastAppAdmin': 'You are the only app administrator: appoint a successor first.',
	'error.soleMember': 'You are the only member: to leave, delete the family.',
	'error.webOnly': 'This can only be done in the web app.'
};
