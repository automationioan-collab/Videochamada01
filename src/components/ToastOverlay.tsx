import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  ShieldAlert,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';

export type ToastVariant =
  | 'user_joined'
  | 'user_left'
  | 'call_accepted'
  | 'info'
  | 'warning';

export interface StudioToast {
  id: string;
  variant: ToastVariant;
  title: string;
  message: string;
  timestamp: string;
}

interface ToastOverlayProps {
  toasts: StudioToast[];
  onDismiss: (id: string) => void;
}

const VARIANT_CONFIG: Record<
  ToastVariant,
  {
    icon: React.ComponentType<{ className?: string }>;
    iconColor: string;
    labelColor: string;
  }
> = {
  user_joined: {
    icon: UserPlus,
    iconColor: 'text-[#86EFAC]',
    labelColor: 'text-[#86EFAC]',
  },
  user_left: {
    icon: UserMinus,
    iconColor: 'text-[#938291]',
    labelColor: 'text-[#938291]',
  },
  call_accepted: {
    icon: CheckCircle2,
    iconColor: 'text-[#F4C2D7]',
    labelColor: 'text-[#F4C2D7]',
  },
  info: {
    icon: CheckCircle2,
    iconColor: 'text-[#F8D6E3]',
    labelColor: 'text-[#F8D6E3]',
  },
  warning: {
    icon: ShieldAlert,
    iconColor: 'text-[#FCA5A5]',
    labelColor: 'text-[#FCA5A5]',
  },
};

export const ToastOverlay: React.FC<ToastOverlayProps> = ({
  toasts,
  onDismiss,
}) => {
  return (
    <div
      aria-live="polite"
      aria-label="Notificações em tempo real"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 w-[calc(100vw-2.5rem)] max-w-sm pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const config = VARIANT_CONFIG[toast.variant];
          const Icon = config.icon;

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              role="status"
              className="pointer-events-auto bg-[#150D1D]/95 backdrop-blur-md border border-[#F4C2D7]/25 rounded-2xl p-4 shadow-xl flex items-start gap-3"
            >
              <div className="pt-0.5 shrink-0">
                <Icon className={`w-4 h-4 ${config.iconColor}`} />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-semibold ${config.labelColor}`}>
                    {toast.title}
                  </p>
                  <span className="text-[11px] font-mono tabular-nums text-[#938291] shrink-0">
                    {toast.timestamp}
                  </span>
                </div>
                <p className="text-xs text-[#C9BAC4] leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Fechar notificação"
                className="p-1 -mr-1 -mt-1 rounded-full text-[#938291] hover:text-[#FAF4F7] hover:bg-[#FAF4F7]/5 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
