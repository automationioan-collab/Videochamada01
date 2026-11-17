import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PhoneCall, PhoneOff, ShieldAlert, Users, Video } from 'lucide-react';
import { CallQueuePanel } from './components/CallQueuePanel';
import { Header, type WorkspaceTab } from './components/Header';
import { LoginView } from './components/LoginView';
import { ModelAdminPage } from './components/ModelAdminPage';
import { ModelOfflineView } from './components/ModelOfflineView';
import {
  RatingSystem,
  type EndedSessionContext,
} from './components/RatingSystem';
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
  type RoomEvent,
  type SignalPayload,
} from './hooks/useWebSocketStudio';
import { isDndActiveNow, isWithinOperatingHours } from './lib/schedule';
import type { CallPlan, CallRequest } from './types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

interface ActiveCallSession {
  callId: string;
  partnerUid: string;
  partnerName: string;
  isGroupRoom?: boolean;
  queueCallId?: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
}

interface IncomingRing {
  callId: string;
  fromUid: string;
  fromName: string;
  planId?: string;
  planName?: string;
  planDurationMinutes?: number;
  planPriceCents?: number;
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
    interestMessages,
    callPlans,
    loginWithGoogle,
    logout,
    updateStudioState,
    updateUserControl,
    requestVideoCall,
    updateCallStatus,
    saveCallPlan,
    deleteCallPlan,
    sendCallMessage,
    recordCallHistory,
    updateCallHistoryStatus,
    submitCallRating,
    sendInterestMessage,
    updateInterestMessageStatus,
    deleteInterestMessage,
  } = useStudioAuth();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [activeSession, setActiveSession] = useState<ActiveCallSession | null>(
    null
  );
  const [endedCallForRating, setEndedCallForRating] =
    useState<EndedSessionContext | null>(null);
  const [incomingRing, setIncomingRing] = useState<IncomingRing | null>(null);
  const [incomingRingPlanId, setIncomingRingPlanId] = useState<string>('');
  const [noticeBanner, setNoticeBanner] = useState<string | null>(null);
  const [ratePerMinuteCents, setRatePerMinuteCents] = useState<number>(1500);
  const [toasts, setToasts] = useState<StudioToast[]>([]);
  const [scheduleNow, setScheduleNow] = useState<Date>(() => new Date());
  const toastTimersRef = useRef<Map<string, number>>(new Map());
  const sessionStartedAtRef = useRef<number | null>(null);
  const autoScheduleSyncRef = useRef<string | null>(null);
  const dndSyncRef = useRef<string | null>(null);
  const dndActiveRef = useRef<boolean>(false);
  const warnedPlanCallIdRef = useRef<string | null>(null);
  const endedPlanCallIdRef = useRef<string | null>(null);
  const elapsedSecondsRef = useRef<number>(0);
  const sendWsRef = useRef<(payload: unknown) => void>(() => {});
  const pendingPublicJoinRef = useRef<boolean>(false);
  const roomStartedAtMapRef = useRef<Map<string, number>>(new Map());
  const activeSessionRef = useRef<ActiveCallSession | null>(null);
  activeSessionRef.current = activeSession;

  const activePlans = useMemo(
    () => callPlans.filter((p) => p.active),
    [callPlans]
  );

  const defaultPlan = useMemo(
    () =>
      activePlans.find((p) => p.id === 'plan_private_20') ??
      activePlans[0] ??
      null,
    [activePlans]
  );

  const selectedRingPlan = useMemo(
    () =>
      activePlans.find((p) => p.id === incomingRingPlanId) ?? defaultPlan,
    [activePlans, defaultPlan, incomingRingPlanId]
  );

  const activeStagePlan = useMemo(
    () =>
      activeSession?.planName &&
      activeSession?.planDurationMinutes &&
      activeSession?.planPriceCents !== undefined
        ? {
            name: activeSession.planName,
            durationMinutes: activeSession.planDurationMinutes,
            priceCents: activeSession.planPriceCents,
          }
        : null,
    [activeSession]
  );

  useEffect(() => {
    if (activePlans.length === 0) {
      setIncomingRingPlanId('');
      return;
    }
    if (!activePlans.some((p) => p.id === incomingRingPlanId)) {
      const preferred =
        (incomingRing?.planId &&
          activePlans.find((p) => p.id === incomingRing.planId)?.id) ||
        defaultPlan?.id ||
        activePlans[0].id;
      setIncomingRingPlanId(preferred);
    }
  }, [activePlans, defaultPlan, incomingRing?.planId, incomingRingPlanId]);

  const isAdminRoute = currentPath === '/admin';

  const navigateRoute = useCallback((path: '/' | '/admin') => {
    if (typeof window !== 'undefined' && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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

  const hasActiveTimedDnd = Boolean(
    studioState?.dndUntilMs && studioState.dndUntilMs > Date.now()
  );

  useEffect(() => {
    const tickMs =
      hasActiveTimedDnd || Boolean(studioState?.dndScheduleEnabled)
        ? 1000
        : 15000;
    const intervalId = window.setInterval(() => {
      setScheduleNow(new Date());
    }, tickMs);
    return () => window.clearInterval(intervalId);
  }, [hasActiveTimedDnd, studioState?.dndScheduleEnabled]);

  const webrtcSignalRef = useRef<(signal: SignalPayload) => Promise<void>>(
    async () => {}
  );
  const webrtcOfferRef = useRef<
    (targetUid: string, callId: string) => Promise<void>
  >(async () => {});
  const webrtcCloseRef = useRef<(targetUid?: string) => void>(() => {});
  const webrtcToggleMicRef = useRef<(force?: boolean) => void>(() => {});
  const finalizeRemoteCallEndRef = useRef<() => void>(() => {});

  const handleIncomingSignal = useCallback(
    (signal: SignalPayload) => {
      if (signal.type === 'call:ring') {
        if (isAdmin && dndActiveRef.current) {
          sendWsRef.current({
            type: 'call:reject',
            targetUid: signal.fromUid,
            callId: signal.callId || `direct_${Date.now()}`,
          });
          return;
        }
        if (signal.planId) {
          setIncomingRingPlanId(signal.planId);
        }
        setIncomingRing({
          callId: signal.callId || `direct_${Date.now()}`,
          fromUid: signal.fromUid,
          fromName: signal.fromName || 'Lorena Noir',
          planId: signal.planId,
          planName: signal.planName,
          planDurationMinutes: signal.planDurationMinutes,
          planPriceCents: signal.planPriceCents,
        });
        return;
      }

      if (signal.type === 'call:accept') {
        const callId = signal.callId || `direct_${Date.now()}`;
        const partnerName = signal.fromName || 'Participante';
        const prev = activeSessionRef.current;
        sessionStartedAtRef.current = Date.now();
        setEndedCallForRating(null);
        setActiveSession({
          callId,
          partnerUid: signal.fromUid,
          partnerName,
          planId: signal.planId || prev?.planId,
          planName: signal.planName || prev?.planName,
          planDurationMinutes:
            signal.planDurationMinutes || prev?.planDurationMinutes,
          planPriceCents: signal.planPriceCents ?? prev?.planPriceCents,
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
        const endedSess = activeSessionRef.current;
        if (!isAdmin && endedSess && sessionStartedAtRef.current) {
          const fallbackDur = Math.max(
            1,
            Math.round((Date.now() - sessionStartedAtRef.current) / 1000)
          );
          const dur =
            elapsedSecondsRef.current > 0
              ? elapsedSecondsRef.current
              : fallbackDur;
          setEndedCallForRating({
            callId: endedSess.callId,
            partnerName: endedSess.partnerName,
            planName: endedSess.planName,
            durationSeconds: dur,
          });
          sessionStartedAtRef.current = null;
          setActiveTab('studio');
        }
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
    [isAdmin, pushToast]
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

  const handleRoomEvent = useCallback(
    (event: RoomEvent) => {
      if (event.kind === 'peer_joined') {
        roomStartedAtMapRef.current.set(event.participant.uid, Date.now());
        if (activeSessionRef.current?.isGroupRoom || isAdmin) {
          pushToast(
            'user_joined',
            'Entrou na sala de vídeo',
            `${event.participant.displayName} entrou na videochamada ao vivo.`
          );
        }
        return;
      }

      if (event.kind === 'peer_left') {
        webrtcCloseRef.current(event.participant.uid);
        const startedAt =
          roomStartedAtMapRef.current.get(event.participant.uid) || Date.now();
        roomStartedAtMapRef.current.delete(event.participant.uid);

        if (isAdmin && !event.participant.isAdmin && event.participant.callId) {
          const durationSeconds = Math.max(
            1,
            Math.round((Date.now() - startedAt) / 1000)
          );
          const amountCents =
            event.participant.planPriceCents &&
            event.participant.planPriceCents > 0
              ? event.participant.planPriceCents
              : Math.max(
                  ratePerMinuteCents,
                  Math.round((durationSeconds / 60) * ratePerMinuteCents)
                );

          void recordCallHistory({
            callId: event.participant.callId,
            userId: event.participant.uid,
            userName: event.participant.displayName,
            durationSeconds,
            amountCents,
            planId: event.participant.planId,
            planName: event.participant.planName,
            planDurationMinutes: event.participant.planDurationMinutes,
          });
          void updateCallStatus(event.participant.callId, 'ended', 'captured');
        }

        if (activeSessionRef.current?.isGroupRoom || isAdmin) {
          pushToast(
            'user_left',
            'Saiu da sala de vídeo',
            `${event.participant.displayName} saiu da videochamada.`
          );
        }
      }
    },
    [isAdmin, pushToast, ratePerMinuteCents, recordCallHistory, updateCallStatus]
  );

  const {
    wsConnected,
    peers,
    roomParticipants,
    sendWs,
    joinRoom,
    leaveRoom,
    sendModerationCommand,
  } = useWebSocketStudio({
    user,
    profile: myProfile,
    onSignal: handleIncomingSignal,
    onModerationEffect: handleModerationEffect,
    onPresenceEvent: handlePresenceEvent,
    onRoomEvent: handleRoomEvent,
  });

  const {
    localStream,
    remoteStream,
    remoteStreams,
    peerConnectionStates,
    micEnabled,
    camEnabled,
    mediaError,
    connectionState,
    elapsedSeconds,
    acquireLocalMedia,
    startCallOffer,
    syncMeshPeers,
    handleSignal,
    closePeerConnection,
    toggleMic,
    toggleCam,
  } = useWebRTC({ sendWs });

  webrtcSignalRef.current = handleSignal;
  webrtcOfferRef.current = startCallOffer;
  webrtcCloseRef.current = closePeerConnection;
  webrtcToggleMicRef.current = toggleMic;
  elapsedSecondsRef.current = elapsedSeconds;
  sendWsRef.current = sendWs as (payload: unknown) => void;
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
      sess.planPriceCents && sess.planPriceCents > 0
        ? sess.planPriceCents
        : durationSeconds > 0
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
      planId: sess.planId,
      planName: sess.planName,
      planDurationMinutes: sess.planDurationMinutes,
    });
    const matchingQueue = callQueue.find((q) => q.id === sess.callId);
    if (
      matchingQueue &&
      (matchingQueue.status === 'in_call' ||
        matchingQueue.status === 'accepted')
    ) {
      void updateCallStatus(matchingQueue.id, 'ended', 'captured');
    }
    void updateStudioState({
      activeCallId: '',
      activeCallUserId: '',
      activeCallUserName: '',
    });
  };

  const handleDirectCallUser = useCallback(
    async (target: { uid: string; displayName: string; photoUrl?: string }) => {
      const callId = `direct_${Date.now()}_${target.uid.slice(0, 6)}`;
      const planMeta = defaultPlan
        ? {
            planId: defaultPlan.id,
            planName: defaultPlan.name,
            planDurationMinutes: defaultPlan.durationMinutes,
            planPriceCents: defaultPlan.priceCents,
          }
        : {};
      setActiveSession({
        callId,
        partnerUid: target.uid,
        partnerName: target.displayName,
        ...planMeta,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      sendWs({
        type: 'call:ring',
        targetUid: target.uid,
        callId,
        ...planMeta,
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
    [acquireLocalMedia, defaultPlan, isAdmin, sendWs, updateStudioState]
  );

  const handleAcceptQueueAndCall = useCallback(
    async (req: CallRequest) => {
      await updateCallStatus(req.id, 'accepted');
      const planMeta = {
        planId: req.planId,
        planName: req.planName,
        planDurationMinutes: req.planDurationMinutes,
        planPriceCents: req.planPriceCents,
      };
      setActiveSession({
        callId: req.id,
        partnerUid: req.userId,
        partnerName: req.userName,
        ...planMeta,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      sendWs({
        type: 'call:ring',
        targetUid: req.userId,
        callId: req.id,
        ...planMeta,
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

  const handleVisitorJoinGroupRoom = useCallback(
    async (topic: string, plan: CallPlan) => {
      if (isDndActiveNow(studioState, new Date())) {
        const msg =
          'A modelo está em Modo Não Perturbe. Novas entradas estão temporariamente bloqueadas.';
        setNoticeBanner(msg);
        pushToast('warning', 'Modo Não Perturbe ativo', msg);
        return;
      }
      if (studioState?.callMode === 'paused') {
        setNoticeBanner('A sala de videochamada está temporariamente pausada.');
        return;
      }
      const queueCallId = await requestVideoCall(topic, plan);
      if (!queueCallId) return;

      await updateCallStatus(queueCallId, 'in_call');
      const modelName =
        studioState?.modelName || modelProfile?.displayName || 'Lorena Noir';

      setEndedCallForRating(null);
      sessionStartedAtRef.current = Date.now();
      setActiveSession({
        callId: 'main_studio_room',
        queueCallId,
        isGroupRoom: true,
        partnerUid: 'main_studio_room',
        partnerName: `Sala Ao Vivo · ${modelName}`,
        planId: plan.id,
        planName: plan.name,
        planDurationMinutes: plan.durationMinutes,
        planPriceCents: plan.priceCents,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      joinRoom({
        roomId: 'main_studio_room',
        callId: queueCallId,
        planId: plan.id,
        planName: plan.name,
        planDurationMinutes: plan.durationMinutes,
        planPriceCents: plan.priceCents,
      });
      pushToast(
        'call_accepted',
        'Na sala ao vivo',
        `Você entrou na videochamada ao vivo (${plan.name}). Outros participantes conectam automaticamente.`
      );
    },
    [
      acquireLocalMedia,
      joinRoom,
      modelProfile?.displayName,
      pushToast,
      requestVideoCall,
      studioState,
      updateCallStatus,
    ]
  );

  const handleAdminJoinGroupRoom = useCallback(async () => {
    setEndedCallForRating(null);
    sessionStartedAtRef.current = Date.now();
    setActiveSession({
      callId: 'main_studio_room',
      isGroupRoom: true,
      partnerUid: 'main_studio_room',
      partnerName: 'Sala Ao Vivo Multi-Participantes',
    });
    setActiveTab('call');
    await acquireLocalMedia();
    joinRoom({ roomId: 'main_studio_room' });
    pushToast(
      'call_accepted',
      'Sala ao vivo aberta',
      'Você entrou na sala de videochamada para atender múltiplos internautas.'
    );
  }, [acquireLocalMedia, joinRoom, pushToast]);

  const handleVisitorDirectCallModel = useCallback(
    async (topic: string, plan: CallPlan) => {
      if (isDndActiveNow(studioState, new Date())) {
        const msg =
          'A modelo está em Modo Não Perturbe. Novas solicitações estão temporariamente bloqueadas.';
        setNoticeBanner(msg);
        pushToast('warning', 'Modo Não Perturbe ativo', msg);
        return;
      }
      const callId = await requestVideoCall(topic, plan);
      if (!callId || !modelProfile) return;
      const modelName =
        studioState?.modelName || modelProfile.displayName || 'Lorena Noir';
      const planMeta = {
        planId: plan.id,
        planName: plan.name,
        planDurationMinutes: plan.durationMinutes,
        planPriceCents: plan.priceCents,
      };
      setActiveSession({
        callId,
        partnerUid: modelProfile.uid,
        partnerName: modelName,
        ...planMeta,
      });
      setActiveTab('call');
      await acquireLocalMedia();
      sendWs({
        type: 'call:ring',
        targetUid: modelProfile.uid,
        callId,
        ...planMeta,
      });
      setNoticeBanner(
        `Plano ${plan.name} (${BRL_FORMATTER.format(plan.priceCents / 100)}) autorizado. Chamando ${modelName}...`
      );
    },
    [
      acquireLocalMedia,
      modelProfile,
      pushToast,
      requestVideoCall,
      sendWs,
      studioState,
    ]
  );

  const handleAcceptIncomingRing = useCallback(async () => {
    if (!incomingRing) return;
    const ring = incomingRing;
    const matchingQueue = callQueue.find((q) => q.id === ring.callId);

    const chosenPlan = !isAdmin && !matchingQueue ? selectedRingPlan : null;
    if (!isAdmin && !matchingQueue && !chosenPlan) {
      pushToast(
        'warning',
        'Plano obrigatório',
        'Selecione um plano pré-definido antes de aceitar a videochamada.'
      );
      return;
    }

    if (!isAdmin && !matchingQueue && chosenPlan) {
      const authQueueId = await requestVideoCall(
        `Videochamada direta com ${ring.fromName}`,
        chosenPlan
      );
      if (!authQueueId) return;
    }

    const planMeta = chosenPlan
      ? {
          planId: chosenPlan.id,
          planName: chosenPlan.name,
          planDurationMinutes: chosenPlan.durationMinutes,
          planPriceCents: chosenPlan.priceCents,
        }
      : {
          planId: matchingQueue?.planId || ring.planId,
          planName: matchingQueue?.planName || ring.planName,
          planDurationMinutes:
            matchingQueue?.planDurationMinutes || ring.planDurationMinutes,
          planPriceCents: matchingQueue?.planPriceCents ?? ring.planPriceCents,
        };

    setIncomingRing(null);
    setEndedCallForRating(null);
    sessionStartedAtRef.current = Date.now();
    setActiveSession({
      callId: ring.callId,
      partnerUid: ring.fromUid,
      partnerName: ring.fromName,
      ...planMeta,
    });
    setActiveTab('call');
    await acquireLocalMedia();

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
      ...planMeta,
    });
    pushToast(
      'call_accepted',
      'Chamada aceita',
      planMeta.planName
        ? `Videochamada com ${ring.fromName} iniciada (${planMeta.planName}).`
        : `Videochamada com ${ring.fromName} iniciada.`
    );
  }, [
    acquireLocalMedia,
    callQueue,
    incomingRing,
    isAdmin,
    pushToast,
    requestVideoCall,
    selectedRingPlan,
    sendWs,
    updateCallStatus,
    updateStudioState,
  ]);

  const handleRejectIncomingRing = useCallback(() => {
    if (!incomingRing) return;
    const matchingQueue = callQueue.find((q) => q.id === incomingRing.callId);
    if (
      isAdmin &&
      matchingQueue &&
      (matchingQueue.status === 'waiting' || matchingQueue.status === 'accepted')
    ) {
      void updateCallStatus(matchingQueue.id, 'rejected', 'refunded');
    }
    sendWs({
      type: 'call:reject',
      targetUid: incomingRing.fromUid,
      callId: incomingRing.callId,
    });
    setIncomingRing(null);
  }, [callQueue, incomingRing, isAdmin, sendWs, updateCallStatus]);

  const handleEnterAcceptedCall = useCallback(
    async (req: CallRequest) => {
      if (!modelProfile) return;
      const planMeta = {
        planId: req.planId,
        planName: req.planName,
        planDurationMinutes: req.planDurationMinutes,
        planPriceCents: req.planPriceCents,
      };
      setEndedCallForRating(null);
      sessionStartedAtRef.current = Date.now();
      setActiveSession({
        callId: req.id,
        partnerUid: modelProfile.uid,
        partnerName: modelProfile.displayName,
        ...planMeta,
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
        ...planMeta,
      });
    },
    [acquireLocalMedia, modelProfile, sendWs, updateCallStatus]
  );

  const handleSubmitCallRating = useCallback(
    async (recordId: string, rating: number, comment?: string) => {
      await submitCallRating(recordId, rating, comment);
      pushToast(
        'info',
        'Avaliação enviada',
        `Sua nota ${rating}/5 foi salva no histórico de chamadas.`
      );
    },
    [pushToast, submitCallRating]
  );

  const handleEndCall = useCallback(async () => {
    if (activeSession?.isGroupRoom) {
      const fallbackDuration = sessionStartedAtRef.current
        ? Math.max(
            1,
            Math.round((Date.now() - sessionStartedAtRef.current) / 1000)
          )
        : 0;
      const durationSeconds =
        elapsedSeconds > 0 ? elapsedSeconds : fallbackDuration;

      leaveRoom('main_studio_room');

      if (!isAdmin) {
        if (activeSession.queueCallId) {
          await updateCallStatus(activeSession.queueCallId, 'ended');
        }
        if (sessionStartedAtRef.current) {
          setEndedCallForRating({
            callId: activeSession.queueCallId || activeSession.callId,
            partnerName: activeSession.partnerName,
            planName: activeSession.planName,
            durationSeconds,
          });
          setActiveTab('studio');
        }
      }

      sessionStartedAtRef.current = null;
      closePeerConnection();
      setActiveSession(null);
      return;
    }

    if (activeSession) {
      const fallbackDuration = sessionStartedAtRef.current
        ? Math.max(
            1,
            Math.round((Date.now() - sessionStartedAtRef.current) / 1000)
          )
        : 0;
      const durationSeconds =
        elapsedSeconds > 0 ? elapsedSeconds : fallbackDuration;

      if (isAdmin) {
        const amountCents =
          activeSession.planPriceCents && activeSession.planPriceCents > 0
            ? activeSession.planPriceCents
            : durationSeconds > 0
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
          planId: activeSession.planId,
          planName: activeSession.planName,
          planDurationMinutes: activeSession.planDurationMinutes,
        });
      } else if (sessionStartedAtRef.current) {
        setEndedCallForRating({
          callId: activeSession.callId,
          partnerName: activeSession.partnerName,
          planName: activeSession.planName,
          durationSeconds,
        });
        setActiveTab('studio');
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
        await updateCallStatus(
          matchingQueue.id,
          'ended',
          isAdmin ? 'captured' : undefined
        );
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
    leaveRoom,
    ratePerMinuteCents,
    recordCallHistory,
    sendWs,
    updateCallStatus,
    updateStudioState,
  ]);

  // Mesh peer synchronization when connected inside the shared group room
  useEffect(() => {
    if (!user || !activeSession?.isGroupRoom) return;
    const participantUids = roomParticipants.map((p) => p.uid);
    void syncMeshPeers(user.uid, participantUids, 'main_studio_room');
  }, [activeSession?.isGroupRoom, roomParticipants, syncMeshPeers, user]);

  // Redirect visitor back to studio tab after clicking public landing CTA
  useEffect(() => {
    if (!user || !pendingPublicJoinRef.current) return;
    pendingPublicJoinRef.current = false;
    if (!isAdmin && isAdminRoute) {
      navigateRoute('/');
    }
    if (!isAdmin) {
      setActiveTab('studio');
    }
  }, [isAdmin, isAdminRoute, navigateRoute, user]);

  useEffect(() => {
    if (
      !activeSession?.planDurationMinutes ||
      connectionState !== 'connected'
    ) {
      return;
    }
    const limitSeconds = activeSession.planDurationMinutes * 60;
    const remainingSeconds = limitSeconds - elapsedSeconds;

    if (
      remainingSeconds <= 60 &&
      remainingSeconds > 0 &&
      warnedPlanCallIdRef.current !== activeSession.callId
    ) {
      warnedPlanCallIdRef.current = activeSession.callId;
      pushToast(
        'warning',
        'Último minuto do plano',
        `Resta menos de 1 minuto no plano ${activeSession.planName || 'contratado'}.`
      );
    }

    if (
      remainingSeconds <= 0 &&
      endedPlanCallIdRef.current !== activeSession.callId
    ) {
      endedPlanCallIdRef.current = activeSession.callId;
      pushToast(
        'info',
        'Tempo do plano concluído',
        `Os ${activeSession.planDurationMinutes} minutos contratados foram finalizados.`
      );
      if (isAdmin || activeSession.isGroupRoom) {
        void handleEndCall();
      }
    }
  }, [
    activeSession,
    connectionState,
    elapsedSeconds,
    handleEndCall,
    isAdmin,
    pushToast,
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

  const handleSendInterestMessage = useCallback(
    async (input: { preferredTime: string; message: string }) => {
      const id = await sendInterestMessage(input);
      if (id) {
        pushToast(
          'info',
          'Mensagem de interesse enviada',
          'Lorena Noir receberá seu recado assim que retornar ao estúdio.'
        );
      }
      return id;
    },
    [pushToast, sendInterestMessage]
  );

  const modelOnline = modelProfile
    ? peers.some((p) => p.uid === modelProfile.uid)
    : false;
  const scheduleOfflineNow =
    Boolean(studioState?.autoScheduleEnabled) &&
    !isWithinOperatingHours(studioState, scheduleNow);
  const dndActiveNow = isDndActiveNow(studioState, scheduleNow);
  dndActiveRef.current = dndActiveNow;

  const isModelUnavailable =
    !isAdmin &&
    !activeSession &&
    !incomingRing &&
    (scheduleOfflineNow ||
      dndActiveNow ||
      (studioState !== null &&
        (!studioState.isLive || studioState.callMode === 'paused')));

  useEffect(() => {
    if (!isAdmin || !studioState?.autoScheduleEnabled) {
      autoScheduleSyncRef.current = null;
      return;
    }
    const shouldBeLive = isWithinOperatingHours(studioState, scheduleNow);
    const targetMode = shouldBeLive ? 'open' : 'paused';
    if (
      studioState.isLive === shouldBeLive &&
      studioState.callMode === targetMode
    ) {
      autoScheduleSyncRef.current = null;
      return;
    }

    const syncKey = `${shouldBeLive}_${studioState.scheduleStartTime}_${studioState.scheduleEndTime}_${studioState.scheduleDays}`;
    if (autoScheduleSyncRef.current === syncKey) return;
    autoScheduleSyncRef.current = syncKey;

    void updateStudioState({
      isLive: shouldBeLive,
      callMode: targetMode,
    });
    pushToast(
      'info',
      shouldBeLive
        ? 'Estúdio aberto automaticamente'
        : 'Modo Descanso ativado automaticamente',
      shouldBeLive
        ? 'Seu horário de atendimento começou e a sala está liberada.'
        : 'Seu horário configurado encerrou e a tela de Descanso está ativa.'
    );
  }, [isAdmin, pushToast, scheduleNow, studioState, updateStudioState]);

  useEffect(() => {
    if (!isAdmin || !studioState) {
      dndSyncRef.current = null;
      return;
    }
    const nowMs = scheduleNow.getTime();
    const shouldDnd = isDndActiveNow(studioState, scheduleNow);
    const hasExpiredUntil =
      !shouldDnd &&
      (studioState.dndUntilMs ?? 0) > 0 &&
      (studioState.dndUntilMs ?? 0) <= nowMs;

    if (Boolean(studioState.dndActive) === shouldDnd && !hasExpiredUntil) {
      dndSyncRef.current = null;
      return;
    }

    const syncKey = `${shouldDnd}_${hasExpiredUntil ? 0 : studioState.dndUntilMs ?? 0}_${studioState.dndScheduleEnabled}`;
    if (dndSyncRef.current === syncKey) return;
    dndSyncRef.current = syncKey;

    void updateStudioState({
      dndActive: shouldDnd,
      ...(hasExpiredUntil ? { dndUntilMs: 0 } : {}),
    });

    pushToast(
      shouldDnd ? 'warning' : 'info',
      shouldDnd
        ? 'Modo Não Perturbe ativado'
        : 'Modo Não Perturbe encerrado',
      shouldDnd
        ? 'Novas solicitações de videochamada estão bloqueadas pelo agendamento.'
        : 'O período de bloqueio terminou e as solicitações estão liberadas.'
    );
  }, [isAdmin, pushToast, scheduleNow, studioState, updateStudioState]);

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
        isAdminRoute={isAdminRoute}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          if (isAdminRoute) navigateRoute('/');
          setActiveTab(tab);
        }}
        onNavigateRoute={navigateRoute}
        onLogin={() => void loginWithGoogle()}
        onLogout={() => void logout()}
      />

      {!user ? (
        isAdminRoute ? (
          <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-16 flex items-center justify-center">
            <section className="max-w-lg w-full bg-[#13151A] border border-white/10 rounded-xl p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#C9A46B]">
                  Administração · Lorena Noir
                </p>
                <h1 className="font-display text-3xl font-semibold text-[#F3EFE6]">
                  Central de Recepção da Modelo
                </h1>
                <p className="text-sm text-[#9BA1AE] leading-relaxed">
                  Entre com sua conta administrativa para atender videochamadas dos internautas, moderar áudio em tempo real e acompanhar a receita.
                </p>
              </div>

              {authError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200"
                >
                  {authError}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void loginWithGoogle()}
                  className="px-5 py-3 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors cursor-pointer"
                >
                  Entrar como Modelo Administradora
                </button>
                <button
                  type="button"
                  onClick={() => navigateRoute('/')}
                  className="px-4 py-3 text-xs font-medium rounded-lg bg-[#161920] border border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6] transition-colors cursor-pointer"
                >
                  Ir para área dos internautas
                </button>
              </div>
            </section>
          </main>
        ) : (
          <LoginView
            onEnterVideoCall={() => {
              pendingPublicJoinRef.current = true;
              void loginWithGoogle();
            }}
            authError={authError}
          />
        )
      ) : isAdminRoute ? (
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-6">
          {!isAdmin ? (
            <section className="max-w-lg mx-auto my-12 bg-[#13151A] border border-white/10 rounded-xl p-8 space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#FCA5A5]">
                  Acesso Restrito
                </p>
                <h1 className="font-display text-3xl font-semibold text-[#F3EFE6]">
                  Área Exclusiva da Modelo
                </h1>
                <p className="text-sm text-[#9BA1AE] leading-relaxed">
                  A conta conectada atualmente não possui permissão administrativa para receber chamadas no painel da modelo Lorena Noir.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigateRoute('/')}
                  className="px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors cursor-pointer"
                >
                  Ir para Recepção de Videochamada
                </button>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="px-4 py-2.5 text-xs font-medium rounded-lg bg-[#161920] border border-white/15 text-[#F3EFE6] hover:bg-[#1F232C] transition-colors cursor-pointer"
                >
                  Trocar de Conta
                </button>
              </div>
            </section>
          ) : (
            <ModelAdminPage
              myUid={user.uid}
              myProfile={myProfile}
              modelProfile={modelProfile}
              allProfiles={allProfiles}
              peers={peers}
              roomParticipants={roomParticipants}
              studioState={studioState}
              callQueue={callQueue}
              callMessages={callMessages}
              callHistory={callHistory}
              interestMessages={interestMessages}
              callPlans={callPlans}
              ratePerMinuteCents={ratePerMinuteCents}
              onChangeRatePerMinuteCents={setRatePerMinuteCents}
              wsConnected={wsConnected}
              isGroupRoom={Boolean(activeSession?.isGroupRoom)}
              activeCallId={activeSession?.callId || null}
              activePartnerUid={activeSession?.partnerUid || null}
              activePartnerName={activeSession?.partnerName || ''}
              activePlan={activeStagePlan}
              incomingRing={incomingRing}
              localStream={localStream}
              remoteStream={remoteStream}
              remoteStreams={remoteStreams}
              peerConnectionStates={peerConnectionStates}
              micEnabled={micEnabled}
              camEnabled={camEnabled}
              mediaError={mediaError}
              connectionState={connectionState}
              elapsedSeconds={elapsedSeconds}
              onAcquireMedia={acquireLocalMedia}
              onToggleMic={() => toggleMic()}
              onToggleCam={toggleCam}
              onEndCall={handleEndCall}
              onJoinGroupRoomAdmin={handleAdminJoinGroupRoom}
              onSendMessage={handleSendMessage}
              onAcceptIncomingRing={handleAcceptIncomingRing}
              onRejectIncomingRing={handleRejectIncomingRing}
              onAcceptQueueAndCall={handleAcceptQueueAndCall}
              onUpdateCallStatus={updateCallStatus}
              onDirectCallUser={handleDirectCallUser}
              onSavePlan={saveCallPlan}
              onDeletePlan={deleteCallPlan}
              onUpdateStudioState={updateStudioState}
              onUpdateUserControl={updateUserControl}
              onSendModeration={sendModerationCommand}
              onRecordCallHistory={recordCallHistory}
              onUpdateCallHistoryStatus={updateCallHistoryStatus}
              onUpdateInterestMessageStatus={updateInterestMessageStatus}
              onDeleteInterestMessage={deleteInterestMessage}
            />
          )}
        </main>
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
                  onClick={() => navigateRoute('/admin')}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#13151A] border border-white/10 text-[#F3EFE6] hover:bg-[#1B1E26] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-[#C9A46B]" />
                  <span>Página de Administração</span>
                </button>
              )}
              {!isModelUnavailable && (
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
              )}
            </div>
          </div>

          {/* Incoming Real-Time Call Alert */}
          {incomingRing && (
            <div
              role="alert"
              className="p-4 sm:px-6 rounded-xl bg-[#191611] border border-[#C9A46B]/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="flex items-start sm:items-center gap-3">
                <PhoneCall className="w-5 h-5 text-[#C9A46B] shrink-0 mt-0.5 sm:mt-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#F3EFE6]">
                    Chamada de vídeo recebida de {incomingRing.fromName}
                  </p>
                  <p className="text-xs text-[#C8CCD4]">
                    {incomingRing.planName && incomingRing.planPriceCents !== undefined
                      ? `Plano selecionado: ${incomingRing.planName} · ${BRL_FORMATTER.format(incomingRing.planPriceCents / 100)} (${incomingRing.planDurationMinutes || 0} min)`
                      : 'Selecione um plano pré-definido e autorize a cobrança para iniciar o vídeo.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {!isAdmin &&
                  !callQueue.some((q) => q.id === incomingRing.callId) &&
                  activePlans.length > 0 && (
                    <select
                      aria-label="Plano da videochamada"
                      value={selectedRingPlan?.id || ''}
                      onChange={(e) => setIncomingRingPlanId(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg bg-[#0E1014] border border-white/15 text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
                    >
                      {activePlans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} ·{' '}
                          {BRL_FORMATTER.format(plan.priceCents / 100)}
                        </option>
                      ))}
                    </select>
                  )}
                <button
                  type="button"
                  onClick={() => void handleAcceptIncomingRing()}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {!isAdmin &&
                  !callQueue.some((q) => q.id === incomingRing.callId) &&
                  selectedRingPlan
                    ? `Autorizar ${BRL_FORMATTER.format(selectedRingPlan.priceCents / 100)} e Aceitar`
                    : 'Aceitar Vídeo'}
                </button>
                <button
                  type="button"
                  onClick={handleRejectIncomingRing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#1B1E26] border border-white/10 text-[#9BA1AE] hover:text-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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

          {/* Post-Session Quality Rating Prompt */}
          {!isAdmin && !activeSession && endedCallForRating && (
            <RatingSystem
              callHistory={callHistory}
              endedSession={endedCallForRating}
              modelName={
                studioState?.modelName ||
                modelProfile?.displayName ||
                'Lorena Noir'
              }
              onSubmitRating={handleSubmitCallRating}
              onDismissEndedSession={() => setEndedCallForRating(null)}
            />
          )}

          {/* Active Workspace Content */}
          {isModelUnavailable ? (
            <ModelOfflineView
              isAdmin={false}
              myProfile={myProfile}
              modelProfile={modelProfile}
              studioState={studioState}
              modelOnline={modelOnline}
              myInterestMessages={interestMessages}
              onSendInterestMessage={handleSendInterestMessage}
            />
          ) : (
            <>
              {activeTab === 'call' && (
                <VideoCallStage
                  isAdmin={isAdmin}
                  isGroupRoom={Boolean(activeSession?.isGroupRoom)}
                  myProfile={myProfile}
                  modelProfile={modelProfile}
                  studioState={studioState}
                  activeCallId={activeSession?.callId || null}
                  activePartnerName={activeSession?.partnerName || ''}
                  activePartnerUid={activeSession?.partnerUid || null}
                  activePlan={activeStagePlan}
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
                  interestMessages={interestMessages}
                  callPlans={callPlans}
                  ratePerMinuteCents={ratePerMinuteCents}
                  onChangeRatePerMinuteCents={setRatePerMinuteCents}
                  onUpdateStudioState={updateStudioState}
                  onUpdateUserControl={updateUserControl}
                  onSendModeration={sendModerationCommand}
                  onDirectCallUser={handleDirectCallUser}
                  onSavePlan={saveCallPlan}
                  onDeletePlan={deleteCallPlan}
                  onRecordCallHistory={recordCallHistory}
                  onUpdateCallHistoryStatus={updateCallHistoryStatus}
                  onUpdateInterestMessageStatus={updateInterestMessageStatus}
                  onDeleteInterestMessage={deleteInterestMessage}
                />
              )}

              {activeTab === 'queue' && (
                <div className="space-y-8">
                  <CallQueuePanel
                    isAdmin={isAdmin}
                    myProfile={myProfile}
                    modelProfile={modelProfile}
                    studioState={studioState}
                    callQueue={callQueue}
                    callPlans={callPlans}
                    peers={peers}
                    roomParticipants={roomParticipants}
                    onRequestCall={requestVideoCall}
                    onDirectCallModel={handleVisitorDirectCallModel}
                    onJoinGroupRoom={handleVisitorJoinGroupRoom}
                    onAcceptAndCall={handleAcceptQueueAndCall}
                    onUpdateCallStatus={updateCallStatus}
                    onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
                  />
                  {!isAdmin && (
                    <RatingSystem
                      callHistory={callHistory}
                      endedSession={null}
                      modelName={
                        studioState?.modelName ||
                        modelProfile?.displayName ||
                        'Lorena Noir'
                      }
                      showHistoryList={true}
                      onSubmitRating={handleSubmitCallRating}
                    />
                  )}
                </div>
              )}

              {activeTab === 'studio' &&
                (isAdmin ? (
                  <div className="space-y-8">
                    {studioState && !studioState.isLive && (
                      <ModelOfflineView
                        isAdmin={true}
                        myProfile={myProfile}
                        modelProfile={modelProfile}
                        studioState={studioState}
                        modelOnline={modelOnline}
                        myInterestMessages={interestMessages}
                        onSendInterestMessage={handleSendInterestMessage}
                        onUpdateStudioState={updateStudioState}
                      />
                    )}
                    <UserControlPanel
                      myUid={user.uid}
                      profiles={allProfiles}
                      peers={peers}
                      studioState={studioState}
                      callHistory={callHistory}
                      interestMessages={interestMessages}
                      callPlans={callPlans}
                      ratePerMinuteCents={ratePerMinuteCents}
                      onChangeRatePerMinuteCents={setRatePerMinuteCents}
                      onUpdateStudioState={updateStudioState}
                      onUpdateUserControl={updateUserControl}
                      onSendModeration={sendModerationCommand}
                      onDirectCallUser={handleDirectCallUser}
                      onSavePlan={saveCallPlan}
                      onDeletePlan={deleteCallPlan}
                      onRecordCallHistory={recordCallHistory}
                      onUpdateCallHistoryStatus={updateCallHistoryStatus}
                      onUpdateInterestMessageStatus={updateInterestMessageStatus}
                      onDeleteInterestMessage={deleteInterestMessage}
                    />
                    <CallQueuePanel
                      isAdmin={isAdmin}
                      myProfile={myProfile}
                      modelProfile={modelProfile}
                      studioState={studioState}
                      callQueue={callQueue}
                      callPlans={callPlans}
                      peers={peers}
                      roomParticipants={roomParticipants}
                      onRequestCall={requestVideoCall}
                      onDirectCallModel={handleVisitorDirectCallModel}
                      onJoinGroupRoom={handleVisitorJoinGroupRoom}
                      onAcceptAndCall={handleAcceptQueueAndCall}
                      onUpdateCallStatus={updateCallStatus}
                      onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
                    />
                  </div>
                ) : (
                  <div className="space-y-8">
                    <CallQueuePanel
                      isAdmin={isAdmin}
                      myProfile={myProfile}
                      modelProfile={modelProfile}
                      studioState={studioState}
                      callQueue={callQueue}
                      callPlans={callPlans}
                      peers={peers}
                      roomParticipants={roomParticipants}
                      onRequestCall={requestVideoCall}
                      onDirectCallModel={handleVisitorDirectCallModel}
                      onJoinGroupRoom={handleVisitorJoinGroupRoom}
                      onAcceptAndCall={handleAcceptQueueAndCall}
                      onUpdateCallStatus={updateCallStatus}
                      onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
                    />
                    <RatingSystem
                      callHistory={callHistory}
                      endedSession={null}
                      modelName={
                        studioState?.modelName ||
                        modelProfile?.displayName ||
                        'Lorena Noir'
                      }
                      showHistoryList={true}
                      onSubmitRating={handleSubmitCallRating}
                    />
                  </div>
                ))}
            </>
          )}
        </main>
      )}

      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
