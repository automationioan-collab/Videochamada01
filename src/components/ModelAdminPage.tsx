import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Ban,
  BellRing,
  Mic,
  MicOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  Trash2,
  Users,
  Video,
  Volume2,
  VolumeX,
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
  GalleryCategoryType,
  GalleryItemRecord,
  InterestMessage,
  InterestMessageStatus,
  PresencePeer,
  RoomParticipant,
  StudioConfig,
  StudioProfile,
  StudioRole,
  StudioState,
  StudioStateUpdatePatch,
} from '../types/studio';
import type { ModerationEffect } from '../hooks/useWebSocketStudio';
import { getScheduleFromState, isDndActiveNow } from '../lib/schedule';
import { AdminSiteEditor } from './AdminSiteEditor';
import { CallPlansManager } from './CallPlansManager';
import { DailyRevenueBarChart } from './DailyRevenueBarChart';
import { DoNotDisturbPanel } from './DoNotDisturbPanel';
import { InterestMessagesPanel } from './InterestMessagesPanel';
import { OperatingSchedulePanel } from './OperatingSchedulePanel';
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
  studioConfig: StudioConfig | null;
  galleryItems: GalleryItemRecord[];
  callQueue: CallRequest[];
  callMessages: CallMessage[];
  callHistory: CallHistoryRecord[];
  interestMessages: InterestMessage[];
  callPlans: CallPlan[];
  ratePerMinuteCents: number;
  onChangeRatePerMinuteCents: (cents: number) => void;
  soundEnabled: boolean;
  onToggleSoundEnabled: () => void;
  onTestSoundDing: () => void;
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
  onDeleteCallRequest: (requestId: string) => Promise<void>;
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
  onUpdateStudioState: (patch: StudioStateUpdatePatch) => Promise<void>;
  onSaveStudioConfig: (
    patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>>
  ) => Promise<void>;
  onSaveGalleryItem: (input: {
    id?: string;
    title: string;
    caption: string;
    category: GalleryCategoryType;
    specs: string;
    src: string;
    alt: string;
    sortOrder: number;
    active: boolean;
  }) => Promise<void>;
  onDeleteGalleryItem: (itemId: string) => Promise<void>;
  onRestoreDefaultGallery: () => Promise<void>;
  onUpdateUserControl: (
    targetUid: string,
    patch: Partial<{
      displayName: string;
      photoUrl: string;
      role: StudioRole;
      accessStatus: AccessStatus;
      notes: string;
    }>
  ) => Promise<void>;
  onDeleteUserProfile: (targetUid: string) => Promise<void>;
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
  onUpdateCallHistoryRecord: (
    recordId: string,
    patch: Partial<{
      durationSeconds: number;
      amountCents: number;
      status: CallHistoryStatus;
    }>
  ) => Promise<void>;
  onDeleteCallHistoryRecord: (recordId: string) => Promise<void>;
  onUpdateInterestMessageStatus: (
    messageId: string,
    status: InterestMessageStatus
  ) => Promise<void>;
  onDeleteInterestMessage: (messageId: string) => Promise<void>;
}

type AdminSection =
  | 'reception'
  | 'site_editor'
  | 'plans'
  | 'offline_schedule'
  | 'management';

export const ModelAdminPage: React.FC<ModelAdminPageProps> = ({
  myUid,
  myProfile,
  modelProfile,
  allProfiles,
  peers,
  roomParticipants,
  studioState,
  studioConfig,
  galleryItems,
  callQueue,
  callMessages,
  callHistory,
  interestMessages,
  callPlans,
  ratePerMinuteCents,
  onChangeRatePerMinuteCents,
  soundEnabled,
  onToggleSoundEnabled,
  onTestSoundDing,
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
  onDeleteCallRequest,
  onDirectCallUser,
  onSavePlan,
  onDeletePlan,
  onUpdateStudioState,
  onSaveStudioConfig,
  onSaveGalleryItem,
  onDeleteGalleryItem,
  onRestoreDefaultGallery,
  onUpdateUserControl,
  onDeleteUserProfile,
  onSendModeration,
  onRecordCallHistory,
  onUpdateCallHistoryStatus,
  onUpdateCallHistoryRecord,
  onDeleteCallHistoryRecord,
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
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-5 sm:px-6 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#F4C2D7]">
            Administração da Modelo · {studioState?.modelName || 'Lorena Noir'}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#FAF4F7]">
            Central de Recepção de Videochamadas
          </h1>
          <p className="text-xs text-[#C9BAC4] tabular-nums">
            {onlineVisitors.length} internauta
            {onlineVisitors.length === 1 ? '' : 's'} online ·{' '}
            {roomParticipants.length} na sala ao vivo ·{' '}
            {waitingRequests.length} na fila ·{' '}
            {dndActiveNow
              ? 'Modo Não Perturbe ativo'
              : studioState?.autoScheduleEnabled
                ? `Agenda automática (${
                    getScheduleFromState(studioState).schedulePeriods.filter(
                      (p) => p.enabled
                    ).length
                  } períodos)`
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
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
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
            className={`px-4 py-2 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              studioState?.isLive ?? true
                ? 'bg-[#16A34A]/20 border-[#16A34A]/50 text-[#86EFAC]'
                : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4]'
            }`}
          >
            {studioState?.isLive ?? true
              ? 'Recebendo Chamadas'
              : 'Em Descanso (Offline)'}
          </button>

          {/* Call mode selector */}
          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full">
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
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  (studioState?.callMode ?? 'open') === mode.id
                    ? 'luxury-rose-cta font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Audio Notification System Toggle & Test Ding */}
          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full">
            <button
              type="button"
              aria-pressed={soundEnabled}
              onClick={onToggleSoundEnabled}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                soundEnabled
                  ? 'bg-[#16A34A]/20 text-[#86EFAC]'
                  : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5" />
              )}
              <span>{soundEnabled ? 'Ding Ativo' : 'Som Mudo'}</span>
            </button>
            <button
              type="button"
              onClick={onTestSoundDing}
              title="Reproduzir som de notificação (ding)"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full text-[#F4C2D7] hover:bg-[#21142D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Testar</span>
            </button>
          </div>

          {/* Admin Sub-View Switch */}
          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full overflow-x-auto">
            {(
              [
                { id: 'reception', label: 'Recepção ao Vivo' },
                { id: 'site_editor', label: 'Site, Perfil e Galeria' },
                { id: 'plans', label: 'Planos e Preços' },
                { id: 'offline_schedule', label: 'Horários e Descanso' },
                { id: 'management', label: 'Usuários e Receita' },
              ] as const
            ).map((tab) => {
              const isSelected = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSection(tab.id)}
                  className={`relative px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'text-[#FAF4F7]'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="admin-section-tab"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full bg-[#281837] border border-[#F4C2D7]/35 shadow-[0_0_16px_-4px_rgba(244,194,215,0.4)]"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {section === 'reception' ? (
        <div className="space-y-6">
          {/* Active Caller Quick Moderation Bar when in a 1-on-1 call */}
          {activePartnerUid && !isGroupRoom && (
            <div className="luxury-card border border-[#F4C2D7]/40 rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-[#FAF4F7]">
                  Atendendo agora: {activePartnerName}
                </p>
                <p className="text-[#C9BAC4]">
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
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-full bg-[#21142D] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#281837] transition-colors cursor-pointer"
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
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-full bg-red-950/40 border border-red-500/35 text-red-200 hover:bg-red-950/60 transition-colors cursor-pointer"
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
            <section className="lg:col-span-6 luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F4C2D7]/15 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <PhoneIncoming className="w-4 h-4 text-[#F4C2D7]" />
                  <h2 className="text-sm font-semibold text-[#FAF4F7]">
                    Chamadas Recebidas e Fila
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                  {waitingRequests.length + (incomingRing ? 1 : 0)} pendente
                  {waitingRequests.length + (incomingRing ? 1 : 0) === 1
                    ? ''
                    : 's'}
                </span>
              </div>

              <div className="divide-y divide-[#F4C2D7]/10">
                {incomingRing && (
                  <div className="p-5 bg-[#21142D] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-semibold text-[#F4C2D7]">
                        Chamando agora
                      </p>
                      <p className="text-sm font-semibold text-[#FAF4F7] truncate">
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
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors cursor-pointer"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Atender Vídeo</span>
                      </button>
                      <button
                        type="button"
                        onClick={onRejectIncomingRing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <PhoneOff className="w-3.5 h-3.5" />
                        <span>Recusar</span>
                      </button>
                    </div>
                  </div>
                )}

                {waitingRequests.length === 0 && !incomingRing ? (
                  <div className="p-10 text-center space-y-1.5">
                    <p className="text-sm font-medium text-[#FAF4F7]">
                      Nenhuma chamada aguardando atendimento.
                    </p>
                    <p className="text-xs text-[#C9BAC4]">
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
                          <p className="text-sm font-medium text-[#FAF4F7] truncate">
                            {req.userName}
                          </p>
                          <p className="text-xs text-[#C9BAC4] truncate">
                            {req.topic} · {isOnline ? 'Online agora' : 'Offline'}
                          </p>
                          {req.planName &&
                            typeof req.planPriceCents === 'number' && (
                              <p className="text-[11px] font-mono tabular-nums text-[#F4C2D7]">
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
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all cursor-pointer"
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
                            className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDeleteCallRequest(req.id)}
                            aria-label={`Remover pedido de ${req.userName}`}
                            className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Online Visitors Right Now */}
            <section className="lg:col-span-6 luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#F4C2D7]/15 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-[#86EFAC]" />
                  <h2 className="text-sm font-semibold text-[#FAF4F7]">
                    Internautas Conectados Agora
                  </h2>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#86EFAC]">
                  {onlineVisitors.length} online
                </span>
              </div>

              {onlineVisitors.length === 0 ? (
                <div className="p-10 text-center space-y-1.5">
                  <p className="text-sm font-medium text-[#FAF4F7]">
                    Nenhum internauta conectado neste instante.
                  </p>
                  <p className="text-xs text-[#C9BAC4]">
                    Você receberá uma notificação sonora e visual assim que alguém entrar no site.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F4C2D7]/10">
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
                              className="w-8 h-8 rounded-full object-cover border border-[#F4C2D7]/25 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#21142D] border border-[#F4C2D7]/25 flex items-center justify-center text-xs font-semibold text-[#F4C2D7] shrink-0">
                              {visitor.displayName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-[#FAF4F7] truncate">
                              {visitor.displayName}
                            </p>
                            <p className="text-xs text-[#C9BAC4]">
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
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-35 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0 cursor-pointer"
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

          {/* 30-Day Captured Revenue Bar Chart */}
          <DailyRevenueBarChart callHistory={callHistory} callQueue={callQueue} />

          {/* Offline Interest Messages */}
          <InterestMessagesPanel
            messages={interestMessages}
            peers={peers}
            onUpdateStatus={onUpdateInterestMessageStatus}
            onDeleteMessage={onDeleteInterestMessage}
            onDirectCallUser={onDirectCallUser}
          />
        </div>
      ) : section === 'site_editor' ? (
        <AdminSiteEditor
          modelProfile={modelProfile}
          studioConfig={studioConfig}
          galleryItems={galleryItems}
          onSaveStudioConfig={onSaveStudioConfig}
          onSaveGalleryItem={onSaveGalleryItem}
          onDeleteGalleryItem={onDeleteGalleryItem}
          onRestoreDefaultGallery={onRestoreDefaultGallery}
        />
      ) : section === 'plans' ? (
        <CallPlansManager
          plans={callPlans}
          onSavePlan={onSavePlan}
          onDeletePlan={onDeletePlan}
        />
      ) : section === 'offline_schedule' ? (
        <div className="space-y-8">
          <OperatingSchedulePanel
            studioState={studioState}
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
        <div className="space-y-8">
          <DailyRevenueBarChart callHistory={callHistory} callQueue={callQueue} />
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
            onDeleteUserProfile={onDeleteUserProfile}
            onSendModeration={onSendModeration}
            onDirectCallUser={onDirectCallUser}
            onSavePlan={onSavePlan}
            onDeletePlan={onDeletePlan}
            onRecordCallHistory={onRecordCallHistory}
            onUpdateCallHistoryStatus={onUpdateCallHistoryStatus}
            onUpdateCallHistoryRecord={onUpdateCallHistoryRecord}
            onDeleteCallHistoryRecord={onDeleteCallHistoryRecord}
            onUpdateInterestMessageStatus={onUpdateInterestMessageStatus}
            onDeleteInterestMessage={onDeleteInterestMessage}
          />
        </div>
      )}
    </div>
  );
};
