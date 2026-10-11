import type { ErrorCode, Locale } from '@app/contract';

/** Texts of the error codes, used only for MCP: the web app translates codes itself. */
export const messages: Record<ErrorCode, Record<Locale, string>> = {
	unauthorized: {
		'it-IT': 'Accesso non valido o scaduto: collega di nuovo l’agente.',
		'en-GB': 'Access is invalid or has expired: connect the agent again.',
	},
	forbidden: {
		'it-IT': 'Non hai i permessi per questa operazione.',
		'en-GB': 'You do not have permission for this operation.',
	},
	not_found: { 'it-IT': 'Elemento non trovato.', 'en-GB': 'Item not found.' },
	invalid: {
		'it-IT': 'Alcuni dati non sono validi: controlla i campi indicati.',
		'en-GB': 'Some data is not valid: check the fields listed.',
	},
	conflict: {
		'it-IT': 'Qualcun altro ha modificato questi dati nel frattempo: guarda chi e cosa ha cambiato prima di riprovare.',
		'en-GB': 'Someone else changed this data in the meantime: check who changed what before trying again.',
	},
	not_allowed: {
		'it-IT': 'Operazione non consentita nello stato attuale.',
		'en-GB': 'This operation is not allowed in the current state.',
	},
	last_admin: {
		'it-IT': 'La famiglia deve avere almeno un amministratore.',
		'en-GB': 'The family must have at least one administrator.',
	},
	last_app_admin: {
		'it-IT': 'L’app deve avere almeno un amministratore.',
		'en-GB': 'The app must have at least one administrator.',
	},
	sole_member: {
		'it-IT': 'Sei l’unico membro: questa operazione eliminerebbe la famiglia.',
		'en-GB': 'You are the only member: this operation would delete the family.',
	},
	web_only: {
		'it-IT': 'Questa operazione si completa solo nell’app: apri il collegamento indicato.',
		'en-GB': 'This operation can only be completed in the app: open the link provided.',
	},
	internal: {
		'it-IT': 'Si è verificato un errore imprevisto. Riprova più tardi.',
		'en-GB': 'An unexpected error occurred. Please try again later.',
	},
};

export function messageFor(code: ErrorCode, locale: Locale): string {
	return messages[code][locale];
}
