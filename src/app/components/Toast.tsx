import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import './Feedback.css';

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; onClick: () => void };
}

interface ToastApi {
  show: (message: string, options?: { tone?: 'info' | 'error'; action?: ToastItem['action']; duration?: number }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi['show']>((message, options) => {
    const id = ++seq.current;
    const tone = options?.tone ?? 'info';
    setItems((list) => [...list.slice(-2), { id, message, tone, action: options?.action }]);
    const duration = options?.duration ?? (tone === 'error' ? 8000 : 3500);
    window.setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((t) => (
          <div key={t.id} className={`toast${t.tone === 'error' ? ' toast--error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            {t.action && (
              <button type="button" className="toast__action" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('ToastProvider missing');
  return api;
}
