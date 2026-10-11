import { createContext, useContext, type ReactNode } from 'react';
import type { Api } from './types';

const ApiContext = createContext<Api | null>(null);

/** Screens get the client from context, never by import, so tests and wave 2 can swap it. */
export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi outside ApiProvider');
  return api;
}
