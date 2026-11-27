import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Barcode,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  Landmark,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import type {
  MercadoPagoPaymentMethod,
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

const METHOD_META: Record<
  MercadoPagoPaymentMethod,
  { label: string; shortLabel: string; description: string }
> = {
  pix: {
    label: 'PIX Instantâneo · Mercado Pago',
    shortLabel: 'PIX',
    description:
      'Escaneie o QR Code ou utilize o PIX Copia e Cola no aplicativo do seu banco.',
  },
  credit_card: {
    label: 'Cartão de Crédito · Mercado Pago',
    shortLabel: 'Cartão de Crédito',
    description:
      'Pague com segurança no Checkout Oficial Mercado Pago com parcelamento no cartão.',
  },
  debit_card: {
    label: 'Cartão de Débito · Mercado Pago',
    shortLabel: 'Cartão de Débito',
    description:
      'Conclua com cartão de débito no ambiente oficial criptografado do Mercado Pago.',
  },
  account_money: {
    label: 'Saldo Mercado Pago · Checkout Oficial',
    shortLabel: 'Saldo Mercado Pago',
    description:
      'Entre com sua conta Mercado Pago e pague usando saldo em conta ou linha de crédito.',
  },
  ticket: {
    label: 'Boleto / Lotérica · Mercado Pago',
    shortLabel: 'Boleto / Lotérica',
    description:
      'Gere o boleto bancário ou código de pagamento em lotérica pelo Checkout Mercado Pago.',
  },
};

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
  confirmLabel,
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
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localCharge, setLocalCharge] = useState<PixChargeRecord | null>(charge);

  // Keep latest callbacks in refs so polling & key listeners never tear down on parent re-renders
  const onCloseRef = useRef(onClose);
  const onCheckStatusRef = useRef(onCheckStatus);
  const onPaidRef = useRef(onPaid);
  onCloseRef.current = onClose;
  onCheckStatusRef.current = onCheckStatus;
  onPaidRef.current = onPaid;

  useEffect(() => {
    setLocalCharge(charge);
    setCopied(false);
    setFeedbackError(null);
    setPendingNotice(null);
    setNowMs(Date.now());
  }, [charge]);

  useEffect(() => {
    if (!localCharge) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) {
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, localCharge?.id]);

  useEffect(() => {
    if (!localCharge || localCharge.status !== 'pending') return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [localCharge?.id, localCharge?.status]);

  // Live polling for Mercado Pago / Admin PIX approval
  useEffect(() => {
    if (!localCharge || localCharge.status !== 'pending') return;
    const chargeId = localCharge.id;
    const modelId = localCharge.modelId;
    let active = true;
    const poll = window.setInterval(() => {
      void onCheckStatusRef.current(modelId, chargeId).then((res) => {
        if (!active) return;
        if (res.charge) {
          setLocalCharge(res.charge);
          if (res.charge.status === 'paid') {
            void onPaidRef.current(res);
          }
        }
      });
    }, 3500);

    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [localCharge?.id, localCharge?.modelId, localCharge?.status]);

  if (!localCharge) return null;

  const activeMethod: MercadoPagoPaymentMethod =
    localCharge.preferredPaymentMethod || 'pix';
  const isCheckoutMethod = activeMethod !== 'pix';
  const methodInfo = METHOD_META[activeMethod] || METHOD_META.pix;

  const remainingMs = Math.max(0, localCharge.expiresAt - nowMs);
  const isExpired =
    localCharge.status === 'expired' ||
    (localCharge.status === 'pending' && remainingMs <= 0);
  const isPaid = localCharge.status === 'paid';

  const resolvedConfirmLabel =
    confirmLabel ||
    (isCheckoutMethod
      ? 'Já Paguei no Mercado Pago · Verificar e Liberar'
      : 'Já Paguei via PIX · Confirmar e Liberar');

  const handleCopyBrCode = async () => {
    try {
      await navigator.clipboard.writeText(localCharge.brCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch {
      setFeedbackError(
        'Não foi possível copiar automaticamente. Selecione e copie o código abaixo.'
      );
    }
  };

  const handleConfirm = async () => {
    if (confirming || isExpired || isPaid) return;
    setConfirming(true);
    setFeedbackError(null);
    setPendingNotice(null);
    try {
      const res = await onConfirmPayment(localCharge.modelId, localCharge.id);
      if (res.charge) {
        setLocalCharge(res.charge);
      }
      if (res.ok && res.charge?.status === 'paid') {
        await onPaidRef.current(res);
      } else if (res.pending) {
        setPendingNotice(
          res.error ||
            'Aviso de pagamento enviado! Aguarde a confirmação oficial — esta tela atualiza automaticamente.'
        );
      } else {
        setFeedbackError(
          res.error ||
            'Ainda não recebemos a confirmação do pagamento. Tente novamente em instantes.'
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
    onCloseRef.current();
  };

  const renderHeaderIcon = () => {
    if (activeMethod === 'credit_card') {
      return <CreditCard className="w-4 h-4 text-[#38BDF8]" />;
    }
    if (activeMethod === 'debit_card') {
      return <Landmark className="w-4 h-4 text-[#38BDF8]" />;
    }
    if (activeMethod === 'account_money') {
      return <Wallet className="w-4 h-4 text-[#38BDF8]" />;
    }
    if (activeMethod === 'ticket') {
      return <Barcode className="w-4 h-4 text-[#38BDF8]" />;
    }
    return <QrCode className="w-4 h-4 text-[#38BDF8]" />;
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pix-modal-title"
      className="fixed inset-0 z-[120] bg-[#040611]/88 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="max-w-lg w-full luxury-card border border-[#38BDF8]/35 rounded-3xl overflow-hidden shadow-[0_24px_80px_-20px_rgba(56,189,248,0.35)] my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#818CF8]/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#0EA5E9]/15 border border-[#38BDF8]/35 flex items-center justify-center shrink-0">
              {renderHeaderIcon()}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-[#38BDF8] truncate">
                {methodInfo.label}
              </p>
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
            aria-label="Fechar janela de pagamento Mercado Pago"
            className="p-2 rounded-full bg-[#0A0F24] border border-[#818CF8]/25 text-[#B6C2E2] hover:text-[#F8FAFC] hover:border-[#38BDF8]/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Amount & Countdown */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl bg-[#070B1E]/90 border border-[#818CF8]/25">
            <div>
              <p className="text-[11px] text-[#94A3B8]">
                Valor ({methodInfo.shortLabel})
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

          {isPaid ? (
            <div className="p-6 rounded-2xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-[#86EFAC] mx-auto" />
              <p className="text-sm font-semibold text-[#F8FAFC]">
                Pagamento Confirmado via Mercado Pago!
              </p>
              <p className="text-xs text-[#B6C2E2]">
                Seu acesso está sendo liberado automaticamente.
              </p>
            </div>
          ) : isCheckoutMethod ? (
            /* Checkout Pro Dedicated Flow for Cartão de Crédito, Débito, Saldo MP, Boleto */
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-[#0B1433]/90 border border-[#38BDF8]/40 space-y-4">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#F8FAFC]">
                    Checkout Oficial Mercado Pago · {methodInfo.shortLabel}
                  </p>
                  <p className="text-xs text-[#B6C2E2] leading-relaxed">
                    {methodInfo.description}
                  </p>
                </div>

                {localCharge.checkoutUrl && !isExpired && (
                  <a
                    href={localCharge.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-xs font-semibold rounded-full bg-[#009EE3] hover:bg-[#008ED0] text-white shadow-[0_10px_28px_-10px_rgba(0,158,227,0.7)] transition-colors whitespace-nowrap"
                  >
                    <span>
                      Pagar com {methodInfo.shortLabel} no Mercado Pago
                    </span>
                    <ExternalLink className="w-4 h-4 shrink-0" />
                  </a>
                )}

                <div className="flex flex-col items-center gap-2 pt-2 border-t border-[#818CF8]/20">
                  <p className="text-[11px] text-[#94A3B8] text-center">
                    Ou escaneie com a câmera do celular para abrir o Checkout no telefone:
                  </p>
                  <div className="p-2.5 rounded-xl bg-white">
                    <img
                      src={localCharge.qrCodeDataUrl}
                      alt={`QR Code Checkout Mercado Pago para ${methodInfo.shortLabel}`}
                      className={`w-36 h-36 object-contain ${
                        isExpired ? 'opacity-25 blur-[2px]' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* PIX QR Code + Copia e Cola + Optional Checkout Pro Link */
            <>
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

              {/* Pix Copia e Cola */}
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

              {/* Secondary Checkout Pro shortcut when Mercado Pago Token is active */}
              {!isExpired && localCharge.checkoutUrl && (
                <div className="p-4 rounded-2xl bg-[#0B1433]/90 border border-[#38BDF8]/35 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#F8FAFC]">
                    <CreditCard className="w-4 h-4 text-[#38BDF8] shrink-0" />
                    <span>Prefere Cartão, Débito, Saldo MP ou Boleto?</span>
                  </div>
                  <p className="text-[11px] text-[#B6C2E2]">
                    Abra o Checkout Oficial do Mercado Pago com todos os meios habilitados na conta e volte aqui para liberação automática.
                  </p>
                  <a
                    href={localCharge.checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-full bg-[#009EE3]/20 border border-[#009EE3]/60 text-[#E0F2FE] hover:bg-[#009EE3]/30 transition-colors whitespace-nowrap"
                  >
                    <span>Abrir Checkout Mercado Pago (Cartão, Débito, Saldo, Boleto)</span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              )}
            </>
          )}

          {/* Beneficiary metadata */}
          <div className="px-4 py-3 rounded-xl bg-[#070B1E]/75 border border-[#818CF8]/15 text-[11px] text-[#B6C2E2] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span>Beneficiário:</span>
              <span className="font-medium text-[#F8FAFC]">
                {localCharge.merchantName} · {localCharge.merchantCity}
              </span>
            </div>
            {!isCheckoutMethod && (
              <div className="flex items-center justify-between gap-2">
                <span>Chave PIX:</span>
                <span className="font-mono text-[#E2E8F0]">
                  {localCharge.pixKeyMasked}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5 pt-1 text-[#94A3B8]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
              <span>
                {localCharge.provider === 'mercadopago'
                  ? 'Mercado Pago ativo: verificação automática via PIX ou Checkout Pro em tempo real.'
                  : `PIX direto para a chave oficial da modelo (${localCharge.pixKeyMasked}). A confirmação automática e Cartão/Checkout Mercado Pago ativam ao configurar MERCADOPAGO_ACCESS_TOKEN nos Secrets.`}
              </span>
            </div>
          </div>

          {pendingNotice && (
            <div
              role="status"
              className="p-3 rounded-xl bg-[#0EA5E9]/15 border border-[#38BDF8]/40 text-xs text-[#E0F2FE]"
            >
              {pendingNotice}
            </div>
          )}

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
                    {regenerating ? 'Gerando nova cobrança...' : 'Gerar Nova Cobrança'}
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
                    {confirming ? 'Verificando pagamento...' : resolvedConfirmLabel}
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

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
