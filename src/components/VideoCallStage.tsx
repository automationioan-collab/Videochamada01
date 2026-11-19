import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Video,
  VideoOff,
  Camera,
} from 'lucide-react';
import type {
  CallMessage,
  RoomParticipant,
  StudioProfile,
  StudioState,
} from '../types/studio';

interface VideoCallStageProps {
  isAdmin: boolean;
  isGroupRoom?: boolean;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  activeCallId: string | null;
  activePartnerName: string;
  activePartnerUid: string | null;
  activePlan?: {
    name: string;
    durationMinutes: number;
    priceCents: number;
  } | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteStreams?: Record<string, MediaStream>;
  peerConnectionStates?: Record<string, RTCPeerConnectionState>;
  roomParticipants?: RoomParticipant[];
  micEnabled: boolean;
  camEnabled: boolean;
  mediaError: string | null;
  connectionState: RTCPeerConnectionState;
  elapsedSeconds: number;
  wsConnected: boolean;
  messages: CallMessage[];
  onAcquireMedia: () => Promise<MediaStream | null>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEndCall: () => void;
  onSendMessage: (text: string) => Promise<void>;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

interface RemoteVideoTileProps {
  participant: RoomParticipant;
  stream: MediaStream | undefined;
  state: RTCPeerConnectionState | undefined;
}

const RemoteVideoTile: React.FC<RemoteVideoTileProps> = ({
  participant,
  stream,
  state,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasLiveVideo, setHasLiveVideo] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      el.srcObject = stream;
    }
    const updateTrackFlag = () => {
      const live = Boolean(
        stream?.getVideoTracks().some((t) => t.readyState === 'live')
      );
      setHasLiveVideo(live);
    };
    updateTrackFlag();
    if (!stream) return;
    stream.addEventListener('addtrack', updateTrackFlag);
    stream.addEventListener('removetrack', updateTrackFlag);
    return () => {
      stream.removeEventListener('addtrack', updateTrackFlag);
      stream.removeEventListener('removetrack', updateTrackFlag);
    };
  }, [stream]);

  return (
    <div
      data-protected-media="true"
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full h-full min-h-[180px] rounded-xl overflow-hidden bg-[#150D1D] border border-[#F4C2D7]/20 select-none"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        controls={false}
        controlsList="nodownload nofullscreen noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full object-cover ${hasLiveVideo ? 'block' : 'hidden'}`}
      />
      <div
        aria-hidden="true"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        className="absolute inset-0 z-10 select-none"
      />
      {!hasLiveVideo && (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center">
          {participant.photoUrl ? (
            <img
              src={participant.photoUrl}
              alt={participant.displayName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover border border-[#F4C2D7]/35"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-[#21142D] border border-[#F4C2D7]/25 flex items-center justify-center font-display text-xl text-[#F4C2D7]">
              {participant.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <p className="text-xs font-medium text-[#C9BAC4]">
            {state === 'connected'
              ? 'Áudio conectado'
              : 'Conectando vídeo...'}
          </p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-[#0B060F]/95 to-transparent flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-[#FAF4F7] truncate">
          {participant.displayName}
        </span>
        <span className="text-[11px] font-mono tabular-nums text-[#F4C2D7] shrink-0">
          {participant.isAdmin ? 'Modelo' : 'Visitante'}
          {state === 'connected' ? ' · Ao vivo' : ''}
        </span>
      </div>
    </div>
  );
};

export const VideoCallStage: React.FC<VideoCallStageProps> = ({
  isAdmin,
  isGroupRoom = false,
  myProfile,
  modelProfile,
  studioState,
  activeCallId,
  activePartnerName,
  activePartnerUid,
  activePlan,
  localStream,
  remoteStream,
  remoteStreams = {},
  peerConnectionStates = {},
  roomParticipants = [],
  micEnabled,
  camEnabled,
  mediaError,
  connectionState,
  elapsedSeconds,
  wsConnected,
  messages,
  onAcquireMedia,
  onToggleMic,
  onToggleCam,
  onEndCall,
  onSendMessage,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [draftText, setDraftText] = useState('');
  const [sending, setSending] = useState(false);
  const [standbyFailed, setStandbyFailed] = useState(false);

  const isMutedByAdmin = myProfile?.accessStatus === 'muted';
  const isBlocked = myProfile?.accessStatus === 'blocked';
  const hasRemoteVideo =
    Boolean(remoteStream) &&
    remoteStream!.getVideoTracks().some((t) => t.readyState === 'live');
  const inActiveCall = Boolean(activeCallId && (activePartnerUid || isGroupRoom));

  const otherRoomParticipants = useMemo(
    () => roomParticipants.filter((p) => p.uid !== myProfile?.uid),
    [myProfile?.uid, roomParticipants]
  );

  const totalRoomCount = Math.max(
    inActiveCall && isGroupRoom ? 1 : 0,
    roomParticipants.length
  );

  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const callMessages = activeCallId
    ? messages.filter((m) => m.callId === activeCallId)
    : messages.slice(-20);

  const handleSubmitChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftText.trim() || sending || isMutedByAdmin || isBlocked) return;
    setSending(true);
    try {
      await onSendMessage(draftText);
      setDraftText('');
    } finally {
      setSending(false);
    }
  };

  const planTotalSeconds = activePlan ? activePlan.durationMinutes * 60 : 0;
  const remainingSeconds = activePlan
    ? Math.max(0, planTotalSeconds - elapsedSeconds)
    : 0;

  const connectionLabel = (() => {
    if (!inActiveCall) return 'Sala em espera';
    if (isGroupRoom) {
      const base = `${totalRoomCount} participante${totalRoomCount === 1 ? '' : 's'} na sala`;
      if (connectionState === 'connected') {
        return activePlan
          ? `${base} · ${formatDuration(elapsedSeconds)} · Restante ${formatDuration(remainingSeconds)}`
          : `${base} · ${formatDuration(elapsedSeconds)}`;
      }
      return otherRoomParticipants.length === 0
        ? `${base} · Aguardando conexões`
        : `${base} · Sincronizando vídeo`;
    }
    if (connectionState === 'connected') {
      return activePlan
        ? `Conectado · ${formatDuration(elapsedSeconds)} · Restante ${formatDuration(remainingSeconds)}`
        : `Conectado · ${formatDuration(elapsedSeconds)}`;
    }
    if (connectionState === 'connecting') return 'Estabelecendo vídeo...';
    if (connectionState === 'failed') return 'Falha na conexão WebRTC';
    return 'Aguardando participante';
  })();

  const groupGridCols =
    otherRoomParticipants.length <= 1
      ? 'grid-cols-1'
      : otherRoomParticipants.length <= 4
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-2 lg:grid-cols-3';

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Main Video Stage */}
      <div className="lg:col-span-8 flex flex-col luxury-card border border-[#F4C2D7]/25 rounded-2xl overflow-hidden shadow-[0_24px_60px_-24px_rgba(192,98,162,0.28)]">
        <div
          data-protected-media="true"
          onContextMenu={(e) => e.preventDefault()}
          className="relative tech-reticle aspect-video bg-[#0B060F] w-full overflow-hidden select-none"
        >
          {isGroupRoom && otherRoomParticipants.length > 0 ? (
            <div className={`w-full h-full p-3 pt-16 pb-16 sm:pb-3 grid gap-3 ${groupGridCols}`}>
              {otherRoomParticipants.map((participant) => (
                <RemoteVideoTile
                  key={participant.uid}
                  participant={participant}
                  stream={remoteStreams[participant.uid]}
                  state={peerConnectionStates[participant.uid]}
                />
              ))}
            </div>
          ) : !isGroupRoom && hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              controls={false}
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                controls={false}
                controlsList="nodownload nofullscreen noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                draggable={false}
                className="hidden"
              />
              {!standbyFailed ? (
                <img
                  src="/src/assets/images/model_studio_hero_1794946401293.jpg"
                  alt={modelProfile?.displayName || 'Estúdio da Modelo'}
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onContextMenu={(e) => e.preventDefault()}
                  onError={() => setStandbyFailed(true)}
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#150D1D]">
                  <Video className="w-12 h-12 text-[#F4C2D7]/50" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/95 via-[#0B060F]/35 to-[#0B060F]/60 pointer-events-none" />
            </>
          )}
          <div
            aria-hidden="true"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className="absolute inset-0 z-[5] select-none"
          />

          {/* Top overlay bar */}
          <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between gap-4 pointer-events-none">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[#F4C2D7]">
                {isGroupRoom
                  ? `Sala Ao Vivo · ${studioState?.modelName || 'Lorena Noir'}`
                  : inActiveCall
                    ? `Em chamada com ${activePartnerName}`
                    : studioState?.modelName ||
                      modelProfile?.displayName ||
                      'Lorena Noir'}
              </p>
              <p className="text-xs font-mono tabular-nums text-[#C9BAC4]">
                {connectionLabel}
              </p>
            </div>
            <div className="text-right text-xs text-[#C9BAC4] space-y-0.5">
              {inActiveCall && activePlan && (
                <p className="font-mono tabular-nums text-[#F4C2D7]">
                  {activePlan.name} · {BRL_FORMATTER.format(activePlan.priceCents / 100)}
                </p>
              )}
              <p>
                {wsConnected ? 'Sinalização ativa' : 'Reconectando sinalização'}
              </p>
            </div>
          </div>

          {/* Standby center note when no remote participants / video */}
          {((isGroupRoom && otherRoomParticipants.length === 0) ||
            (!isGroupRoom && !hasRemoteVideo)) && (
            <div className="absolute bottom-6 left-6 right-52 space-y-1.5 pointer-events-none">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                {isGroupRoom
                  ? 'Sala Ao Vivo Aberta'
                  : inActiveCall
                    ? `Conectando vídeo com ${activePartnerName}`
                    : isAdmin
                      ? 'Câmera do Estúdio Pronta'
                      : 'Sala Privada da Modelo'}
              </h2>
              <p className="text-xs sm:text-sm text-[#C9BAC4] max-w-lg">
                {isGroupRoom
                  ? 'Você já está conectado na videochamada ao vivo. Novos internautas e Lorena Noir aparecerão automaticamente neste painel.'
                  : inActiveCall
                    ? 'Aguardando fluxo de mídia do participante. Você pode conversar pelo chat ao lado.'
                    : isAdmin
                      ? 'Selecione um usuário online, aceite alguém da fila ou entre na sala ao vivo compartilhada.'
                      : 'Entre na chamada ao vivo pelo botão da recepção para conectar sua câmera e conversar em grupo ou 1-para-1.'}
              </p>
            </div>
          )}

          {/* Local Camera Picture-in-Picture */}
          <div
            data-protected-media="true"
            onContextMenu={(e) => e.preventDefault()}
            className="absolute bottom-4 right-4 z-20 w-36 sm:w-44 aspect-video rounded-xl overflow-hidden bg-[#1A1024] border border-[#F4C2D7]/25 shadow-[0_0_24px_rgba(244,194,215,0.12)] select-none"
          >
            {localStream && camEnabled ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                controls={false}
                controlsList="nodownload nofullscreen noremoteplayback"
                disablePictureInPicture
                disableRemotePlayback
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                <VideoOff className="w-4 h-4 text-[#938291]" />
                <span className="text-[11px] text-[#938291]">
                  {localStream ? 'Câmera pausada' : 'Prévia desligada'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Media Control Bar */}
        <div className="p-4 sm:px-6 border-t border-[#F4C2D7]/15 flex flex-wrap items-center justify-between gap-4 bg-[#150D1D]">
          <div className="flex flex-wrap items-center gap-3">
            {!localStream ? (
              <button
                type="button"
                onClick={() => void onAcquireMedia()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Ativar Câmera e Microfone</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isMutedByAdmin}
                  onClick={onToggleMic}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    micEnabled && !isMutedByAdmin
                      ? 'bg-[#21142D] border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#281837]'
                      : 'bg-red-950/50 border-red-500/40 text-red-200'
                  }`}
                >
                  {micEnabled && !isMutedByAdmin ? (
                    <Mic className="w-4 h-4 text-[#F4C2D7]" />
                  ) : (
                    <MicOff className="w-4 h-4" />
                  )}
                  <span>
                    {isMutedByAdmin
                      ? 'Silenciado pela Modelo'
                      : micEnabled
                        ? 'Microfone ativo'
                        : 'Microfone mudo'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={onToggleCam}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    camEnabled
                      ? 'bg-[#21142D] border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#281837]'
                      : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#938291]'
                  }`}
                >
                  {camEnabled ? (
                    <Video className="w-4 h-4 text-[#F4C2D7]" />
                  ) : (
                    <VideoOff className="w-4 h-4" />
                  )}
                  <span>{camEnabled ? 'Câmera ativa' : 'Câmera desligada'}</span>
                </button>
              </>
            )}
          </div>

          {inActiveCall && (
            <button
              type="button"
              onClick={onEndCall}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Encerrar Chamada</span>
            </button>
          )}
        </div>

        {mediaError && (
          <div className="px-6 py-2.5 bg-amber-950/30 border-t border-amber-500/20 text-xs text-amber-200">
            {mediaError}
          </div>
        )}
      </div>

      {/* In-Call Chat Sidebar */}
      <aside className="lg:col-span-4 flex flex-col luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden min-h-[420px]">
        <div className="px-5 py-4 border-b border-[#F4C2D7]/15 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#FAF4F7]">
              Chat da Chamada
            </h3>
            <p className="text-xs text-[#C9BAC4]">
              {inActiveCall
                ? `Sessão privada · ${activePartnerName}`
                : 'Mensagens sincronizadas da sessão'}
            </p>
          </div>
        </div>

        <div
          ref={chatScrollRef}
          className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[380px]"
        >
          {callMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-10 space-y-2">
              <p className="text-sm text-[#C9BAC4]">
                Nenhuma mensagem nesta chamada ainda.
              </p>
              <p className="text-xs text-[#938291]">
                {inActiveCall
                  ? 'Envie uma mensagem abaixo para conversar durante o vídeo.'
                  : 'O chat privado fica disponível assim que houver uma solicitação ativa.'}
              </p>
            </div>
          ) : (
            callMessages.map((msg) => {
              const isMine = msg.senderUid === myProfile?.uid;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col space-y-1 ${
                    isMine ? 'items-end' : 'items-start'
                  }`}
                >
                  <div className="flex items-center gap-2 text-[11px] text-[#938291]">
                    <span>{msg.senderName}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {msg.senderRole === 'model' ? 'Modelo' : 'Participante'}
                    </span>
                  </div>
                  <div
                    className={`px-3.5 py-2.5 rounded-xl text-sm max-w-[85%] break-words ${
                      isMine
                        ? 'bg-[#281837] border border-[#F4C2D7]/35 text-[#FAF4F7]'
                        : 'bg-[#1A1024] border border-[#F4C2D7]/15 text-[#FAF4F7]'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form
          onSubmit={handleSubmitChat}
          className="p-4 border-t border-[#F4C2D7]/15 flex items-center gap-2"
        >
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            disabled={!inActiveCall || isMutedByAdmin || isBlocked}
            maxLength={500}
            placeholder={
              isBlocked
                ? 'Acesso bloqueado'
                : isMutedByAdmin
                  ? 'Você está silenciado pela modelo'
                  : inActiveCall
                    ? 'Escrever mensagem...'
                    : 'Inicie uma chamada para enviar mensagens'
            }
            className="flex-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={
              !inActiveCall ||
              !draftText.trim() ||
              sending ||
              isMutedByAdmin ||
              isBlocked
            }
            aria-label="Enviar mensagem"
            className="p-2.5 rounded-full luxury-rose-cta transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </section>
  );
};
