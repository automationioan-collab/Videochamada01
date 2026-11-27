import React from 'react';
import {
  Barcode,
  CreditCard,
  Landmark,
  QrCode,
  Wallet,
} from 'lucide-react';
import type { MercadoPagoPaymentMethod } from '../types/studio';

export const MERCADO_PAGO_METHOD_OPTIONS: Array<{
  id: MercadoPagoPaymentMethod;
  label: string;
  hint: string;
}> = [
  { id: 'pix', label: 'PIX', hint: 'QR Code na hora' },
  { id: 'credit_card', label: 'Crédito', hint: 'Até 12x' },
  { id: 'debit_card', label: 'Débito', hint: 'Débito online' },
  { id: 'account_money', label: 'Saldo MP', hint: 'Conta Mercado Pago' },
  { id: 'ticket', label: 'Boleto', hint: 'Banco / Lotérica' },
];

export function getMercadoPagoMethodActionLabel(
  method: MercadoPagoPaymentMethod
): string {
  switch (method) {
    case 'credit_card':
      return 'Pagar no Cartão de Crédito';
    case 'debit_card':
      return 'Pagar no Cartão de Débito';
    case 'account_money':
      return 'Pagar com Saldo Mercado Pago';
    case 'ticket':
      return 'Gerar Boleto Mercado Pago';
    case 'pix':
    default:
      return 'Gerar QR Code PIX';
  }
}

interface MercadoPagoMethodSelectorProps {
  value: MercadoPagoPaymentMethod;
  onChange: (next: MercadoPagoPaymentMethod) => void;
  mercadoPagoConfigured?: boolean;
  disabled?: boolean;
  compact?: boolean;
  theme?: 'indigo' | 'rose';
}

export const MercadoPagoMethodSelector: React.FC<
  MercadoPagoMethodSelectorProps
> = ({
  value,
  onChange,
  mercadoPagoConfigured = false,
  disabled = false,
  compact = false,
  theme = 'rose',
}) => {
  const isIndigo = theme === 'indigo';

  const renderIcon = (id: MercadoPagoPaymentMethod) => {
    const cls = 'w-3.5 h-3.5 shrink-0';
    if (id === 'credit_card') return <CreditCard className={cls} />;
    if (id === 'debit_card') return <Landmark className={cls} />;
    if (id === 'account_money') return <Wallet className={cls} />;
    if (id === 'ticket') return <Barcode className={cls} />;
    return <QrCode className={cls} />;
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={`font-medium ${
            isIndigo ? 'text-[#F8FAFC]' : 'text-[#FAF4F7]'
          }`}
        >
          Forma de pagamento · Mercado Pago
        </span>
        <span className="text-[11px] text-[#38BDF8] font-medium whitespace-nowrap">
          Meio exclusivo
        </span>
      </div>

      <div
        role="group"
        aria-label="Formas de pagamento Mercado Pago"
        className={`grid gap-2 ${
          compact
            ? 'grid-cols-2 sm:grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
        }`}
      >
        {MERCADO_PAGO_METHOD_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className={`min-w-0 px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] ${
                selected
                  ? isIndigo
                    ? 'bg-[#162252] border-[#38BDF8] text-[#F8FAFC]'
                    : 'bg-[#281837] border-[#38BDF8] text-[#FAF4F7]'
                  : isIndigo
                    ? 'bg-[#070B1E]/90 border-[#818CF8]/25 text-[#B6C2E2] hover:border-[#38BDF8]/60 hover:text-[#F8FAFC]'
                    : 'bg-[#0B060F]/90 border-[#F4C2D7]/15 text-[#C9BAC4] hover:border-[#38BDF8]/60 hover:text-[#FAF4F7]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                <span className={selected ? 'text-[#38BDF8]' : 'text-[#94A3B8]'}>
                  {renderIcon(option.id)}
                </span>
                <span className="truncate">{option.label}</span>
              </div>
              {!compact && (
                <p className="text-[10px] text-[#94A3B8] mt-0.5 truncate">
                  {option.hint}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-[#B6C2E2] leading-relaxed">
        {value === 'pix'
          ? 'PIX Instantâneo ativo: gera QR Code e Copia e Cola na hora para pagamento em segundos.'
          : mercadoPagoConfigured
            ? 'Checkout Oficial Mercado Pago ativo: pagamento seguro com retorno e liberação automática.'
            : 'Cartão, Débito, Saldo MP e Boleto exigem MERCADOPAGO_ACCESS_TOKEN nos Secrets do servidor. O pagamento via PIX funciona imediatamente.'}
      </p>
    </div>
  );
};
