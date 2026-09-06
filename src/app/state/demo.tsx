import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onlineManager } from '@tanstack/react-query';

interface DemoState {
  /** Prototype controls available (admin on a demo deployment or mock mode). */
  available: boolean;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  simulatedOffline: boolean;
  setSimulatedOffline: (v: boolean) => void;
}

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ available, children }: { available: boolean; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [simulatedOffline, setOffline] = useState(false);

  const setSimulatedOffline = useCallback((v: boolean) => {
    setOffline(v);
    onlineManager.setOnline(!v);
  }, []);

  useEffect(() => () => onlineManager.setOnline(true), []);

  const value = useMemo(
    () => ({ available, drawerOpen, setDrawerOpen, simulatedOffline, setSimulatedOffline }),
    [available, drawerOpen, simulatedOffline, setSimulatedOffline],
  );
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const v = useContext(DemoContext);
  if (!v) throw new Error('DemoProvider missing');
  return v;
}
