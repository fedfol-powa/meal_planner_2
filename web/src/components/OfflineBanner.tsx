import { useSyncExternalStore } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { isOnline, subscribeConnectivity } from '../lib/connectivity';

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOnline, () => true);
}

/** Offline the app is read-only, except the shopping list and its queue (spec, «Spesa offline con sessione non verificata»). */
export function offlineMessageKey(pathname: string): 'offline.banner' | 'offline.bannerShopping' {
  return pathname.startsWith('/shopping/') ? 'offline.bannerShopping' : 'offline.banner';
}

export function OfflineBanner({ pathname }: { pathname: string }) {
  const t = useT();
  return useOnline() ? null : <p className="offline-banner" role="status">{t(offlineMessageKey(pathname))}</p>;
}
