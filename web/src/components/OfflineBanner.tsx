import { useSyncExternalStore } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { isOnline, subscribeConnectivity } from '../lib/connectivity';

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}

export function OfflineBanner() {
  const t = useT();
  return useOnline() ? null : <p className="offline-banner" role="status">{t('offline.banner')}</p>;
}
