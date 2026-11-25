import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CreditCard,
  Lock,
  PhoneCall,
  PhoneOff,
  QrCode,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { isDndActiveNow } from '../lib/schedule';
import { DEFAULT_STUDIO_CONFIG } from '../lib/studioDefaults';
import { GaleriaModelo } from './GaleriaModelo';
import { PixPaymentModal, type PixConfirmationResponse } from './PixPaymentModal';
import { SalaDeEspera } from './SalaDeEspera';
import { TechSpotlightCard } from './TechEffects';
import { TipGoalProgressCard } from './TipGoalProgressCard';
import type {
  CallEntryIntent,
  CallPaymentStatus,
  CallPlan,
  CallRequest,
  CallStatus,
  GalleryItemRecord,
  PixChargeKind,
  PixChargeRecord,
  PresencePeer,
  QueueWaitSummary,
  RoomParticipant,
  StudioConfig,
  StudioProfile,
  StudioState,
} from '../types/studio';

interface CallQueuePanelProps {
  isAdmin: boolean;
  modelId?: string;
  entryIntent?: CallEntryIntent;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  studioConfig?: StudioConfig | null;
  galleryItems?: GalleryItemRecord[];
  callQueue: CallRequest[];
  callPlans: CallPlan[];
  peers: PresencePeer[];
  roomParticipants: RoomParticipant[];
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
  onJoinGroupRoom: (
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
  entryIntent = 'group',
  myProfile,
  modelProfile,
  studioState,
  studioConfig,
  galleryItems,
  callQueue,
  callPlans,
  peers,
  roomParticipants,
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
  onJoinGroupRoom,
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
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [paymentAuthorized, setPaymentAuthorized] = useState(true);
  const [submitting, setSubmitting] = useState<'group' | 'private' | null>(null);
  const [activePixCharge, setActivePixCharge] = useState<PixChargeRecord | null>(
    null
  );
  const [pendingPixCall, setPendingPixCall] = useState<{
    mode: 'group' | 'private';
    plan: CallPlan;
    topic: string;
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

  const buildCleanTopic = (plan: CallPlan, mode: 'group' | 'private') => {
    const base =
      topic.trim() ||
      `${plan.name} · Pagamento ${paymentMethod === 'pix' ? 'PIX' : 'Cartão'}`;
    return mode === 'private' ? `[Privativa 1-para-1] ${base}` : base;
  };

  const startCallPlanPixCharge = async (
    mode: 'group' | 'private',
    plan: CallPlan,
    cleanTopic: string
  ) => {
    if (!onCreatePixCharge) return;
    setPixError(null);
    const res = await onCreatePixCharge({
      modelId: modelId || 'lorena_noir',
      kind: 'call_plan',
      planId: plan.id,
      callMode: mode,
      topic: cleanTopic,
    });
    if (res.ok && res.charge) {
      setPendingPixCall({ mode, plan, topic: cleanTopic });
      setActivePixCharge(res.charge);
    } else {
      setPixError(res.error || 'Não foi possível gerar o QR Code PIX.');
    }
  };

  const handleJoinSharedRoom = async () => {
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
    const cleanTopic = buildCleanTopic(selectedPlan, 'group');
    setSubmitting('group');
    setPixError(null);
    try {
      if (paymentMethod === 'pix' && onCreatePixCharge) {
        await startCallPlanPixCharge('group', selectedPlan, cleanTopic);
        return;
      }
      await onJoinGroupRoom(cleanTopic, selectedPlan);
      setTopic('');
    } finally {
      setSubmitting(null);
    }
  };

  const handlePrivateOneOnOneCall = async () => {
    if (
      submitting ||
      isBlocked ||
      dndBlocked ||
      activeRequest ||
      !selectedPlan ||
      !paymentAuthorized
    ) {
      return;
    }
    const cleanTopic = buildCleanTopic(selectedPlan, 'private');
    setSubmitting('private');
    setPixError(null);
    try {
      if (paymentMethod === 'pix' && onCreatePixCharge) {
        await startCallPlanPixCharge('private', selectedPlan, cleanTopic);
        return;
      }
      if (canDirectCallNow) {
        await onDirectCallModel(cleanTopic, selectedPlan);
      } else {
        await onRequestCall(cleanTopic, selectedPlan);
      }
      setTopic('');
    } finally {
      setSubmitting(null);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (entryIntent === 'private') {
      await handlePrivateOneOnOneCall();
    } else {
      await handleJoinSharedRoom();
    }
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
            studioConfig?.groupButtonLabel ||
            DEFAULT_STUDIO_CONFIG.groupButtonLabel
          }
          privateCtaLabel={
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
                  : 'Sala aberta'}{' '}
                · {roomParticipants.length} na videochamada agora
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
                    ? `${displayModelName} está em atendimento privativo no momento`
                    : `${resolvedQueueSummary.totalWaiting} ${
                        resolvedQueueSummary.totalWaiting === 1
                          ? 'internauta aguardando'
                          : 'internautas aguardando'
                      } na fila`}
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

          {entryIntent === 'private' && (
            <div className="px-4 py-2.5 rounded-xl bg-[#21142D] border border-[#F4C2D7]/40 text-xs text-[#F8D6E3] flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Modo selecionado: Chamada Privativa 1-para-1 (exclusivamente você e{' '}
                {displayModelName}).
              </span>
            </div>
          )}
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
            <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/15 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[#FAF4F7]">
                  <CreditCard className="w-4 h-4 text-[#F4C2D7] shrink-0" />
                  <span className="font-medium">Forma de pagamento</span>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#150D1D] border border-[#F4C2D7]/15 rounded-full self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      paymentMethod === 'pix'
                        ? 'luxury-rose-cta font-semibold'
                        : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                    }`}
                  >
                    PIX Instantâneo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`px-3 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'luxury-rose-cta font-semibold'
                        : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                    }`}
                  >
                    Cartão de Crédito
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#C9BAC4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentAuthorized}
                  onChange={(e) => setPaymentAuthorized(e.target.checked)}
                  className="mt-0.5 accent-[#F4C2D7] cursor-pointer"
                />
                <span>
                  Autorizo a cobrança de{' '}
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

              {paymentMethod === 'pix' && (
                <p className="text-[11px] text-[#38BDF8] flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Ao clicar abaixo, geraremos o QR Code PIX + Copia e Cola para
                    liberação imediata da sua sessão.
                  </span>
                </p>
              )}
            </div>

            {pixError && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
              >
                {pixError}
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
                type="button"
                onClick={() => void handlePrivateOneOnOneCall()}
                disabled={
                  Boolean(submitting) ||
                  dndBlocked ||
                  !selectedPlan ||
                  !paymentAuthorized ||
                  studioState?.callMode === 'paused'
                }
                className={`inline-flex items-center gap-2.5 px-5 py-3 text-xs font-semibold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  entryIntent === 'private'
                    ? 'luxury-rose-cta'
                    : 'bg-[#1A1024] border border-[#F4C2D7]/45 text-[#FAF4F7] hover:border-[#F4C2D7] hover:bg-[#281837]'
                }`}
              >
                {canDirectCallNow ? (
                  <Lock className="w-4 h-4 shrink-0" />
                ) : (
                  <PhoneCall className="w-4 h-4 shrink-0" />
                )}
                <span>
                  {submitting === 'private'
                    ? 'Chamando no privado...'
                    : canDirectCallNow
                      ? `Chamada Privativa Só com ${displayModelName} (1-para-1)`
                      : 'Solicitar Chamada Privativa (1-para-1)'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleJoinSharedRoom()}
                disabled={
                  Boolean(submitting) ||
                  dndBlocked ||
                  !selectedPlan ||
                  !paymentAuthorized ||
                  studioState?.callMode === 'paused'
                }
                className={`inline-flex items-center gap-2.5 px-5 py-3 text-xs font-semibold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  entryIntent === 'private'
                    ? 'bg-[#1A1024] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#281837]'
                    : 'luxury-rose-cta'
                }`}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>
                  {dndBlocked
                    ? 'Modo Não Perturbe ativo'
                    : studioState?.callMode === 'paused'
                      ? 'Sala temporariamente fechada'
                      : submitting === 'group'
                        ? 'Conectando na sala...'
                        : selectedPlan
                          ? `Sala ao Vivo (Múltiplos Internautas · ${BRL_FORMATTER.format(
                              selectedPlan.priceCents / 100
                            )})`
                          : 'Selecione um plano'}
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
            alt={`Ambiente do Salão Privado ${studioConfig?.studioBrand || 'Maison Aura'}`}
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
            Sala Ao Vivo · {roomParticipants.length} conectado
            {roomParticipants.length === 1 ? '' : 's'}
          </p>
          <p className="font-display text-2xl font-semibold text-[#FAF4F7]">
            Sala Compartilhada ou Privativa 1-para-1
          </p>
          <p className="text-xs text-[#C9BAC4]">
            Escolha entrar na sala compartilhada com outros internautas ou iniciar uma sessão 100% privativa somente com {displayModelName}.
          </p>
        </div>
      </aside>
    </div>

      <TipGoalProgressCard
        modelId={modelId || 'lorena_noir'}
        modelName={displayModelName}
        studioState={studioState}
        isAuthenticated={true}
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
          studioConfig?.groupButtonLabel ||
          DEFAULT_STUDIO_CONFIG.groupButtonLabel
        }
        privateCtaLabel={
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
        onPrivateAction={() => void handlePrivateOneOnOneCall()}
      />

      {activePixCharge &&
        pendingPixCall &&
        onCheckPixCharge &&
        onConfirmPixCharge && (
          <PixPaymentModal
            charge={activePixCharge}
            title={`Pagamento PIX · ${pendingPixCall.plan.name}`}
            subtitle={`${
              pendingPixCall.mode === 'private'
                ? 'Chamada Privativa 1-para-1'
                : 'Sala ao Vivo'
            } com ${displayModelName}`}
            confirmLabel="Já Paguei via PIX · Liberar Chamada"
            onClose={() => {
              setActivePixCharge(null);
              setPendingPixCall(null);
            }}
            onCancelCharge={onCancelPixCharge}
            onCheckStatus={onCheckPixCharge}
            onConfirmPayment={onConfirmPixCharge}
            onRegenerate={async () => {
              await startCallPlanPixCharge(
                pendingPixCall.mode,
                pendingPixCall.plan,
                pendingPixCall.topic
              );
            }}
            onPaid={async (res) => {
              const pending = pendingPixCall;
              setActivePixCharge(null);
              setPendingPixCall(null);
              setTopic('');
              if (pending.mode === 'group') {
                await onJoinGroupRoom(
                  pending.topic,
                  pending.plan,
                  res.callRequestId
                );
              } else if (canDirectCallNow) {
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
