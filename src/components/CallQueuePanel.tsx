import React, { useState } from 'react';
import { PhoneCall, PhoneOff, Video, X } from 'lucide-react';
import type {
  CallRequest,
  CallStatus,
  PresencePeer,
  StudioProfile,
  StudioState,
} from '../types/studio';

interface CallQueuePanelProps {
  isAdmin: boolean;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  callQueue: CallRequest[];
  peers: PresencePeer[];
  onRequestCall: (topic: string) => Promise<string | null>;
  onDirectCallModel: (topic: string) => Promise<void>;
  onAcceptAndCall: (req: CallRequest) => Promise<void>;
  onUpdateCallStatus: (requestId: string, status: CallStatus) => Promise<void>;
  onEnterAcceptedCall: (req: CallRequest) => void;
}

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
  peers,
  onRequestCall,
  onDirectCallModel,
  onAcceptAndCall,
  onUpdateCallStatus,
  onEnterAcceptedCall,
}) => {
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [loungeFailed, setLoungeFailed] = useState(false);

  const isBlocked = myProfile?.accessStatus === 'blocked';
  const activeRequest = callQueue.find(
    (q) => q.status === 'waiting' || q.status === 'accepted' || q.status === 'in_call'
  );
  const modelOnline = modelProfile
    ? peers.some((p) => p.uid === modelProfile.uid)
    : false;
  const canDirectCallNow =
    Boolean(modelProfile) &&
    modelOnline &&
    (studioState?.isLive ?? true) &&
    (studioState?.callMode ?? 'open') === 'open';
  const displayModelName =
    studioState?.modelName || modelProfile?.displayName || 'Lorena Noir';

  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isBlocked || activeRequest) return;
    setSubmitting(true);
    try {
      const cleanTopic =
        topic.trim() || `Videochamada ao vivo com ${displayModelName}`;
      if (canDirectCallNow) {
        await onDirectCallModel(cleanTopic);
      } else {
        await onRequestCall(cleanTopic);
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
                        onClick={() => void onUpdateCallStatus(req.id, 'rejected')}
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
              <p className="text-xs text-[#9BA1AE]">
                {studioState?.isLive ?? true
                  ? 'Estúdio Ao Vivo'
                  : 'Estúdio Pausado'}{' '}
                ·{' '}
                {modelOnline
                  ? 'Lorena Noir conectada agora'
                  : 'Em preparação'}
              </p>
            </div>
          </div>

          <p className="text-sm text-[#C8CCD4] leading-relaxed">
            {studioState?.headline ||
              'Atendimento privado por videochamada ao vivo com Lorena Noir.'}
          </p>
        </div>

        {isBlocked ? (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200">
            Seu acesso às videochamadas foi suspenso pela moderação do estúdio.
          </div>
        ) : activeRequest ? (
          <div className="p-5 rounded-xl bg-[#0B0C0F] border border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-[#9BA1AE]">Sua solicitação atual</p>
                <p className="text-sm font-medium text-[#F3EFE6] mt-0.5">
                  {activeRequest.topic}
                </p>
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
        ) : (
          <form onSubmit={handleRequestSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="call-topic"
                className="block text-xs font-medium text-[#9BA1AE]"
              >
                Assunto ou preferência da chamada
              </label>
              <input
                id="call-topic"
                type="text"
                maxLength={160}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex.: Conversa privada ao vivo, sessão VIP..."
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-[#F3EFE6] placeholder:text-[#686E7C] focus:outline-none focus:border-[#C9A46B]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting || studioState?.callMode === 'paused'}
                className="inline-flex items-center gap-2.5 px-6 py-3 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {canDirectCallNow ? (
                  <Video className="w-4 h-4" />
                ) : (
                  <PhoneCall className="w-4 h-4" />
                )}
                <span>
                  {studioState?.callMode === 'paused'
                    ? 'Sala temporariamente fechada'
                    : submitting
                      ? 'Conectando...'
                      : canDirectCallNow
                        ? `Chamar ${displayModelName} em Vídeo Agora`
                        : `Solicitar Videochamada com ${displayModelName}`}
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
          <p className="text-xs font-medium text-[#E2C799]">
            Recepção em Tempo Real
          </p>
          <p className="font-display text-2xl font-semibold text-[#F3EFE6]">
            Sala de Espera Exclusiva
          </p>
          <p className="text-xs text-[#C8CCD4]">
            Assim que a modelo aprovar sua entrada, sua câmera e áudio conectam diretamente na sala privada.
          </p>
        </div>
      </aside>
    </div>
  );
};
