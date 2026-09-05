import { createContext, useContext, type ReactNode } from 'react';
import type { ConfigDto } from '@shared/types';

const ConfigContext = createContext<ConfigDto | null>(null);

export function ConfigProvider({ config, children }: { config: ConfigDto; children: ReactNode }) {
  return <ConfigContext.Provider value={config}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigDto {
  const c = useContext(ConfigContext);
  if (!c) throw new Error('ConfigProvider missing');
  return c;
}
