import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Video,
  VideoOff,
  Camera,
} from 'lucide-react';
import type { CallMessage, StudioProfile, StudioState } from '../types/studio';

interface VideoCallStageProps {
  isAdmin: boolean;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  activeCallId: string | null;
  activePartnerName: string;
  activePartnerUid: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
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

function formatDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export const VideoCallStage: React.FC<VideoCallStageProps> = ({
  isAdmin,
  myProfile,
  modelProfile,
  studioState,
  activeCallId,
  activePartnerName,
  activePartnerUid,
  localStream,
  remoteStream,
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
  const inActiveCall = Boolean(activeCallId && activePartnerUid);

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

  const connectionLabel = (() => {
    if (!inActiveCall) return 'Sala em espera';
    if (connectionState === 'connected')
      return `Conectado · ${formatDuration(elapsedSeconds)}`;
    if (connectionState === 'connecting') return 'Estabelecendo vídeo...';
    if (connectionState === 'failed') return 'Falha na conexão WebRTC';
    return 'Aguardando participante';
  })();

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Main Video Stage */}
      <div className="lg:col-span-8 flex flex-col bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
        <div className="relative aspect-video bg-[#0B0C0F] w-full overflow-hidden">
          {/* Remote stream or editorial studio cover */}
          {hasRemoteVideo ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="hidden"
              />
              {!standbyFailed ? (
                <img
                  src="/src/assets/images/model_studio_hero_1794946401293.jpg"
                  alt={modelProfile?.displayName || 'Estúdio da Modelo'}
                  referrerPolicy="no-referrer"
                  onError={() => setStandbyFailed(true)}
                  className="w-full h-full object-cover opacity-80"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#101217]">
                  <Video className="w-12 h-12 text-[#C9A46B]/50" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F]/90 via-[#0B0C0F]/35 to-[#0B0C0F]/60" />
            </>
          )}

          {/* Top overlay bar */}
          <div className="absolute top-0 left-0 right-0 p-5 flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-[#E2C799]">
                {inActiveCall
                  ? `Em chamada com ${activePartnerName}`
                  : studioState?.modelName ||
                    modelProfile?.displayName ||
                    'Lorena Noir'}
              </p>
              <p className="text-xs font-mono tabular-nums text-[#C8CCD4]">
                {connectionLabel}
              </p>
            </div>
            <div className="text-right text-xs text-[#C8CCD4]">
              <span>
                {wsConnected ? 'Sinalização ativa' : 'Reconectando sinalização'}
              </span>
            </div>
          </div>

          {/* Standby center note when no remote video */}
          {!hasRemoteVideo && (
            <div className="absolute bottom-6 left-6 right-52 space-y-1.5 pointer-events-none">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#F3EFE6]">
                {inActiveCall
                  ? `Conectando vídeo com ${activePartnerName}`
                  : isAdmin
                    ? 'Câmera do Estúdio Pronta'
                    : 'Sala Privada da Modelo'}
              </h2>
              <p className="text-xs sm:text-sm text-[#C8CCD4] max-w-lg">
                {inActiveCall
                  ? 'Aguardando fluxo de mídia do participante. Você pode conversar pelo chat ao lado.'
                  : isAdmin
                    ? 'Selecione um usuário online ou aceite alguém da fila para iniciar a videochamada.'
                    : 'Ative sua prévia de câmera abaixo e aguarde a modelo aceitar sua solicitação.'}
              </p>
            </div>
          )}

          {/* Local Camera Picture-in-Picture */}
          <div className="absolute bottom-4 right-4 w-36 sm:w-44 aspect-video rounded-lg overflow-hidden bg-[#161920] border border-white/15">
            {localStream && camEnabled ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                <VideoOff className="w-4 h-4 text-[#9BA1AE]" />
                <span className="text-[11px] text-[#9BA1AE]">
                  {localStream ? 'Câmera pausada' : 'Prévia desligada'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Media Control Bar */}
        <div className="p-4 sm:px-6 border-t border-white/10 flex flex-wrap items-center justify-between gap-4 bg-[#13151A]">
          <div className="flex flex-wrap items-center gap-3">
            {!localStream ? (
              <button
                type="button"
                onClick={() => void onAcquireMedia()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    micEnabled && !isMutedByAdmin
                      ? 'bg-[#1C2029] border-white/15 text-[#F3EFE6] hover:bg-[#252A36]'
                      : 'bg-red-950/50 border-red-500/40 text-red-200'
                  }`}
                >
                  {micEnabled && !isMutedByAdmin ? (
                    <Mic className="w-4 h-4" />
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
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    camEnabled
                      ? 'bg-[#1C2029] border-white/15 text-[#F3EFE6] hover:bg-[#252A36]'
                      : 'bg-[#13151A] border-white/10 text-[#9BA1AE]'
                  }`}
                >
                  {camEnabled ? (
                    <Video className="w-4 h-4" />
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
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
      <aside className="lg:col-span-4 flex flex-col bg-[#13151A] border border-white/10 rounded-xl overflow-hidden min-h-[420px]">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#F3EFE6]">
              Chat da Chamada
            </h3>
            <p className="text-xs text-[#9BA1AE]">
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
              <p className="text-sm text-[#9BA1AE]">
                Nenhuma mensagem nesta chamada ainda.
              </p>
              <p className="text-xs text-[#727988]">
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
                  <div className="flex items-center gap-2 text-[11px] text-[#9BA1AE]">
                    <span>{msg.senderName}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {msg.senderRole === 'model' ? 'Modelo' : 'Participante'}
                    </span>
                  </div>
                  <div
                    className={`px-3.5 py-2.5 rounded-lg text-sm max-w-[85%] break-words ${
                      isMine
                        ? 'bg-[#C9A46B]/20 border border-[#C9A46B]/30 text-[#F3EFE6]'
                        : 'bg-[#1B1E26] border border-white/10 text-[#E5E2DC]'
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
          className="p-4 border-t border-white/10 flex items-center gap-2"
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
            className="flex-1 bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm text-[#F3EFE6] placeholder:text-[#686E7C] focus:outline-none focus:border-[#C9A46B] disabled:opacity-50"
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
            className="p-2.5 rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </aside>
    </section>
  );
};
