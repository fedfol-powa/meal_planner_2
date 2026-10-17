export type AlertEvent = 'weekly_job_overdue' | 'weekly_job_abandoned' | 'backup_export_missing' | 'account_deletion_overdue' | 'ops_alert_test';

export type AlertDetails = Record<string, string | number | null>;

const PREFIX = '[Cosa si mangia]';

const TITLES: Record<AlertEvent, string> = {
	weekly_job_overdue: 'Menu in ritardo per una famiglia',
	weekly_job_abandoned: 'Menu abbandonato per una famiglia',
	backup_export_missing: 'Esportazione notturna mancante',
	account_deletion_overdue: 'Cancellazione di un account bloccata',
	ops_alert_test: 'Prova degli allarmi',
};

/**
 * Subject and plain-text body of an alert (spec W15, section 5), computed once at creation and
 * stored in the row. `details` holds ids, codes, numbers and dates only: never an address or a name.
 */
export function alertMessage(event: AlertEvent, _key: string, details: AlertDetails, createdAt: Date): { subject: string; body: string } {
	const title = TITLES[event];
	const lines = [title, ...Object.entries(details).map(([field, value]) => `${field}: ${value ?? ''}`), `Creato il ${utc(createdAt)}`, `Dettagli nei log del Worker (evento ${event})`];
	return { subject: `${PREFIX} ${title}`, body: lines.join('\n') };
}

function utc(date: Date): string {
	return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}
