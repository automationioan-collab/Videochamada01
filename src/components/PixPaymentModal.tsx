import React, { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  PixChargeRecord,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
  StudioState,
} from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export interface PixConfirmationResponse {
  ok: boolean;
  pending?: boolean;
  charge?: PixChargeRecord;
  albumToken?: string;
  items?: PrivateAlbumItemRecord[];
  summary?: PrivateAlbumSummary;
  studioState?: StudioState;
  callRequestId?: string;
  error?: string;
}

interface PixPaymentModalProps {
  charge: PixChargeRecord | null;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  onClose: () => void;
  onCancelCharge?: (modelId: string, chargeId: string) => Promise<void>;
  onCheckStatus: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onConfirmPayment: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onRegenerate?: () => Promise<void>;
  onPaid: (result: PixConfirmationResponse) => void | Promise<void>;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return '00:00';
  const totalSec = Math.ceil(remainingMs / 1000);
  const mins = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSec % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export const PixPaymentModal: React.FC<PixPaymentModalProps> = ({
  charge,
  title,
  subtitle,
  confirmLabel = 'Já Paguei via PIX · Confirmar e Liberar',
  onClose,
  onCancelCharge,
  onCheckStatus,
  onConfirmPayment,
  onRegenerate,
  onPaid,
}) => {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localCharge, setLocalCharge] = useState<PixChargeRecord | null>(charge);

  useEffect(() => {
    setLocalCharge(charge);
    setCopied(false);
    setFeedbackError(null);
    setNowMs(Date.now());
  }, [charge]);

  useEffect(() => {
    if (!localCharge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, localCharge, onClose]);

  useEffect(() => {
    if (!localCharge || localCharge.status !== 'pending') return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [localCharge]);

  // Live polling for PSP / Admin PIX approval
  useEffect(() => {
    if (!localCharge || localCharge.status !== 'pending') return;
    let active = true;
    const poll = window.setInterval(() => {
      void onCheckStatus(localCharge.modelId, localCharge.id).then((res) => {
        if (!active) return;
        if (res.charge) {
          setLocalCharge(res.charge);
          if (res.charge.status === 'paid') {
            void onPaid(res);
          }
        }
      });
    }, 3500);

    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [localCharge, onCheckStatus, onPaid]);

  if (!localCharge) return null;

  const remainingMs = Math.max(0, localCharge.expiresAt - nowMs);
  const isExpired =
    localCharge.status === 'expired' ||
    (localCharge.status === 'pending' && remainingMs <= 0);
  const isPaid = localCharge.status === 'paid';

  const handleCopyBrCode = async () => {
    try {
      await navigator.clipboard.writeText(localCharge.brCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setFeedbackError(
        'Não foi possível copiar automaticamente. Selecione e copie o código PIX abaixo.'
      );
    }
  };

  const handleConfirm = async () => {
    if (confirming || isExpired || isPaid) return;
    setConfirming(true);
    setFeedbackError(null);
    try {
      const res = await onConfirmPayment(localCharge.modelId, localCharge.id);
      if (res.charge) {
        setLocalCharge(res.charge);
      }
      if (res.ok && res.charge?.status === 'paid') {
        await onPaid(res);
      } else {
        setFeedbackError(
          res.error ||
            'Ainda não recebemos a confirmação do PIX. Tente novamente em instantes.'
        );
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleRegenerateClick = async () => {
    if (!onRegenerate || regenerating) return;
    setRegenerating(true);
    setFeedbackError(null);
    try {
      await onRegenerate();
    } finally {
      setRegenerating(false);
    }
  };

  const handleCancelAndClose = async () => {
    if (localCharge.status === 'pending' && onCancelCharge) {
      await onCancelCharge(localCharge.modelId, localCharge.id);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pix-modal-title"
      className="fixed inset-0 z-50 bg-[#040611]/88 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="max-w-lg w-full luxury-card border border-[#38BDF8]/35 rounded-3xl overflow-hidden shadow-[0_24px_80px_-20px_rgba(56,189,248,0.35)] my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#818CF8]/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0EA5E9]/15 border border-[#38BDF8]/35 flex items-center justify-center shrink-0">
              <QrCode className="w-4 h-4 text-[#38BDF8]" />
            </div>
            <div className="min-w-0">
              <h3
                id="pix-modal-title"
                className="font-display text-lg sm:text-xl font-bold text-[#F8FAFC] truncate"
              >
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-[#B6C2E2] truncate">{subtitle}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleCancelAndClose()}
            aria-label="Fechar janela de pagamento PIX"
            className="p-2 rounded-full bg-[#0A0F24] border border-[#818CF8]/25 text-[#B6C2E2] hover:text-[#F8FAFC] hover:border-[#38BDF8]/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount & Countdown */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl bg-[#070B1E]/90 border border-[#818CF8]/25">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8]">
                Valor do PIX
              </p>
              <p className="font-display text-2xl font-bold tabular-nums text-[#38BDF8]">
                {BRL_FORMATTER.format(localCharge.amountCents / 100)}
              </p>
            </div>

            <div className="text-right">
              <p className="text-[11px] text-[#94A3B8] inline-flex items-center gap-1 justify-end">
                <Clock3 className="w-3 h-3 text-[#38BDF8]" />
                <span>{isExpired ? 'Expirado' : 'Expira em'}</span>
              </p>
              <p
                className={`font-mono text-lg font-semibold tabular-nums ${
                  isExpired ? 'text-[#FCA5A5]' : 'text-[#F8FAFC]'
                }`}
              >
                {formatCountdown(remainingMs)}
              </p>
            </div>
          </div>

          {/* Scannable QR Code */}
          {isPaid ? (
            <div className="p-6 rounded-2xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-[#86EFAC] mx-auto" />
              <p className="text-sm font-semibold text-[#F8FAFC]">
                Pagamento PIX Confirmado!
              </p>
              <p className="text-xs text-[#B6C2E2]">
                Seu acesso está sendo liberado automaticamente.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-white shadow-[0_0_32px_rgba(56,189,248,0.22)]">
                <img
                  src={localCharge.qrCodeDataUrl}
                  alt={`QR Code PIX no valor de ${BRL_FORMATTER.format(
                    localCharge.amountCents / 100
                  )}`}
                  className={`w-52 h-52 sm:w-56 sm:h-56 object-contain ${
                    isExpired ? 'opacity-25 blur-[2px]' : ''
                  }`}
                />
              </div>
              <p className="text-xs text-center text-[#B6C2E2] max-w-sm">
                Abra o aplicativo do seu banco, escolha{' '}
                <strong className="text-[#F8FAFC]">Pagar com PIX &gt; Ler QR Code</strong>{' '}
                ou copie o código abaixo em{' '}
                <strong className="text-[#F8FAFC]">Pix Copia e Cola</strong>.
              </p>
            </div>
          )}

          {/* Pix Copia e Cola */}
          {!isPaid && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-[#B6C2E2]">
                <span className="font-semibold text-[#F8FAFC]">
                  PIX Copia e Cola (EMV)
                </span>
                <span className="font-mono text-[#94A3B8]">
                  TXID: {localCharge.txid}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  readOnly
                  value={localCharge.brCode}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Código PIX Copia e Cola"
                  className="flex-1 bg-[#070B1E] border border-[#818CF8]/25 rounded-xl px-3.5 py-2.5 text-[11px] font-mono text-[#E2E8F0] focus:outline-none focus:border-[#38BDF8]"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyBrCode()}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl bg-[#131C42] border border-[#38BDF8]/40 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#86EFAC]" />
                      <span className="text-[#86EFAC]">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#38BDF8]" />
                      <span>Copiar Código PIX</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Beneficiary metadata */}
          <div className="px-4 py-3 rounded-xl bg-[#070B1E]/75 border border-[#818CF8]/15 text-[11px] text-[#B6C2E2] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span>Beneficiário:</span>
              <span className="font-medium text-[#F8FAFC]">
                {localCharge.merchantName} · {localCharge.merchantCity}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span>Chave PIX:</span>
              <span className="font-mono text-[#E2E8F0]">
                {localCharge.pixKeyMasked}
              </span>
            </div>
            <div className="flex items-center gap-1.5 pt-1 text-[#94A3B8]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
              <span>
                {localCharge.provider === 'mercadopago'
                  ? 'Verificação bancária automática em tempo real ativa.'
                  : localCharge.usingDemoKey
                    ? 'QR Code padrão BACEN do estúdio ativo. Confirme após o pagamento.'
                    : 'QR Code BACEN válido gerado com a chave oficial da modelo.'}
              </span>
            </div>
          </div>

          {feedbackError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
            >
              {feedbackError}
            </div>
          )}

          {/* Actions */}
          {!isPaid && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
              {isExpired && onRegenerate ? (
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={() => void handleRegenerateClick()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold rounded-full luxury-rose-cta transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {regenerating ? 'Gerando novo QR Code...' : 'Gerar Novo QR Code PIX'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={confirming || isExpired}
                  onClick={() => void handleConfirm()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold rounded-full luxury-rose-cta transition-all cursor-pointer disabled:opacity-50"
                >
                  {confirming ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>
                    {confirming ? 'Verificando pagamento...' : confirmLabel}
                  </span>
                </button>
              )}

              <button
                type="button"
                disabled={confirming}
                onClick={() => void handleCancelAndClose()}
                className="px-4 py-3 text-xs font-medium rounded-full bg-[#0A0F24] border border-[#818CF8]/25 text-[#B6C2E2] hover:text-[#F8FAFC] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
