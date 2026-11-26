import React, { useState } from 'react';
import { CheckCircle2, Gift, QrCode, Target, Users } from 'lucide-react';
import { PixPaymentModal, type PixConfirmationResponse } from './PixPaymentModal';
import type { PixChargeKind, PixChargeRecord, StudioState } from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const PRESET_TIPS_CENTS = [1000, 2500, 5000, 10000];

interface TipGoalProgressCardProps {
  modelId: string;
  modelName: string;
  studioState: StudioState | null;
  isAuthenticated: boolean;
  compact?: boolean;
  onSendTip?: (
    modelId: string,
    input: {
      amountCents: number;
      paymentMethod: 'pix' | 'card';
      message?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onCreatePixCharge?: (input: {
    modelId: string;
    kind: PixChargeKind;
    amountCents?: number;
    planId?: string;
    topic?: string;
    callMode?: 'group' | 'private';
    note?: string;
  }) => Promise<{ ok: boolean; charge?: PixChargeRecord; error?: string }>;
  onCheckPixCharge?: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onConfirmPixCharge?: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onCancelPixCharge?: (modelId: string, chargeId: string) => Promise<void>;
  onRequireAuth?: () => void;
}

export const TipGoalProgressCard: React.FC<TipGoalProgressCardProps> = ({
  modelId,
  modelName,
  studioState,
  isAuthenticated,
  compact = false,
  onSendTip,
  onCreatePixCharge,
  onCheckPixCharge,
  onConfirmPixCharge,
  onCancelPixCharge,
  onRequireAuth,
}) => {
  const [selectedCents, setSelectedCents] = useState<number>(2500);
  const [customReais, setCustomReais] = useState<string>('');
  const paymentMethod = 'pix' as const;
  const [note, setNote] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [activePixCharge, setActivePixCharge] = useState<PixChargeRecord | null>(
    null
  );
  const [pendingPixTip, setPendingPixTip] = useState<{
    amountCents: number;
    note?: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  if (!studioState?.tipGoalEnabled) return null;

  const title = studioState.tipGoalTitle || 'Meta Especial do Estúdio';
  const description = studioState.tipGoalDescription || '';
  const targetCents = Math.max(500, studioState.tipGoalTargetCents || 30000);
  const currentCents = Math.max(0, studioState.tipGoalCurrentCents || 0);
  const pct = Math.min(100, Math.round((currentCents / targetCents) * 100));
  const remainingCents = Math.max(0, targetCents - currentCents);
  const contributorsCount = studioState.tipGoalContributorsCount || 0;
  const rewardText = studioState.tipGoalRewardText || '';
  const lastTipName = studioState.tipGoalLastTipName || '';
  const lastTipAmountCents = studioState.tipGoalLastTipAmountCents || 0;

  const resolvedAmountCents = customReais.trim()
    ? Math.round((Number(customReais.replace(',', '.')) || 0) * 100)
    : selectedCents;

  const handleSubmitTip = async (amountToSendCents: number) => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    if (!onSendTip && !(paymentMethod === 'pix' && onCreatePixCharge)) return;
    if (!Number.isFinite(amountToSendCents) || amountToSendCents < 500) {
      setFeedback({
        type: 'error',
        text: 'Valor mínimo de gorjeta é R$ 5,00.',
      });
      return;
    }

    const trimmedNote = note.trim() || undefined;

    if (paymentMethod === 'pix' && onCreatePixCharge) {
      setSending(true);
      setFeedback(null);
      try {
        const res = await onCreatePixCharge({
          modelId,
          kind: 'tip',
          amountCents: amountToSendCents,
          note: trimmedNote,
        });
        if (res.ok && res.charge) {
          setPendingPixTip({ amountCents: amountToSendCents, note: trimmedNote });
          setActivePixCharge(res.charge);
        } else {
          setFeedback({
            type: 'error',
            text: res.error || 'Não foi possível gerar o QR Code PIX.',
          });
        }
      } finally {
        setSending(false);
      }
      return;
    }

    if (!onSendTip) return;
    setSending(true);
    setFeedback(null);
    const res = await onSendTip(modelId, {
      amountCents: amountToSendCents,
      paymentMethod,
      message: trimmedNote,
    });
    setSending(false);

    if (res.ok) {
      setCustomReais('');
      setNote('');
      setFeedback({
        type: 'success',
        text: `Gorjeta de ${BRL_FORMATTER.format(
          amountToSendCents / 100
        )} enviada para ${modelName}!`,
      });
    } else {
      setFeedback({
        type: 'error',
        text: res.error || 'Não foi possível enviar a gorjeta.',
      });
    }
  };

  const regenerateTipPixCharge = async () => {
    if (!pendingPixTip || !onCreatePixCharge) return;
    const res = await onCreatePixCharge({
      modelId,
      kind: 'tip',
      amountCents: pendingPixTip.amountCents,
      note: pendingPixTip.note,
    });
    if (res.ok && res.charge) {
      setActivePixCharge(res.charge);
    }
  };

  return (
    <section
      aria-labelledby={`tip-goal-heading-${compact ? 'compact' : 'full'}`}
      className={`luxury-glass-rim border border-[#818CF8]/25 rounded-2xl ${
        compact ? 'p-4 space-y-3' : 'p-6 sm:p-7 space-y-5'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-[#38BDF8]">
            <Target className="w-4 h-4 shrink-0" />
            <span>Meta de Gorjeta ao Vivo · {modelName}</span>
          </div>
          <h3
            id={`tip-goal-heading-${compact ? 'compact' : 'full'}`}
            className={`font-display font-bold text-[#F8FAFC] ${
              compact ? 'text-xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            {title}
          </h3>
          {description && (
            <p
              className={`text-[#B6C2E2] leading-relaxed ${
                compact ? 'text-xs line-clamp-2' : 'text-xs sm:text-sm max-w-2xl'
              }`}
            >
              {description}
            </p>
          )}
        </div>

        <div className="text-left sm:text-right shrink-0">
          <p
            className={`font-mono font-semibold tabular-nums text-[#38BDF8] ${
              compact ? 'text-base' : 'text-xl sm:text-2xl'
            }`}
          >
            {BRL_FORMATTER.format(currentCents / 100)}{' '}
            <span className="text-xs font-normal text-[#B6C2E2]">
              / {BRL_FORMATTER.format(targetCents / 100)}
            </span>
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#B6C2E2]">
            {pct}% concluído ·{' '}
            {remainingCents === 0
              ? 'Meta atingida!'
              : `Faltam ${BRL_FORMATTER.format(remainingCents / 100)}`}
          </p>
        </div>
      </div>

      {/* Real-time Progress Bar */}
      <div className="space-y-2">
        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progresso da meta de gorjeta de ${modelName}: ${pct}%`}
          className="h-3.5 w-full rounded-full bg-[#070B1E]/95 border border-[#818CF8]/25 overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#38BDF8] shadow-[0_0_16px_rgba(56,189,248,0.55)] transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#B6C2E2]">
          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
            <Users className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>
              {contributorsCount}{' '}
              {contributorsCount === 1 ? 'apoiador' : 'apoiadores'}
            </span>
            {lastTipName && lastTipAmountCents > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Última gorjeta: {lastTipName} (
                  {BRL_FORMATTER.format(lastTipAmountCents / 100)})
                </span>
              </>
            )}
          </span>

          {rewardText && (
            <span className="inline-flex items-center gap-1.5 text-[#C4B5FD]">
              <Gift className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
              <span>{rewardText}</span>
            </span>
          )}
        </div>
      </div>

      {/* Interactive Contribution Bar */}
      <div className="pt-3 border-t border-[#818CF8]/15 space-y-3">
        {isAuthenticated && onSendTip ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_TIPS_CENTS.map((cents) => {
                  const active = !customReais.trim() && selectedCents === cents;
                  return (
                    <button
                      key={cents}
                      type="button"
                      disabled={sending}
                      onClick={() => {
                        setCustomReais('');
                        setSelectedCents(cents);
                      }}
                      className={`px-3 py-1.5 text-xs font-mono font-semibold tabular-nums rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'luxury-rose-cta border-transparent'
                          : 'bg-[#070B1E]/85 border-[#818CF8]/25 text-[#F8FAFC] hover:border-[#38BDF8]/70'
                      }`}
                    >
                      {BRL_FORMATTER.format(cents / 100)}
                    </button>
                  );
                })}
                <input
                  type="number"
                  min="5"
                  step="1"
                  value={customReais}
                  onChange={(e) => setCustomReais(e.target.value)}
                  placeholder="Outro R$"
                  aria-label="Outro valor de gorjeta em reais"
                  className="w-24 bg-[#070B1E]/85 border border-[#818CF8]/25 rounded-full px-3 py-1.5 text-xs font-mono tabular-nums text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#070B1E]/85 border border-[#38BDF8]/35 rounded-full text-[11px] font-medium text-[#38BDF8]">
                <QrCode className="w-3.5 h-3.5" />
                <span>PIX Verificado</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              {!compact && (
                <input
                  type="text"
                  maxLength={120}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Mensagem rápida para a modelo (opcional)"
                  className="flex-1 bg-[#070B1E]/85 border border-[#818CF8]/25 rounded-full px-4 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                />
              )}
              <button
                type="button"
                disabled={sending || resolvedAmountCents < 500}
                onClick={() => void handleSubmitTip(resolvedAmountCents)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>
                  {sending
                    ? 'Gerando PIX...'
                    : `Gerar PIX · ${BRL_FORMATTER.format(
                        Math.max(0, resolvedAmountCents) / 100
                      )}`}
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#B6C2E2]">
              Acompanhe a barra acima em tempo real ou entre para enviar uma
              gorjeta para {modelName}.
            </p>
            {onRequireAuth && (
              <button
                type="button"
                onClick={onRequireAuth}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Target className="w-3.5 h-3.5" />
                <span>Contribuir para a Meta</span>
              </button>
            )}
          </div>
        )}

        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-xl text-xs border flex items-center gap-2 ${
              feedback.type === 'error'
                ? 'bg-red-950/40 border-red-500/35 text-red-200'
                : 'bg-[#0EA5E9]/15 border-[#38BDF8]/40 text-[#E0F2FE]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {activePixCharge && onCheckPixCharge && onConfirmPixCharge && (
        <PixPaymentModal
          charge={activePixCharge}
          title="Pagamento PIX · Meta de Gorjeta"
          subtitle={`Contribuição para a meta de ${modelName}`}
          confirmLabel="Já Paguei via PIX · Confirmar Gorjeta"
          onClose={() => {
            setActivePixCharge(null);
            setPendingPixTip(null);
          }}
          onCancelCharge={onCancelPixCharge}
          onCheckStatus={onCheckPixCharge}
          onConfirmPayment={onConfirmPixCharge}
          onRegenerate={regenerateTipPixCharge}
          onPaid={() => {
            const paidAmountCents = activePixCharge.amountCents;
            setActivePixCharge(null);
            setPendingPixTip(null);
            setCustomReais('');
            setNote('');
            setFeedback({
              type: 'success',
              text: `Gorjeta de ${BRL_FORMATTER.format(
                paidAmountCents / 100
              )} confirmada via PIX para ${modelName}!`,
            });
          }}
        />
      )}
    </section>
  );
};
