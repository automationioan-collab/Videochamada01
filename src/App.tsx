import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneCall, PhoneOff, ShieldAlert, Users, Video } from 'lucide-react';
import { CallQueuePanel } from './components/CallQueuePanel';
import { Header, type WorkspaceTab } from './components/Header';
import { LoginView } from './components/LoginView';
import {
  ToastOverlay,
  type StudioToast,
  type ToastVariant,
} from './components/ToastOverlay';
import { UserControlPanel } from './components/UserControlPanel';
import { VideoCallStage } from './components/VideoCallStage';
import { useStudioAuth } from './hooks/useStudioAuth';
import { useWebRTC } from './hooks/useWebRTC';
import {
  useWebSocketStudio,
  type ModerationEffect,
  type PresenceEvent,
  type SignalPayload,
} from './hooks/useWebSocketStudio';
import type { CallRequest } from './types/studio';

interface ActiveCallSession {
  callId: string;
  partnerUid: string;
  partnerName: string;
}

interface IncomingRing {
  callId: string;
  fromUid: string;
  fromName: string;
}

export default function App() {
  const {
    user,
    authLoading,
    authError,
    isAdmin,
    myProfile,
    modelProfile,
    allProfiles,
    studioState,
    callQueue,
    callMessages,
    callHistory,
    loginWithGoogle,
    logout,
    updateStudioState,
    updateUserControl,
    requestVideoCall,
    updateCallStatus,
    sendCallMessage,
    recordCallHistory,
    updateCallHistoryStatus,
  } = useStudioAuth();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [activeSession, setActiveSession] = useState<ActiveCallSession | null>(
    null
  );
  const [incomingRing, setIncomingRing] = useState<IncomingRing | null>(null);
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [ratePerMinuteCents, setRatePerMinuteCents] = useState<number>(1500);
  const [toasts, setToasts] = useState<StudioToast[]>([]);
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const sessionStartedAtRef = useRef<number | null>(null);
  const activeSessionRef = useRef<ActiveCallSession | null>(null);
  activeSessionRef.current = activeSession;

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (variant: ToastVariant, title: string, message: string) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const timestamp = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date());

      setToasts((prev) =>
        [...prev, { id, variant, title, message, timestamp }].slice(-4)
      );

      const timer = window.setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
      toastTimersRef.current.set(id, timer);
    },
    []
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const webrtcSignalRef = useRef<(signal: SignalPayload) => Promise<void>>(
    async () => {}
  );
  const webrtcOfferRef = useRef<
    (targetUid: string, callId: string) => Promise<void>
  >(async () => {});
  const webrtcCloseRef = useRef<() => void>(() => {});
  const webrtcToggleMicRef = useRef<(force?: boolean) => void>(() => {});
  const finalizeRemoteCallEndRef = useRef<() => void>(() => {});

  const handleIncomingSignal = useCallback(
    (signal: SignalPayload) => {
      if (signal.type === 'call:ring') {
        setIncomingRing({
          callId: signal.callId || `direct_${Date.now()}`,
          fromUid: signal.fromUid,
          fromName: signal.fromName || 'Lorena Noir',
        });
        return;
      }

      if (signal.type === 'call:accept') {
        const callId = signal.callId || `direct_${Date.now()}`;
        const partnerName = signal.fromName || 'Participante';
        sessionStartedAtRef.current = Date.now();
        setActiveSession({
          callId,
          partnerUid: signal.fromUid,
          partnerName,
        });
        setActiveTab('call');
        pushToast(
          'call_accepted',
          'Chamada aceita',
          `${partnerName} aceitou a videochamada. Conectando vídeo...`
        );
        void webrtcOfferRef.current(signal.fromUid, callId);
        return;
      }

      if (signal.type === 'call:reject') {
        const msg = `${signal.fromName || 'O participante'} recusou a videochamada.`;
        setNoticeBanner(msg);
        pushToast('warning', 'Chamada recusada', msg);
        setActiveSession(null);
        webrtcCloseRef.current();
        return;
      }

      if (signal.type === 'call:end') {
        finalizeRemoteCallEndRef.current();
        setIncomingRing(null);
        setActiveSession(null);
        webrtcCloseRef.current();
        setNoticeBanner('A videochamada foi encerrada.');
        pushToast('info', 'Chamada encerrada', 'A sessão de vídeo foi finalizada.');
        return;
      }

      void webrtcSignalRef.current(signal);
    },
    [pushToast]
  );

  const handlePresenceEvent = useCallback(
    (event: PresenceEvent) => {
      if (event.kind === 'joined') {
        pushToast(
          'user_joined',
          'Novo usuário no estúdio',
          `${event.peer.displayName} entrou no estúdio agora.`
        );
      } else {
        pushToast(
          'user_left',
          'Usuário saiu do estúdio',
          `${event.peer.displayName} desconectou-se da sala.`
        );
      }
    },
    [pushToast]
  );

  const handleModerationEffect = useCallback(
    (effect: ModerationEffect) => {
      if (effect.action === 'mute') {
        webrtcToggleMicRef.current(false);
        const msg =
          'Seu microfone e chat foram silenciados em tempo real pela modelo.';
        setNoticeBanner(msg);
        pushToast('warning', 'Áudio silenciado', msg);
      } else if (effect.action === 'unmute') {
        const msg = 'Seu áudio e chat foram liberados pela modelo.';
        setNoticeBanner(msg);
        pushToast('info', 'Áudio liberado', msg);
      } else if (effect.action === 'block' || effect.action === 'kick_call') {
        webrtcCloseRef.current();
        setActiveSession(null);
        setIncomingRing(null);
        const msg =
          effect.action === 'block'
            ? 'Seu acesso ao estúdio foi bloqueado em tempo real pela moderação.'
            : 'A modelo encerrou sua participação na chamada.';
        setNoticeBanner(msg);
        pushToast('warning', 'Sessão interrompida', msg);
      } else if (effect.action === 'vip') {
        const msg = 'Seu perfil recebeu acesso VIP no estúdio.';
        setNoticeBanner(msg);
        pushToast('info', 'Acesso VIP', msg);
      }
    },
    [pushToast]
  );

  const { wsConnected, peers, sendWs, sendModerationCommand } =
    useWebSocketStudio({
      user,
      profile: myProfile,
      onSignal: handleIncomingSignal,
      onModerationEffect: handleModerationEffect,
      onPresenceEvent: handlePresenceEvent,
    });

  const {
    localStream,
    remoteStream,
    micEnabled,
    camEnabled,
    mediaError,
    connectionState,
    elapsedSeconds,
    acquireLocalMedia,
    startCallOffer,
    handleSignal,
    closePeerConnection,
    toggleMic,
    toggleCam,
  } = useWebRTC({ sendWs });

  webrtcSignalRef.current = handleSignal;
  webrtcOfferRef.current = startCallOffer;
  webrtcCloseRef.current = closePeerConnection;
  webrtcToggleMicRef.current = toggleMic;
  finalizeRemoteCallEndRef.current = () => {
    const sess = activeSessionRef.current;
    if (!isAdmin || !sess || !sessionStartedAtRef.current) return;
    const fallbackDuration = Math.max(
      1,
      Math.round((Date.now() - sessionStartedAtRef.current) / 1000)
    );
    const durationSeconds =
      elapsedSeconds > 0 ? elapsedSeconds : fallbackDuration;
    const amountCents =
      durationSeconds > 0
        ? Math.max(
            ratePerMinuteCents,
            Math.round((durationSeconds / 60) * ratePerMinuteCents)
          )
        : 0;
    sessionStartedAtRef.current = null;
    void recordCallHistory({
      callId: sess.callId,
      userId: sess.partnerUid,
      userName: sess.partnerName,
      durationSeconds,
      amountCents,
    });
  };

  const handleDirectCallUser = useCallback(
    async (target: { uid: string; displayName: string; photoUrl?: string }) => {
      const callId = `direct_${Date.now()}_${target.uid.slice(0, 6)}`;
      setActiveSession({
        callId,
        partnerUid: target.uid,
        partnerName: target.displayName,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      sendWs({
        type: 'call:ring',
        targetUid: target.uid,
        callId,
      });
      if (isAdmin) {
        await updateStudioState({
          activeCallId: callId,
          activeCallUserId: target.uid,
          activeCallUserName: target.displayName,
        });
      }
      setNoticeBanner(`Chamando ${target.displayName} para a sala de vídeo...`);
    },
    [acquireLocalMedia, isAdmin, sendWs, updateStudioState]
  );

  const handleAcceptQueueAndCall = useCallback(
    async (req: CallRequest) => {
      await updateCallStatus(req.id, 'accepted');
      setActiveSession({
        callId: req.id,
        partnerUid: req.userId,
        partnerName: req.userName,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      sendWs({
        type: 'call:ring',
        targetUid: req.userId,
        callId: req.id,
      });
      await updateStudioState({
        activeCallId: req.id,
        activeCallUserId: req.userId,
        activeCallUserName: req.userName,
      });
      pushToast(
        'call_accepted',
        'Chamada aceita',
        `Solicitação de ${req.userName} aceita. Chamando para o vídeo...`
      );
    },
    [acquireLocalMedia, pushToast, sendWs, updateCallStatus, updateStudioState]
  );

  const handleVisitorDirectCallModel = useCallback(
    async (topic: string) => {
      if (!modelProfile) {
        await requestVideoCall(topic);
        return;
      }
      const callId = await requestVideoCall(topic);
      if (!callId) return;
      const modelName =
        studioState?.modelName || modelProfile.displayName || 'Lorena Noir';
      setActiveSession({
        callId,
        partnerUid: modelProfile.uid,
        partnerName: modelName,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      sendWs({
        type: 'call:ring',
        targetUid: modelProfile.uid,
        callId,
      });
      setNoticeBanner(
        `Chamando ${modelName}... Aguarde ela aceitar para iniciar o vídeo.`
      );
    },
    [
      acquireLocalMedia,
      modelProfile,
      requestVideoCall,
      sendWs,
      studioState?.modelName,
    ]
  );

  const handleAcceptIncomingRing = useCallback(async () => {
    if (!incomingRing) return;
    const ring = incomingRing;
    setIncomingRing(null);
    sessionStartedAtRef.current = Date.now();
    setActiveSession({
      callId: ring.callId,
      partnerUid: ring.fromUid,
      partnerName: ring.fromName,
    });
    setActiveTab('call');
    await acquireLocalMedia();

    const matchingQueue = callQueue.find((q) => q.id === ring.callId);
    if (
      matchingQueue &&
      (matchingQueue.status === 'accepted' || matchingQueue.status === 'waiting')
    ) {
      await updateCallStatus(matchingQueue.id, 'in_call');
    }

    if (isAdmin) {
      await updateStudioState({
        activeCallId: ring.callId,
        activeCallUserId: ring.fromUid,
        activeCallUserName: ring.fromName,
      });
    }

    sendWs({
      type: 'call:accept',
      targetUid: ring.fromUid,
      callId: ring.callId,
    });
    pushToast(
      'call_accepted',
      'Chamada aceita',
      `Videochamada com ${ring.fromName} iniciada.`
    );
  }, [
    acquireLocalMedia,
    callQueue,
    incomingRing,
    isAdmin,
    pushToast,
    sendWs,
    updateCallStatus,
    updateStudioState,
  ]);

  const handleRejectIncomingRing = useCallback(() => {
    if (!incomingRing) return;
    sendWs({
      type: 'call:reject',
      targetUid: incomingRing.fromUid,
      callId: incomingRing.callId,
    });
    setIncomingRing(null);
  }, [incomingRing, sendWs]);

  const handleEnterAcceptedCall = useCallback(
    async (req: CallRequest) => {
      if (!modelProfile) return;
      setActiveSession({
        callId: req.id,
        partnerUid: modelProfile.uid,
        partnerName: modelProfile.displayName,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      if (req.status === 'accepted') {
        await updateCallStatus(req.id, 'in_call');
      }
      sendWs({
        type: 'call:accept',
        targetUid: modelProfile.uid,
        callId: req.id,
      });
    },
    [acquireLocalMedia, modelProfile, sendWs, updateCallStatus]
  );

  const handleEndCall = useCallback(async () => {
    if (activeSession) {
      if (isAdmin) {
        const fallbackDuration = sessionStartedAtRef.current
          ? Math.max(
              1,
              Math.round((Date.now() - sessionStartedAtRef.current) / 1000)
            )
          : 0;
        const durationSeconds =
          elapsedSeconds > 0 ? elapsedSeconds : fallbackDuration;
        const amountCents =
          durationSeconds > 0
            ? Math.max(
                ratePerMinuteCents,
                Math.round((durationSeconds / 60) * ratePerMinuteCents)
              )
            : 0;

        await recordCallHistory({
          callId: activeSession.callId,
          userId: activeSession.partnerUid,
          userName: activeSession.partnerName,
          durationSeconds,
          amountCents,
        });
      }

      sendWs({
        type: 'call:end',
        targetUid: activeSession.partnerUid,
        callId: activeSession.callId,
      });
      const matchingQueue = callQueue.find(
        (q) => q.id === activeSession.callId
      );
      if (
        matchingQueue &&
        (matchingQueue.status === 'in_call' ||
          matchingQueue.status === 'accepted')
      ) {
        await updateCallStatus(matchingQueue.id, 'ended');
      }
    }
    if (isAdmin) {
      await updateStudioState({
        activeCallId: '',
        activeCallUserId: '',
        activeCallUserName: '',
      });
    }
    sessionStartedAtRef.current = null;
    closePeerConnection();
    setActiveSession(null);
  }, [
    activeSession,
    callQueue,
    closePeerConnection,
    elapsedSeconds,
    isAdmin,
    ratePerMinuteCents,
    recordCallHistory,
    sendWs,
    updateCallStatus,
    updateStudioState,
  ]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!activeSession) return;
      await sendCallMessage(
        activeSession.callId,
        activeSession.partnerUid,
        text
      );
    },
    [activeSession, sendCallMessage]
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0C0F] text-[#F3EFE6] flex items-center justify-center">
        <p className="text-sm text-[#9BA1AE]">Carregando estúdio...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0C0F] text-[#F3EFE6] flex flex-col">
      <Header
        isAuthenticated={Boolean(user)}
        isAdmin={isAdmin}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogin={() => void loginWithGoogle()}
        onLogout={() => void logout()}
        userDisplayName={myProfile?.displayName}
      />

      {!user ? (
        <LoginView
          onLogin={() => void loginWithGoogle()}
          authError={authError}
        />
      ) : (
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-6">
          {/* Account & Live Context Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/10">
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-semibold text-[#F3EFE6]">
                {isAdmin ? 'Painel da Modelo' : 'Recepção do Estúdio'}
              </h1>
              <p className="text-xs text-[#9BA1AE]">
                {myProfile?.displayName || user.displayName} ·{' '}
                {isAdmin ? 'Modelo Administradora' : 'Visitante Autenticado'} ·{' '}
                {wsConnected
                  ? `${peers.length} conectado${peers.length === 1 ? '' : 's'} em tempo real`
                  : 'Reconectando tempo real...'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#13151A] border border-white/10 text-[#F3EFE6] hover:bg-[#1B1E26] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[#C9A46B]" />
                  <span>Controle de Usuários</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('call')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Video className="w-3.5 h-3.5" />
                <span>
                  {activeSession ? 'Voltar para Chamada' : 'Abrir Sala de Vídeo'}
                </span>
              </button>
            </div>
          </div>

          {/* Incoming Real-Time Call Alert */}
          {incomingRing && (
            <div
              role="alert"
              className="p-4 sm:px-6 rounded-xl bg-[#191611] border border-[#C9A46B]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <PhoneCall className="w-5 h-5 text-[#C9A46B] shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-[#F3EFE6]">
                    Chamada de vídeo recebida de {incomingRing.fromName}
                  </p>
                  <p className="text-xs text-[#C8CCD4]">
                    Aceite para conectar câmera e microfone na sala privada.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleAcceptIncomingRing()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors cursor-pointer"
                >
                  Aceitar Vídeo
                </button>
                <button
                  type="button"
                  onClick={handleRejectIncomingRing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#1B1E26] border border-white/10 text-[#9BA1AE] hover:text-red-300 transition-colors cursor-pointer"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Recusar</span>
                </button>
              </div>
            </div>
          )}

          {/* Real-time Moderation or Call Status Banner */}
          {noticeBanner && (
            <div className="px-4 py-3 rounded-lg bg-[#13151A] border border-white/15 flex items-center justify-between gap-4 text-xs text-[#E2C799]">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{noticeBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setNoticeBanner(null)}
                className="text-[#9BA1AE] hover:text-[#F3EFE6] cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          )}

          {/* Active Workspace Content */}
          {activeTab === 'call' && (
            <VideoCallStage
              isAdmin={isAdmin}
              myProfile={myProfile}
              modelProfile={modelProfile}
              studioState={studioState}
              activeCallId={activeSession?.callId || null}
              activePartnerName={activeSession?.partnerName || ''}
              activePartnerUid={activeSession?.partnerUid || null}
              localStream={localStream}
              remoteStream={remoteStream}
              micEnabled={micEnabled}
              camEnabled={camEnabled}
              mediaError={mediaError}
              connectionState={connectionState}
              elapsedSeconds={elapsedSeconds}
              wsConnected={wsConnected}
              messages={callMessages}
              onAcquireMedia={acquireLocalMedia}
              onToggleMic={() => toggleMic()}
              onToggleCam={toggleCam}
              onEndCall={() => void handleEndCall()}
              onSendMessage={handleSendMessage}
            />
          )}

          {activeTab === 'users' && isAdmin && (
            <UserControlPanel
              myUid={user.uid}
              profiles={allProfiles}
              peers={peers}
              studioState={studioState}
              callHistory={callHistory}
              ratePerMinuteCents={ratePerMinuteCents}
              onChangeRatePerMinuteCents={setRatePerMinuteCents}
              onUpdateStudioState={updateStudioState}
              onUpdateUserControl={updateUserControl}
              onSendModeration={sendModerationCommand}
              onDirectCallUser={handleDirectCallUser}
              onRecordCallHistory={recordCallHistory}
              onUpdateCallHistoryStatus={updateCallHistoryStatus}
            />
          )}

          {activeTab === 'queue' && (
            <CallQueuePanel
              isAdmin={isAdmin}
              myProfile={myProfile}
              modelProfile={modelProfile}
              studioState={studioState}
              callQueue={callQueue}
              peers={peers}
              onRequestCall={requestVideoCall}
              onDirectCallModel={handleVisitorDirectCallModel}
              onAcceptAndCall={handleAcceptQueueAndCall}
              onUpdateCallStatus={updateCallStatus}
              onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
            />
          )}

          {activeTab === 'studio' &&
            (isAdmin ? (
              <div className="space-y-8">
                <UserControlPanel
                  myUid={user.uid}
                  profiles={allProfiles}
                  peers={peers}
                  studioState={studioState}
                  callHistory={callHistory}
                  ratePerMinuteCents={ratePerMinuteCents}
                  onChangeRatePerMinuteCents={setRatePerMinuteCents}
                  onUpdateStudioState={updateStudioState}
                  onUpdateUserControl={updateUserControl}
                  onSendModeration={sendModerationCommand}
                  onDirectCallUser={handleDirectCallUser}
                  onRecordCallHistory={recordCallHistory}
                  onUpdateCallHistoryStatus={updateCallHistoryStatus}
                />
                <CallQueuePanel
                  isAdmin={isAdmin}
                  myProfile={myProfile}
                  modelProfile={modelProfile}
                  studioState={studioState}
                  callQueue={callQueue}
                  peers={peers}
                  onRequestCall={requestVideoCall}
                  onDirectCallModel={handleVisitorDirectCallModel}
                  onAcceptAndCall={handleAcceptQueueAndCall}
                  onUpdateCallStatus={updateCallStatus}
                  onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
                />
              </div>
            ) : (
              <CallQueuePanel
                isAdmin={isAdmin}
                myProfile={myProfile}
                modelProfile={modelProfile}
                studioState={studioState}
                callQueue={callQueue}
                peers={peers}
                onRequestCall={requestVideoCall}
                onDirectCallModel={handleVisitorDirectCallModel}
                onAcceptAndCall={handleAcceptQueueAndCall}
                onUpdateCallStatus={updateCallStatus}
                onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
              />
            ))}
        </main>
      )}

      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
