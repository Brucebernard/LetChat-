import React, { createContext, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

type ToastType = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90%] max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-xl text-xs font-semibold transition-all ${
              t.type === 'error'
                ? 'bg-red-950/90 text-white border-red-500/60'
                : t.type === 'success'
                ? 'bg-[#12121C]/95 text-white border-[#00E5FF]/50'
                : 'bg-[#12121C]/95 text-white border-[#7C3AED]/50'
            }`}
          >
            {t.type === 'error' ? (
              <AlertCircle size={16} className="shrink-0 text-red-400" />
            ) : t.type === 'success' ? (
              <CheckCircle2 size={16} className="shrink-0 text-[#00E5FF]" />
            ) : (
              <Info size={16} className="shrink-0 text-[#7C3AED]" />
            )}
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
