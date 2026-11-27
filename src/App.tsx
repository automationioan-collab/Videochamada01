import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'motion/react';
import {
  BellRing,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  PhoneCall,
  PhoneOff,
  ShieldAlert,
  UserPlus,
  Video,
} from 'lucide-react';
import { ADMIN_MODEL_THEMES } from './lib/modelThemes';
import { CallQueuePanel } from './components/CallQueuePanel';
import { Header, type WorkspaceTab } from './components/Header';
import { LoginView } from './components/LoginView';
import { ModelAdminPage } from './components/ModelAdminPage';
import { ModelOfflineView } from './components/ModelOfflineView';
import { ModelProfileBioSection } from './components/ModelProfileBioSection';
import { PixPaymentModal } from './components/PixPaymentModal';
import { PrivateAlbumViewer } from './components/PrivateAlbumViewer';
import {
  RatingSystem,
  type EndedSessionContext,
} from './components/RatingSystem';
import { SalaDeEspera } from './components/SalaDeEspera';
import { TechAmbientField } from './components/TechEffects';
import {
  ToastOverlay,
  type StudioToast,
  type ToastVariant,
} from './components/ToastOverlay';
import { VideoCallStage } from './components/VideoCallStage';
import {
  WhatsappInviteCheckoutView,
  type InviteCheckoutSelection,
} from './components/WhatsappInviteCheckoutView';
import { useStudioAuth } from './hooks/useStudioAuth';
import { useWebRTC } from './hooks/useWebRTC';
import {
  useWebSocketStudio,
  type ModerationEffect,
  type PresenceEvent,
  type SignalPayload,
} from './hooks/useWebSocketStudio';
import {
  isAudioSoundEnabled,
  playNotificationDing,
  setAudioSoundEnabled,
  unlockAudioContext,
} from './lib/audio';
import { installMediaProtection } from './lib/mediaProtection';
import {
  formatMinutesSecondsClock,
  getHolidayForDate,
  getUpcomingBlockWarning,
  isDndActiveNow,
  isWeekdayBlockedNow,
  isWithinOperatingHours,
  serializeSchedulePeriodsDigest,
} from './lib/schedule';
import type {
  CallPlan,
  CallRequest,
  MercadoPagoPaymentMethod,
  PixChargeRecord,
  PublicWhatsappInviteData,
} from './types/studio';

const PENDING_INVITE_CHECKOUT_KEY = 'model_gat_pending_invite_checkout';

function parseWhatsappInviteIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const match = window.location.pathname.match(
      /^\/convite\/([a-zA-Z0-9_-]+)/
    );
    if (match?.[1]) return match[1];
    const fromQuery = new URLSearchParams(window.location.search)
      .get('convite')
      ?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    // Ignore URL restrictions
  }
  return null;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

interface ActiveCallSession {
  callId: string;
  partnerUid: string;
  partnerName: string;
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
    modelSession,
    modelAccount,
    modelToken,
    modelAuthId,
    authLoading,
    authError,
    modelAuthError,
    modelAuthSubmitting,
    primaryNeedsClaim,
    primaryClaimInfo,
    isAdmin,
    activeModelId,
    activeAdminThemeId,
    effectiveActorUid,
    publicModels,
    selectedPublicModelId,
    setSelectedPublicModelId,
    publicRatings,
    publicShowcaseLoading,
    myProfile,
    modelProfile,
    allProfiles,
    studioState,
    studioConfig,
    galleryItems,
    privateAlbumSummary,
    privateAlbumItems,
    visitorUnlockedPrivateItems,
    callQueue,
    callMessages,
    callHistory,
    interestMessages,
    callPlans,
    pixCharges,
    whatsappInvites,
    refreshWorkspace,
    refreshPublicModels,
    loginWithGoogle,
    loginAsModel,
    claimPrimaryModelPassword,
    registerAsModel,
    logout,
    updateMyModelAccount,
    updateStudioState,
    saveStudioConfig,
    uploadStudioImage,
    uploadStudioMedia,
    saveGalleryItem,
    deleteGalleryItem,
    restoreDefaultGallery,
    toggleMediaVisibility,
    savePrivateAlbumSettings,
    savePrivateAlbumItem,
    deletePrivateAlbumItem,
    purchasePrivateAlbum,
    unlockPrivateAlbum,
    createPixCharge,
    reconcileMercadoPagoReturn,
    checkPixChargeStatus,
    confirmPixCharge,
    cancelPixCharge,
    confirmModelPixCharge,
    cancelModelPixCharge,
    createWhatsappInvite,
    deleteWhatsappInvite,
    updateUserControl,
    deleteUserProfile,
    requestVideoCall,
    updateCallStatus,
    deleteCallRequest,
    saveCallPlan,
    deleteCallPlan,
    sendCallMessage,
    recordCallHistory,
    updateCallHistoryStatus,
    updateCallHistoryRecord,
    deleteCallHistoryRecord,
    submitCallRating,
    sendInterestMessage,
    updateInterestMessageStatus,
    deleteInterestMessage,
    sendTipContribution,
  } = useStudioAuth();

  const [adminAuthMode, setAdminAuthMode] = useState<'login' | 'register'>(
    'login'
  );
  const [modelLoginInput, setModelLoginInput] = useState('');
  const [modelPasswordInput, setModelPasswordInput] = useState('');
  const [showModelPassword, setShowModelPassword] = useState(false);

  // Self-registration form for new private model admin panels
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regLoginInput, setRegLoginInput] = useState('');
  const [regPasswordInput, setRegPasswordInput] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regThemeColor, setRegThemeColor] = useState<string>('rose_velvet');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLocalError, setRegLocalError] = useState<string | null>(null);

  // First-run primary model password claim state
  const [claimLoginInput, setClaimLoginInput] = useState('');
  const [claimPasswordInput, setClaimPasswordInput] = useState('');
  const [claimConfirmPassword, setClaimConfirmPassword] = useState('');
  const [showClaimPassword, setShowClaimPassword] = useState(false);
  const [claimLocalError, setClaimLocalError] = useState<string | null>(null);

  const isAuthenticated = Boolean(user || modelSession);
  const activeModelDisplayName =
    studioConfig?.modelName ||
    studioState?.modelName ||
    modelProfile?.displayName ||
    modelSession?.model.displayName ||
    'Lorena Noir';

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [allowAdminVisitorPreview, setAllowAdminVisitorPreview] =
    useState<boolean>(false);
  const [currentPath, setCurrentPath] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [activeInviteId, setActiveInviteId] = useState<string | null>(() =>
    parseWhatsappInviteIdFromLocation()
  );
  const [inviteData, setInviteData] = useState<PublicWhatsappInviteData | null>(
    null
  );
  const [inviteLoading, setInviteLoading] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSubmitting, setInviteSubmitting] = useState<boolean>(false);
  const [inviteCheckoutError, setInviteCheckoutError] = useState<string | null>(
    null
  );
  const [inviteRequiresTokenFallback, setInviteRequiresTokenFallback] =
    useState<boolean>(false);
  const [invitePixCharge, setInvitePixCharge] =
    useState<PixChargeRecord | null>(null);
  const [pendingInvitePixMeta, setPendingInvitePixMeta] = useState<{
    plan: CallPlan;
    topic: string;
    inviteId: string;
    preferredPaymentMethod: MercadoPagoPaymentMethod;
  } | null>(null);
  const pendingInviteAutoCheckoutRef = useRef<
    (InviteCheckoutSelection & { inviteId: string }) | null
  >(null);
  const [highContrastAdmin, setHighContrastAdmin] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return (
        window.localStorage.getItem('maison_aura_admin_high_contrast') ===
        'true'
      );
    } catch {
      return false;
    }
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    isAudioSoundEnabled()
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
  const announcedPauseWarningRef = useRef<string | null>(null);
  const dndActiveRef = useRef<boolean>(false);
  const warnedPlanCallIdRef = useRef<string | null>(null);
  const endedPlanCallIdRef = useRef<string | null>(null);
  const elapsedSecondsRef = useRef<number>(0);
  const sendWsRef = useRef<(payload: unknown) => void>(() => {});
  const pendingPublicJoinRef = useRef<boolean>(false);
  const seenQueueIdsRef = useRef<Set<string>>(new Set());
  const notifiedVipQueueIdsRef = useRef<Set<string>>(new Set());
  const queueInitializedRef = useRef<boolean>(false);
  const myUidRef = useRef<string | null>(null);
  myUidRef.current = effectiveActorUid || null;
  const activeSessionRef = useRef<ActiveCallSession | null>(null);
  activeSessionRef.current = activeSession;

  const toggleHighContrastAdmin = useCallback(() => {
    setHighContrastAdmin((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            'maison_aura_admin_high_contrast',
            String(next)
          );
        } catch {
          // Ignore storage restrictions in embedded iframes
        }
      }
      return next;
    });
  }, []);

  const toggleSoundEnabled = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      setAudioSoundEnabled(next);
      if (next) {
        unlockAudioContext();
        playNotificationDing('test', true);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const unlock = () => unlockAudioContext();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    return installMediaProtection();
  }, []);

  useEffect(() => {
    setRatePerMinuteCents(studioConfig?.ratePerMinuteCents || 1500);
  }, [studioConfig?.ratePerMinuteCents, activeModelId]);

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

  const navigateRoute = useCallback(
    (path: '/' | '/admin', options?: { previewVisitor?: boolean }) => {
      if (path === '/admin') {
        setAllowAdminVisitorPreview(false);
        setActiveInviteId(null);
      } else {
        setActiveInviteId(null);
        if (options?.previewVisitor) {
          setAllowAdminVisitorPreview(true);
        }
      }
      if (
        typeof window !== 'undefined' &&
        (window.location.pathname !== path ||
          window.location.search.includes('convite='))
      ) {
        try {
          window.history.pushState({}, '', path);
        } catch {
          // Ignore History API restrictions in sandboxed frames
        }
      }
      setCurrentPath(path);
    },
    []
  );

  useEffect(() => {
    const onPopState = () => {
      setCurrentPath(window.location.pathname);
      setActiveInviteId(parseWhatsappInviteIdFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Automatically isolate authenticated Model Admin onto /admin unless explicitly previewing / or inspecting an invite
  useEffect(() => {
    if (!isAuthenticated) {
      setAllowAdminVisitorPreview(false);
      return;
    }
    if (
      isAdmin &&
      currentPath !== '/admin' &&
      !allowAdminVisitorPreview &&
      !activeInviteId
    ) {
      navigateRoute('/admin');
    }
  }, [
    activeInviteId,
    allowAdminVisitorPreview,
    currentPath,
    isAdmin,
    isAuthenticated,
    navigateRoute,
  ]);

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

  useEffect(() => {
    if (typeof window === 'undefined' || authLoading) return;
    try {
      const params = new URLSearchParams(window.location.search);
      const mpStatus = params.get('mp_status');
      const mpRef = params.get('ref') || undefined;
      if (!mpStatus) return;
      if (mpStatus === 'approved') {
        pushToast(
          'call_accepted',
          'Retorno do Mercado Pago',
          'Pagamento retornado com sucesso. Sincronizando confirmação oficial...'
        );
      } else if (mpStatus === 'pending') {
        pushToast(
          'info',
          'Pagamento em processamento',
          'O Mercado Pago está processando sua transação. Assim que compensar, o acesso será liberado.'
        );
      } else if (mpStatus === 'failure') {
        pushToast(
          'info',
          'Pagamento não concluído',
          'O pagamento no Mercado Pago foi cancelado ou recusado. Você pode gerar uma nova cobrança.'
        );
      }
      if (user && (mpStatus === 'approved' || mpStatus === 'pending' || mpRef)) {
        void reconcileMercadoPagoReturn(mpRef);
      } else {
        void refreshWorkspace();
      }
      params.delete('mp_status');
      params.delete('ref');
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`;
      window.history.replaceState({}, '', nextUrl);
    } catch {
      // Ignore query cleanup errors in sandboxed iframes
    }
  }, [authLoading, pushToast, reconcileMercadoPagoReturn, refreshWorkspace, user]);

  const hasActiveTimedDnd = Boolean(
    studioState?.dndUntilMs && studioState.dndUntilMs > Date.now()
  );

  const hasActiveDailyPauses = Boolean(
    studioState?.dailyPausePeriods?.some((p) => p.enabled)
  );

  useEffect(() => {
    const tickMs =
      hasActiveTimedDnd ||
      Boolean(studioState?.dndScheduleEnabled) ||
      Boolean(studioState?.pauseWarningEnabled) ||
      hasActiveDailyPauses
        ? 1000
        : 15000;
    const intervalId = window.setInterval(() => {
      setScheduleNow(new Date());
    }, tickMs);
    return () => window.clearInterval(intervalId);
  }, [
    hasActiveDailyPauses,
    hasActiveTimedDnd,
    studioState?.dndScheduleEnabled,
    studioState?.pauseWarningEnabled,
  ]);

  const webrtcSignalRef = useRef<(signal: SignalPayload) => Promise<void>>(
    async () => {}
  );
  const webrtcOfferRef = useRef<
    (targetUid: string, callId: string) => Promise<void>
  >(async () => {});
  const webrtcCloseRef = useRef<(targetUid?: string) => void>(() => {});
  const webrtcToggleMicRef = useRef<(force?: boolean) => void>(() => {});
  const finalizeRemoteCallEndRef = useRef<() => void>(() => {});
  const vipUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    vipUidsRef.current = new Set(
      allProfiles.filter((p) => p.accessStatus === 'vip').map((p) => p.uid)
    );
  }, [allProfiles]);

  const handleIncomingSignal = useCallback(
    (signal: SignalPayload) => {
      if (signal.type === 'call:ring') {
        if (isAdmin && dndActiveRef.current) {
          sendWsRef.current({
            type: 'call:reject',
            targetUid: signal.fromUid,
            callId: signal.callId || `direct_${Date.now()}`,
            reason: 'A modelo está em Modo Não Perturbe no momento.',
          });
          return;
        }
        if (
          isAdmin &&
          activeSessionRef.current &&
          activeSessionRef.current.partnerUid !== signal.fromUid
        ) {
          sendWsRef.current({
            type: 'call:reject',
            targetUid: signal.fromUid,
            callId: signal.callId || `direct_${Date.now()}`,
            reason:
              'A modelo já está em sala privativa com outro internauta. Você continua na fila.',
          });
          return;
        }
        if (signal.planId) {
          setIncomingRingPlanId(signal.planId);
        }
        const isVipCallerRing =
          isAdmin && vipUidsRef.current.has(signal.fromUid);
        playNotificationDing(
          isVipCallerRing ? 'vip_priority' : 'incoming_call'
        );
        if (isVipCallerRing) {
          pushToast(
            'vip_priority',
            'Chamada Prioritária VIP',
            `${signal.fromName || 'Cliente VIP'} está chamando para atendimento privativo.`
          );
        }
        setIncomingRing({
          callId: signal.callId || `direct_${Date.now()}`,
          fromUid: signal.fromUid,
          fromName: signal.fromName || activeModelDisplayName,
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
          'Sala privativa conectada',
          `${partnerName} aceitou a videochamada 1-para-1. Conectando vídeo...`
        );
        void webrtcOfferRef.current(signal.fromUid, callId);
        return;
      }

      if (signal.type === 'call:reject') {
        const msg =
          signal.reason ||
          `${signal.fromName || 'O participante'} recusou a videochamada.`;
        setNoticeBanner(msg);
        pushToast('warning', 'Sala privativa indisponível', msg);
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
        setNoticeBanner('A videochamada privativa foi encerrada.');
        pushToast('info', 'Chamada encerrada', 'A sessão de vídeo foi finalizada.');
        return;
      }

      void webrtcSignalRef.current(signal);
    },
    [activeModelDisplayName, isAdmin, pushToast]
  );

  const handlePresenceEvent = useCallback(
    (event: PresenceEvent) => {
      if (event.kind === 'joined') {
        if (event.peer.uid !== myUidRef.current) {
          playNotificationDing('user_joined');
        }
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

  const {
    wsConnected,
    peers,
    queueSummary,
    sendWs,
    sendModerationCommand,
    syncQueueEntry,
    syncAuthoritativeQueue,
  } = useWebSocketStudio({
    user,
    modelToken,
    modelAuthId,
    selectedModelId: activeModelId,
    profile: myProfile,
    onSignal: handleIncomingSignal,
    onModerationEffect: handleModerationEffect,
    onPresenceEvent: handlePresenceEvent,
    onStudioRefresh: () => {
      void refreshWorkspace();
    },
    onModelsRefresh: () => {
      void refreshPublicModels();
    },
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
      if (activeSessionRef.current) {
        pushToast(
          'warning',
          'Sala privativa ocupada (1/1)',
          'Você já está em atendimento com 1 internauta. Encerre a chamada atual antes de chamar outro.'
        );
        return;
      }
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
      setNoticeBanner(
        `Chamando ${target.displayName} para sala privativa 1-para-1...`
      );
    },
    [
      acquireLocalMedia,
      defaultPlan,
      isAdmin,
      pushToast,
      sendWs,
      updateStudioState,
    ]
  );

  const handleAcceptQueueAndCall = useCallback(
    async (req: CallRequest) => {
      if (activeSessionRef.current) {
        pushToast(
          'warning',
          'Sala privativa ocupada (1/1)',
          'Encerre o atendimento atual antes de atender o próximo internauta da fila.'
        );
        return;
      }
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
        'Chamada privativa aceita',
        `Solicitação de ${req.userName} aceita. Chamando para a sala 1-para-1...`
      );
    },
    [acquireLocalMedia, pushToast, sendWs, updateCallStatus, updateStudioState]
  );

  const handleVisitorDirectCallModel = useCallback(
    async (topic: string, plan: CallPlan, existingCallRequestId?: string) => {
      if (isDndActiveNow(studioState, new Date())) {
        const msg =
          'A modelo está em Modo Não Perturbe. Novas solicitações estão temporariamente bloqueadas.';
        setNoticeBanner(msg);
        pushToast('warning', 'Modo Não Perturbe ativo', msg);
        return;
      }
      const callId =
        existingCallRequestId || (await requestVideoCall(topic, plan));
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
    ratePerMinuteCents,
    recordCallHistory,
    sendWs,
    updateCallStatus,
    updateStudioState,
  ]);

  // Play incoming call ding & toast when a call request enters waiting queue for admin (with VIP priority alert)
  useEffect(() => {
    if (!isAdmin) {
      seenQueueIdsRef.current.clear();
      notifiedVipQueueIdsRef.current.clear();
      queueInitializedRef.current = false;
      return;
    }

    const vipUidSet = new Set(
      allProfiles.filter((p) => p.accessStatus === 'vip').map((p) => p.uid)
    );

    if (!queueInitializedRef.current) {
      const initialWaitingVips: CallRequest[] = [];
      for (const req of callQueue) {
        seenQueueIdsRef.current.add(req.id);
        if (
          req.status === 'waiting' &&
          vipUidSet.has(req.userId) &&
          !notifiedVipQueueIdsRef.current.has(req.id)
        ) {
          notifiedVipQueueIdsRef.current.add(req.id);
          initialWaitingVips.push(req);
        }
      }
      queueInitializedRef.current = true;

      if (initialWaitingVips.length > 0) {
        const firstVip = initialWaitingVips[0];
        pushToast(
          'vip_priority',
          'Cliente VIP na Sala de Espera',
          initialWaitingVips.length === 1
            ? `${firstVip.userName} (VIP) está aguardando na fila com prioridade.`
            : `${initialWaitingVips.length} clientes VIP aguardando na fila com prioridade (${firstVip.userName}).`
        );
        if (!dndActiveRef.current) {
          playNotificationDing('vip_priority');
        }
      }
      return;
    }

    let hasNewWaiting = false;
    let hasNewVipWaiting = false;
    for (const req of callQueue) {
      const isVipCaller = vipUidSet.has(req.userId);
      const isNewReq = !seenQueueIdsRef.current.has(req.id);
      if (isNewReq) {
        seenQueueIdsRef.current.add(req.id);
      }

      if (
        req.status === 'waiting' &&
        isVipCaller &&
        !notifiedVipQueueIdsRef.current.has(req.id)
      ) {
        notifiedVipQueueIdsRef.current.add(req.id);
        hasNewVipWaiting = true;
        pushToast(
          'vip_priority',
          'Cliente VIP na Sala de Espera',
          `${req.userName} (VIP) entrou na fila com prioridade (${req.planName || 'plano selecionado'}).`
        );
      } else if (isNewReq && req.status === 'waiting') {
        hasNewWaiting = true;
        pushToast(
          'info',
          'Nova solicitação na fila',
          `${req.userName} solicitou chamada (${req.planName || 'plano selecionado'}).`
        );
      }
    }
    if (hasNewVipWaiting && !dndActiveRef.current) {
      playNotificationDing('vip_priority');
    } else if (hasNewWaiting && !dndActiveRef.current) {
      playNotificationDing('incoming_call');
    }
  }, [allProfiles, callQueue, isAdmin, pushToast]);

  // Synchronize visitor waiting entry to WebSocket queue calculator
  useEffect(() => {
    if (!isAuthenticated || isAdmin || !wsConnected) return;
    const waitingReq = callQueue.find((q) => q.status === 'waiting');
    if (waitingReq) {
      syncQueueEntry({
        status: 'waiting',
        callId: waitingReq.id,
        planDurationMinutes: waitingReq.planDurationMinutes || 10,
        createdAtMs: waitingReq.createdAt?.toMillis?.() ?? Date.now(),
        isVip: myProfile?.accessStatus === 'vip',
      });
    } else {
      syncQueueEntry({ status: 'idle' });
    }
  }, [
    callQueue,
    isAdmin,
    isAuthenticated,
    myProfile?.accessStatus,
    syncQueueEntry,
    wsConnected,
  ]);

  // Synchronize authoritative model queue & active call estimate from Admin
  useEffect(() => {
    if (!isAuthenticated || !isAdmin || !wsConnected) return;
    const vipUidSet = new Set(
      allProfiles.filter((p) => p.accessStatus === 'vip').map((p) => p.uid)
    );
    const waitingEntries = callQueue
      .filter((q) => q.status === 'waiting')
      .map((q) => ({
        callId: q.id,
        uid: q.userId,
        planDurationMinutes: q.planDurationMinutes || 10,
        createdAtMs: q.createdAt?.toMillis?.() ?? Date.now(),
        isVip: vipUidSet.has(q.userId),
      }));

    const activeQueueReq = studioState?.activeCallId
      ? callQueue.find((q) => q.id === studioState.activeCallId)
      : undefined;

    const activeCall = activeSession
      ? {
          callId: activeSession.callId,
          durationMinutes: activeSession.planDurationMinutes || 15,
          startedAtMs: sessionStartedAtRef.current ?? undefined,
        }
      : studioState?.activeCallId
        ? {
            callId: studioState.activeCallId,
            durationMinutes: activeQueueReq?.planDurationMinutes || 15,
            startedAtMs: activeQueueReq?.updatedAt?.toMillis?.() ?? undefined,
          }
        : null;

    syncAuthoritativeQueue({
      waiting: waitingEntries,
      activeCall,
    });
  }, [
    activeSession,
    allProfiles,
    callQueue,
    isAdmin,
    isAuthenticated,
    studioState?.activeCallId,
    syncAuthoritativeQueue,
    wsConnected,
  ]);

  // Redirect visitor back to studio tab after clicking public landing CTA, or isolate admin to /admin
  useEffect(() => {
    if (!isAuthenticated || !pendingPublicJoinRef.current) return;
    pendingPublicJoinRef.current = false;
    if (isAdmin) {
      navigateRoute('/admin');
      return;
    }
    if (isAdminRoute) {
      navigateRoute('/');
    }
    setActiveTab('studio');
  }, [isAdmin, isAdminRoute, isAuthenticated, navigateRoute]);

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
      if (isAdmin) {
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
          `${activeModelDisplayName} receberá seu recado assim que retornar ao estúdio.`
        );
      }
      return id;
    },
    [activeModelDisplayName, pushToast, sendInterestMessage]
  );

  const modelOnline = modelProfile
    ? peers.some((p) => p.uid === modelProfile.uid)
    : false;
  const holidayToday = getHolidayForDate(studioState, scheduleNow);
  const weekdayBlockedToday = isWeekdayBlockedNow(studioState, scheduleNow);
  const scheduleOfflineNow =
    Boolean(holidayToday) ||
    weekdayBlockedToday ||
    (Boolean(studioState?.autoScheduleEnabled) &&
      !isWithinOperatingHours(studioState, scheduleNow));
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
    if (!isAdmin || !studioState) {
      autoScheduleSyncRef.current = null;
      return;
    }
    const isHolidayNow = getHolidayForDate(studioState, scheduleNow) !== null;
    const isBlockedDayNow = isWeekdayBlockedNow(studioState, scheduleNow);
    const forcedClosedToday = isHolidayNow || isBlockedDayNow;
    if (!studioState.autoScheduleEnabled && !forcedClosedToday) {
      autoScheduleSyncRef.current = null;
      return;
    }

    const shouldBeLive =
      !forcedClosedToday && isWithinOperatingHours(studioState, scheduleNow);
    const targetMode = shouldBeLive ? 'open' : 'paused';
    if (
      studioState.isLive === shouldBeLive &&
      studioState.callMode === targetMode
    ) {
      autoScheduleSyncRef.current = null;
      return;
    }

    const syncKey = `${shouldBeLive}_${isHolidayNow}_${isBlockedDayNow}_${serializeSchedulePeriodsDigest(studioState)}`;
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
        : isHolidayNow
          ? 'Modo Descanso ativado por data programada'
          : isBlockedDayNow
            ? 'Dia bloqueado na agenda semanal'
            : 'Modo Descanso ativado automaticamente',
      shouldBeLive
        ? 'Seu horário de atendimento começou e a sala está liberada.'
        : isHolidayNow
          ? 'A data de hoje está definida como feriado/folga e o estúdio entrou em descanso.'
          : isBlockedDayNow
            ? 'Este dia da semana está marcado como folga recorrente em Gerenciamento de Agenda.'
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

    const syncKey = `${shouldDnd}_${hasExpiredUntil ? 0 : studioState.dndUntilMs ?? 0}_${studioState.dndScheduleEnabled}_${serializeSchedulePeriodsDigest(studioState)}`;
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

  const upcomingBlockWarning = useMemo(
    () => getUpcomingBlockWarning(studioState, scheduleNow),
    [studioState, scheduleNow]
  );

  useEffect(() => {
    if (isAdmin || !upcomingBlockWarning) return;
    const warningKey = `${activeModelId}_${upcomingBlockWarning.kind}_${upcomingBlockWarning.startsAtMs}`;
    if (announcedPauseWarningRef.current === warningKey) return;
    announcedPauseWarningRef.current = warningKey;

    const minsLeft = Math.max(
      1,
      Math.ceil(upcomingBlockWarning.remainingMs / 60_000)
    );
    pushToast(
      'warning',
      `Aviso de Pausa · ${activeModelDisplayName}`,
      upcomingBlockWarning.customMessage ||
        `${upcomingBlockWarning.label} inicia em ${minsLeft} minuto${minsLeft === 1 ? '' : 's'} (${upcomingBlockWarning.startTime}).`
    );
  }, [activeModelDisplayName, activeModelId, isAdmin, pushToast, upcomingBlockWarning]);

  const handleModelLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLocalError(null);
    if (!modelLoginInput.trim() || !modelPasswordInput) return;
    const ok = await loginAsModel(modelLoginInput.trim(), modelPasswordInput);
    if (ok) {
      setModelPasswordInput('');
      navigateRoute('/admin');
    }
  };

  const handleModelRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegLocalError(null);
    if (regDisplayName.trim().length < 2) {
      setRegLocalError('Informe seu nome artístico (mínimo 2 caracteres).');
      return;
    }
    if (regLoginInput.trim().length < 3) {
      setRegLocalError('Informe um login de acesso (mínimo 3 caracteres).');
      return;
    }
    if (regPasswordInput.length < 6) {
      setRegLocalError('Sua senha privativa deve ter pelo menos 6 caracteres.');
      return;
    }
    if (regPasswordInput !== regConfirmPassword) {
      setRegLocalError('A confirmação da senha não confere.');
      return;
    }
    const res = await registerAsModel({
      displayName: regDisplayName.trim(),
      loginUsername: regLoginInput.trim(),
      password: regPasswordInput,
      adminThemeColor: regThemeColor,
    });
    if (res.ok) {
      setRegPasswordInput('');
      setRegConfirmPassword('');
      navigateRoute('/admin');
    }
  };

  const handlePrimaryClaimSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setClaimLocalError(null);
    if (claimPasswordInput.length < 6) {
      setClaimLocalError('A senha inicial deve ter pelo menos 6 caracteres.');
      return;
    }
    if (claimPasswordInput !== claimConfirmPassword) {
      setClaimLocalError('A confirmação da senha não confere.');
      return;
    }
    const res = await claimPrimaryModelPassword({
      password: claimPasswordInput,
      ...(claimLoginInput.trim()
        ? { loginUsername: claimLoginInput.trim() }
        : {}),
    });
    if (res.ok) {
      setClaimPasswordInput('');
      setClaimConfirmPassword('');
      navigateRoute('/admin');
    }
  };

  // Load WhatsApp Invite landing data when visiting /convite/:inviteId
  useEffect(() => {
    if (!activeInviteId) {
      setInviteData(null);
      setInviteError(null);
      setInviteLoading(false);
      return;
    }
    let cancelled = false;
    setInviteLoading(true);
    setInviteError(null);
    void fetch(`/api/public/invites/${encodeURIComponent(activeInviteId)}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as PublicWhatsappInviteData & {
          ok?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.invite) {
          setInviteData(null);
          setInviteError(json.error || 'Convite não encontrado ou expirado.');
          return;
        }
        setInviteData({
          invite: json.invite,
          model: json.model,
          studioConfig: json.studioConfig,
          studioState: json.studioState,
          callPlans: json.callPlans,
        });
        setSelectedPublicModelId(json.model.id);
      })
      .catch(() => {
        if (!cancelled) {
          setInviteError('Não foi possível carregar o convite agora.');
        }
      })
      .finally(() => {
        if (!cancelled) setInviteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeInviteId, setSelectedPublicModelId]);

  const handleInvitePayAndHire = useCallback(
    async (selection: InviteCheckoutSelection) => {
      if (!inviteData) return;
      const availablePlans =
        activePlans.length > 0 ? activePlans : inviteData.callPlans;
      const plan =
        availablePlans.find((p) => p.id === selection.planId) ||
        availablePlans[0];
      if (!plan) {
        setInviteCheckoutError('Nenhum pacote ativo disponível neste convite.');
        return;
      }

      setInviteSubmitting(true);
      setInviteCheckoutError(null);
      setInviteRequiresTokenFallback(false);
      try {
        const pixRes = await createPixCharge({
          modelId: inviteData.model.id,
          kind: 'call_plan',
          planId: plan.id,
          callMode: 'private',
          topic: selection.topic,
          inviteId: inviteData.invite.id,
          preferredPaymentMethod: selection.paymentMethod,
        });
        if (!pixRes.ok || !pixRes.charge) {
          setInviteRequiresTokenFallback(Boolean(pixRes.requiresMercadoPagoToken));
          setInviteCheckoutError(
            pixRes.error ||
              'Não foi possível gerar o pagamento no Mercado Pago.'
          );
          return;
        }
        setPendingInvitePixMeta({
          plan,
          topic: selection.topic,
          inviteId: inviteData.invite.id,
          preferredPaymentMethod: selection.paymentMethod,
        });
        setInvitePixCharge(pixRes.charge);
      } finally {
        setInviteSubmitting(false);
      }
    },
    [
      activePlans,
      createPixCharge,
      dndActiveNow,
      handleVisitorDirectCallModel,
      inviteData,
      modelOnline,
      modelProfile,
      navigateRoute,
      pushToast,
      refreshWorkspace,
      requestVideoCall,
      studioState?.activeCallId,
      studioState?.callMode,
      studioState?.isLive,
    ]
  );

  // Resume WhatsApp Invite checkout automatically right after visitor signs in with Google
  useEffect(() => {
    if (!isAuthenticated || isAdmin || !inviteData || isAdminRoute) return;
    if (selectedPublicModelId !== inviteData.model.id) return;

    let pending: (InviteCheckoutSelection & { inviteId: string }) | null =
      pendingInviteAutoCheckoutRef.current;

    if (!pending && typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(PENDING_INVITE_CHECKOUT_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as InviteCheckoutSelection & {
            inviteId?: string;
          };
          if (parsed && parsed.inviteId === inviteData.invite.id) {
            pending = {
              inviteId: parsed.inviteId,
              planId: parsed.planId,
              paymentMethod: parsed.paymentMethod,
              callMode: parsed.callMode,
              topic: parsed.topic,
            };
          }
        }
      } catch {
        // Ignore storage errors
      }
    }

    if (!pending || pending.inviteId !== inviteData.invite.id) return;

    pendingInviteAutoCheckoutRef.current = null;
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(PENDING_INVITE_CHECKOUT_KEY);
      } catch {
        // Ignore storage errors
      }
    }
    void handleInvitePayAndHire(pending);
  }, [
    handleInvitePayAndHire,
    inviteData,
    isAdmin,
    isAdminRoute,
    isAuthenticated,
    selectedPublicModelId,
  ]);

  if (authLoading) {
    return (
      <div className="min-h-screen luxury-canvas text-[#FAF4F7] flex items-center justify-center">
        <p className="text-sm text-[#C9BAC4]">Carregando estúdio...</p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        data-admin-theme={
          isAdminRoute && isAdmin && !highContrastAdmin
            ? activeAdminThemeId
            : undefined
        }
        className={`relative min-h-screen text-[#FAF4F7] flex flex-col ${
          isAdmin && highContrastAdmin
            ? 'admin-high-contrast'
            : isAdminRoute && isAdmin
              ? 'admin-model-themed luxury-canvas'
              : 'luxury-canvas'
        }`}
      >
        <TechAmbientField />
        <Header
          studioBrand={studioConfig?.studioBrand || 'Model Gat Brasil'}
          isAuthenticated={isAuthenticated}
          isAdmin={isAdmin}
          isAdminRoute={isAdminRoute}
          highContrastAdmin={highContrastAdmin}
          onToggleHighContrastAdmin={toggleHighContrastAdmin}
          activeTab={activeTab}
          onSelectTab={(tab) => {
            if (isAdminRoute) {
              navigateRoute('/', { previewVisitor: isAdmin });
            }
            setActiveTab(tab);
          }}
          onNavigateRoute={(path) =>
            navigateRoute(path, { previewVisitor: isAdmin && path === '/' })
          }
          onLogin={() => {
            if (isAdminRoute) {
              document.getElementById('model-login-input')?.focus();
            } else {
              void loginWithGoogle();
            }
          }}
          onLogout={() => {
            setModelPasswordInput('');
            void logout();
          }}
        />

        {activeInviteId && !isAdminRoute && !activeSession ? (
          inviteLoading ? (
            <main className="relative z-10 flex-1 max-w-[1280px] w-full mx-auto px-6 py-16 flex items-center justify-center">
              <p className="text-sm text-[#C9BAC4]">
                Carregando convite exclusivo...
              </p>
            </main>
          ) : inviteError || !inviteData ? (
            <main className="relative z-10 flex-1 max-w-[1280px] w-full mx-auto px-6 py-16 flex items-center justify-center">
              <section className="max-w-md w-full luxury-card border border-[#F4C2D7]/20 rounded-3xl p-8 text-center space-y-4">
                <h1 className="font-display text-2xl font-semibold text-[#FAF4F7]">
                  Convite indisponível
                </h1>
                <p className="text-sm text-[#C9BAC4]">
                  {inviteError ||
                    'Este link de convite não foi encontrado ou já expirou.'}
                </p>
                <button
                  type="button"
                  onClick={() => navigateRoute('/')}
                  className="px-6 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta cursor-pointer"
                >
                  Ir para Vitrine Principal
                </button>
              </section>
            </main>
          ) : (
            <WhatsappInviteCheckoutView
              inviteData={inviteData}
              isAuthenticated={isAuthenticated}
              isAdmin={isAdmin}
              isBlocked={myProfile?.accessStatus === 'blocked'}
              mercadoPagoConfigured={Boolean(studioConfig?.mercadoPagoConfigured)}
              requiresTokenFallback={inviteRequiresTokenFallback}
              onFallbackToPix={() => {
                const fallbackPlanId =
                  inviteData.invite.planId ||
                  activePlans[0]?.id ||
                  inviteData.callPlans[0]?.id ||
                  '';
                void handleInvitePayAndHire({
                  planId: fallbackPlanId,
                  paymentMethod: 'pix',
                  callMode: 'private',
                  topic: 'Convite WhatsApp · Pagamento via PIX (Sala Privativa 1-para-1)',
                });
              }}
              activePlans={activePlans}
              submitting={inviteSubmitting}
              errorMsg={inviteCheckoutError}
              authError={authError}
              onRequireAuthAndPay={(selection) => {
                const payload = {
                  ...selection,
                  inviteId: inviteData.invite.id,
                };
                pendingInviteAutoCheckoutRef.current = payload;
                try {
                  window.sessionStorage.setItem(
                    PENDING_INVITE_CHECKOUT_KEY,
                    JSON.stringify(payload)
                  );
                } catch {
                  // Ignore storage restrictions
                }
                void loginWithGoogle();
              }}
              onPayAndHire={handleInvitePayAndHire}
              onGoToFullCatalog={() => navigateRoute('/')}
              onBackToAdmin={
                isAdmin ? () => navigateRoute('/admin') : undefined
              }
            />
          )
        ) : isAdminRoute && !isAdmin ? (
          <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-6 py-12 flex items-center justify-center">
            <section className="max-w-lg w-full luxury-card tech-reticle border border-[#F4C2D7]/20 rounded-3xl p-8 space-y-6">
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#F4C2D7] inline-flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Acesso Privativo · Painel Individual da Modelo</span>
                </p>
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#FAF4F7]">
                  Painel Exclusivo da Modelo
                </h1>
                <p className="text-sm text-[#C9BAC4] leading-relaxed">
                  Cada modelo possui seu próprio painel de administração isolado, acessível exclusivamente pelo seu login e senha individuais. Ninguém mais tem acesso ao seu painel.
                </p>
              </div>

              {user && !modelSession && (
                <div className="p-3.5 rounded-xl bg-[#21142D]/85 border border-[#F4C2D7]/30 text-xs text-[#F8D6E3]">
                  Você está conectado(a) como internauta ({user.displayName || 'Google'}). Para abrir seu painel administrativo particular, entre com seu login e senha de modelo abaixo.
                </div>
              )}

              {primaryNeedsClaim && (
                <form
                  onSubmit={(e) => void handlePrimaryClaimSubmit(e)}
                  className="p-5 rounded-2xl bg-[#150D1D] border border-[#38BDF8]/40 space-y-4"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#38BDF8]">
                      Configuração Inicial · Definir Senha do Painel Principal
                    </p>
                    <p className="text-xs text-[#C9BAC4] leading-relaxed">
                      O painel principal de{' '}
                      <strong className="text-[#FAF4F7]">
                        {primaryClaimInfo?.displayName || 'Lorena Noir'}
                      </strong>{' '}
                      (login{' '}
                      <span className="font-mono text-[#F4C2D7]">
                        {primaryClaimInfo?.loginUsername || 'lorena@modelgat.local'}
                      </span>
                      ) ainda não possui senha definida. Crie uma senha exclusiva abaixo para ativar e entrar no painel.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="claim-primary-login"
                      className="block text-xs font-medium text-[#C9BAC4]"
                    >
                      Login de Acesso (opcional alterar)
                    </label>
                    <input
                      id="claim-primary-login"
                      type="text"
                      maxLength={120}
                      autoComplete="username"
                      value={claimLoginInput}
                      onChange={(e) => setClaimLoginInput(e.target.value)}
                      placeholder={
                        primaryClaimInfo?.loginUsername || 'lorena@modelgat.local'
                      }
                      className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl px-4 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#38BDF8]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="claim-primary-pass"
                        className="block text-xs font-medium text-[#C9BAC4]"
                      >
                        Nova Senha Inicial (mín. 6)
                      </label>
                      <div className="relative">
                        <input
                          id="claim-primary-pass"
                          type={showClaimPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          maxLength={80}
                          autoComplete="new-password"
                          value={claimPasswordInput}
                          onChange={(e) => setClaimPasswordInput(e.target.value)}
                          placeholder="Crie sua senha"
                          className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl pl-4 pr-10 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#38BDF8]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClaimPassword((p) => !p)}
                          aria-label={
                            showClaimPassword ? 'Ocultar senha' : 'Mostrar senha'
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                        >
                          {showClaimPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="claim-primary-confirm"
                        className="block text-xs font-medium text-[#C9BAC4]"
                      >
                        Confirmar Senha
                      </label>
                      <input
                        id="claim-primary-confirm"
                        type={showClaimPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        maxLength={80}
                        autoComplete="new-password"
                        value={claimConfirmPassword}
                        onChange={(e) => setClaimConfirmPassword(e.target.value)}
                        placeholder="Repita sua senha"
                        className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl px-4 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#38BDF8]"
                      />
                    </div>
                  </div>

                  {(claimLocalError || modelAuthError) && (
                    <div
                      role="alert"
                      className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200"
                    >
                      {claimLocalError || modelAuthError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      modelAuthSubmitting ||
                      claimPasswordInput.length < 6 ||
                      !claimConfirmPassword
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      {modelAuthSubmitting
                        ? 'Salvando senha inicial...'
                        : 'Definir Senha e Entrar no Painel'}
                    </span>
                  </button>
                </form>
              )}

              {/* Mode Switch: Login vs Create Private Panel */}
              <div
                role="tablist"
                aria-label="Tipo de acesso ao painel da modelo"
                className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/20"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminAuthMode === 'login'}
                  onClick={() => {
                    setAdminAuthMode('login');
                    setRegLocalError(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    adminAuthMode === 'login'
                      ? 'bg-[#21142D] text-[#FAF4F7] border border-[#F4C2D7]/35'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Entrar no Meu Painel</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={adminAuthMode === 'register'}
                  onClick={() => {
                    setAdminAuthMode('register');
                    setRegLocalError(null);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
                    adminAuthMode === 'register'
                      ? 'bg-[#21142D] text-[#FAF4F7] border border-[#F4C2D7]/35'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Criar Meu Painel</span>
                </button>
              </div>

              {adminAuthMode === 'login' ? (
                <form
                  onSubmit={(e) => void handleModelLoginSubmit(e)}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label
                      htmlFor="model-login-input"
                      className="block text-xs font-medium text-[#C9BAC4]"
                    >
                      Seu Login ou E-mail da Modelo
                    </label>
                    <input
                      id="model-login-input"
                      type="text"
                      required
                      autoComplete="username"
                      value={modelLoginInput}
                      onChange={(e) => setModelLoginInput(e.target.value)}
                      placeholder="Ex.: camila ou camila@modelgat.local"
                      className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="model-password-input"
                      className="block text-xs font-medium text-[#C9BAC4]"
                    >
                      Sua Senha Exclusiva
                    </label>
                    <div className="relative">
                      <input
                        id="model-password-input"
                        type={showModelPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        value={modelPasswordInput}
                        onChange={(e) => setModelPasswordInput(e.target.value)}
                        placeholder="Digite sua senha privativa"
                        className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl pl-4 pr-11 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowModelPassword((p) => !p)}
                        aria-label={
                          showModelPassword ? 'Ocultar senha' : 'Mostrar senha'
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                      >
                        {showModelPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {modelAuthError && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200"
                    >
                      {modelAuthError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={
                      modelAuthSubmitting ||
                      !modelLoginInput.trim() ||
                      !modelPasswordInput
                    }
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 shrink-0" />
                    <span>
                      {modelAuthSubmitting
                        ? 'Entrando no painel...'
                        : 'Entrar no Meu Painel Privativo'}
                    </span>
                  </button>
                </form>
              ) : (
                <form
                  onSubmit={(e) => void handleModelRegisterSubmit(e)}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label
                      htmlFor="reg-model-name"
                      className="block text-xs font-medium text-[#C9BAC4]"
                    >
                      Seu Nome Artístico na Vitrine
                    </label>
                    <input
                      id="reg-model-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      placeholder="Ex.: Valentina Lux"
                      className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="reg-model-login"
                      className="block text-xs font-medium text-[#C9BAC4]"
                    >
                      Seu Login Privativo (único)
                    </label>
                    <input
                      id="reg-model-login"
                      type="text"
                      required
                      minLength={3}
                      maxLength={120}
                      autoComplete="username"
                      value={regLoginInput}
                      onChange={(e) => setRegLoginInput(e.target.value)}
                      placeholder="Ex.: valentina ou valentina@modelgat.local"
                      className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="reg-model-pass"
                        className="block text-xs font-medium text-[#C9BAC4]"
                      >
                        Senha Privativa (mín. 6)
                      </label>
                      <div className="relative">
                        <input
                          id="reg-model-pass"
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          maxLength={120}
                          autoComplete="new-password"
                          value={regPasswordInput}
                          onChange={(e) => setRegPasswordInput(e.target.value)}
                          placeholder="Crie sua senha"
                          className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl pl-4 pr-10 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((p) => !p)}
                          aria-label={
                            showRegPassword ? 'Ocultar senha' : 'Mostrar senha'
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                        >
                          {showRegPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="reg-model-confirm"
                        className="block text-xs font-medium text-[#C9BAC4]"
                      >
                        Confirmar Senha
                      </label>
                      <input
                        id="reg-model-confirm"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        maxLength={120}
                        autoComplete="new-password"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="Repita sua senha"
                        className="w-full bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-[#C9BAC4]">
                      Cor do Seu Painel Administrativo
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {ADMIN_MODEL_THEMES.map((theme) => {
                        const selected = regThemeColor === theme.id;
                        return (
                          <button
                            key={theme.id}
                            type="button"
                            title={theme.label}
                            aria-label={`Escolher cor ${theme.label}`}
                            aria-pressed={selected}
                            onClick={() => setRegThemeColor(theme.id)}
                            className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                              selected
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0B060F] scale-110'
                                : 'opacity-80 hover:opacity-100 border border-white/25'
                            }`}
                            style={{ backgroundColor: theme.swatchHex }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {(regLocalError || modelAuthError) && (
                    <div
                      role="alert"
                      className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200"
                    >
                      {regLocalError || modelAuthError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={modelAuthSubmitting}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4 shrink-0" />
                    <span>
                      {modelAuthSubmitting
                        ? 'Criando painel exclusivo...'
                        : 'Criar e Entrar no Meu Painel Privativo'}
                    </span>
                  </button>
                </form>
              )}

              <div className="pt-4 border-t border-[#F4C2D7]/15 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => navigateRoute('/')}
                  className="px-5 py-2.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors cursor-pointer"
                >
                  Ir para área dos internautas
                </button>
                {user && (
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="px-4 py-2 text-xs text-[#938291] hover:text-[#FAF4F7] cursor-pointer"
                  >
                    Sair da conta Google
                  </button>
                )}
              </div>
            </section>
          </main>
        ) : !isAuthenticated ? (
          <LoginView
            studioConfig={studioConfig}
            studioState={studioState}
            galleryItems={galleryItems}
            callPlans={callPlans}
            publicModels={publicModels}
            publicRatings={publicRatings}
            publicShowcaseLoading={publicShowcaseLoading}
            selectedModelId={selectedPublicModelId}
            onSelectModel={setSelectedPublicModelId}
            privateAlbumSummary={privateAlbumSummary}
            onUnlockPrivateAlbum={unlockPrivateAlbum}
            onRequirePrivateAlbumAuth={() => {
              void loginWithGoogle();
            }}
            onEnterVideoCall={() => {
              pendingPublicJoinRef.current = true;
              void loginWithGoogle();
            }}
            onEnterPrivateCall={() => {
              pendingPublicJoinRef.current = true;
              void loginWithGoogle();
            }}
            onNavigateToAdmin={() => navigateRoute('/admin')}
            authError={authError}
          />
        ) : isAdminRoute ? (
          <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-6">
            <ModelAdminPage
              myUid={effectiveActorUid}
              myProfile={myProfile}
              modelProfile={modelProfile}
              allProfiles={allProfiles}
              peers={peers}
              studioState={studioState}
              studioConfig={studioConfig}
              galleryItems={galleryItems}
              privateAlbumSummary={privateAlbumSummary}
              privateAlbumItems={privateAlbumItems}
              callQueue={callQueue}
              callMessages={callMessages}
              callHistory={callHistory}
              interestMessages={interestMessages}
              callPlans={callPlans}
              ratePerMinuteCents={ratePerMinuteCents}
              onChangeRatePerMinuteCents={setRatePerMinuteCents}
              soundEnabled={soundEnabled}
              onToggleSoundEnabled={toggleSoundEnabled}
              onTestSoundDing={() => {
                unlockAudioContext();
                playNotificationDing('test', true);
              }}
              wsConnected={wsConnected}
              activeCallId={activeSession?.callId || null}
              activePartnerUid={activeSession?.partnerUid || null}
              activePartnerName={activeSession?.partnerName || ''}
              activePlan={activeStagePlan}
              incomingRing={incomingRing}
              localStream={localStream}
              remoteStream={remoteStream}
              micEnabled={micEnabled}
              camEnabled={camEnabled}
              mediaError={mediaError}
              connectionState={connectionState}
              elapsedSeconds={elapsedSeconds}
              onAcquireMedia={acquireLocalMedia}
              onToggleMic={() => toggleMic()}
              onToggleCam={toggleCam}
              onEndCall={handleEndCall}
              onSendMessage={handleSendMessage}
              onAcceptIncomingRing={handleAcceptIncomingRing}
              onRejectIncomingRing={handleRejectIncomingRing}
              onAcceptQueueAndCall={handleAcceptQueueAndCall}
              onUpdateCallStatus={updateCallStatus}
              onDeleteCallRequest={deleteCallRequest}
              onDirectCallUser={handleDirectCallUser}
              onSavePlan={saveCallPlan}
              onDeletePlan={deleteCallPlan}
              onUpdateStudioState={updateStudioState}
              onUploadImage={uploadStudioImage}
              onUploadMedia={uploadStudioMedia}
              onSaveStudioConfig={saveStudioConfig}
              onSaveGalleryItem={saveGalleryItem}
              onDeleteGalleryItem={deleteGalleryItem}
              onRestoreDefaultGallery={restoreDefaultGallery}
              onToggleMediaVisibility={toggleMediaVisibility}
              onSavePrivateAlbumSettings={savePrivateAlbumSettings}
              onSavePrivateAlbumItem={savePrivateAlbumItem}
              onDeletePrivateAlbumItem={deletePrivateAlbumItem}
              onUpdateUserControl={updateUserControl}
              onDeleteUserProfile={deleteUserProfile}
              onSendModeration={sendModerationCommand}
              onRecordCallHistory={recordCallHistory}
              onUpdateCallHistoryStatus={updateCallHistoryStatus}
              onUpdateCallHistoryRecord={updateCallHistoryRecord}
              onDeleteCallHistoryRecord={deleteCallHistoryRecord}
              onUpdateInterestMessageStatus={updateInterestMessageStatus}
              onDeleteInterestMessage={deleteInterestMessage}
              activeModelId={activeModelId}
              activeAdminThemeId={activeAdminThemeId}
              modelAccount={modelAccount}
              onUpdateMyModelAccount={updateMyModelAccount}
              pixCharges={pixCharges}
              onConfirmModelPixCharge={confirmModelPixCharge}
              onCancelModelPixCharge={cancelModelPixCharge}
              whatsappInvites={whatsappInvites}
              onCreateWhatsappInvite={createWhatsappInvite}
              onDeleteWhatsappInvite={deleteWhatsappInvite}
            />
          </main>
        ) : (
          <main className="relative z-10 flex-1 max-w-[1440px] w-full mx-auto px-6 py-8 space-y-6">
            {/* Pure Internauta Reception Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#F4C2D7]/15">
              <div className="space-y-1">
                <h1 className="font-display text-3xl sm:text-4xl font-semibold text-[#FAF4F7]">
                  Recepção do Estúdio · {activeModelDisplayName}
                </h1>
                <p className="text-xs text-[#C9BAC4]">
                  {myProfile?.displayName ||
                    user?.displayName ||
                    modelSession?.model.displayName ||
                    'Participante'}{' '}
                  · Visitante Autenticado ·{' '}
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
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/35 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Voltar ao Meu Painel Privativo</span>
                  </button>
                )}
                {!isModelUnavailable &&
                  (activeSession ||
                    callQueue.some(
                      (q) =>
                        q.status === 'waiting' ||
                        q.status === 'accepted' ||
                        q.status === 'in_call'
                    )) && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('call')}
                      className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>
                        {activeSession
                          ? 'Voltar para Sala Privativa'
                          : 'Abrir Sala de Espera Privativa'}
                      </span>
                    </button>
                  )}
              </div>
            </div>

            {/* Active Model Switcher on Authenticated Visitor Reception */}
            {!isAdmin && publicModels.length > 1 && !activeSession && (
              <section
                aria-label="Escolher modelo do estúdio"
                className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-[#F4C2D7]">
                    Selecionar Modelo para Atendimento
                  </span>
                  <span className="font-mono tabular-nums text-[#C9BAC4]">
                    {publicModels.length} disponíveis
                  </span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {publicModels.map((model) => {
                    const selected = model.id === selectedPublicModelId;
                    const rateCents = model.ratePerMinuteCents || 1500;
                    const minPriceCents =
                      model.minPlanPriceCents || rateCents * 10 || 8900;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => {
                          setSelectedPublicModelId(model.id);
                          setEndedCallForRating(null);
                          setNoticeBanner(null);
                        }}
                        aria-pressed={selected}
                        className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#21142D] border-[#F4C2D7] text-[#FAF4F7]'
                            : 'bg-[#0B060F]/80 border-[#F4C2D7]/15 text-[#C9BAC4] hover:border-[#F4C2D7]/45 hover:text-[#FAF4F7]'
                        }`}
                      >
                        {model.avatarUrl ? (
                          <img
                            src={model.avatarUrl}
                            alt={model.displayName}
                            referrerPolicy="no-referrer"
                            draggable={false}
                            className="w-6 h-6 rounded-full object-cover border border-[#F4C2D7]/30 shrink-0"
                          />
                        ) : null}
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            model.modelOnline
                              ? 'bg-[#86EFAC]'
                              : model.isLive
                                ? 'bg-[#F4C2D7]'
                                : 'bg-[#938291]'
                          }`}
                        />
                        <span className="text-xs font-semibold">
                          {model.displayName}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#F4C2D7]/90">
                          · a partir de{' '}
                          {BRL_FORMATTER.format(minPriceCents / 100)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

          {/* Incoming Real-Time Call Alert */}
          {incomingRing && (
            <div
              role="alert"
              className="p-4 sm:px-6 rounded-2xl luxury-card border border-[#F4C2D7]/45 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_0_32px_rgba(244,194,215,0.16)]"
            >
              <div className="flex items-start sm:items-center gap-3">
                <PhoneCall className="w-5 h-5 text-[#F4C2D7] shrink-0 mt-0.5 sm:mt-0" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#FAF4F7]">
                    Chamada de vídeo recebida de {incomingRing.fromName}
                  </p>
                  <p className="text-xs text-[#C9BAC4]">
                    {incomingRing.planName && incomingRing.planPriceCents !== undefined
                      ? `Plano selecionado: ${incomingRing.planName} · ${BRL_FORMATTER.format(incomingRing.planPriceCents / 100)} (${incomingRing.planDurationMinutes || 0} min)`
                      : 'Selecione um plano pré-definido e autorize a cobrança para iniciar o vídeo.'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {!callQueue.some((q) => q.id === incomingRing.callId) &&
                  activePlans.length > 0 && (
                    <select
                      aria-label="Plano da videochamada"
                      value={selectedRingPlan?.id || ''}
                      onChange={(e) => setIncomingRingPlanId(e.target.value)}
                      className="px-3.5 py-2 text-xs rounded-full bg-[#0B060F] border border-[#F4C2D7]/25 text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
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
                  className="px-5 py-2 text-xs font-semibold rounded-full bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {!callQueue.some((q) => q.id === incomingRing.callId) &&
                  selectedRingPlan
                    ? `Autorizar ${BRL_FORMATTER.format(selectedRingPlan.priceCents / 100)} e Aceitar`
                    : 'Aceitar Vídeo'}
                </button>
                <button
                  type="button"
                  onClick={handleRejectIncomingRing}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <PhoneOff className="w-3.5 h-3.5" />
                  <span>Recusar</span>
                </button>
              </div>
            </div>
          )}

          {/* Automatic Pre-Pause Warning Banner for Visitors (e.g., 5 min before scheduled block) */}
          {!isAdmin && !isModelUnavailable && upcomingBlockWarning && (
            <div
              role="alert"
              aria-live="polite"
              className="px-5 py-4 rounded-2xl luxury-card border border-[#FCD34D]/50 bg-gradient-to-r from-[#2D1B2E]/95 via-[#21142D]/95 to-[#150D1D] shadow-[0_0_28px_-12px_rgba(252,211,77,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                <BellRing className="w-5 h-5 text-[#FCD34D] shrink-0 mt-0.5 sm:mt-0" />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-[#FDE68A]">
                    Aviso de Pausa · {upcomingBlockWarning.label}
                  </p>
                  <p className="text-xs sm:text-sm text-[#FAF4F7] break-words">
                    {upcomingBlockWarning.customMessage ||
                      `${activeModelDisplayName} entrará em bloqueio/pausa agendada às ${upcomingBlockWarning.startTime}${
                        upcomingBlockWarning.endTime
                          ? ` (retorno previsto às ${upcomingBlockWarning.endTime})`
                          : ''
                      }.`}
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right shrink-0 sm:pl-4 sm:border-l border-[#FCD34D]/20">
                <p className="text-[10px] text-[#C9BAC4]">Pausa inicia em</p>
                <p className="font-mono text-xl font-semibold tabular-nums text-[#FDE68A]">
                  {formatMinutesSecondsClock(upcomingBlockWarning.remainingMs)}
                </p>
              </div>
            </div>
          )}

          {/* Real-time Moderation or Call Status Banner */}
          {noticeBanner && (
            <div className="px-5 py-3 rounded-2xl luxury-card border border-[#F4C2D7]/25 flex items-center justify-between gap-4 text-xs text-[#F4C2D7]">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{noticeBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setNoticeBanner(null)}
                className="text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
              >
                Dispensar
              </button>
            </div>
          )}

          {/* Post-Session Quality Rating Prompt */}
          {!activeSession && endedCallForRating && (
            <RatingSystem
              callHistory={callHistory}
              endedSession={endedCallForRating}
              modelName={activeModelDisplayName}
              onSubmitRating={handleSubmitCallRating}
              onDismissEndedSession={() => setEndedCallForRating(null)}
            />
          )}

          {/* Active Visitor Workspace Content */}
          {isModelUnavailable ? (
            <ModelOfflineView
              isAdmin={false}
              myProfile={myProfile}
              modelProfile={modelProfile}
              modelAvatarUrl={studioConfig?.modelAvatarUrl || modelProfile?.photoUrl}
              loungeImageUrl={studioConfig?.loungeImageUrl}
              studioState={studioState}
              modelOnline={modelOnline}
              myInterestMessages={interestMessages}
              onSendInterestMessage={handleSendInterestMessage}
            />
          ) : (
            <>
              {activeTab === 'call' &&
                (activeSession ||
                callQueue.some((q) => q.status === 'in_call') ? (
                  <VideoCallStage
                    isAdmin={false}
                    modelId={activeModelId}
                    mercadoPagoConfigured={Boolean(
                      studioConfig?.mercadoPagoConfigured
                    )}
                    myProfile={myProfile}
                    modelProfile={modelProfile}
                    studioState={studioState}
                    activeCallId={activeSession?.callId || null}
                    activePartnerName={activeSession?.partnerName || ''}
                    activePartnerUid={activeSession?.partnerUid || null}
                    activePlan={activeStagePlan}
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
                    onSendTip={sendTipContribution}
                    onCreatePixCharge={createPixCharge}
                    onCheckPixCharge={checkPixChargeStatus}
                    onConfirmPixCharge={confirmPixCharge}
                    onCancelPixCharge={cancelPixCharge}
                  />
                ) : myProfile?.accessStatus !== 'blocked' &&
                  callQueue.some(
                    (q) => q.status === 'waiting' || q.status === 'accepted'
                  ) ? (
                  <SalaDeEspera
                    request={
                      callQueue.find(
                        (q) => q.status === 'waiting' || q.status === 'accepted'
                      )!
                    }
                    modelName={activeModelDisplayName}
                    modelAvatarUrl={
                      studioConfig?.modelAvatarUrl || modelProfile?.photoUrl
                    }
                    loungeImageUrl={studioConfig?.loungeImageUrl}
                    modelOnline={modelOnline}
                    isVip={myProfile?.accessStatus === 'vip'}
                    studioState={studioState}
                    queueSummary={queueSummary}
                    wsConnected={wsConnected}
                    localStream={localStream}
                    micEnabled={micEnabled}
                    camEnabled={camEnabled}
                    mediaError={mediaError}
                    onAcquireMedia={acquireLocalMedia}
                    onToggleMic={() => toggleMic()}
                    onToggleCam={toggleCam}
                    onEnterAcceptedCall={(req) =>
                      void handleEnterAcceptedCall(req)
                    }
                    onCancelRequest={(requestId) =>
                      updateCallStatus(requestId, 'cancelled')
                    }
                  />
                ) : (
                  <div className="space-y-6">
                    <div className="px-5 py-3.5 rounded-2xl luxury-card border border-[#F4C2D7]/35 text-xs text-[#F8D6E3]">
                      Acesso exclusivo mediante pagamento: selecione um plano abaixo e conclua via PIX QR Code para liberar sua sala privativa 1-para-1 com {activeModelDisplayName}.
                    </div>
                    <CallQueuePanel
                      isAdmin={false}
                      modelId={activeModelId}
                      myProfile={myProfile}
                      modelProfile={modelProfile}
                      studioState={studioState}
                      studioConfig={studioConfig}
                      galleryItems={galleryItems}
                      callQueue={callQueue}
                      callPlans={callPlans}
                      peers={peers}
                      queueSummary={queueSummary}
                      wsConnected={wsConnected}
                      localStream={localStream}
                      micEnabled={micEnabled}
                      camEnabled={camEnabled}
                      mediaError={mediaError}
                      onAcquireMedia={acquireLocalMedia}
                      onToggleMic={() => toggleMic()}
                      onToggleCam={toggleCam}
                      onRequestCall={requestVideoCall}
                      onDirectCallModel={handleVisitorDirectCallModel}
                      onRefreshWorkspace={refreshWorkspace}
                      onAcceptAndCall={handleAcceptQueueAndCall}
                      onUpdateCallStatus={updateCallStatus}
                      onDeleteCallRequest={deleteCallRequest}
                      onEnterAcceptedCall={(req) =>
                        void handleEnterAcceptedCall(req)
                      }
                      onSendTip={sendTipContribution}
                      onCreatePixCharge={createPixCharge}
                      onCheckPixCharge={checkPixChargeStatus}
                      onConfirmPixCharge={confirmPixCharge}
                      onCancelPixCharge={cancelPixCharge}
                    />
                  </div>
                ))}

              {activeTab === 'queue' && (
                <div className="space-y-8">
                  <CallQueuePanel
                    isAdmin={false}
                    modelId={activeModelId}
                    myProfile={myProfile}
                    modelProfile={modelProfile}
                    studioState={studioState}
                    studioConfig={studioConfig}
                    galleryItems={galleryItems}
                    callQueue={callQueue}
                    callPlans={callPlans}
                    peers={peers}
                    queueSummary={queueSummary}
                    wsConnected={wsConnected}
                    localStream={localStream}
                    micEnabled={micEnabled}
                    camEnabled={camEnabled}
                    mediaError={mediaError}
                    onAcquireMedia={acquireLocalMedia}
                    onToggleMic={() => toggleMic()}
                    onToggleCam={toggleCam}
                    onRequestCall={requestVideoCall}
                    onDirectCallModel={handleVisitorDirectCallModel}
                    onRefreshWorkspace={refreshWorkspace}
                    onAcceptAndCall={handleAcceptQueueAndCall}
                    onUpdateCallStatus={updateCallStatus}
                    onDeleteCallRequest={deleteCallRequest}
                    onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
                    onSendTip={sendTipContribution}
                    onCreatePixCharge={createPixCharge}
                    onCheckPixCharge={checkPixChargeStatus}
                    onConfirmPixCharge={confirmPixCharge}
                    onCancelPixCharge={cancelPixCharge}
                  />
                  <ModelProfileBioSection
                    modelName={activeModelDisplayName}
                    studioBrand={studioConfig?.studioBrand || 'Model Gat Brasil'}
                    modelBio={studioConfig?.modelBio}
                    basicInfo={studioConfig?.basicInfo}
                    avatarUrl={
                      studioConfig?.modelAvatarUrl || modelProfile?.photoUrl
                    }
                  />
                  <PrivateAlbumViewer
                    modelId={activeModelId}
                    modelName={activeModelDisplayName}
                    summary={privateAlbumSummary}
                    isAuthenticated={Boolean(user)}
                    mercadoPagoConfigured={Boolean(
                      studioConfig?.mercadoPagoConfigured
                    )}
                    authError={authError}
                    initialUnlockedItems={visitorUnlockedPrivateItems}
                    onPurchaseAlbum={purchasePrivateAlbum}
                    onCreatePixCharge={createPixCharge}
                    onCheckPixCharge={checkPixChargeStatus}
                    onConfirmPixCharge={confirmPixCharge}
                    onCancelPixCharge={cancelPixCharge}
                    onRequireAuth={() => {
                      void loginWithGoogle();
                    }}
                    onUnlock={unlockPrivateAlbum}
                  />
                  <RatingSystem
                    callHistory={callHistory}
                    endedSession={null}
                    modelName={activeModelDisplayName}
                    showHistoryList={true}
                    onSubmitRating={handleSubmitCallRating}
                  />
                </div>
              )}

              {activeTab === 'studio' && (
                <div className="space-y-8">
                  <CallQueuePanel
                    isAdmin={false}
                    modelId={activeModelId}
                    myProfile={myProfile}
                    modelProfile={modelProfile}
                    studioState={studioState}
                    studioConfig={studioConfig}
                    galleryItems={galleryItems}
                    callQueue={callQueue}
                    callPlans={callPlans}
                    peers={peers}
                    queueSummary={queueSummary}
                    wsConnected={wsConnected}
                    localStream={localStream}
                    micEnabled={micEnabled}
                    camEnabled={camEnabled}
                    mediaError={mediaError}
                    onAcquireMedia={acquireLocalMedia}
                    onToggleMic={() => toggleMic()}
                    onToggleCam={toggleCam}
                    onRequestCall={requestVideoCall}
                    onDirectCallModel={handleVisitorDirectCallModel}
                    onRefreshWorkspace={refreshWorkspace}
                    onAcceptAndCall={handleAcceptQueueAndCall}
                    onUpdateCallStatus={updateCallStatus}
                    onDeleteCallRequest={deleteCallRequest}
                    onEnterAcceptedCall={(req) => void handleEnterAcceptedCall(req)}
                    onSendTip={sendTipContribution}
                    onCreatePixCharge={createPixCharge}
                    onCheckPixCharge={checkPixChargeStatus}
                    onConfirmPixCharge={confirmPixCharge}
                    onCancelPixCharge={cancelPixCharge}
                  />
                  <ModelProfileBioSection
                    modelName={activeModelDisplayName}
                    studioBrand={studioConfig?.studioBrand || 'Model Gat Brasil'}
                    modelBio={studioConfig?.modelBio}
                    basicInfo={studioConfig?.basicInfo}
                    avatarUrl={
                      studioConfig?.modelAvatarUrl || modelProfile?.photoUrl
                    }
                  />
                  <PrivateAlbumViewer
                    modelId={activeModelId}
                    modelName={activeModelDisplayName}
                    summary={privateAlbumSummary}
                    isAuthenticated={Boolean(user)}
                    mercadoPagoConfigured={Boolean(
                      studioConfig?.mercadoPagoConfigured
                    )}
                    authError={authError}
                    initialUnlockedItems={visitorUnlockedPrivateItems}
                    onPurchaseAlbum={purchasePrivateAlbum}
                    onCreatePixCharge={createPixCharge}
                    onCheckPixCharge={checkPixChargeStatus}
                    onConfirmPixCharge={confirmPixCharge}
                    onCancelPixCharge={cancelPixCharge}
                    onRequireAuth={() => {
                      void loginWithGoogle();
                    }}
                    onUnlock={unlockPrivateAlbum}
                  />
                  <RatingSystem
                    callHistory={callHistory}
                    endedSession={null}
                    modelName={activeModelDisplayName}
                    showHistoryList={true}
                    onSubmitRating={handleSubmitCallRating}
                  />
                </div>
              )}
            </>
          )}
          {isModelUnavailable && (
            <div className="space-y-8 pt-2">
              <ModelProfileBioSection
                modelName={activeModelDisplayName}
                studioBrand={studioConfig?.studioBrand || 'Model Gat Brasil'}
                modelBio={studioConfig?.modelBio}
                basicInfo={studioConfig?.basicInfo}
                avatarUrl={
                  studioConfig?.modelAvatarUrl || modelProfile?.photoUrl
                }
              />
              <PrivateAlbumViewer
                modelId={activeModelId}
                modelName={activeModelDisplayName}
                summary={privateAlbumSummary}
                isAuthenticated={Boolean(user)}
                mercadoPagoConfigured={Boolean(
                  studioConfig?.mercadoPagoConfigured
                )}
                authError={authError}
                initialUnlockedItems={visitorUnlockedPrivateItems}
                onPurchaseAlbum={purchasePrivateAlbum}
                onCreatePixCharge={createPixCharge}
                onCheckPixCharge={checkPixChargeStatus}
                onConfirmPixCharge={confirmPixCharge}
                onCancelPixCharge={cancelPixCharge}
                onRequireAuth={() => {
                  void loginWithGoogle();
                }}
                onUnlock={unlockPrivateAlbum}
              />
            </div>
          )}
        </main>
      )}

      {invitePixCharge && pendingInvitePixMeta && (
        <PixPaymentModal
          charge={invitePixCharge}
          title={
            invitePixCharge.preferredPaymentMethod &&
            invitePixCharge.preferredPaymentMethod !== 'pix'
              ? `Checkout Mercado Pago · ${pendingInvitePixMeta.plan.name}`
              : `Pagamento PIX · ${pendingInvitePixMeta.plan.name}`
          }
          subtitle={`Chamada Privativa 1-para-1 · Convite com ${
            inviteData?.model.displayName || activeModelDisplayName
          }`}
          confirmLabel={
            invitePixCharge.preferredPaymentMethod &&
            invitePixCharge.preferredPaymentMethod !== 'pix'
              ? 'Já Paguei no Mercado Pago · Liberar Sala Privativa'
              : 'Já Paguei via PIX · Liberar Sala Privativa'
          }
          onClose={() => {
            setInvitePixCharge(null);
            setPendingInvitePixMeta(null);
          }}
          onCancelCharge={cancelPixCharge}
          onCheckStatus={checkPixChargeStatus}
          onConfirmPayment={confirmPixCharge}
          onRegenerate={async () => {
            if (!inviteData) return;
            const res = await createPixCharge({
              modelId: inviteData.model.id,
              kind: 'call_plan',
              planId: pendingInvitePixMeta.plan.id,
              callMode: 'private',
              topic: pendingInvitePixMeta.topic,
              inviteId: pendingInvitePixMeta.inviteId,
              preferredPaymentMethod:
                pendingInvitePixMeta.preferredPaymentMethod,
            });
            if (res.ok && res.charge) {
              setInvitePixCharge(res.charge);
            }
          }}
          onPaid={async (res) => {
            const meta = pendingInvitePixMeta;
            const modelDisplay =
              inviteData?.model.displayName || activeModelDisplayName;
            setInvitePixCharge(null);
            setPendingInvitePixMeta(null);

            const canDirectCallNow =
              Boolean(modelProfile) &&
              modelOnline &&
              !dndActiveNow &&
              !studioState?.activeCallId &&
              (studioState?.isLive ?? true) &&
              (studioState?.callMode ?? 'open') === 'open';

            navigateRoute('/');

            if (canDirectCallNow) {
              await handleVisitorDirectCallModel(
                meta.topic,
                meta.plan,
                res.callRequestId
              );
            } else {
              setActiveTab('call');
              await refreshWorkspace();
            }

            pushToast(
              'call_accepted',
              'Pagamento confirmado!',
              `Sala privativa 1-para-1 com ${modelDisplay} liberada.`
            );
          }}
        />
      )}

      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
      </div>
    </MotionConfig>
  );
}
