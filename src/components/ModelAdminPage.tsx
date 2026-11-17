import React, { useMemo, useState } from 'react';
import {
  Ban,
  Mic,
  MicOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Users,
  Video,
  X,
} from 'lucide-react';
import type {
  AccessStatus,
  CallHistoryRecord,
  CallHistoryStatus,
  CallMessage,
  CallPaymentStatus,
  CallPlan,
  CallRequest,
  CallStatus,
  InterestMessage,
  InterestMessageStatus,
  PresencePeer,
  RoomParticipant,
  StudioCallMode,
  StudioProfile,
  StudioState,
} from '../types/studio';
import type { ModerationEffect } from '../hooks/useWebSocketStudio';
import { isDndActiveNow } from '../lib/schedule';
import { CallPlansManager } from './CallPlansManager';
import { DoNotDisturbPanel } from './DoNotDisturbPanel';
import { InterestMessagesPanel } from './InterestMessagesPanel';
import { ModelOfflineView } from './ModelOfflineView';
import { UserControlPanel } from './UserControlPanel';
import { VideoCallStage } from './VideoCallStage';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

interface ModelAdminPageProps {
  myUid: string;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  allProfiles: StudioProfile[];
  peers: PresencePeer[];
  roomParticipants: RoomParticipant[];
  studioState: StudioState | null;
  callQueue: CallRequest[];
  callMessages: CallMessage[];
  callHistory: CallHistoryRecord[];
  interestMessages: InterestMessage[];
  callPlans: CallPlan[];
  ratePerMinuteCents: number;
  onChangeRatePerMinuteCents: (cents: number) => void;
  wsConnected: boolean;
  isGroupRoom: boolean;
  activeCallId: string | null;
  activePartnerUid: string | null;
  activePartnerName: string;
  activePlan?: {
    name: string;
    durationMinutes: number;
    priceCents: number;
  } | null;
  incomingRing: {
    callId: string;
    fromUid: string;
    fromName: string;
    planName?: string;
    planDurationMinutes?: number;
    planPriceCents?: number;
  } | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  peerConnectionStates: Record<string, RTCPeerConnectionState>;
  micEnabled: boolean;
  camEnabled: boolean;
  mediaError: string | null;
  connectionState: RTCPeerConnectionState;
  elapsedSeconds: number;
  onAcquireMedia: () => Promise<MediaStream | null>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEndCall: () => Promise<void>;
  onJoinGroupRoomAdmin: () => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
  onAcceptIncomingRing: () => Promise<void>;
  onRejectIncomingRing: () => void;
  onAcceptQueueAndCall: (req: CallRequest) => Promise<void>;
  onUpdateCallStatus: (
    requestId: string,
    status: CallStatus,
    paymentStatus?: CallPaymentStatus
  ) => Promise<void>;
  onDirectCallUser: (target: {
    uid: string;
    displayName: string;
    photoUrl?: string;
  }) => Promise<void>;
  onSavePlan: (input: {
    id?: string;
    name: string;
    description: string;
    durationMinutes: number;
    priceCents: number;
    active: boolean;
    sortOrder: number;
  }) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
  onUpdateStudioState: (
    patch: Partial<{
      modelName: string;
      isLive: boolean;
      callMode: StudioCallMode;
      headline: string;
      autoScheduleEnabled: boolean;
      scheduleStartTime: string;
      scheduleEndTime: string;
      scheduleDays: string;
      scheduleTimezone: string;
      dndActive: boolean;
      dndUntilMs: number;
      dndScheduleEnabled: boolean;
      dndStartTime: string;
      dndEndTime: string;
    }>
  ) => Promise<void>;
  onUpdateUserControl: (
    targetUid: string,
    patch: Partial<{ accessStatus: AccessStatus; notes: string }>
  ) => Promise<void>;
  onSendModeration: (
    targetUid: string,
    action: ModerationEffect['action'],
    reason?: string
  ) => void;
  onRecordCallHistory: (input: {
    callId: string;
    userId: string;
    userName: string;
    durationSeconds: number;
    amountCents: number;
    planId?: string;
    planName?: string;
    planDurationMinutes?: number;
  }) => Promise<void>;
  onUpdateCallHistoryStatus: (
    recordId: string,
    status: CallHistoryStatus
  ) => Promise<void>;
  onUpdateInterestMessageStatus: (
    messageId: string,
    status: InterestMessageStatus
  ) => Promise<void>;
  onDeleteInterestMessage: (messageId: string) => Promise<void>;
}

type AdminSection = 'reception' | 'plans' | 'offline_schedule' | 'management';

export const ModelAdminPage: React.FC<ModelAdminPageProps> = ({
  myUid,
  myProfile,
  modelProfile,
  allProfiles,
  peers,
  roomParticipants,
  studioState,
  callQueue,
  callMessages,
  callHistory,
  interestMessages,
  callPlans,
  ratePerMinuteCents,
  onChangeRatePerMinuteCents,
  wsConnected,
  isGroupRoom,
  activeCallId,
  activePartnerUid,
  activePartnerName,
  activePlan,
  incomingRing,
  localStream,
  remoteStream,
  remoteStreams,
  peerConnectionStates,
  micEnabled,
  camEnabled,
  mediaError,
  connectionState,
  elapsedSeconds,
  onAcquireMedia,
  onToggleMic,
  onToggleCam,
  onEndCall,
  onJoinGroupRoomAdmin,
  onSendMessage,
  onAcceptIncomingRing,
  onRejectIncomingRing,
  onAcceptQueueAndCall,
  onUpdateCallStatus,
  onDirectCallUser,
  onSavePlan,
  onDeletePlan,
  onUpdateStudioState,
  onUpdateUserControl,
  onSendModeration,
  onRecordCallHistory,
  onUpdateCallHistoryStatus,
  onUpdateInterestMessageStatus,
  onDeleteInterestMessage,
}) => {
  const [section, setSection] = useState<AdminSection>('reception');

  const onlineVisitors = useMemo(
    () => peers.filter((p) => p.uid !== myUid),
    [peers, myUid]
  );

  const waitingRequests = useMemo(
    () => callQueue.filter((c) => c.status === 'waiting'),
    [callQueue]
  );

  const profileMap = useMemo(() => {
    const map = new Map<string, StudioProfile>();
    for (const p of allProfiles) {
      map.set(p.uid, p);
    }
    return map;
  }, [allProfiles]);

  const activePartnerProfile =
    activePartnerUid && !isGroupRoom
      ? profileMap.get(activePartnerUid) || null
      : null;
  const activePartnerMuted = activePartnerProfile?.accessStatus === 'muted';
  const dndActiveNow = isDndActiveNow(studioState);

  return (
    <div className="space-y-6">
      {/* Model Reception Top Control Strip */}
      <section className="bg-[#13151A] border border-white/10 rounded-xl p-5 sm:px-6 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#C9A46B]">
            Administração da Modelo · {studioState?.modelName || 'Lorena Noir'}
          </p>
          <h1 className="font-display text-3xl font-semibold text-[#F3EFE6]">
            Central de Recepção de Videochamadas
          </h1>
          <p className="text-xs text-[#9BA1AE] tabular-nums">
            {onlineVisitors.length} internauta
            {onlineVisitors.length === 1 ? '' : 's'} online ·{' '}
            {roomParticipants.length} na sala ao vivo ·{' '}
            {waitingRequests.length} na fila ·{' '}
            {dndActiveNow
              ? 'Modo Não Perturbe ativo'
              : wsConnected
                ? 'Sinalização em tempo real ativa'
                : 'Reconectando'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isGroupRoom && (
            <button
              type="button"
              onClick={() => void onJoinGroupRoomAdmin()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5" />
              <span>
                {roomParticipants.length > 0
                  ? `Entrar na Sala Ao Vivo (${roomParticipants.length})`
                  : 'Abrir Sala Ao Vivo (Grupo)'}
              </span>
            </button>
          )}

          {/* Availability toggle */}
          <button
            type="button"
            onClick={() =>
              void onUpdateStudioState({
                isLive: !(studioState?.isLive ?? true),
                autoScheduleEnabled: false,
              })
            }
            className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              studioState?.isLive ?? true
                ? 'bg-[#16A34A]/20 border-[#16A34A]/50 text-[#86EFAC]'
                : 'bg-[#1B1E26] border-white/15 text-[#9BA1AE]'
            }`}
          >
            {studioState?.isLive ?? true
              ? 'Recebendo Chamadas'
              : 'Em Descanso (Offline)'}
          </button>

          {/* Call mode selector */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
            {(
              [
                { id: 'open', label: 'Chamada Direta' },
                { id: 'queue_only', label: 'Somente Fila' },
                { id: 'paused', label: 'Fechado' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => void onUpdateStudioState({ callMode: mode.id })}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  (studioState?.callMode ?? 'open') === mode.id
                    ? 'bg-[#C9A46B] text-[#0B0C0F]'
                    : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Admin Sub-View Switch */}
          <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
            <button
              type="button"
              onClick={() => setSection('reception')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                section === 'reception'
                  ? 'bg-[#1F232C] text-[#F3EFE6]'
                  : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
              }`}
            >
              Recepção ao Vivo
            </button>
            <button
              type="button"
              onClick={() => setSection('plans')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                section === 'plans'
                  ? 'bg-[#1F232C] text-[#F3EFE6]'
                  : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
              }`}
            >
              Planos e Preços
            </button>
            <button
              type="button"
              onClick={() => setSection('offline_schedule')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                section === 'offline_schedule'
                  ? 'bg-[#1F232C] text-[#F3EFE6]'
                  : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
              }`}
            >
              Horários e Descanso
            </button>
            <button
              type="button"
              onClick={() => setSection('management')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                section === 'management'
                  ? 'bg-[#1F232C] text-[#F3EFE6]'
                  : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
              }`}
            >
              Usuários e Receita
            </button>
          </div>
        </div>
      </section>

      {section === 'reception' ? (
        <div className="space-y-6">
          {/* Active Caller Quick Moderation Bar when in a 1-on-1 call */}
          {activePartnerUid && !isGroupRoom && (
            <div className="bg-[#13151A] border border-[#C9A46B]/40 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-[#F3EFE6]">
                  Atendendo agora: {activePartnerName}
                </p>
                <p className="text-[#9BA1AE]">
                  Modere o áudio ou encerre o acesso do internauta instantaneamente.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextStatus = activePartnerMuted ? 'active' : 'muted';
                    const wsAction = activePartnerMuted ? 'unmute' : 'mute';
                    void onUpdateUserControl(activePartnerUid, {
                      accessStatus: nextStatus,
                    });
                    onSendModeration(activePartnerUid, wsAction);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#1B1E26] border border-white/15 text-[#F3EFE6] hover:bg-[#252A36] transition-colors cursor-pointer"
                >
                  {activePartnerMuted ? (
                    <Mic className="w-3.5 h-3.5 text-[#86EFAC]" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5 text-[#FCD34D]" />
                  )}
                  <span>
                    {activePartnerMuted ? 'Liberar Áudio' : 'Silenciar Internauta'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void onUpdateUserControl(activePartnerUid, {
                      accessStatus: 'blocked',
                    });
                    onSendModeration(activePartnerUid, 'block');
                    void onEndCall();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-950/40 border border-red-500/35 text-red-200 hover:bg-red-950/60 transition-colors cursor-pointer"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Bloquear e Encerrar</span>
                </button>
              </div>
            </div>
          )}

          {/* Video Reception Stage */}
          <VideoCallStage
            isAdmin={true}
            isGroupRoom={isGroupRoom}
            myProfile={myProfile}
            modelProfile={modelProfile}
            studioState={studioState}
            activeCallId={activeCallId}
            activePartnerName={activePartnerName}
            activePartnerUid={activePartnerUid}
            activePlan={activePlan}
            localStream={localStream}
            remoteStream={remoteStream}
            remoteStreams={remoteStreams}
            peerConnectionStates={peerConnectionStates}
            roomParticipants={roomParticipants}
            micEnabled={micEnabled}
            camEnabled={camEnabled}
            mediaError={mediaError}
            connectionState={connectionState}
            elapsedSeconds={elapsedSeconds}
            wsConnected={wsConnected}
            messages={callMessages}
            onAcquireMedia={onAcquireMedia}
            onToggleMic={onToggleMic}
            onToggleCam={onToggleCam}
            onEndCall={() => void onEndCall()}
            onSendMessage={onSendMessage}
          />

          {/* Scheduled Do Not Disturb Mode */}
          <DoNotDisturbPanel
            studioState={studioState}
            onUpdateStudioState={onUpdateStudioState}
          />

          {/* Incoming Calls Queue & Online Visitors Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Incoming & Waiting Queue */}
            <section className="lg:col-span-6 bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <PhoneIncoming className="w-4 h-4 text-[#C9A46B]" />
                  <h2 className="text-sm font-semibold text-[#F3EFE6]">
                    Chamadas Recebidas e Fila
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#E2C799]">
                  {waitingRequests.length + (incomingRing ? 1 : 0)} pendente
                  {waitingRequests.length + (incomingRing ? 1 : 0) === 1
                    ? ''
                    : 's'}
                </span>
              </div>

              <div className="divide-y divide-white/5">
                {incomingRing && (
                  <div className="p-5 bg-[#1B1710] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-semibold text-[#E2C799]">
                        Chamando agora
                      </p>
                      <p className="text-sm font-semibold text-[#F3EFE6] truncate">
                        {incomingRing.fromName}
                      </p>
                      {incomingRing.planName &&
                        typeof incomingRing.planPriceCents === 'number' && (
                          <p className="text-[11px] font-mono tabular-nums text-[#86EFAC]">
                            {incomingRing.planName} ·{' '}
                            {BRL_FORMATTER.format(
                              incomingRing.planPriceCents / 100
                            )}{' '}
                            · Pré-autorizado
                          </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onAcceptIncomingRing()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Atender Vídeo</span>
                      </button>
                      <button
                        type="button"
                        onClick={onRejectIncomingRing}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1B1E26] border border-white/10 text-[#9BA1AE] hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        <span>Recusar</span>
                      </button>
                    </div>
                  </div>
                )}

                {waitingRequests.length === 0 && !incomingRing ? (
                  <div className="p-10 text-center space-y-1.5">
                    <p className="text-sm font-medium text-[#F3EFE6]">
                      Nenhuma chamada aguardando atendimento.
                    </p>
                    <p className="text-xs text-[#9BA1AE]">
                      Quando um internauta contratar um plano e chamar Lorena Noir, o pedido aparecerá aqui em tempo real.
                    </p>
                  </div>
                ) : (
                  waitingRequests.map((req) => {
                    const isOnline = onlineVisitors.some(
                      (p) => p.uid === req.userId
                    );
                    return (
                      <div
                        key={req.id}
                        className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-medium text-[#F3EFE6] truncate">
                            {req.userName}
                          </p>
                          <p className="text-xs text-[#9BA1AE] truncate">
                            {req.topic} · {isOnline ? 'Online agora' : 'Offline'}
                          </p>
                          {req.planName &&
                            typeof req.planPriceCents === 'number' && (
                              <p className="text-[11px] font-mono tabular-nums text-[#E2C799]">
                                {req.planName} ·{' '}
                                {BRL_FORMATTER.format(req.planPriceCents / 100)}{' '}
                                ·{' '}
                                {req.paymentStatus === 'captured'
                                  ? 'Cobrado'
                                  : 'Pré-autorizado'}
                              </p>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void onAcceptQueueAndCall(req)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors cursor-pointer"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Atender</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void onUpdateCallStatus(
                                req.id,
                                'rejected',
                                'refunded'
                              )
                            }
                            aria-label={`Recusar ${req.userName}`}
                            className="p-2 rounded-lg bg-[#161920] border border-white/10 text-[#9BA1AE] hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Online Visitors Right Now */}
            <section className="lg:col-span-6 bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-[#86EFAC]" />
                  <h2 className="text-sm font-semibold text-[#F3EFE6]">
                    Internautas Conectados Agora
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#86EFAC]">
                  {onlineVisitors.length} online
                </span>
              </div>

              {onlineVisitors.length === 0 ? (
                <div className="p-10 text-center space-y-1.5">
                  <p className="text-sm font-medium text-[#F3EFE6]">
                    Nenhum internauta conectado neste instante.
                  </p>
                  <p className="text-xs text-[#9BA1AE]">
                    Você receberá uma notificação em tempo real assim que alguém entrar no site.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {onlineVisitors.map((visitor) => {
                    const prof = profileMap.get(visitor.uid);
                    const status = prof?.accessStatus || visitor.accessStatus;
                    const isBlocked = status === 'blocked';
                    return (
                      <div
                        key={visitor.uid}
                        className="px-5 py-3.5 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {visitor.photoUrl ? (
                            <img
                              src={visitor.photoUrl}
                              alt={visitor.displayName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#1B1E26] flex items-center justify-center text-xs font-semibold text-[#C9A46B] shrink-0">
                              {visitor.displayName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#F3EFE6] truncate">
                              {visitor.displayName}
                            </p>
                            <p className="text-xs text-[#9BA1AE]">
                              {visitor.inCallWith
                                ? 'Em videochamada'
                                : 'Na recepção'}{' '}
                              ·{' '}
                              {status === 'vip'
                                ? 'VIP'
                                : status === 'muted'
                                  ? 'Silenciado'
                                  : isBlocked
                                    ? 'Bloqueado'
                                    : 'Ativo'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isBlocked}
                          onClick={() =>
                            void onDirectCallUser({
                              uid: visitor.uid,
                              displayName: visitor.displayName,
                              photoUrl: visitor.photoUrl,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>Chamar</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Offline Interest Messages */}
          <InterestMessagesPanel
            messages={interestMessages}
            peers={peers}
            onUpdateStatus={onUpdateInterestMessageStatus}
            onDeleteMessage={onDeleteInterestMessage}
            onDirectCallUser={onDirectCallUser}
          />
        </div>
      ) : section === 'plans' ? (
        <CallPlansManager
          plans={callPlans}
          onSavePlan={onSavePlan}
          onDeletePlan={onDeletePlan}
        />
      ) : section === 'offline_schedule' ? (
        <div className="space-y-8">
          <ModelOfflineView
            isAdmin={true}
            myProfile={myProfile}
            modelProfile={modelProfile}
            studioState={studioState}
            modelOnline={true}
            myInterestMessages={interestMessages}
            onSendInterestMessage={async () => null}
            onUpdateStudioState={onUpdateStudioState}
          />
          <DoNotDisturbPanel
            studioState={studioState}
            onUpdateStudioState={onUpdateStudioState}
          />
          <InterestMessagesPanel
            messages={interestMessages}
            peers={peers}
            onUpdateStatus={onUpdateInterestMessageStatus}
            onDeleteMessage={onDeleteInterestMessage}
            onDirectCallUser={onDirectCallUser}
          />
        </div>
      ) : (
        <UserControlPanel
          myUid={myUid}
          profiles={allProfiles}
          peers={peers}
          studioState={studioState}
          callHistory={callHistory}
          interestMessages={interestMessages}
          callPlans={callPlans}
          ratePerMinuteCents={ratePerMinuteCents}
          onChangeRatePerMinuteCents={onChangeRatePerMinuteCents}
          onUpdateStudioState={onUpdateStudioState}
          onUpdateUserControl={onUpdateUserControl}
          onSendModeration={onSendModeration}
          onDirectCallUser={onDirectCallUser}
          onSavePlan={onSavePlan}
          onDeletePlan={onDeletePlan}
          onRecordCallHistory={onRecordCallHistory}
          onUpdateCallHistoryStatus={onUpdateCallHistoryStatus}
          onUpdateInterestMessageStatus={onUpdateInterestMessageStatus}
          onDeleteInterestMessage={onDeleteInterestMessage}
        />
      )}
    </div>
  );
};
