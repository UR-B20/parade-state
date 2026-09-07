import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyChartTheme } from '../charts/theme';

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';
const KEY = 'soldiertrack-theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

/** Stamps the root element and the browser chrome colour. Also run inline in index.html before first paint. */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#111a24' : '#ffffff');
  return resolved;
}

const ThemeContext = createContext<{ pref: ThemePref; resolved: ResolvedTheme; setPref: (p: ThemePref) => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => readThemePref());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readThemePref()));

  useEffect(() => {
    setResolved(applyTheme(pref));
    applyChartTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (pref === 'system') { setResolved(applyTheme('system')); applyChartTheme(); } };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* storage unavailable */ }
  }, []);

  const value = useMemo(() => ({ pref, resolved, setPref }), [pref, resolved, setPref]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme outside ThemeProvider');
  return ctx;
}
