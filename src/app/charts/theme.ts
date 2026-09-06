/**
 * Chart.js setup shared by every chart: only the pieces we use are registered, and the
 * defaults follow the app's tokens (Inter, ink greys, hairline gridlines, white tooltips).
 */
import {
  ArcElement, BarController, BarElement, CategoryScale, Chart, DoughnutController, Filler, Legend,
  LineController, LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js';

export function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export const ink = () => cssVar('--text', '#172b43');
export const ink2 = () => cssVar('--text-2', '#627085');
export const ink3 = () => cssVar('--text-3', '#8a96a8');
export const line = () => cssVar('--line', '#e3e8ef');
export const lineStrong = () => cssVar('--line-strong', '#cbd3de');
export const surface = () => cssVar('--surface', '#ffffff');

export const STATUS_COLOR: Record<string, () => string> = {
  PRESENT: () => cssVar('--present', '#087969'),
  MC: () => cssVar('--mc', '#b63b4a'),
  LL: () => cssVar('--ll', '#8a5c12'),
  MA: () => cssVar('--ma', '#2b67a9'),
  RSI: () => cssVar('--rsi', '#ac4a32'),
  OTHERS: () => cssVar('--others', '#637181'),
  UNMARKED: () => cssVar('--line-strong', '#cbd3de'),
};

export const TONE_COLOR = {
  ok: () => cssVar('--ok', '#1f7a46'),
  warn: () => cssVar('--warn', '#8a5c12'),
  danger: () => cssVar('--danger', '#b63b4a'),
  primary: () => cssVar('--primary', '#2856cf'),
};

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Hex + alpha (0..1) to an rgba() string, for area washes. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

let registered = false;
export function ensureCharts(): void {
  if (registered) return;
  registered = true;
  Chart.register(ArcElement, BarController, BarElement, CategoryScale, DoughnutController, Filler, Legend, LineController, LineElement, LinearScale, PointElement, Tooltip);
  Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = ink2();
  Chart.defaults.borderColor = line();
  Chart.defaults.animation = prefersReducedMotion() ? false : { duration: 320, easing: 'easeOutQuart' };
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: surface(),
    titleColor: ink(),
    bodyColor: ink(),
    footerColor: ink2(),
    borderColor: line(),
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    boxPadding: 4,
    boxWidth: 8,
    boxHeight: 8,
    usePointStyle: true,
    titleFont: { weight: 600 },
    bodyFont: { size: 12 },
  });
}

ensureCharts();
