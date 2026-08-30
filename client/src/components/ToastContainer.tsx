import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
      {toasts.map(t => {
        let borderClass = 'border-discord-blurple/50 bg-discord-blurple/10 text-discord-blurple';
        let Icon = Info;

        if (t.type === 'success') {
          borderClass = 'border-emerald-500/50 bg-emerald-950/80 text-emerald-300 dark:border-emerald-500/40';
          Icon = CheckCircle2;
        } else if (t.type === 'error') {
          borderClass = 'border-rose-500/50 bg-rose-950/80 text-rose-300 dark:border-rose-500/40';
          Icon = AlertCircle;
        } else if (t.type === 'warning') {
          borderClass = 'border-amber-500/50 bg-amber-950/80 text-amber-300 dark:border-amber-500/40';
          Icon = AlertTriangle;
        }

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in slide-in-from-bottom-5 bg-white dark:bg-discord-dark-sidebar/95 ${borderClass}`}
          >
            <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <h4 className="font-semibold text-gray-900 dark:text-white leading-tight">{t.title}</h4>
              {t.message && (
                <p className="mt-1 text-gray-600 dark:text-gray-300 text-xs leading-relaxed">{t.message}</p>
              )}
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
