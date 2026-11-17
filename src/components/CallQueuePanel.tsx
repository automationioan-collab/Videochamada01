import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CreditCard,
  PhoneCall,
  PhoneOff,
  Users,
  Video,
  X,
} from 'lucide-react';
import { isDndActiveNow } from '../lib/schedule';
import { GaleriaModelo } from './GaleriaModelo';
import type {
  CallPaymentStatus,
  CallPlan,
  CallRequest,
  CallStatus,
  PresencePeer,
  RoomParticipant,
  StudioProfile,
  StudioState,
} from '../types/studio';

interface CallQueuePanelProps {
  isAdmin: boolean;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  callQueue: CallRequest[];
  callPlans: CallPlan[];
  peers: PresencePeer[];
  roomParticipants: RoomParticipant[];
  onRequestCall: (topic: string, plan: CallPlan) => Promise<string | null>;
  onDirectCallModel: (topic: string, plan: CallPlan) => Promise<void>;
  onJoinGroupRoom: (topic: string, plan: CallPlan) => Promise<void>;
  onAcceptAndCall: (req: CallRequest) => Promise<void>;
  onUpdateCallStatus: (
    requestId: string,
    status: CallStatus,
    paymentStatus?: CallPaymentStatus
  ) => Promise<void>;
  onEnterAcceptedCall: (req: CallRequest) => void;
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
  myProfile,
  modelProfile,
  studioState,
  callQueue,
  callPlans,
  peers,
  roomParticipants,
  onRequestCall,
  onDirectCallModel,
  onJoinGroupRoom,
  onAcceptAndCall,
  onUpdateCallStatus,
  onEnterAcceptedCall,
}) => {
  const [topic, setTopic] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [paymentAuthorized, setPaymentAuthorized] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
  const canDirectCallNow =
    Boolean(modelProfile) &&
    modelOnline &&
    !dndBlocked &&
    (studioState?.isLive ?? true) &&
    (studioState?.callMode ?? 'open') === 'open';
  const displayModelName =
    studioState?.modelName || modelProfile?.displayName || 'Lorena Noir';

  const buildCleanTopic = (plan: CallPlan) =>
    topic.trim() ||
    `${plan.name} · Pagamento ${paymentMethod === 'pix' ? 'PIX' : 'Cartão'}`;

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
    setSubmitting(true);
    try {
      await onJoinGroupRoom(buildCleanTopic(selectedPlan), selectedPlan);
      setTopic('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setSubmitting(true);
    try {
      const cleanTopic = buildCleanTopic(selectedPlan);
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

  if (isAdmin) {
    const waitingCalls = callQueue.filter((c) => c.status === 'waiting');
    const historyCalls = callQueue.filter((c) => c.status !== 'waiting').slice(0, 12);

    return (
      <div className="space-y-8">
        <section className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#F3EFE6]">
                Fila de Chamadas em Tempo Real
              </h2>
              <p className="text-xs text-[#9BA1AE]">
                Aceite solicitações para abrir a videochamada instantaneamente com o usuário.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#E2C799]">
              {waitingCalls.length} aguardando
            </span>
          </div>

          {waitingCalls.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-medium text-[#F3EFE6]">
                Nenhuma solicitação pendente na fila.
              </p>
              <p className="text-xs text-[#9BA1AE]">
                Novos pedidos aparecem automaticamente aqui ou você pode iniciar uma chamada na aba Usuários.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
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
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#1B1E26] flex items-center justify-center text-sm font-semibold text-[#C9A46B] shrink-0">
                          {req.userName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#F3EFE6] truncate">
                          {req.userName}
                        </p>
                        <p className="text-xs text-[#9BA1AE] truncate">
                          {req.topic} · {isOnline ? 'Online agora' : 'Offline'}
                        </p>
                        {req.planName && typeof req.planPriceCents === 'number' && (
                          <p className="text-[11px] font-mono tabular-nums text-[#E2C799] mt-0.5">
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
                        className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Aceitar e Conectar Vídeo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdateCallStatus(req.id, 'rejected', 'refunded')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B1E26] border border-white/10 text-[#9BA1AE] hover:text-red-300 transition-colors whitespace-nowrap cursor-pointer"
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
          <section className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-[#F3EFE6]">
                Histórico Recente de Sessões
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {historyCalls.map((item) => (
                <div
                  key={item.id}
                  className="px-6 py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-[#F3EFE6]">
                      {item.userName}
                    </span>
                    <span className="text-[#727988] mx-2">·</span>
                    <span className="text-[#9BA1AE] truncate">{item.topic}</span>
                  </div>
                  <span className="text-[#9BA1AE] whitespace-nowrap shrink-0">
                    {CALL_STATUS_LABEL[item.status]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // Viewer / Client Queue & Model Availability View
  return (
    <div className="space-y-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
      <section className="lg:col-span-7 bg-[#13151A] border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/model_avatar_camila_1794946401641.jpg"
                alt={displayModelName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-16 h-16 rounded-full object-cover border border-white/15 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#1B1E26] flex items-center justify-center font-display text-2xl text-[#C9A46B]">
                L
              </div>
            )}
            <div>
              <h2 className="font-display text-3xl font-semibold text-[#F3EFE6]">
                {displayModelName}
              </h2>
              <p className="text-xs text-[#9BA1AE] font-mono tabular-nums">
                {studioState?.isLive ?? true
                  ? 'Estúdio Ao Vivo'
                  : 'Estúdio Pausado'}{' '}
                ·{' '}
                {modelOnline
                  ? 'Lorena Noir conectada agora'
                  : 'Sala aberta'}{' '}
                · {roomParticipants.length} na videochamada agora
              </p>
            </div>
          </div>

          <p className="text-sm text-[#C8CCD4] leading-relaxed">
            {studioState?.headline ||
              'Atendimento privado e sala aberta em videochamada ao vivo com Lorena Noir.'}
          </p>
        </div>

        {isBlocked ? (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200">
            Seu acesso às videochamadas foi suspenso pela moderação do estúdio.
          </div>
        ) : activeRequest ? (
          <div className="p-5 rounded-xl bg-[#0B0C0F] border border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs text-[#9BA1AE]">Sua solicitação atual</p>
                <p className="text-sm font-medium text-[#F3EFE6] truncate">
                  {activeRequest.topic}
                </p>
                {activeRequest.planName &&
                  typeof activeRequest.planPriceCents === 'number' && (
                    <p className="text-xs font-mono tabular-nums text-[#E2C799]">
                      {activeRequest.planName} ·{' '}
                      {BRL_FORMATTER.format(activeRequest.planPriceCents / 100)}{' '}
                      · Autorizado
                    </p>
                  )}
              </div>
              <span className="text-xs font-medium text-[#E2C799] whitespace-nowrap shrink-0">
                {CALL_STATUS_LABEL[activeRequest.status]}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(activeRequest.status === 'accepted' ||
                activeRequest.status === 'in_call') && (
                <button
                  type="button"
                  onClick={() => onEnterAcceptedCall(activeRequest)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors cursor-pointer"
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
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#161920] border border-white/10 text-[#9BA1AE] hover:text-red-300 transition-colors cursor-pointer"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Cancelar Solicitação</span>
                </button>
              )}
            </div>
          </div>
        ) : activePlans.length === 0 ? (
          <div className="p-4 rounded-lg bg-[#0B0C0F] border border-white/10 text-xs text-[#9BA1AE]">
            Nenhum plano pré-definido de videochamada está ativo no momento. Aguarde a modelo liberar os pacotes de atendimento.
          </div>
        ) : (
          <form onSubmit={handleRequestSubmit} className="space-y-5">
            {/* Step 1: Predefined Plan Selection */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#9BA1AE]">
                  1. Escolha um plano pré-definido para sua videochamada
                </span>
                <span className="text-[11px] text-[#E2C799]">
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
                      className={`p-3.5 rounded-lg border text-left transition-colors flex flex-col justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-[#1D1912] border-[#C9A46B] text-[#F3EFE6]'
                          : 'bg-[#0B0C0F] border-white/10 text-[#C8CCD4] hover:border-white/25'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono tabular-nums text-[#E2C799]">
                            {plan.durationMinutes} min
                          </span>
                          {isSelected && (
                            <Check className="w-3.5 h-3.5 text-[#C9A46B] shrink-0" />
                          )}
                        </div>
                        <p className="text-xs font-semibold text-[#F3EFE6] line-clamp-1">
                          {plan.name}
                        </p>
                      </div>
                      <p className="text-lg font-semibold font-mono tabular-nums text-[#F3EFE6]">
                        {BRL_FORMATTER.format(plan.priceCents / 100)}
                      </p>
                    </button>
                  );
                })}
              </div>

              {selectedPlan && (
                <p className="text-xs text-[#9BA1AE]">
                  {selectedPlan.description}
                </p>
              )}
            </div>

            {/* Step 2: Payment Method & Authorization */}
            <div className="p-3.5 rounded-lg bg-[#0B0C0F] border border-white/10 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[#F3EFE6]">
                  <CreditCard className="w-4 h-4 text-[#C9A46B] shrink-0" />
                  <span className="font-medium">Forma de pagamento</span>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#13151A] border border-white/10 rounded-lg self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('pix')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      paymentMethod === 'pix'
                        ? 'bg-[#C9A46B] text-[#0B0C0F]'
                        : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                    }`}
                  >
                    PIX Instantâneo
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      paymentMethod === 'card'
                        ? 'bg-[#C9A46B] text-[#0B0C0F]'
                        : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                    }`}
                  >
                    Cartão de Crédito
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#C8CCD4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentAuthorized}
                  onChange={(e) => setPaymentAuthorized(e.target.checked)}
                  className="mt-0.5 accent-[#C9A46B] cursor-pointer"
                />
                <span>
                  Autorizo a cobrança de{' '}
                  <strong className="font-mono tabular-nums text-[#E2C799]">
                    {selectedPlan
                      ? BRL_FORMATTER.format(selectedPlan.priceCents / 100)
                      : 'R$ 0,00'}
                  </strong>{' '}
                  pelo pacote de{' '}
                  <strong className="font-mono tabular-nums text-[#F3EFE6]">
                    {selectedPlan?.durationMinutes ?? 0} minutos
                  </strong>{' '}
                  com {displayModelName}.
                </span>
              </label>
            </div>

            {/* Step 3: Optional Topic */}
            <div className="space-y-1.5">
              <label
                htmlFor="call-topic"
                className="block text-xs font-medium text-[#9BA1AE]"
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
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-[#F3EFE6] placeholder:text-[#686E7C] focus:outline-none focus:border-[#C9A46B]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleJoinSharedRoom()}
                disabled={
                  submitting ||
                  dndBlocked ||
                  !selectedPlan ||
                  !paymentAuthorized ||
                  studioState?.callMode === 'paused'
                }
                className="inline-flex items-center gap-2.5 px-6 py-3 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Users className="w-4 h-4 shrink-0" />
                <span>
                  {dndBlocked
                    ? 'Modo Não Perturbe ativo'
                    : studioState?.callMode === 'paused'
                      ? 'Sala temporariamente fechada'
                      : submitting
                        ? 'Conectando na sala...'
                        : selectedPlan
                          ? `Autorizar ${BRL_FORMATTER.format(
                              selectedPlan.priceCents / 100
                            )} e Entrar na Videochamada ao Vivo`
                          : 'Selecione um plano'}
                </span>
              </button>

              <button
                type="submit"
                disabled={
                  submitting ||
                  dndBlocked ||
                  !selectedPlan ||
                  !paymentAuthorized ||
                  studioState?.callMode === 'paused'
                }
                className="inline-flex items-center gap-2 px-4 py-3 text-xs font-medium rounded-lg bg-[#161920] border border-white/15 text-[#F3EFE6] hover:bg-[#1F232C] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {canDirectCallNow ? (
                  <Video className="w-4 h-4 text-[#C9A46B] shrink-0" />
                ) : (
                  <PhoneCall className="w-4 h-4 text-[#C9A46B] shrink-0" />
                )}
                <span>
                  {canDirectCallNow
                    ? `Chamar ${displayModelName} (1-para-1)`
                    : 'Entrar na Fila Privada'}
                </span>
              </button>
            </div>
          </form>
        )}
      </section>

      <aside className="lg:col-span-5 relative rounded-xl overflow-hidden bg-[#13151A] border border-white/10 min-h-[300px]">
        {!loungeFailed ? (
          <img
            src="/src/assets/images/studio_backdrop_lounge_1794946401840.jpg"
            alt="Ambiente do Salão Privado Maison Aura"
            referrerPolicy="no-referrer"
            onError={() => setLoungeFailed(true)}
            className="w-full h-full object-cover lg:absolute lg:inset-0"
          />
        ) : (
          <div className="w-full h-full bg-[#161920]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F]/95 via-[#0B0C0F]/35 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-6 space-y-1">
          <p className="text-xs font-medium text-[#E2C799] font-mono tabular-nums">
            Sala Ao Vivo · {roomParticipants.length} conectado
            {roomParticipants.length === 1 ? '' : 's'}
          </p>
          <p className="font-display text-2xl font-semibold text-[#F3EFE6]">
            Videochamada Multi-Participantes
          </p>
          <p className="text-xs text-[#C8CCD4]">
            Entre imediatamente na sala ao vivo compartilhada com vários internautas e Lorena Noir, ou solicite atendimento exclusivo 1-para-1.
          </p>
        </div>
      </aside>
    </div>

      <GaleriaModelo
        modelName={displayModelName}
        ctaDisabled={isBlocked || dndBlocked || studioState?.callMode === 'paused'}
        ctaLabel="Entrar na Videochamada ao Vivo"
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
    </div>
  );
};
