import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, type Locale, type MessageKey, type MessageParams } from './translate';

interface LocaleContextValue {
  locale: Locale;
  /** Which language applies (device, browser, profile, per-user choice) is decided by the session. */
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initial);

  useEffect(() => {
    document.documentElement.lang = locale === 'it-IT' ? 'it' : 'en-GB';
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('useLocale outside LocaleProvider');
  return value;
}

export function useT() {
  const { locale } = useLocale();
  return useCallback((key: MessageKey, params?: MessageParams) => translate(locale, key, params), [locale]);
}
