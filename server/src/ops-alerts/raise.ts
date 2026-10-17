import type postgres from 'postgres';
import { logEvent } from '../log.ts';
import { deliverAlerts, insertAlert, type AlertDetails, type AlertEnv, type AlertEvent } from './index.ts';

/** Where a raised alert is delivered at once: the Worker env, and a transport for the tests. */
export interface AlertDelivery {
	env: AlertEnv;
	fetch?: typeof fetch;
}

/**
 * An immediate hook (spec W15, section 5): records the alert in its own transaction and, only when
 * the row is new, runs a delivery round. Never throws: the work that raised it confirms its own state
 * whatever happens here. Without `delivery` the row waits for the hourly delivery.
 */
export async function raiseAlert(sql: postgres.Sql, alert: { event: AlertEvent; key: string; details: AlertDetails }, delivery?: AlertDelivery): Promise<void> {
	try {
		if ((await insertAlert(sql, alert)) && delivery) await deliverAlerts(sql, delivery.env, { fetch: delivery.fetch });
	} catch {
		logEvent('ops_alert_hook_failed', { alert: alert.event }, 'error');
	}
}
