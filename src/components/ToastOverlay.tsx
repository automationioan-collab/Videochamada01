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
    iconColor: 'text-[#9BA1AE]',
    labelColor: 'text-[#9BA1AE]',
  },
  call_accepted: {
    icon: CheckCircle2,
    iconColor: 'text-[#E2C799]',
    labelColor: 'text-[#E2C799]',
  },
  info: {
    icon: CheckCircle2,
    iconColor: 'text-[#C9A46B]',
    labelColor: 'text-[#C9A46B]',
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
              className="pointer-events-auto bg-[#13151A]/95 backdrop-blur-md border border-white/15 rounded-xl p-4 shadow-xl flex items-start gap-3"
            >
              <div className="pt-0.5 shrink-0">
                <Icon className={`w-4 h-4 ${config.iconColor}`} />
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs font-semibold ${config.labelColor}`}>
                    {toast.title}
                  </p>
                  <span className="text-[11px] font-mono tabular-nums text-[#727988] shrink-0">
                    {toast.timestamp}
                  </span>
                </div>
                <p className="text-xs text-[#E5E2DC] leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Fechar notificação"
                className="p-1 -mr-1 -mt-1 rounded-md text-[#727988] hover:text-[#F3EFE6] hover:bg-white/5 transition-colors cursor-pointer shrink-0"
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
