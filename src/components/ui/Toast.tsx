import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type ToastVariant = 'error' | 'warning' | 'success' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
}

// Variant configuration — colors and icons for each toast type

interface VariantStyle {
  border: string;
  titleColor: string;
  barColor: string;
  icon: React.ReactNode;
}

const VARIANTS: Record<ToastVariant, VariantStyle> = {
  error: {
    border: 'border-red-500/40',
    titleColor: 'text-red-400',
    barColor: 'bg-red-500/40',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="6.5" stroke="#f87171" strokeWidth="1.5"/>
        <path d="M7.5 4.5V8M7.5 10.5V11" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  warning: {
    border: 'border-amber-500/40',
    titleColor: 'text-amber-400',
    barColor: 'bg-amber-500/40',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <path d="M7.5 1.5L13.5 12.5H1.5L7.5 1.5Z" stroke="#fbbf24" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M7.5 6V9M7.5 11V11.5" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  success: {
    border: 'border-emerald-500/40',
    titleColor: 'text-emerald-400',
    barColor: 'bg-emerald-500/40',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="6.5" stroke="#34d399" strokeWidth="1.5"/>
        <path d="M4.5 7.5L6.5 9.5L10.5 5.5" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  info: {
    border: 'border-violet-500/40',
    titleColor: 'text-violet-300',
    barColor: 'bg-violet-500/40',
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
        <circle cx="7.5" cy="7.5" r="6.5" stroke="#a78bfa" strokeWidth="1.5"/>
        <path d="M7.5 7V11M7.5 4.5V5" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
};

// Single toast card

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const style = VARIANTS[toast.variant];
  const duration = toast.duration ?? 6000;

  useEffect(() => {
    if (duration === 0) return;
    const t = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onDismiss]);

  return (
    <motion.div
      layout
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={[
        'w-full max-w-[340px] rounded-2xl border px-4 py-3',
        'bg-[#111118] shadow-xl shadow-black/40',
        style.border,
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${style.titleColor}`}>{toast.title}</p>
          {toast.message && (
            <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">{toast.message}</p>
          )}
        </div>
        <button
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss"
          className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      {duration > 0 && (
        <motion.div
          className={`mt-2.5 h-0.5 rounded-full ${style.barColor}`}
          initial={{ scaleX: 1, originX: 0 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: duration / 1000, ease: 'linear' }}
        />
      )}
    </motion.div>
  );
}

// Container component that renders a list of toasts in the bottom-right corner
export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 items-end pointer-events-none"
    >
      <AnimatePresence mode="sync">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastCard toast={t} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// useToast hook
export interface ToastAPI {
  error:   (title: string, message?: string, duration?: number) => void;
  warning: (title: string, message?: string, duration?: number) => void;
  success: (title: string, message?: string, duration?: number) => void;
  info:    (title: string, message?: string, duration?: number) => void;
  dismiss: (id: string) => void;
  toasts:  ToastItem[];
}

export function useToast(): ToastAPI {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((
    variant: ToastVariant, title: string, message?: string, duration?: number
  ) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, variant, title, message, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return {
    error:   (t, m, d) => add('error',   t, m, d),
    warning: (t, m, d) => add('warning', t, m, d),
    success: (t, m, d) => add('success', t, m, d),
    info:    (t, m, d) => add('info',    t, m, d),
    dismiss,
    toasts,
  };
}
