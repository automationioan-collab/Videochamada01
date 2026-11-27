import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Lock,
  PhoneCall,
  PhoneOff,
  QrCode,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { isDndActiveNow } from '../lib/schedule';
import { DEFAULT_STUDIO_CONFIG } from '../lib/studioDefaults';
import { GaleriaModelo } from './GaleriaModelo';
import {
  MercadoPagoMethodSelector,
  getMercadoPagoMethodActionLabel,
} from './MercadoPagoMethodSelector';
import { PixPaymentModal, type PixConfirmationResponse } from './PixPaymentModal';
import { SalaDeEspera } from './SalaDeEspera';
import { TechSpotlightCard } from './TechEffects';
import { TipGoalProgressCard } from './TipGoalProgressCard';
import type {
  CallPaymentStatus,
  CallPlan,
  CallRequest,
  CallStatus,
  GalleryItemRecord,
  MercadoPagoPaymentMethod,
  PixChargeKind,
  PixChargeRecord,
  PresencePeer,
  QueueWaitSummary,
  StudioConfig,
  StudioProfile,
  StudioState,
} from '../types/studio';

interface CallQueuePanelProps {
  isAdmin: boolean;
  modelId?: string;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  studioConfig?: StudioConfig | null;
  galleryItems?: GalleryItemRecord[];
  callQueue: CallRequest[];
  callPlans: CallPlan[];
  peers: PresencePeer[];
  queueSummary?: QueueWaitSummary;
  wsConnected?: boolean;
  localStream?: MediaStream | null;
  micEnabled?: boolean;
  camEnabled?: boolean;
  mediaError?: string | null;
  onAcquireMedia?: () => Promise<MediaStream | null>;
  onToggleMic?: () => void;
  onToggleCam?: () => void;
  onRequestCall: (topic: string, plan: CallPlan) => Promise<string | null>;
  onDirectCallModel: (
    topic: string,
    plan: CallPlan,
    existingCallRequestId?: string
  ) => Promise<void>;
  onRefreshWorkspace?: () => Promise<void>;
  onAcceptAndCall: (req: CallRequest) => Promise<void>;
  onUpdateCallStatus: (
    requestId: string,
    status: CallStatus,
    paymentStatus?: CallPaymentStatus
  ) => Promise<void>;
  onDeleteCallRequest?: (requestId: string) => Promise<void>;
  onEnterAcceptedCall: (req: CallRequest) => void;
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
    preferredPaymentMethod?: MercadoPagoPaymentMethod;
  }) => Promise<{
    ok: boolean;
    charge?: PixChargeRecord;
    error?: string;
    requiresMercadoPagoToken?: boolean;
  }>;
  onCheckPixCharge?: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onConfirmPixCharge?: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onCancelPixCharge?: (modelId: string, chargeId: string) => Promise<void>;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  waiting: 'Aguardando aprovação',
  accepted: 'Aceita · Pronta para vídeo',
  in_call: 'Em chamada',
  ended: 'Encerrada',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
};

export const CallQueuePanel: React.FC<CallQueuePanelProps> = ({
  isAdmin,
  modelId,
  myProfile,
  modelProfile,
  studioState,
  studioConfig,
  galleryItems,
  callQueue,
  callPlans,
  peers,
  queueSummary,
  wsConnected = false,
  localStream = null,
  micEnabled = true,
  camEnabled = true,
  mediaError = null,
  onAcquireMedia,
  onToggleMic,
  onToggleCam,
  onRequestCall,
  onDirectCallModel,
  onRefreshWorkspace,
  onAcceptAndCall,
  onUpdateCallStatus,
  onDeleteCallRequest,
  onEnterAcceptedCall,
  onSendTip,
  onCreatePixCharge,
  onCheckPixCharge,
  onConfirmPixCharge,
  onCancelPixCharge,
}) => {
  const [topic, setTopic] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<MercadoPagoPaymentMethod>('pix');
  const [requiresTokenFallback, setRequiresTokenFallback] = useState(false);
  const [paymentAuthorized, setPaymentAuthorized] = useState(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activePixCharge, setActivePixCharge] = useState<PixChargeRecord | null>(
    null
  );
  const [pendingPixCall, setPendingPixCall] = useState<{
    plan: CallPlan;
    topic: string;
    preferredPaymentMethod: MercadoPagoPaymentMethod;
  } | null>(null);
  const [pixError, setPixError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [loungeFailed, setLoungeFailed] = useState(false);

  const activePlans = useMemo(
    () => callPlans.filter((p) => p.active),
    [callPlans]
  );

  useEffect(() => {
    if (activePlans.length === 0) {
      setSelectedPlanId('');
      return;
    }
    if (!activePlans.some((p) => p.id === selectedPlanId)) {
      const preferred =
        activePlans.find((p) => p.id === 'plan_private_20') || activePlans[0];
      setSelectedPlanId(preferred.id);
    }
  }, [activePlans, selectedPlanId]);

  const selectedPlan = useMemo(
    () => activePlans.find((p) => p.id === selectedPlanId) || null,
    [activePlans, selectedPlanId]
  );

  const isBlocked = myProfile?.accessStatus === 'blocked';
  const activeRequest = callQueue.find(
    (q) => q.status === 'waiting' || q.status === 'accepted' || q.status === 'in_call'
  );
  const modelOnline = modelProfile
    ? peers.some((p) => p.uid === modelProfile.uid)
    : false;
  const dndBlocked = isDndActiveNow(studioState);
  const modelBusyInCall = Boolean(studioState?.activeCallId);
  const canDirectCallNow =
    Boolean(modelProfile) &&
    modelOnline &&
    !dndBlocked &&
    !modelBusyInCall &&
    (studioState?.isLive ?? true) &&
    (studioState?.callMode ?? 'open') === 'open';
  const displayModelName =
    studioConfig?.modelName ||
    studioState?.modelName ||
    modelProfile?.displayName ||
    DEFAULT_STUDIO_CONFIG.modelName;
  const avatarSrc =
    studioConfig?.modelAvatarUrl ||
    modelProfile?.photoUrl ||
    DEFAULT_STUDIO_CONFIG.modelAvatarUrl;
  const loungeSrc =
    studioConfig?.loungeImageUrl || DEFAULT_STUDIO_CONFIG.loungeImageUrl;

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  useEffect(() => {
    setLoungeFailed(false);
  }, [loungeSrc]);

  const methodLabelForTopic = (method: MercadoPagoPaymentMethod) => {
    switch (method) {
      case 'credit_card':
        return 'Cartão de Crédito';
      case 'debit_card':
        return 'Cartão de Débito';
      case 'account_money':
        return 'Saldo Mercado Pago';
      case 'ticket':
        return 'Boleto Mercado Pago';
      case 'pix':
      default:
        return 'PIX';
    }
  };

  const buildCleanTopic = (
    plan: CallPlan,
    method: MercadoPagoPaymentMethod = selectedPaymentMethod
  ) => {
    const base =
      topic.trim() || `${plan.name} · Pagamento ${methodLabelForTopic(method)}`;
    return `[Privativa 1-para-1] ${base}`;
  };

  const startCallPlanPixCharge = async (
    plan: CallPlan,
    cleanTopic: string,
    methodOverride?: MercadoPagoPaymentMethod
  ) => {
    if (!onCreatePixCharge) return;
    const methodToUse = methodOverride || selectedPaymentMethod;
    setPixError(null);
    setRequiresTokenFallback(false);
    const res = await onCreatePixCharge({
      modelId: modelId || 'lorena_noir',
      kind: 'call_plan',
      planId: plan.id,
      callMode: 'private',
      topic: cleanTopic,
      preferredPaymentMethod: methodToUse,
    });
    if (res.ok && res.charge) {
      setPendingPixCall({
        plan,
        topic: cleanTopic,
        preferredPaymentMethod: methodToUse,
      });
      setActivePixCharge(res.charge);
    } else {
      setRequiresTokenFallback(Boolean(res.requiresMercadoPagoToken));
      setPixError(
        res.error || 'Não foi possível gerar o pagamento no Mercado Pago.'
      );
    }
  };

  const handlePrivateOneOnOneCall = async (
    methodOverride?: MercadoPagoPaymentMethod
  ) => {
    if (
      submitting ||
      isBlocked ||
      dndBlocked ||
      activeRequest ||
      !selectedPlan ||
      !paymentAuthorized ||
      studioState?.callMode === 'paused'
    ) {
      return;
    }
    const methodToUse = methodOverride || selectedPaymentMethod;
    const cleanTopic = buildCleanTopic(selectedPlan, methodToUse);
    setSubmitting(true);
    setPixError(null);
    setRequiresTokenFallback(false);
    try {
      if (onCreatePixCharge) {
        await startCallPlanPixCharge(selectedPlan, cleanTopic, methodToUse);
        return;
      }
      if (canDirectCallNow) {
        await onDirectCallModel(cleanTopic, selectedPlan);
      } else {
        await onRequestCall(cleanTopic, selectedPlan);
      }
      setTopic('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handlePrivateOneOnOneCall();
  };

  if (isAdmin) {
    const waitingCalls = callQueue.filter((c) => c.status === 'waiting');
    const historyCalls = callQueue.filter((c) => c.status !== 'waiting').slice(0, 12);
    const totalEstimatedQueueMinutes = waitingCalls.reduce(
      (acc, req) => acc + (req.planDurationMinutes || 10),
      0
    );

    return (
      <div className="space-y-8">
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-[#F4C2D7]/15 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#FAF4F7]">
                Fila de Chamadas em Tempo Real
              </h2>
              <p className="text-xs text-[#C9BAC4]">
                Aceite solicitações para abrir a videochamada instantaneamente com o usuário.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
              {waitingCalls.length} aguardando
              {waitingCalls.length > 0
                ? ` · ~${totalEstimatedQueueMinutes} min estimados`
                : ''}
            </span>
          </div>

          {waitingCalls.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-[#FAF4F7]">
                Nenhuma solicitação pendente na fila.
              </p>
              <p className="text-xs text-[#C9BAC4]">
                Novos pedidos aparecem automaticamente aqui ou você pode iniciar uma chamada na aba Usuários.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F4C2D7]/10">
              {waitingCalls.map((req) => {
                const isOnline = peers.some((p) => p.uid === req.userId);
                return (
                  <div
                    key={req.id}
                    className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      {req.userPhotoUrl ? (
                        <img
                          src={req.userPhotoUrl}
                          alt={req.userName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover shrink-0 border border-[#F4C2D7]/25"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#21142D] flex items-center justify-center text-sm font-semibold text-[#F4C2D7] shrink-0">
                          {req.userName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#FAF4F7] truncate">
                          {req.userName}
                        </p>
                        <p className="text-xs text-[#C9BAC4] truncate">
                          {req.topic} · {isOnline ? 'Online agora' : 'Offline'}
                        </p>
                        {req.planName && typeof req.planPriceCents === 'number' && (
                          <p className="text-[11px] font-mono tabular-nums text-[#F4C2D7] mt-0.5">
                            {req.planName} ·{' '}
                            {BRL_FORMATTER.format(req.planPriceCents / 100)} ·{' '}
                            {req.paymentStatus === 'captured'
                              ? 'Cobrado'
                              : 'Pré-autorizado'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onAcceptAndCall(req)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Aceitar e Conectar Vídeo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateCallStatus(req.id, 'rejected', 'refunded')
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Recusar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {historyCalls.length > 0 && (
          <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#F4C2D7]/15">
              <h3 className="text-sm font-semibold text-[#FAF4F7]">
                Histórico Recente de Sessões
              </h3>
            </div>
            <div className="divide-y divide-[#F4C2D7]/10">
              {historyCalls.map((item) => (
                <div
                  key={item.id}
                  className="px-6 py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-[#FAF4F7]">
                      {item.userName}
                    </span>
                    <span className="text-[#938291] mx-2">·</span>
                    <span className="text-[#C9BAC4] truncate">{item.topic}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[#C9BAC4] whitespace-nowrap">
                      {CALL_STATUS_LABEL[item.status]}
                    </span>
                    {onDeleteCallRequest && (
                      <button
                        type="button"
                        onClick={() => void onDeleteCallRequest(item.id)}
                        aria-label={`Remover registro de ${item.userName}`}
                        className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  const resolvedQueueSummary: QueueWaitSummary = queueSummary ?? {
    totalWaiting: 0,
    myPosition: 0,
    aheadCount: 0,
    activeCallRemainingSeconds: 0,
    aheadQueueSeconds: 0,
    totalEstimatedWaitSeconds: 0,
    updatedAtMs: 0,
  };

  // Dedicated visual Waiting Room when visitor has a pending/accepted call request
  if (
    !isBlocked &&
    activeRequest &&
    (activeRequest.status === 'waiting' || activeRequest.status === 'accepted')
  ) {
    return (
      <div className="space-y-12">
        <SalaDeEspera
          request={activeRequest}
          modelName={displayModelName}
          modelAvatarUrl={avatarSrc}
          loungeImageUrl={loungeSrc}
          modelOnline={modelOnline}
          isVip={myProfile?.accessStatus === 'vip'}
          studioState={studioState}
          queueSummary={resolvedQueueSummary}
          wsConnected={wsConnected}
          localStream={localStream}
          micEnabled={micEnabled}
          camEnabled={camEnabled}
          mediaError={mediaError}
          onAcquireMedia={onAcquireMedia ?? (async () => null)}
          onToggleMic={onToggleMic ?? (() => {})}
          onToggleCam={onToggleCam ?? (() => {})}
          onEnterAcceptedCall={onEnterAcceptedCall}
          onCancelRequest={(requestId) =>
            onUpdateCallStatus(requestId, 'cancelled')
          }
        />

        <TipGoalProgressCard
          modelId={modelId || 'lorena_noir'}
          modelName={displayModelName}
          studioState={studioState}
          isAuthenticated={true}
          mercadoPagoConfigured={Boolean(studioConfig?.mercadoPagoConfigured)}
          onSendTip={onSendTip}
          onCreatePixCharge={onCreatePixCharge}
          onCheckPixCharge={onCheckPixCharge}
          onConfirmPixCharge={onConfirmPixCharge}
          onCancelPixCharge={onCancelPixCharge}
        />

        <GaleriaModelo
          modelName={displayModelName}
          items={galleryItems}
          hasCustomSource={Boolean(studioConfig)}
          ctaDisabled={true}
          ctaLabel={
            studioConfig?.privateButtonLabel ||
            DEFAULT_STUDIO_CONFIG.privateButtonLabel
          }
          onPrimaryAction={() =>
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        />
      </div>
    );
  }

  // Viewer / Client Queue & Model Availability View
  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
      <TechSpotlightCard className="lg:col-span-7 luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {!avatarFailed && avatarSrc ? (
              <img
                src={avatarSrc}
                alt={displayModelName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-16 h-16 rounded-full object-cover border border-[#F4C2D7]/35 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#21142D] flex items-center justify-center font-display text-2xl text-[#F4C2D7]">
                {displayModelName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="font-display text-3xl font-semibold text-[#FAF4F7]">
                {displayModelName}
              </h2>
              <p className="text-xs text-[#C9BAC4] font-mono tabular-nums">
                {studioState?.isLive ?? true
                  ? 'Estúdio Ao Vivo'
                  : 'Estúdio Pausado'}{' '}
                ·{' '}
                {modelOnline
                  ? `${displayModelName} conectada agora`
                  : 'Atendimento via fila'}{' '}
                ·{' '}
                {modelBusyInCall
                  ? 'Em sala privativa (1/1)'
                  : 'Sala privativa livre (1-para-1)'}
              </p>
            </div>
          </div>

          <p className="text-sm text-[#C9BAC4] leading-relaxed">
            {studioConfig?.headline ||
              studioState?.headline ||
              DEFAULT_STUDIO_CONFIG.headline}
          </p>

          {(resolvedQueueSummary.totalWaiting > 0 || modelBusyInCall) &&
            !activeRequest && (
              <div className="px-4 py-2.5 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/25 text-xs text-[#C9BAC4] flex flex-wrap items-center justify-between gap-2">
                <span>
                  {modelBusyInCall
                    ? `${displayModelName} está em sala privativa (1/1) com outro internauta agora — pague para reservar sua vez na fila`
                    : `${resolvedQueueSummary.totalWaiting} ${
                        resolvedQueueSummary.totalWaiting === 1
                          ? 'internauta aguardando'
                          : 'internautas aguardando'
                      } na fila privativa`}
                </span>
                <span className="font-mono tabular-nums text-[#F4C2D7]">
                  Espera est.: ~
                  {Math.max(
                    1,
                    Math.ceil(
                      resolvedQueueSummary.totalEstimatedWaitSeconds / 60
                    )
                  )}{' '}
                  min
                </span>
              </div>
            )}

          <div className="px-4 py-2.5 rounded-xl bg-[#21142D] border border-[#F4C2D7]/40 text-xs text-[#F8D6E3] flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>
              Exclusivo 1-para-1 mediante pagamento: apenas 1 internauta por vez
              pode ver e conversar com {displayModelName}.
            </span>
          </div>
        </div>

        {isBlocked ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200">
            Seu acesso às videochamadas foi suspenso pela moderação do estúdio.
          </div>
        ) : activeRequest ? (
          <div className="p-5 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/20 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs text-[#C9BAC4]">Sua solicitação atual</p>
                <p className="text-sm font-medium text-[#FAF4F7] truncate">
                  {activeRequest.topic}
                </p>
                {activeRequest.planName &&
                  typeof activeRequest.planPriceCents === 'number' && (
                    <p className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                      {activeRequest.planName} ·{' '}
                      {BRL_FORMATTER.format(activeRequest.planPriceCents / 100)}{' '}
                      · Autorizado
                    </p>
                  )}
              </div>
              <span className="text-xs font-medium text-[#F4C2D7] whitespace-nowrap shrink-0">
                {CALL_STATUS_LABEL[activeRequest.status]}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(activeRequest.status === 'accepted' ||
                activeRequest.status === 'in_call') && (
                <button
                  type="button"
                  onClick={() => onEnterAcceptedCall(activeRequest)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-colors cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>Ir para a Sala de Vídeo</span>
                </button>
              )}

              {activeRequest.status === 'waiting' && (
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateCallStatus(activeRequest.id, 'cancelled')
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Cancelar Solicitação</span>
                </button>
              )}
            </div>
          </div>
        ) : activePlans.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/20 text-xs text-[#C9BAC4]">
            Nenhum plano pré-definido de videochamada está ativo no momento. Aguarde a modelo liberar os pacotes de atendimento.
          </div>
        ) : (
          <form onSubmit={handleRequestSubmit} className="space-y-5">
            {/* Step 1: Predefined Plan Selection */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#C9BAC4]">
                  1. Escolha um plano pré-definido para sua videochamada
                </span>
                <span className="text-[11px] text-[#F4C2D7]">
                  Cobrança obrigatória por sessão
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {activePlans.map((plan) => {
                  const isSelected = plan.id === selectedPlan?.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlanId(plan.id)}
                      aria-pressed={isSelected}
                      className={`tech-glass-interactive p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#281837] border-[#F4C2D7] text-[#FAF4F7] shadow-[0_0_24px_-8px_rgba(244,194,215,0.45)]'
                          : 'bg-[#0B060F] border-[#F4C2D7]/15 text-[#C9BAC4] hover:border-[#F4C2D7]/45'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono tabular-nums text-[#F4C2D7]">
                            {plan.durationMinutes} min
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#F4C2D7] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-[#FAF4F7] line-clamp-1">
                          {plan.name}
                        </p>
                      </div>
                      <p className="text-lg font-semibold font-mono tabular-nums text-[#FAF4F7]">
                        {BRL_FORMATTER.format(plan.priceCents / 100)}
                      </p>
                    </button>
                  );
                })}
              </div>

              {selectedPlan && (
                <p className="text-xs text-[#C9BAC4]">
                  {selectedPlan.description}
                </p>
              )}
            </div>

            {/* Step 2: Payment Method & Authorization */}
            <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/15 space-y-4">
              <MercadoPagoMethodSelector
                value={selectedPaymentMethod}
                onChange={(next) => {
                  setSelectedPaymentMethod(next);
                  setPixError(null);
                  setRequiresTokenFallback(false);
                }}
                mercadoPagoConfigured={Boolean(
                  studioConfig?.mercadoPagoConfigured
                )}
                disabled={submitting}
                theme="rose"
              />

              <label className="flex items-start gap-2.5 text-xs text-[#C9BAC4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentAuthorized}
                  onChange={(e) => setPaymentAuthorized(e.target.checked)}
                  className="mt-0.5 accent-[#F4C2D7] cursor-pointer"
                />
                <span>
                  Autorizo a cobrança via Mercado Pago de{' '}
                  <strong className="font-mono tabular-nums text-[#F4C2D7]">
                    {selectedPlan
                      ? BRL_FORMATTER.format(selectedPlan.priceCents / 100)
                      : 'R$ 0,00'}
                  </strong>{' '}
                  pelo pacote de{' '}
                  <strong className="font-mono tabular-nums text-[#FAF4F7]">
                    {selectedPlan?.durationMinutes ?? 0} minutos
                  </strong>{' '}
                  com {displayModelName}.
                </span>
              </label>
            </div>

            {pixError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200 space-y-2"
              >
                <p>{pixError}</p>
                {requiresTokenFallback && selectedPlan && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPaymentMethod('pix');
                      void handlePrivateOneOnOneCall('pix');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-full bg-[#0EA5E9]/20 border border-[#38BDF8]/50 text-[#E0F2FE] hover:bg-[#0EA5E9]/30 transition-colors cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Pagar agora via PIX QR Code</span>
                  </button>
                )}
              </div>
            )}

            {/* Step 3: Optional Topic */}
            <div className="space-y-1.5">
              <label
                htmlFor="call-topic"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Assunto ou preferência da chamada (opcional)
              </label>
              <input
                id="call-topic"
                type="text"
                maxLength={160}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex.: Conversa ao vivo, sessão VIP..."
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={
                  submitting ||
                  dndBlocked ||
                  !selectedPlan ||
                  !paymentAuthorized ||
                  studioState?.callMode === 'paused'
                }
                className="inline-flex items-center gap-2.5 px-6 py-3 text-xs font-semibold rounded-full luxury-rose-cta transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {canDirectCallNow ? (
                  <Lock className="w-4 h-4 shrink-0" />
                ) : (
                  <PhoneCall className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {dndBlocked
                    ? 'Modo Não Perturbe ativo'
                    : studioState?.callMode === 'paused'
                      ? 'Sala temporariamente fechada'
                      : submitting
                        ? 'Preparando pagamento Mercado Pago...'
                        : !selectedPlan
                          ? 'Selecione um plano'
                          : `${getMercadoPagoMethodActionLabel(selectedPaymentMethod)} (${BRL_FORMATTER.format(
                              selectedPlan.priceCents / 100
                            )}) e Liberar Sala Privativa`}
                </span>
              </button>
            </div>
          </form>
        )}
      </TechSpotlightCard>

      <aside className="lg:col-span-5 relative tech-reticle rounded-2xl overflow-hidden bg-[#150D1D] border border-[#F4C2D7]/25 min-h-[300px] shadow-[0_18px_45px_-20px_rgba(192,98,162,0.3)]">
        {!loungeFailed && loungeSrc ? (
          <img
            src={loungeSrc}
            alt={`Ambiente do Salão Privado ${studioConfig?.studioBrand || 'Model Gat Brasil'}`}
            referrerPolicy="no-referrer"
            onError={() => setLoungeFailed(true)}
            className="w-full h-full object-cover lg:absolute lg:inset-0"
          />
        ) : (
          <div className="w-full h-full bg-[#1A1024]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/95 via-[#0B060F]/35 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-6 space-y-1">
          <p className="text-xs font-medium text-[#F4C2D7] font-mono tabular-nums">
            {modelBusyInCall
              ? 'Sala Privativa Ocupada (1/1)'
              : 'Sala Privativa Livre (1-para-1)'}
          </p>
          <p className="font-display text-2xl font-semibold text-[#FAF4F7]">
            Somente 1 Internauta por Vez
          </p>
          <p className="text-xs text-[#C9BAC4]">
            Todas as videochamadas são 100% privativas mediante pagamento. Enquanto você estiver na sala com {displayModelName}, nenhum outro visitante entra ou assiste.
          </p>
        </div>
      </aside>
    </div>

      <TipGoalProgressCard
        modelId={modelId || 'lorena_noir'}
        modelName={displayModelName}
        studioState={studioState}
        isAuthenticated={true}
        mercadoPagoConfigured={Boolean(studioConfig?.mercadoPagoConfigured)}
        onSendTip={onSendTip}
        onCreatePixCharge={onCreatePixCharge}
        onCheckPixCharge={onCheckPixCharge}
        onConfirmPixCharge={onConfirmPixCharge}
        onCancelPixCharge={onCancelPixCharge}
      />

      <GaleriaModelo
        modelName={displayModelName}
        items={galleryItems}
        hasCustomSource={Boolean(studioConfig)}
        ctaDisabled={isBlocked || dndBlocked || studioState?.callMode === 'paused'}
        ctaLabel={
          studioConfig?.privateButtonLabel ||
          DEFAULT_STUDIO_CONFIG.privateButtonLabel
        }
        onPrimaryAction={() => {
          const input = document.getElementById('call-topic');
          if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input.focus();
          } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
      />

      {activePixCharge &&
        pendingPixCall &&
        onCheckPixCharge &&
        onConfirmPixCharge && (
          <PixPaymentModal
            charge={activePixCharge}
            title={
              activePixCharge.preferredPaymentMethod &&
              activePixCharge.preferredPaymentMethod !== 'pix'
                ? `Checkout Mercado Pago · ${pendingPixCall.plan.name}`
                : `Pagamento PIX · ${pendingPixCall.plan.name}`
            }
            subtitle={`Chamada Privativa 1-para-1 com ${displayModelName}`}
            confirmLabel={
              activePixCharge.preferredPaymentMethod &&
              activePixCharge.preferredPaymentMethod !== 'pix'
                ? 'Já Paguei no Mercado Pago · Liberar Sala Privativa'
                : 'Já Paguei via PIX · Liberar Sala Privativa'
            }
            onClose={() => {
              setActivePixCharge(null);
              setPendingPixCall(null);
            }}
            onCancelCharge={onCancelPixCharge}
            onCheckStatus={onCheckPixCharge}
            onConfirmPayment={onConfirmPixCharge}
            onRegenerate={async () => {
              await startCallPlanPixCharge(
                pendingPixCall.plan,
                pendingPixCall.topic,
                pendingPixCall.preferredPaymentMethod
              );
            }}
            onPaid={async (res) => {
              const pending = pendingPixCall;
              setActivePixCharge(null);
              setPendingPixCall(null);
              setTopic('');
              if (canDirectCallNow) {
                await onDirectCallModel(
                  pending.topic,
                  pending.plan,
                  res.callRequestId
                );
              } else if (onRefreshWorkspace) {
                await onRefreshWorkspace();
              }
            }}
          />
        )}
    </div>
  );
};
