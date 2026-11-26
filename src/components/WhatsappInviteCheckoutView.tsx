import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Lock,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  CallEntryIntent,
  CallPlan,
  PublicWhatsappInviteData,
} from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export interface InviteCheckoutSelection {
  planId: string;
  paymentMethod: 'pix' | 'card';
  callMode: CallEntryIntent;
  topic: string;
}

interface WhatsappInviteCheckoutViewProps {
  inviteData: PublicWhatsappInviteData;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isBlocked?: boolean;
  activePlans: CallPlan[];
  submitting: boolean;
  errorMsg: string | null;
  authError?: string | null;
  onRequireAuthAndPay: (selection: InviteCheckoutSelection) => void;
  onPayAndHire: (selection: InviteCheckoutSelection) => Promise<void>;
  onGoToFullCatalog: () => void;
  onBackToAdmin?: () => void;
}

export const WhatsappInviteCheckoutView: React.FC<
  WhatsappInviteCheckoutViewProps
> = ({
  inviteData,
  isAuthenticated,
  isAdmin,
  isBlocked = false,
  activePlans,
  submitting,
  errorMsg,
  authError,
  onRequireAuthAndPay,
  onPayAndHire,
  onGoToFullCatalog,
  onBackToAdmin,
}) => {
  const { invite, model, studioConfig } = inviteData;

  const plans = useMemo(
    () =>
      activePlans.length > 0
        ? activePlans
        : inviteData.callPlans.filter((p) => p.active),
    [activePlans, inviteData.callPlans]
  );

  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => {
    if (invite.planId && plans.some((p) => p.id === invite.planId)) {
      return invite.planId;
    }
    return plans[0]?.id || '';
  });
  const [callMode] = useState<CallEntryIntent>('private');
  const paymentMethod = 'pix' as const;
  const [topic, setTopic] = useState<string>('');
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    if (invite.planId && plans.some((p) => p.id === invite.planId)) {
      setSelectedPlanId(invite.planId);
    } else if (!plans.some((p) => p.id === selectedPlanId)) {
      setSelectedPlanId(plans[0]?.id || '');
    }
  }, [invite.planId, plans, selectedPlanId]);

  useEffect(() => {
    setPhotoFailed(false);
  }, [invite.photoUrl]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || plans[0] || null,
    [plans, selectedPlanId]
  );

  const displayName =
    studioConfig.modelName || model.displayName || 'Modelo do Estúdio';
  const brand = studioConfig.studioBrand || 'Model Gat Brasil';
  const isAlreadyPaid = invite.status === 'paid';

  const handlePrimaryClick = () => {
    if (!selectedPlan || submitting || isBlocked) return;
    const selection: InviteCheckoutSelection = {
      planId: selectedPlan.id,
      paymentMethod,
      callMode,
      topic:
        topic.trim() ||
        `Convite WhatsApp · ${selectedPlan.name} (Sala Privativa 1-para-1)`,
    };
    if (!isAuthenticated) {
      onRequireAuthAndPay(selection);
      return;
    }
    void onPayAndHire(selection);
  };

  return (
    <main className="relative z-10 flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 sm:py-12 space-y-8">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#F4C2D7]/15">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#F4C2D7] inline-flex items-center gap-1.5">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Convite Exclusivo via WhatsApp · {brand}</span>
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#FAF4F7]">
            {invite.recipientName
              ? `${invite.recipientName}, ${displayName} convidou você`
              : `${displayName} convidou você para uma videochamada`}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && onBackToAdmin && (
            <button
              type="button"
              onClick={onBackToAdmin}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/35 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Voltar ao Painel da Modelo
            </button>
          )}
          <button
            type="button"
            onClick={onGoToFullCatalog}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Ver vitrine completa de {displayName}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Invite & Checkout Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Pre-selected Photo + Personal Message */}
        <section className="lg:col-span-5 luxury-card border border-[#F4C2D7]/25 rounded-3xl overflow-hidden shadow-[0_24px_65px_-28px_rgba(244,194,215,0.4)]">
          <div className="relative aspect-[4/5] w-full bg-[#150D1D] overflow-hidden">
            {!photoFailed && invite.photoUrl ? (
              <img
                src={invite.photoUrl}
                alt={`Foto exclusiva enviada por ${displayName}`}
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-[#21142D] flex items-center justify-center font-display text-5xl text-[#F4C2D7]">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/95 via-transparent to-transparent pointer-events-none" />

            <div className="absolute bottom-0 left-0 right-0 p-6 space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    model.modelOnline
                      ? 'bg-[#86EFAC]'
                      : model.isLive
                        ? 'bg-[#F4C2D7]'
                        : 'bg-[#938291]'
                  }`}
                />
                <span className="font-medium text-[#FAF4F7]">
                  {model.modelOnline
                    ? `${displayName} está online agora`
                    : model.isLive
                      ? 'Estúdio Ao Vivo aberto'
                      : 'Agende ou deixe recado'}
                </span>
              </div>
              <h2 className="font-display text-2xl font-semibold text-[#FAF4F7]">
                {displayName}
              </h2>
            </div>
          </div>

          <div className="p-6 space-y-3 border-t border-[#F4C2D7]/15">
            <p className="text-xs font-semibold text-[#F4C2D7] inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mensagem pessoal de {displayName}</span>
            </p>
            <blockquote className="text-sm text-[#FAF4F7] leading-relaxed whitespace-pre-line">
              “{invite.message}”
            </blockquote>
            {studioConfig.basicInfo?.specialty && (
              <p className="text-xs text-[#938291]">
                {studioConfig.basicInfo.specialty}
                {studioConfig.basicInfo.languages
                  ? ` · Idiomas: ${studioConfig.basicInfo.languages}`
                  : ''}
              </p>
            )}
          </div>
        </section>

        {/* Right Column: Plan + Payment + Instant Hiring */}
        <section className="lg:col-span-7 luxury-card border border-[#F4C2D7]/20 rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Pagamento e Contratação da Videochamada
            </h2>
            <p className="text-sm text-[#C9BAC4]">
              Confirme o pacote desejado e conclua o pagamento via PIX QR Code ou Cartão para iniciar sua videochamada com {displayName}.
            </p>
          </div>

          {isAlreadyPaid && (
            <div className="p-4 rounded-2xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Este convite já teve um pagamento confirmado. Se desejar contratar uma nova sessão com {displayName}, selecione o pacote abaixo normalmente.
              </span>
            </div>
          )}

          {isBlocked && (
            <div
              role="alert"
              className="p-4 rounded-2xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
            >
              Seu acesso às videochamadas desta modelo foi suspenso pela moderação.
            </div>
          )}

          {/* Private 1-on-1 Mode Notice */}
          <div className="p-3.5 rounded-xl border border-[#F4C2D7]/40 bg-[#281837]/80 flex items-center gap-3">
            <Lock className="w-4 h-4 text-[#F4C2D7] shrink-0" />
            <div>
              <p className="text-xs font-semibold text-[#FAF4F7]">
                Sala Privativa Exclusiva (1-para-1) · Mediante Pagamento
              </p>
              <p className="text-[11px] text-[#C9BAC4]">
                Apenas você e {displayName} na chamada de vídeo. Nenhum outro internauta participa ou assiste.
              </p>
            </div>
          </div>

          {/* Plans Grid */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[#C9BAC4]">
                2. Escolha seu pacote de minutos
              </span>
              {invite.planId && (
                <span className="text-[11px] text-[#F4C2D7]">
                  Sugerido por {displayName}
                </span>
              )}
            </div>

            {plans.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/20 text-xs text-[#C9BAC4]">
                Nenhum pacote ativo no momento. Entre em contato ou aguarde a modelo liberar novos planos.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {plans.map((plan) => {
                  const isSelected = plan.id === selectedPlan?.id;
                  const isSuggested = plan.id === invite.planId;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      aria-pressed={isSelected}
                      className={`p-4 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#281837] border-[#F4C2D7] text-[#FAF4F7] shadow-[0_0_24px_-8px_rgba(244,194,215,0.45)]'
                          : 'bg-[#0B060F] border-[#F4C2D7]/15 text-[#C9BAC4] hover:border-[#F4C2D7]/45'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono tabular-nums text-[#F4C2D7]">
                            {plan.durationMinutes} min
                            {isSuggested ? ' · Indicado' : ''}
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#F4C2D7] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-[#FAF4F7]">
                          {plan.name}
                        </p>
                        {plan.description && (
                          <p className="text-[11px] text-[#938291] line-clamp-2">
                            {plan.description}
                          </p>
                        )}
                      </div>
                      <p className="text-lg font-semibold font-mono tabular-nums text-[#FAF4F7]">
                        {BRL_FORMATTER.format(plan.priceCents / 100)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="p-4 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/15 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-[#FAF4F7]">
                <QrCode className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <span className="font-medium">3. Pagamento via PIX QR Code</span>
              </div>

              <span className="px-3 py-1 text-[11px] font-medium rounded-full bg-[#150D1D] border border-[#F4C2D7]/20 text-[#C9BAC4] self-start sm:self-auto">
                Cartão em breve
              </span>
            </div>

            <p className="text-xs text-[#38BDF8] flex items-center gap-2">
              <QrCode className="w-4 h-4 shrink-0" />
              <span>
                Geramos seu QR Code PIX + Copia e Cola na hora. Após a confirmação do pagamento, sua videochamada com {displayName} é liberada.
              </span>
            </p>
          </div>

          {/* Optional Note */}
          <div className="space-y-1.5">
            <label
              htmlFor="invite-checkout-topic"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Recado rápido para {displayName} (opcional)
            </label>
            <input
              id="invite-checkout-topic"
              type="text"
              maxLength={140}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Ex.: Oi! Acabei de receber seu convite no WhatsApp..."
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
            />
          </div>

          {(errorMsg || authError) && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
            >
              {errorMsg || authError}
            </div>
          )}

          {/* Primary CTA */}
          <div className="pt-1 space-y-3">
            <button
              type="button"
              disabled={!selectedPlan || submitting || isBlocked}
              onClick={handlePrimaryClick}
              className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-4 text-sm font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span>
                {submitting
                  ? 'Preparando QR Code PIX...'
                  : !isAuthenticated
                    ? `Entrar com Google e Gerar PIX · ${
                        selectedPlan
                          ? BRL_FORMATTER.format(selectedPlan.priceCents / 100)
                          : ''
                      }`
                    : `Gerar QR Code PIX e Contratar · ${
                        selectedPlan
                          ? BRL_FORMATTER.format(selectedPlan.priceCents / 100)
                          : ''
                      }`}
              </span>
            </button>

            <p className="text-[11px] text-[#938291] flex items-center justify-center gap-1.5 text-center">
              <ShieldCheck className="w-3.5 h-3.5 text-[#86EFAC] shrink-0" />
              <span>
                {!isAuthenticated
                  ? 'Ao entrar com sua conta Google, o checkout PIX abre automaticamente para você concluir a videochamada.'
                  : 'Sessão segura com criptografia de vídeo em tempo real.'}
              </span>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
};
