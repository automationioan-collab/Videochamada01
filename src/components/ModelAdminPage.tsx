import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BellOff,
  BellRing,
  CalendarClock,
  CalendarRange,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Crown,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  KeyRound,
  Lock,
  MessageCircle,
  Mic,
  MicOff,
  MoonStar,
  PhoneCall,
  PhoneIncoming,
  PhoneOff,
  QrCode,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AccessStatus,
  CallEntryIntent,
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
  MediaAssetType,
  MediaVisibility,
  ModelAccountSummary,
  PixChargeRecord,
  PixChargeStatus,
  PresencePeer,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
  PublicApprovalStatus,
  StudioConfig,
  StudioProfile,
  StudioRole,
  StudioState,
  StudioStateUpdatePatch,
  WhatsappInviteRecord,
} from '../types/studio';
import type { ModerationEffect } from '../hooks/useWebSocketStudio';
import {
  ADMIN_MODEL_THEMES,
  getAdminModelTheme,
} from '../lib/modelThemes';
import {
  getActiveDailyPause,
  getScheduleFromState,
  isDndActiveNow,
  isWeekdayBlockedNow,
} from '../lib/schedule';
import { AdminSiteEditor } from './AdminSiteEditor';
import { AgendaManagementPanel } from './AgendaManagementPanel';
import { CallPlansManager } from './CallPlansManager';
import { DoNotDisturbPanel } from './DoNotDisturbPanel';
import { FinancialEarningsDashboard } from './FinancialEarningsDashboard';
import { InterestMessagesPanel } from './InterestMessagesPanel';
import { MediaManagementPanel } from './MediaManagementPanel';
import { OperatingSchedulePanel } from './OperatingSchedulePanel';
import { PixDynamicBillingPanel } from './PixDynamicBillingPanel';
import { PixSalesAnalyticsPanel } from './PixSalesAnalyticsPanel';
import { TechVideoCallButton } from './TechEffects';
import { TipGoalManagerCard } from './TipGoalManagerCard';
import { UserControlPanel } from './UserControlPanel';
import { VideoCallStage } from './VideoCallStage';
import { WhatsappInvitePanel } from './WhatsappInvitePanel';

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
  studioState: StudioState | null;
  studioConfig: StudioConfig | null;
  galleryItems: GalleryItemRecord[];
  privateAlbumSummary?: PrivateAlbumSummary | null;
  privateAlbumItems?: PrivateAlbumItemRecord[];
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
  micEnabled: boolean;
  camEnabled: boolean;
  mediaError: string | null;
  connectionState: RTCPeerConnectionState;
  elapsedSeconds: number;
  onAcquireMedia: () => Promise<MediaStream | null>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEndCall: () => Promise<void>;
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
  onUploadImage?: (
    file: File,
    targetModelId?: string
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onUploadMedia?: (
    file: File,
    targetModelId?: string,
    allowVideo?: boolean
  ) => Promise<{
    ok: boolean;
    url?: string;
    mediaType?: MediaAssetType;
    error?: string;
  }>;
  onSaveStudioConfig: (
    patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>> & {
      recalculatePlans?: boolean;
    }
  ) => Promise<{ ok: boolean; error?: string } | void>;
  onSaveGalleryItem: (input: {
    id?: string;
    title: string;
    caption: string;
    category: GalleryCategoryType;
    mediaType?: MediaAssetType;
    specs: string;
    src: string;
    alt: string;
    sortOrder: number;
    active: boolean;
  }) => Promise<
    { ok: boolean; approvalStatus?: PublicApprovalStatus; error?: string } | void
  >;
  onDeleteGalleryItem: (itemId: string) => Promise<void>;
  onRestoreDefaultGallery: () => Promise<void>;
  onSavePrivateAlbumSettings?: (input: {
    enabled?: boolean;
    password?: string;
    hint?: string;
    priceCents?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  onSavePrivateAlbumItem?: (input: {
    id?: string;
    title: string;
    caption: string;
    mediaType: MediaAssetType;
    src: string;
    thumbnailUrl?: string;
    sortOrder: number;
    active: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDeletePrivateAlbumItem?: (itemId: string) => Promise<void>;
  onToggleMediaVisibility?: (input: {
    itemId: string;
    fromVisibility: MediaVisibility;
    toVisibility: MediaVisibility;
    category?: GalleryCategoryType;
  }) => Promise<{
    ok: boolean;
    visibility?: MediaVisibility;
    approvalStatus?: PublicApprovalStatus;
    error?: string;
  }>;
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
  activeModelId?: string;
  activeAdminThemeId?: string;
  modelAccount?: ModelAccountSummary | null;
  onUpdateMyModelAccount?: (patch: {
    loginUsername?: string;
    currentPassword?: string;
    newPassword?: string;
    adminThemeColor?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  pixCharges?: PixChargeRecord[];
  onConfirmModelPixCharge?: (
    chargeId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onCancelModelPixCharge?: (
    chargeId: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onCreateModelPixCharge?: (input: {
    amountCents: number;
    description: string;
    recipientName?: string;
    dueDate?: string;
    finePercent?: number;
    interestMonthlyPercent?: number;
    expiresAfterDueDays?: number;
  }) => Promise<{ ok: boolean; charge?: PixChargeRecord; error?: string }>;
  onRecalculateModelPixCharge?: (
    chargeId: string
  ) => Promise<{
    ok: boolean;
    updated?: boolean;
    charge?: PixChargeRecord;
    error?: string;
  }>;
  whatsappInvites?: WhatsappInviteRecord[];
  onCreateWhatsappInvite?: (input: {
    recipientName?: string;
    recipientPhone?: string;
    photoUrl: string;
    message: string;
    planId?: string;
    callMode?: CallEntryIntent;
    saveAsDefault?: boolean;
  }) => Promise<{
    ok: boolean;
    invite?: WhatsappInviteRecord;
    invitePath?: string;
    error?: string;
  }>;
  onDeleteWhatsappInvite?: (inviteId: string) => Promise<void>;
}

type AdminSection =
  | 'private_calls'
  | 'whatsapp_invite'
  | 'users'
  | 'plans'
  | 'revenue'
  | 'tip_goal'
  | 'agenda'
  | 'schedule'
  | 'media'
  | 'site'
  | 'account';

export const ModelAdminPage: React.FC<ModelAdminPageProps> = ({
  myUid,
  myProfile,
  modelProfile,
  allProfiles,
  peers,
  studioState,
  studioConfig,
  galleryItems,
  privateAlbumSummary = null,
  privateAlbumItems = [],
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
  activeCallId,
  activePartnerUid,
  activePartnerName,
  activePlan,
  incomingRing,
  localStream,
  remoteStream,
  micEnabled,
  camEnabled,
  mediaError,
  connectionState,
  elapsedSeconds,
  onAcquireMedia,
  onToggleMic,
  onToggleCam,
  onEndCall,
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
  onUploadImage,
  onUploadMedia,
  onSaveStudioConfig,
  onSaveGalleryItem,
  onDeleteGalleryItem,
  onRestoreDefaultGallery,
  onSavePrivateAlbumSettings,
  onSavePrivateAlbumItem,
  onDeletePrivateAlbumItem,
  onToggleMediaVisibility,
  onUpdateUserControl,
  onDeleteUserProfile,
  onSendModeration,
  onRecordCallHistory,
  onUpdateCallHistoryStatus,
  onUpdateCallHistoryRecord,
  onDeleteCallHistoryRecord,
  onUpdateInterestMessageStatus,
  onDeleteInterestMessage,
  activeModelId = 'lorena_noir',
  activeAdminThemeId = 'rose_velvet',
  modelAccount = null,
  onUpdateMyModelAccount,
  pixCharges = [],
  onConfirmModelPixCharge,
  onCancelModelPixCharge,
  onCreateModelPixCharge,
  onRecalculateModelPixCharge,
  whatsappInvites = [],
  onCreateWhatsappInvite,
  onDeleteWhatsappInvite,
}) => {
  const [section, setSection] = useState<AdminSection>('private_calls');
  const [visitorSearch, setVisitorSearch] = useState('');
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const [rateDraftBrl, setRateDraftBrl] = useState<string>(() =>
    (ratePerMinuteCents / 100).toFixed(2)
  );
  const [savingRate, setSavingRate] = useState(false);
  const [rateSavedMsg, setRateSavedMsg] = useState<string | null>(null);
  const [pixActionId, setPixActionId] = useState<string | null>(null);
  const [pixAdminMsg, setPixAdminMsg] = useState<string | null>(null);
  const [expandedPixChargeId, setExpandedPixChargeId] = useState<string | null>(
    null
  );
  const [copiedPixChargeId, setCopiedPixChargeId] = useState<string | null>(
    null
  );

  // Own isolated account credentials state
  const [accountLoginDraft, setAccountLoginDraft] = useState(
    () => modelAccount?.loginUsername || ''
  );
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState('');
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountErrorMsg, setAccountErrorMsg] = useState<string | null>(null);
  const [accountSuccessMsg, setAccountSuccessMsg] = useState<string | null>(
    null
  );

  useEffect(() => {
    setAccountLoginDraft(modelAccount?.loginUsername || '');
  }, [modelAccount?.loginUsername]);

  useEffect(() => {
    setRateDraftBrl((ratePerMinuteCents / 100).toFixed(2));
  }, [ratePerMinuteCents, activeModelId]);

  const currentTheme = useMemo(
    () => getAdminModelTheme(activeAdminThemeId),
    [activeAdminThemeId]
  );

  const handleSaveModelRate = async (recalculatePlans: boolean) => {
    const parsed = Number(rateDraftBrl.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 1) return;
    const nextCents = Math.max(100, Math.min(1000000, Math.round(parsed * 100)));
    setSavingRate(true);
    setRateSavedMsg(null);
    try {
      onChangeRatePerMinuteCents(nextCents);
      await onSaveStudioConfig({
        ratePerMinuteCents: nextCents,
        ...(recalculatePlans ? { recalculatePlans: true } : {}),
      });
      setRateSavedMsg(
        recalculatePlans
          ? `Tarifa salva (${BRL_FORMATTER.format(nextCents / 100)}/min) e pacotes ajustados para esta modelo.`
          : `Tarifa por minuto salva para ${modelName}: ${BRL_FORMATTER.format(nextCents / 100)}/min.`
      );
    } finally {
      setSavingRate(false);
    }
  };

  const handleSaveOwnAccountCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateMyModelAccount || savingAccount) return;
    setAccountErrorMsg(null);
    setAccountSuccessMsg(null);

    const trimmedLogin = accountLoginDraft.trim().toLowerCase();
    if (trimmedLogin.length < 3) {
      setAccountErrorMsg('O login privativo deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!currentPasswordDraft) {
      setAccountErrorMsg(
        'Digite sua senha atual para confirmar alterações de login ou senha.'
      );
      return;
    }
    if (newPasswordDraft) {
      if (newPasswordDraft.length < 6) {
        setAccountErrorMsg('A nova senha deve ter pelo menos 6 caracteres.');
        return;
      }
      if (newPasswordDraft !== confirmPasswordDraft) {
        setAccountErrorMsg('A confirmação da nova senha não confere.');
        return;
      }
    }

    setSavingAccount(true);
    try {
      const res = await onUpdateMyModelAccount({
        loginUsername: trimmedLogin,
        currentPassword: currentPasswordDraft,
        ...(newPasswordDraft ? { newPassword: newPasswordDraft } : {}),
      });
      if (!res.ok) {
        setAccountErrorMsg(
          res.error || 'Não foi possível atualizar suas credenciais.'
        );
        return;
      }
      setCurrentPasswordDraft('');
      setNewPasswordDraft('');
      setConfirmPasswordDraft('');
      setAccountSuccessMsg(
        newPasswordDraft
          ? 'Login e senha exclusivos atualizados com segurança.'
          : 'Login exclusivo atualizado com sucesso.'
      );
    } finally {
      setSavingAccount(false);
    }
  };

  const onlineVisitors = useMemo(
    () => peers.filter((p) => p.uid !== myUid),
    [peers, myUid]
  );

  const profileMap = useMemo(() => {
    const map = new Map<string, StudioProfile>();
    for (const p of allProfiles) {
      map.set(p.uid, p);
    }
    return map;
  }, [allProfiles]);

  const filteredOnlineVisitors = useMemo(() => {
    const q = visitorSearch.trim().toLowerCase();
    const list = q
      ? onlineVisitors.filter((v) => v.displayName.toLowerCase().includes(q))
      : [...onlineVisitors];
    list.sort((a, b) => {
      const aVip =
        (profileMap.get(a.uid)?.accessStatus || a.accessStatus) === 'vip';
      const bVip =
        (profileMap.get(b.uid)?.accessStatus || b.accessStatus) === 'vip';
      if (aVip !== bVip) return aVip ? -1 : 1;
      return 0;
    });
    return list;
  }, [onlineVisitors, profileMap, visitorSearch]);

  const waitingRequests = useMemo(() => {
    const waiting = callQueue.filter((c) => c.status === 'waiting');
    return [...waiting].sort((a, b) => {
      const aVip = profileMap.get(a.userId)?.accessStatus === 'vip';
      const bVip = profileMap.get(b.userId)?.accessStatus === 'vip';
      if (aVip !== bVip) return aVip ? -1 : 1;
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return ta - tb;
    });
  }, [callQueue, profileMap]);

  const waitingVipRequests = useMemo(
    () =>
      waitingRequests.filter(
        (req) => profileMap.get(req.userId)?.accessStatus === 'vip'
      ),
    [profileMap, waitingRequests]
  );

  const unreadMessagesCount = useMemo(
    () => interestMessages.filter((m) => m.status === 'unread').length,
    [interestMessages]
  );

  const pendingPixChargesCount = useMemo(
    () => pixCharges.filter((c) => c.status === 'pending').length,
    [pixCharges]
  );

  const activePartnerProfile = activePartnerUid
    ? profileMap.get(activePartnerUid) || null
    : null;
  const activePartnerMuted = activePartnerProfile?.accessStatus === 'muted';
  const dndActiveNow = isDndActiveNow(studioState);
  const scheduleSnapshot = getScheduleFromState(studioState);
  const agendaRulesCount =
    scheduleSnapshot.dailyPausePeriods.filter((p) => p.enabled).length +
    scheduleSnapshot.weeklyBlockedDays.length +
    scheduleSnapshot.holidayDates.length;
  const agendaBlockingNow =
    getActiveDailyPause(studioState) !== null ||
    isWeekdayBlockedNow(studioState);
  const isLive = studioState?.isLive ?? true;
  const callMode = studioState?.callMode ?? 'open';
  const activeModeKey: 'open' | 'queue_only' | 'rest' = !isLive || callMode === 'paused'
    ? 'rest'
    : callMode === 'queue_only'
      ? 'queue_only'
      : 'open';

  const modelName =
    studioConfig?.modelName ||
    studioState?.modelName ||
    modelProfile?.displayName ||
    'Lorena Noir';
  const modelAvatar = studioConfig?.modelAvatarUrl || modelProfile?.photoUrl;
  const pendingPrivateCount = waitingRequests.length + (incomingRing ? 1 : 0);
  const hasActiveCall = Boolean(activeCallId);
  const showStageNow = hasActiveCall || showCameraPreview || Boolean(localStream);

  const firstCallableOnlineVisitor = useMemo(
    () =>
      onlineVisitors.find((visitor) => {
        const status =
          profileMap.get(visitor.uid)?.accessStatus || visitor.accessStatus;
        return status !== 'blocked';
      }) ?? null,
    [onlineVisitors, profileMap]
  );

  const firstWaitingIsVip =
    waitingRequests.length > 0 &&
    profileMap.get(waitingRequests[0].userId)?.accessStatus === 'vip';

  const callLaunchHint = incomingRing
    ? `Chamando agora: ${incomingRing.fromName}`
    : waitingRequests.length > 0
      ? firstWaitingIsVip
        ? `Prioridade VIP na fila: ${waitingRequests[0].userName}`
        : `Próximo na fila: ${waitingRequests[0].userName}`
      : firstCallableOnlineVisitor
        ? `Conectar no privado com ${firstCallableOnlineVisitor.displayName}`
        : 'Ative a prévia da sua câmera para se preparar para atender 1 internauta por vez';

  const handleLorenaEnterVideoCall = async () => {
    if (hasActiveCall) return;
    if (incomingRing) {
      await onAcceptIncomingRing();
      return;
    }
    if (waitingRequests.length > 0) {
      await onAcceptQueueAndCall(waitingRequests[0]);
      return;
    }
    if (firstCallableOnlineVisitor) {
      await onDirectCallUser({
        uid: firstCallableOnlineVisitor.uid,
        displayName: firstCallableOnlineVisitor.displayName,
        photoUrl: firstCallableOnlineVisitor.photoUrl,
      });
      return;
    }
    await handleOpenCameraPreview();
  };

  const navItems: Array<{
    id: AdminSection;
    label: string;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    countText?: string;
    highlight?: boolean;
  }> = [
    {
      id: 'private_calls',
      label: 'Chamada Privativa',
      hint: 'Entrar 1-para-1 e atender fila',
      icon: Video,
      countText:
        pendingPrivateCount > 0
          ? `${pendingPrivateCount}`
          : onlineVisitors.length > 0
            ? `${onlineVisitors.length}`
            : undefined,
      highlight: pendingPrivateCount > 0 || hasActiveCall,
    },
    {
      id: 'whatsapp_invite',
      label: 'Convite WhatsApp',
      hint: 'Foto, mensagem e link de pagamento',
      icon: MessageCircle,
      countText:
        whatsappInvites.length > 0 ? `${whatsappInvites.length}` : undefined,
      highlight: whatsappInvites.some((i) => i.status === 'paid'),
    },
    {
      id: 'users',
      label: 'Internautas e Acesso',
      hint: 'VIP, silenciar e mensagem inicial',
      icon: Users,
      countText: `${allProfiles.filter((p) => p.uid !== myUid).length}`,
    },
    {
      id: 'plans',
      label: 'Planos e Preços',
      hint: 'Duração e valores das sessões',
      icon: CreditCard,
      countText: `${callPlans.filter((p) => p.active).length}`,
    },
    {
      id: 'revenue',
      label: 'Receita e Histórico',
      hint: 'PIX, ganhos e sessões',
      icon: TrendingUp,
      countText:
        pendingPixChargesCount > 0 ? `${pendingPixChargesCount} PIX` : undefined,
      highlight: pendingPixChargesCount > 0,
    },
    {
      id: 'tip_goal',
      label: 'Meta de Gorjeta',
      hint: 'Título, valor alvo e descrição',
      icon: Target,
      countText: studioState?.tipGoalEnabled
        ? `${Math.min(
            100,
            Math.round(
              ((studioState.tipGoalCurrentCents || 0) /
                Math.max(500, studioState.tipGoalTargetCents || 30000)) *
                100
            )
          )}%`
        : 'Oculta',
      highlight: Boolean(studioState?.tipGoalEnabled),
    },
    {
      id: 'agenda',
      label: 'Gerenciamento de Agenda',
      hint: 'Pausas diárias, dias e feriados',
      icon: CalendarRange,
      countText: agendaRulesCount > 0 ? `${agendaRulesCount}` : undefined,
      highlight: agendaBlockingNow,
    },
    {
      id: 'schedule',
      label: 'Horários e Descanso',
      hint: 'Turnos, Não Perturbe e recados',
      icon: CalendarClock,
      countText: unreadMessagesCount > 0 ? `${unreadMessagesCount}` : undefined,
      highlight: dndActiveNow || unreadMessagesCount > 0,
    },
    {
      id: 'media',
      label: 'Gerenciamento de Mídia',
      hint: 'Público ou Privado em tempo real',
      icon: Film,
      countText: `${galleryItems.length + privateAlbumItems.length}`,
    },
    {
      id: 'site',
      label: 'Site, Perfil e Álbum',
      hint: 'Bio, textos e álbum privativo',
      icon: ImageIcon,
    },
    {
      id: 'account',
      label: 'Minha Conta e Senha',
      hint: 'Login privativo, senha e cor',
      icon: KeyRound,
    },
  ];

  const handleOpenCameraPreview = async () => {
    if (showCameraPreview && !hasActiveCall) {
      setShowCameraPreview(false);
      return;
    }
    setShowCameraPreview(true);
    if (!localStream) {
      await onAcquireMedia();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Comfortable Left Navigation & Quick Controls Sidebar */}
      <aside
        aria-label="Menu exclusivo da modelo"
        className="w-full lg:w-[280px] shrink-0 space-y-5 lg:sticky lg:top-22"
      >
        {/* Model Identity & Live Connection */}
        <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-3.5">
            {modelAvatar ? (
              <img
                src={modelAvatar}
                alt={modelName}
                referrerPolicy="no-referrer"
                draggable={false}
                className="w-11 h-11 rounded-full object-cover border-2 shrink-0 bg-[#1A1024]"
                style={{ borderColor: currentTheme.swatchHex }}
              />
            ) : (
              <div
                className="w-11 h-11 rounded-full bg-[#21142D] border-2 flex items-center justify-center font-display text-lg font-semibold shrink-0"
                style={{
                  borderColor: currentTheme.swatchHex,
                  color: currentTheme.accentText,
                }}
              >
                {modelName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 text-xs text-[#C9BAC4]">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: currentTheme.swatchHex }}
                />
                <span className="truncate">
                  Painel · {currentTheme.label}
                </span>
              </div>
              <h1 className="font-display text-xl font-semibold text-[#FAF4F7] truncate">
                {modelName}
              </h1>
            </div>
          </div>

          <div className="pt-3 border-t border-[#F4C2D7]/15 flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-2 text-[#FAF4F7]">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  dndActiveNow
                    ? 'bg-[#FCD34D]'
                    : activeModeKey === 'rest'
                      ? 'bg-[#938291]'
                      : wsConnected
                        ? 'bg-[#86EFAC]'
                        : 'bg-[#FCD34D]'
                }`}
              />
              <span>
                {dndActiveNow
                  ? 'Não Perturbe ativo'
                  : activeModeKey === 'rest'
                    ? 'Em descanso'
                    : activeModeKey === 'queue_only'
                      ? 'Atendendo por fila'
                      : 'Atendendo privativas'}
              </span>
            </span>
            <span className="font-mono tabular-nums text-[#C9BAC4]">
              {onlineVisitors.length} online
            </span>
          </div>
        </section>

        {/* Simple, Human-Friendly Navigation */}
        <nav
          aria-label="Seções da administração"
          className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-2.5 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            const isSelected = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors shrink-0 lg:w-full cursor-pointer ${
                  isSelected
                    ? 'bg-[#21142D] text-[#FAF4F7] border border-[#F4C2D7]/25'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7] hover:bg-[#1A1024]/70 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isSelected ? 'text-[#F4C2D7]' : 'text-[#C9BAC4]'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold whitespace-nowrap truncate">
                      {item.label}
                    </p>
                    <p className="hidden lg:block text-[11px] text-[#938291] truncate">
                      {item.hint}
                    </p>
                  </div>
                </div>

                {item.countText && (
                  <span
                    className={`text-xs font-mono tabular-nums shrink-0 ${
                      item.highlight
                        ? 'text-[#F4C2D7] font-semibold'
                        : 'text-[#938291]'
                    }`}
                  >
                    {item.countText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Easy Studio Availability & Sound Controls */}
        <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-4 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-[#FAF4F7]">
              Status de Atendimento
            </p>
            <p className="text-[11px] text-[#938291]">
              Escolha como os internautas veem seu estúdio agora.
            </p>
          </div>

          <div className="space-y-1.5">
            {(
              [
                {
                  key: 'open',
                  label: 'Disponível · Chamada Direta',
                  desc: 'Podem chamar ou entrar na fila',
                  patch: {
                    isLive: true,
                    callMode: 'open' as const,
                    autoScheduleEnabled: false,
                  },
                },
                {
                  key: 'queue_only',
                  label: 'Disponível · Somente Fila',
                  desc: 'Pedidos ficam na sua fila',
                  patch: {
                    isLive: true,
                    callMode: 'queue_only' as const,
                    autoScheduleEnabled: false,
                  },
                },
                {
                  key: 'rest',
                  label: 'Em Descanso (Offline)',
                  desc: 'Mostra painel de recados',
                  patch: {
                    isLive: false,
                    autoScheduleEnabled: false,
                  },
                },
              ] as const
            ).map((option) => {
              const selected = activeModeKey === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => void onUpdateStudioState(option.patch)}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-left transition-colors border cursor-pointer ${
                    selected
                      ? option.key === 'rest'
                        ? 'bg-[#1A1024] border-[#F4C2D7]/30 text-[#FAF4F7]'
                        : 'bg-[#16A34A]/15 border-[#16A34A]/45 text-[#FAF4F7]'
                      : 'bg-[#0B060F]/70 border-[#F4C2D7]/10 text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{option.label}</span>
                    {selected && (
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          option.key === 'rest' ? 'bg-[#F4C2D7]' : 'bg-[#86EFAC]'
                        }`}
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-[#938291] mt-0.5">
                    {option.desc}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Sound Ding Toggle + Quick Test */}
          <div className="pt-3 border-t border-[#F4C2D7]/15 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-[#C9BAC4]">
                Aviso sonoro (Ding)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-pressed={soundEnabled}
                  onClick={onToggleSoundEnabled}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    soundEnabled
                      ? 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC]'
                      : 'bg-[#1A1024] border-[#F4C2D7]/15 text-[#C9BAC4]'
                  }`}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-3.5 h-3.5" />
                  ) : (
                    <VolumeX className="w-3.5 h-3.5" />
                  )}
                  <span>{soundEnabled ? 'Ativo' : 'Mudo'}</span>
                </button>
                <button
                  type="button"
                  onClick={onTestSoundDing}
                  title="Testar som de notificação"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#1A1024] border border-[#F4C2D7]/15 text-[#F4C2D7] hover:bg-[#21142D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <BellRing className="w-3.5 h-3.5" />
                  <span>Testar</span>
                </button>
              </div>
            </div>

            {dndActiveNow && (
              <div className="pt-2 flex items-center justify-between gap-2 text-xs text-[#FCD34D]">
                <span className="inline-flex items-center gap-1.5">
                  <BellOff className="w-3.5 h-3.5 shrink-0" />
                  <span>Não Perturbe ativo</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void onUpdateStudioState({ dndActive: false, dndUntilMs: 0 })
                  }
                  className="text-xs font-semibold text-[#FAF4F7] underline underline-offset-2 hover:text-[#F4C2D7] cursor-pointer"
                >
                  Desativar
                </button>
              </div>
            )}

            {studioState?.autoScheduleEnabled && (
              <p className="text-[11px] text-[#C9BAC4] pt-1">
                Agenda automática ativa (
                {
                  getScheduleFromState(studioState).schedulePeriods.filter(
                    (p) => p.enabled
                  ).length
                }{' '}
                períodos configurados).
              </p>
            )}
          </div>
        </section>
      </aside>

      {/* Main Comfortable Workspace Canvas */}
      <div className="flex-1 min-w-0 w-full space-y-6">
        {section === 'private_calls' && (
          <div className="space-y-6">
            {/* Friendly Section Header with Signature Technological Call CTA */}
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
                <div className="space-y-1.5">
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                    Sala Privativa 1-para-1 (1 Internauta por Vez)
                  </h2>
                  <p className="text-sm text-[#C9BAC4] leading-relaxed">
                    Atenda um internauta por vez mediante pagamento. Enquanto estiver em chamada privativa, novos pedidos aguardam na fila.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {!hasActiveCall && (
                    <TechVideoCallButton
                      size="hero"
                      label="Atender Próximo Privativo"
                      onClick={() => void handleLorenaEnterVideoCall()}
                    />
                  )}

                  {!hasActiveCall && (
                    <button
                      type="button"
                      onClick={() => void handleOpenCameraPreview()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>
                        {showStageNow ? 'Ocultar Prévia' : 'Testar Câmera'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {!hasActiveCall && (
                <div className="pt-4 border-t border-[#F4C2D7]/15 flex flex-wrap items-center justify-between gap-2 text-xs text-[#C9BAC4]">
                  <span>
                    <strong className="font-medium text-[#F4C2D7]">
                      Ação rápida de {modelName}:
                    </strong>{' '}
                    {callLaunchHint}
                  </span>
                  <span className="font-mono tabular-nums text-[#938291]">
                    {waitingRequests.length} na fila · {onlineVisitors.length}{' '}
                    online
                  </span>
                </div>
              )}
            </section>

            {/* Incoming Private Call Spotlight */}
            {incomingRing &&
              (() => {
                const isVipIncoming =
                  profileMap.get(incomingRing.fromUid)?.accessStatus === 'vip';
                return (
                  <section
                    role="alert"
                    className={`luxury-card rounded-2xl p-6 bg-[#21142D] flex flex-col sm:flex-row sm:items-center justify-between gap-5 ${
                      isVipIncoming
                        ? 'border border-[#FBBF24]/55 shadow-[0_0_28px_-10px_rgba(251,191,36,0.38)]'
                        : 'border border-[#F4C2D7]/40'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0">
                      <p
                        className={`text-xs font-semibold inline-flex items-center gap-2 ${
                          isVipIncoming ? 'text-[#FDE68A]' : 'text-[#F4C2D7]'
                        }`}
                      >
                        {isVipIncoming ? (
                          <Crown className="w-4 h-4 text-[#FBBF24] shrink-0" />
                        ) : (
                          <PhoneIncoming className="w-4 h-4 shrink-0" />
                        )}
                        <span>
                          {isVipIncoming
                            ? 'Chamada Privativa VIP Recebida Agora'
                            : 'Chamada Privativa Recebida Agora'}
                        </span>
                      </p>
                      <h3 className="font-display text-2xl font-semibold text-[#FAF4F7] truncate">
                        {incomingRing.fromName}
                      </h3>
                      {incomingRing.planName &&
                      typeof incomingRing.planPriceCents === 'number' ? (
                        <p className="text-xs font-mono tabular-nums text-[#86EFAC]">
                          {incomingRing.planName} ·{' '}
                          {BRL_FORMATTER.format(
                            incomingRing.planPriceCents / 100
                          )}{' '}
                          · Pagamento pré-autorizado
                        </p>
                      ) : (
                        <p className="text-xs text-[#C9BAC4]">
                          Internauta aguardando você aceitar a videochamada privativa.
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <TechVideoCallButton
                        size="hero"
                        disabled={hasActiveCall}
                        label="Entrar na Videochamada Privativa"
                        onClick={() => void onAcceptIncomingRing()}
                      />
                      <button
                        type="button"
                        onClick={onRejectIncomingRing}
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-full bg-[#150D1D] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <PhoneOff className="w-4 h-4" />
                        <span>Recusar</span>
                      </button>
                    </div>
                  </section>
                );
              })()}

            {/* Priority VIP Waiting Room Notification Banner */}
            {waitingVipRequests.length > 0 && (
              <section
                role="alert"
                aria-label="Notificação prioritária de cliente VIP na Sala de Espera"
                className="luxury-card border border-[#FBBF24]/55 rounded-2xl p-5 sm:p-6 bg-gradient-to-r from-[#2D1B3D]/90 via-[#21142D]/90 to-[#150D1D] shadow-[0_18px_42px_-18px_rgba(251,191,36,0.35)] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#FDE68A]/25 via-[#FBBF24]/15 to-[#21142D] border border-[#FBBF24]/55 flex items-center justify-center shrink-0">
                    <Crown className="w-5 h-5 text-[#FBBF24]" />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-[#FDE68A]">
                      Notificação Prioritária ·{' '}
                      {waitingVipRequests.length === 1
                        ? 'Cliente VIP na Sala de Espera'
                        : `${waitingVipRequests.length} Clientes VIP na Sala de Espera`}
                    </p>
                    <p className="text-sm sm:text-base font-semibold text-[#FAF4F7] truncate">
                      {waitingVipRequests[0].userName} aguarda atendimento VIP prioritário
                    </p>
                    <p className="text-xs text-[#C9BAC4] truncate">
                      {waitingVipRequests[0].planName
                        ? `${waitingVipRequests[0].planName} · `
                        : ''}
                      {waitingVipRequests[0].topic}
                    </p>
                  </div>
                </div>

                <div className="shrink-0">
                  <TechVideoCallButton
                    size="hero"
                    disabled={hasActiveCall}
                    label={`Atender VIP · ${waitingVipRequests[0].userName}`}
                    onClick={() =>
                      void onAcceptQueueAndCall(waitingVipRequests[0])
                    }
                  />
                </div>
              </section>
            )}

            {/* Quick Moderation Strip during Active 1-on-1 Private Call */}
            {activePartnerUid && (
              <section className="luxury-card border border-[#F4C2D7]/25 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-[#FAF4F7]">
                    Em chamada privativa com {activePartnerName}
                  </p>
                  <p className="text-xs text-[#C9BAC4]">
                    Controle o microfone do internauta ou encerre imediatamente se precisar.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
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
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full bg-red-950/40 border border-red-500/35 text-red-200 hover:bg-red-950/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>Bloquear e Encerrar</span>
                  </button>
                </div>
              </section>
            )}

            {/* Video Call Stage (visible when in call or camera test active) */}
            {showStageNow && (
              <VideoCallStage
                isAdmin={true}
                myProfile={myProfile}
                modelProfile={modelProfile}
                studioState={studioState}
                activeCallId={activeCallId}
                activePartnerName={activePartnerName}
                activePartnerUid={activePartnerUid}
                activePlan={activePlan}
                localStream={localStream}
                remoteStream={remoteStream}
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
            )}

            {/* Two-Column Comfortable Call Entry Lists */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Card: Waiting Private Queue */}
              <section className="xl:col-span-6 luxury-card border border-[#F4C2D7]/15 rounded-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-[#F4C2D7]/15 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <PhoneIncoming className="w-4 h-4 text-[#F4C2D7]" />
                      <h3 className="text-base font-semibold text-[#FAF4F7]">
                        Fila de Chamadas Privativas
                      </h3>
                    </div>
                    <p className="text-xs text-[#C9BAC4]">
                      Pedidos com plano selecionado aguardando você aceitar.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#F4C2D7] shrink-0">
                    {waitingRequests.length} aguardando
                  </span>
                </div>

                {waitingRequests.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <Sparkles className="w-5 h-5 text-[#F4C2D7]/70 mx-auto" />
                    <p className="text-sm font-medium text-[#FAF4F7]">
                      Nenhum pedido na fila neste momento
                    </p>
                    <p className="text-xs text-[#C9BAC4] max-w-sm mx-auto leading-relaxed">
                      Quando um internauta escolher um plano e solicitar chamada privativa, ele aparecerá aqui com aviso sonoro.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F4C2D7]/10">
                    {waitingRequests.map((req) => {
                      const isOnline = onlineVisitors.some(
                        (p) => p.uid === req.userId
                      );
                      const isVipCaller =
                        profileMap.get(req.userId)?.accessStatus === 'vip';
                      return (
                        <div
                          key={req.id}
                          className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                            isVipCaller
                              ? 'bg-[#21142D]/55 border-l-2 border-l-[#FBBF24] hover:bg-[#281837]/65'
                              : 'hover:bg-[#FAF4F7]/[0.02]'
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isVipCaller ? (
                                <Crown
                                  aria-label="Cliente VIP"
                                  className="w-4 h-4 text-[#FBBF24] shrink-0"
                                />
                              ) : (
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    isOnline ? 'bg-[#86EFAC]' : 'bg-[#938291]'
                                  }`}
                                />
                              )}
                              <p className="text-sm font-semibold text-[#FAF4F7] truncate">
                                {req.userName}
                              </p>
                              {isVipCaller && (
                                <span className="text-xs font-semibold text-[#FDE68A] whitespace-nowrap">
                                  VIP · Prioridade
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#C9BAC4] truncate">
                              {req.topic} ·{' '}
                              {isOnline ? 'Online agora' : 'Offline no momento'}
                            </p>
                            {req.planName &&
                              typeof req.planPriceCents === 'number' && (
                                <p className="text-xs font-mono tabular-nums text-[#F4C2D7]">
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
                            <TechVideoCallButton
                              size="compact"
                              disabled={hasActiveCall}
                              label={
                                hasActiveCall
                                  ? 'Em Atendimento (1/1)'
                                  : isVipCaller
                                    ? 'Atender VIP Agora'
                                    : 'Atender Privativa'
                              }
                              onClick={() => void onAcceptQueueAndCall(req)}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdateCallStatus(
                                  req.id,
                                  'rejected',
                                  'refunded'
                                )
                              }
                              title="Recusar solicitação"
                              aria-label={`Recusar ${req.userName}`}
                              className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDeleteCallRequest(req.id)}
                              title="Remover da fila"
                              aria-label={`Remover pedido de ${req.userName}`}
                              className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Right Card: Online Visitors for Immediate 1-on-1 Call */}
              <section className="xl:col-span-6 luxury-card border border-[#F4C2D7]/15 rounded-2xl overflow-hidden">
                <div className="px-6 py-5 border-b border-[#F4C2D7]/15 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-[#86EFAC]" />
                        <h3 className="text-base font-semibold text-[#FAF4F7]">
                          Internautas Conectados Agora
                        </h3>
                      </div>
                      <p className="text-xs text-[#C9BAC4]">
                        Chame qualquer visitante online para uma chamada privativa 1-para-1.
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#86EFAC] shrink-0">
                      {onlineVisitors.length} online
                    </span>
                  </div>

                  {onlineVisitors.length > 3 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#938291] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={visitorSearch}
                        onChange={(e) => setVisitorSearch(e.target.value)}
                        placeholder="Buscar internauta conectado..."
                        className="w-full bg-[#0B060F] border border-[#F4C2D7]/15 rounded-full pl-9 pr-4 py-2 text-xs text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                      />
                    </div>
                  )}
                </div>

                {filteredOnlineVisitors.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <MoonStar className="w-5 h-5 text-[#C9BAC4]/60 mx-auto" />
                    <p className="text-sm font-medium text-[#FAF4F7]">
                      {onlineVisitors.length === 0
                        ? 'Nenhum internauta online neste instante'
                        : 'Nenhum internauta encontrado com esse nome'}
                    </p>
                    <p className="text-xs text-[#C9BAC4] max-w-sm mx-auto leading-relaxed">
                      Assim que um visitante entrar no site, o nome dele aparece aqui pronto para chamada privativa.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F4C2D7]/10">
                    {filteredOnlineVisitors.map((visitor) => {
                      const prof = profileMap.get(visitor.uid);
                      const status = prof?.accessStatus || visitor.accessStatus;
                      const isBlocked = status === 'blocked';
                      return (
                        <div
                          key={visitor.uid}
                          className="p-5 flex items-center justify-between gap-4 hover:bg-[#FAF4F7]/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {visitor.photoUrl ? (
                              <img
                                src={visitor.photoUrl}
                                alt={visitor.displayName}
                                referrerPolicy="no-referrer"
                                draggable={false}
                                className="w-10 h-10 rounded-full object-cover border border-[#F4C2D7]/20 shrink-0 bg-[#1A1024]"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-[#21142D] border border-[#F4C2D7]/20 flex items-center justify-center text-sm font-semibold text-[#F4C2D7] shrink-0">
                                {visitor.displayName.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                {status === 'vip' && (
                                  <Crown
                                    aria-label="Cliente VIP"
                                    className="w-3.5 h-3.5 text-[#FBBF24] shrink-0"
                                  />
                                )}
                                <p className="text-sm font-semibold text-[#FAF4F7] truncate">
                                  {visitor.displayName}
                                </p>
                              </div>
                              <p className="text-xs text-[#C9BAC4]">
                                {visitor.inCallWith
                                  ? 'Em videochamada'
                                  : 'Na recepção'}{' '}
                                ·{' '}
                                <span
                                  className={
                                    status === 'vip'
                                      ? 'text-[#FDE68A] font-medium'
                                      : status === 'muted'
                                        ? 'text-[#FCD34D]'
                                        : isBlocked
                                          ? 'text-[#FCA5A5]'
                                          : 'text-[#86EFAC]'
                                  }
                                >
                                  {status === 'vip'
                                    ? 'VIP · Prioridade'
                                    : status === 'muted'
                                      ? 'Silenciado'
                                      : isBlocked
                                        ? 'Bloqueado'
                                        : 'Ativo'}
                                </span>
                              </p>
                            </div>
                          </div>

                          <TechVideoCallButton
                            size="compact"
                            disabled={isBlocked || hasActiveCall}
                            label={
                              hasActiveCall
                                ? 'Sala Ocupada (1/1)'
                                : 'Chamar no Privado'
                            }
                            icon={<PhoneCall className="w-3 h-3" />}
                            onClick={() =>
                              void onDirectCallUser({
                                uid: visitor.uid,
                                displayName: visitor.displayName,
                                photoUrl: visitor.photoUrl,
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <TipGoalManagerCard
              studioState={studioState}
              modelName={modelName}
              onUpdateStudioState={onUpdateStudioState}
            />
          </div>
        )}

        {section === 'users' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                Internautas, Acesso e Mensagem da Recepção
              </h2>
              <p className="text-sm text-[#C9BAC4]">
                Edite o texto de boas-vindas do estúdio, marque clientes como VIP, silencie áudios ou bloqueie acessos.
              </p>
            </section>

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
              showStudioControls={true}
              showDndPanel={false}
              showUsersTable={true}
              showRevenueDashboard={false}
              showCallPlans={false}
              showCallHistory={false}
              showInterestMessages={false}
            />
          </div>
        )}

        {section === 'plans' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                    Planos e Preços Exclusivos · {modelName}
                  </h2>
                  <p className="text-sm text-[#C9BAC4]">
                    Defina os pacotes e a tarifa por minuto que valem apenas para{' '}
                    <span className="text-[#FAF4F7] font-medium">{modelName}</span>{' '}
                    na vitrine pública e nas cobranças.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-2xl px-4 py-2.5 shrink-0">
                  <label
                    htmlFor="admin-rate-per-min"
                    className="text-xs font-medium text-[#C9BAC4] whitespace-nowrap"
                  >
                    Tarifa/min (R$):
                  </label>
                  <input
                    id="admin-rate-per-min"
                    type="text"
                    value={rateDraftBrl}
                    onChange={(e) => setRateDraftBrl(e.target.value)}
                    className="w-24 bg-[#150D1D] border border-[#F4C2D7]/20 rounded-lg px-2.5 py-1.5 text-sm font-mono tabular-nums text-[#FAF4F7] text-right focus:outline-none focus:border-[#F4C2D7]"
                  />
                  <button
                    type="button"
                    disabled={savingRate}
                    onClick={() => void handleSaveModelRate(false)}
                    className="px-3.5 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    {savingRate ? 'Salvando...' : 'Salvar Tarifa'}
                  </button>
                  <button
                    type="button"
                    disabled={savingRate}
                    onClick={() => void handleSaveModelRate(true)}
                    className="px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#21142D] disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    Salvar + Recalcular Planos
                  </button>
                </div>
              </div>

              {rateSavedMsg && (
                <p role="status" className="text-xs text-[#86EFAC]">
                  {rateSavedMsg}
                </p>
              )}
            </section>

            <CallPlansManager
              plans={callPlans}
              modelName={modelName}
              onSavePlan={onSavePlan}
              onDeletePlan={onDeletePlan}
            />
          </div>
        )}

        {section === 'revenue' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                Dashboard Financeiro e Histórico de Sessões
              </h2>
              <p className="text-sm text-[#C9BAC4]">
                Visualize o volume de vendas via PIX com filtros por data, modelo e plano de chamada, além de seus ganhos diários e mensais.
              </p>
            </section>

            <PixSalesAnalyticsPanel
              pixCharges={pixCharges}
              callPlans={callPlans}
              activeModelId={activeModelId}
              modelName={modelName}
              themeAccentColor="#38BDF8"
              themeAccentSoftColor="#E0F2FE"
            />

            <TipGoalManagerCard
              studioState={studioState}
              modelName={modelName}
              onUpdateStudioState={onUpdateStudioState}
            />

            <PixDynamicBillingPanel
              modelName={modelName}
              studioConfig={studioConfig}
              onSaveStudioConfig={onSaveStudioConfig}
              onCreateModelPixCharge={onCreateModelPixCharge}
            />

            {/* Mercado Pago & PIX Payments Verification Card */}
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#0EA5E9]/15 border border-[#38BDF8]/30 flex items-center justify-center shrink-0">
                    <QrCode className="w-4 h-4 text-[#38BDF8]" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-[#FAF4F7]">
                      Pagamentos Mercado Pago & PIX
                    </h3>
                    <p className="text-xs text-[#C9BAC4]">
                      {studioConfig?.mercadoPagoConfigured
                        ? 'Mercado Pago API Ativo (Confirmação Automática via Webhook + Checkout Pro).'
                        : 'PIX Direto Ativo (Chave EVP · Adicione MERCADOPAGO_ACCESS_TOKEN nos Secrets para Cartão e confirmação instantânea).'}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                  {pendingPixChargesCount} pendente
                  {pendingPixChargesCount === 1 ? '' : 's'} · {pixCharges.length} no
                  total
                </span>
              </div>

              {pixAdminMsg && (
                <div className="px-6 py-2.5 bg-[#16A34A]/15 border-b border-[#16A34A]/30 text-xs text-[#86EFAC]">
                  {pixAdminMsg}
                </div>
              )}

              {pixCharges.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#C9BAC4]">
                  Nenhum pagamento PIX gerado para esta modelo ainda. Configure sua chave PIX na aba{' '}
                  <strong className="text-[#FAF4F7]">Site, Perfil e Álbum</strong>{' '}
                  ou utilize o QR Code padrão automático.
                </div>
              ) : (
                <div className="divide-y divide-[#F4C2D7]/10">
                  {pixCharges.slice(0, 20).map((charge) => {
                    const kindLabel =
                      charge.kind === 'private_album'
                        ? 'Álbum Privativo'
                        : charge.kind === 'tip'
                          ? 'Gorjeta na Meta'
                          : charge.kind === 'custom_charge'
                            ? `PIX Dinâmico · ${charge.description}`
                            : charge.planName || 'Plano de Videochamada';
                    const statusMap: Record<
                      PixChargeStatus,
                      { label: string; cls: string }
                    > = {
                      pending: {
                        label: 'Aguardando PIX',
                        cls: 'text-[#FCD34D]',
                      },
                      paid: { label: 'Pago e Liberado', cls: 'text-[#86EFAC]' },
                      expired: { label: 'Expirado', cls: 'text-[#938291]' },
                      cancelled: { label: 'Cancelado', cls: 'text-[#FCA5A5]' },
                    };
                    const statusUi = statusMap[charge.status];
                    const busy = pixActionId === charge.id;
                    const isExpanded = expandedPixChargeId === charge.id;
                    const isCopied = copiedPixChargeId === charge.id;
                    const formattedDue =
                      charge.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(charge.dueDate)
                        ? `${charge.dueDate.slice(8, 10)}/${charge.dueDate.slice(
                            5,
                            7
                          )}/${charge.dueDate.slice(0, 4)}`
                        : null;
                    const isPastDuePending =
                      charge.status === 'pending' &&
                      typeof charge.dueAtMs === 'number' &&
                      Date.now() > charge.dueAtMs;

                    return (
                      <div key={charge.id} className="px-6 py-4 space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-semibold text-[#FAF4F7]">
                                {charge.userName}
                              </span>
                              <span className="text-[#938291]">·</span>
                              <span className="text-[#C9BAC4]">{kindLabel}</span>
                              <span className="text-[#938291]">·</span>
                              <span className={`font-medium ${statusUi.cls}`}>
                                {statusUi.label}
                              </span>
                            </div>
                            {charge.status === 'pending' &&
                              charge.visitorReportedPaidAt && (
                                <p className="text-[11px] font-medium text-[#38BDF8]">
                                  Internauta sinalizou pagamento · Confira seu banco e confirme abaixo
                                </p>
                              )}
                            <p className="text-[11px] font-mono tabular-nums text-[#938291]">
                              {BRL_FORMATTER.format(charge.amountCents / 100)} ·
                              Chave: {charge.pixKeyMasked} · TXID: {charge.txid}
                            </p>
                            {formattedDue && (
                              <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
                                Vencimento: {formattedDue} · Multa{' '}
                                {charge.finePercent ?? 2}% · Juros{' '}
                                {charge.interestMonthlyPercent ?? 1}% a.m.
                                {(charge.daysOverdue ?? 0) > 0 && (
                                  <span className="text-[#FCD34D]">
                                    {' '}
                                    · Atraso {charge.daysOverdue}d (+
                                    {BRL_FORMATTER.format(
                                      ((charge.fineCents ?? 0) +
                                        (charge.interestCents ?? 0)) /
                                        100
                                    )}
                                    )
                                  </span>
                                )}
                              </p>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPixChargeId(
                                  isExpanded ? null : charge.id
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#150D1D] border border-[#38BDF8]/30 text-[#E0F2FE] hover:border-[#38BDF8] cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5 text-[#38BDF8]" />
                              <span>
                                {isExpanded ? 'Ocultar QR Code' : 'Ver QR / Copia e Cola'}
                              </span>
                            </button>

                            {isPastDuePending && onRecalculateModelPixCharge && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  setPixActionId(charge.id);
                                  setPixAdminMsg(null);
                                  void onRecalculateModelPixCharge(charge.id)
                                    .then((res) => {
                                      if (!res.ok) {
                                        setPixAdminMsg(
                                          res.error || 'Erro ao recalcular PIX.'
                                        );
                                      } else if (res.updated) {
                                        setPixAdminMsg(
                                          `QR Code de ${charge.userName} atualizado com multa e juros de mora.`
                                        );
                                      } else {
                                        setPixAdminMsg(
                                          `Cobrança de ${charge.userName} já está com os encargos atualizados.`
                                        );
                                      }
                                    })
                                    .finally(() => setPixActionId(null));
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#150D1D] border border-[#FCD34D]/35 text-[#FCD34D] hover:border-[#FCD34D] disabled:opacity-45 cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Atualizar Atraso</span>
                              </button>
                            )}

                            {charge.status === 'pending' &&
                              onConfirmModelPixCharge &&
                              onCancelModelPixCharge && (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setPixActionId(charge.id);
                                      setPixAdminMsg(null);
                                      void onConfirmModelPixCharge(charge.id)
                                        .then((res) => {
                                          setPixAdminMsg(
                                            res.ok
                                              ? `PIX de ${charge.userName} confirmado e acesso liberado.`
                                              : res.error || 'Erro ao confirmar PIX.'
                                          );
                                        })
                                        .finally(() => setPixActionId(null));
                                    }}
                                    className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    <span>Confirmar Recebimento PIX</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setPixActionId(charge.id);
                                      setPixAdminMsg(null);
                                      void onCancelModelPixCharge(charge.id)
                                        .then((res) => {
                                          setPixAdminMsg(
                                            res.ok
                                              ? `Cobrança PIX de ${charge.userName} cancelada.`
                                              : res.error || 'Erro ao cancelar PIX.'
                                          );
                                        })
                                        .finally(() => setPixActionId(null));
                                    }}
                                    className="px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 disabled:opacity-45 cursor-pointer"
                                  >
                                    Cancelar
                                  </button>
                                </>
                              )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-4 rounded-xl bg-[#0B060F]/90 border border-[#38BDF8]/25 flex flex-col sm:flex-row items-center gap-4">
                            <div className="p-2 rounded-xl bg-white shrink-0">
                              <img
                                src={charge.qrCodeDataUrl}
                                alt={`QR Code PIX TXID ${charge.txid}`}
                                className="w-28 h-28 object-contain"
                              />
                            </div>
                            <div className="flex-1 w-full space-y-2 min-w-0">
                              <p className="text-[11px] font-medium text-[#C9BAC4]">
                                PIX Copia e Cola (Dinâmico · {BRL_FORMATTER.format(charge.amountCents / 100)}):
                              </p>
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  type="text"
                                  readOnly
                                  value={charge.brCode}
                                  onFocus={(e) => e.currentTarget.select()}
                                  aria-label={`Código PIX Copia e Cola ${charge.txid}`}
                                  className="flex-1 bg-[#150D1D] border border-[#818CF8]/25 rounded-xl px-3 py-2 text-[11px] font-mono text-[#E2E8F0] focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard
                                      .writeText(charge.brCode)
                                      .then(() => {
                                        setCopiedPixChargeId(charge.id);
                                        window.setTimeout(
                                          () =>
                                            setCopiedPixChargeId((prev) =>
                                              prev === charge.id ? null : prev
                                            ),
                                          2500
                                        );
                                      });
                                  }}
                                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#131C42] border border-[#38BDF8]/40 text-[#F8FAFC] hover:border-[#38BDF8] cursor-pointer shrink-0"
                                >
                                  {isCopied ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-[#86EFAC]" />
                                      <span className="text-[#86EFAC]">Copiado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5 text-[#38BDF8]" />
                                      <span>Copiar Código</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <FinancialEarningsDashboard
              callHistory={callHistory}
              themeAccentColor={currentTheme.accentText}
              themeAccentSoftColor={currentTheme.accentSoft}
            />

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
              showStudioControls={false}
              showDndPanel={false}
              showUsersTable={false}
              showRevenueDashboard={false}
              showCallPlans={false}
              showCallHistory={true}
              showInterestMessages={false}
            />
          </div>
        )}

        {section === 'tip_goal' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                Configuração da Meta de Gorjeta · {modelName}
              </h2>
              <p className="text-sm text-[#C9BAC4]">
                Defina o título, o valor alvo e a descrição da sua meta exclusiva para exibição dinâmica na página dos visitantes.
              </p>
            </section>

            <TipGoalManagerCard
              studioState={studioState}
              modelName={modelName}
              onUpdateStudioState={onUpdateStudioState}
            />
          </div>
        )}

        {section === 'agenda' && (
          <AgendaManagementPanel
            studioState={studioState}
            modelName={modelName}
            onUpdateStudioState={onUpdateStudioState}
          />
        )}

        {section === 'schedule' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                Horários, Feriados, Pausas e Recados
              </h2>
              <p className="text-sm text-[#C9BAC4]">
                Configure seus horários de trabalho automático, datas especiais de descanso, pausas imediatas e leia recados recebidos offline.
              </p>
            </section>

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
        )}

        {section === 'media' &&
          onSavePrivateAlbumItem &&
          onDeletePrivateAlbumItem &&
          onToggleMediaVisibility &&
          onSavePrivateAlbumSettings && (
            <MediaManagementPanel
              modelId={activeModelId}
              galleryItems={galleryItems}
              privateAlbumItems={privateAlbumItems}
              privateAlbumSummary={privateAlbumSummary}
              onUploadMedia={onUploadMedia}
              onSaveGalleryItem={onSaveGalleryItem}
              onDeleteGalleryItem={onDeleteGalleryItem}
              onSavePrivateAlbumItem={onSavePrivateAlbumItem}
              onDeletePrivateAlbumItem={onDeletePrivateAlbumItem}
              onToggleMediaVisibility={onToggleMediaVisibility}
              onSavePrivateAlbumSettings={onSavePrivateAlbumSettings}
            />
          )}

        {section === 'site' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-1.5">
              <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                Aparência do Site, Descrição e Álbuns
              </h2>
              <p className="text-sm text-[#C9BAC4]">
                Atualize sua descrição, informações básicas, galeria pública e seu álbum privativo com senha de fotos e vídeos.
              </p>
            </section>

            <AdminSiteEditor
              modelId={activeModelId}
              modelProfile={modelProfile}
              studioConfig={studioConfig}
              galleryItems={galleryItems}
              privateAlbumSummary={privateAlbumSummary}
              privateAlbumItems={privateAlbumItems}
              onUploadImage={onUploadImage}
              onUploadMedia={onUploadMedia}
              onSaveStudioConfig={onSaveStudioConfig}
              onSaveGalleryItem={onSaveGalleryItem}
              onDeleteGalleryItem={onDeleteGalleryItem}
              onRestoreDefaultGallery={onRestoreDefaultGallery}
              onSavePrivateAlbumSettings={onSavePrivateAlbumSettings}
              onSavePrivateAlbumItem={onSavePrivateAlbumItem}
              onDeletePrivateAlbumItem={onDeletePrivateAlbumItem}
              onToggleMediaVisibility={onToggleMediaVisibility}
            />
          </div>
        )}

        {section === 'whatsapp_invite' &&
          onCreateWhatsappInvite &&
          onDeleteWhatsappInvite && (
            <WhatsappInvitePanel
              modelId={activeModelId}
              modelName={modelName}
              studioBrand={studioConfig?.studioBrand || 'Model Gat Brasil'}
              studioConfig={studioConfig}
              galleryItems={galleryItems}
              privateAlbumItems={privateAlbumItems}
              callPlans={callPlans}
              allProfiles={allProfiles}
              peers={peers}
              whatsappInvites={whatsappInvites}
              onUploadImage={onUploadImage}
              onSaveStudioConfig={onSaveStudioConfig}
              onCreateWhatsappInvite={onCreateWhatsappInvite}
              onDeleteWhatsappInvite={onDeleteWhatsappInvite}
            />
          )}

        {section === 'account' && (
          <div className="space-y-6">
            <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#86EFAC]">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Acesso 100% Privativo e Isolado</span>
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                    Minha Conta, Login e Senha Privativa
                  </h2>
                  <p className="text-sm text-[#C9BAC4] max-w-2xl">
                    Somente você, com seu login e sua senha específicos, acessa este painel administrativo. Nenhuma outra pessoa ou modelo tem permissão para visualizar ou editar suas configurações.
                  </p>
                </div>

                <div className="px-4 py-3 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/20 shrink-0 space-y-0.5">
                  <p className="text-[11px] text-[#938291]">Login atual</p>
                  <p className="text-xs font-mono text-[#FAF4F7]">
                    {modelAccount?.loginUsername || activeModelId}
                  </p>
                </div>
              </div>
            </section>

            <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-5">
              <div className="space-y-1">
                <h3 className="font-display text-xl font-semibold text-[#FAF4F7]">
                  Cor Visual do Seu Painel Particular
                </h3>
                <p className="text-xs text-[#C9BAC4]">
                  Personalize o tema de cores exclusivo da sua área administrativa ({currentTheme.label}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {ADMIN_MODEL_THEMES.map((theme) => {
                  const isCurrent = theme.id === currentTheme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      aria-pressed={isCurrent}
                      onClick={() => {
                        if (!onUpdateMyModelAccount) return;
                        setAccountErrorMsg(null);
                        setAccountSuccessMsg(null);
                        void onUpdateMyModelAccount({
                          adminThemeColor: theme.id,
                        }).then((res) => {
                          if (res.ok) {
                            setAccountSuccessMsg(
                              `Cor do painel atualizada para ${theme.label}.`
                            );
                          } else {
                            setAccountErrorMsg(
                              res.error || 'Não foi possível alterar a cor.'
                            );
                          }
                        });
                      }}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#21142D] text-[#FAF4F7] font-semibold border-[#F4C2D7]'
                          : 'bg-[#0B060F]/80 border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/25"
                        style={{ backgroundColor: theme.swatchHex }}
                      />
                      <span>{theme.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <form
              onSubmit={(e) => void handleSaveOwnAccountCredentials(e)}
              className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-5"
            >
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#F4C2D7]/15">
                <Lock className="w-4 h-4 text-[#F4C2D7]" />
                <div>
                  <h3 className="text-sm font-semibold text-[#FAF4F7]">
                    Alterar Login Específico e Senha de Acesso
                  </h3>
                  <p className="text-xs text-[#C9BAC4]">
                    Para proteger seu painel, confirme sua senha atual antes de salvar qualquer alteração.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <label
                    htmlFor="own-account-login"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Seu Login ou E-mail Privativo
                  </label>
                  <input
                    id="own-account-login"
                    type="text"
                    required
                    minLength={3}
                    maxLength={120}
                    value={accountLoginDraft}
                    onChange={(e) => setAccountLoginDraft(e.target.value)}
                    placeholder="Ex.: seunome@modelgat.local"
                    className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label
                    htmlFor="own-account-current-pass"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Senha Atual (Obrigatória para confirmar)
                  </label>
                  <div className="relative">
                    <input
                      id="own-account-current-pass"
                      type={showCurrentPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={currentPasswordDraft}
                      onChange={(e) => setCurrentPasswordDraft(e.target.value)}
                      placeholder="Digite sua senha atual"
                      className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl pl-4 pr-11 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword((p) => !p)}
                      aria-label={
                        showCurrentPassword
                          ? 'Ocultar senha atual'
                          : 'Mostrar senha atual'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="own-account-new-pass"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Nova Senha (opcional, mín. 6 caracteres)
                  </label>
                  <div className="relative">
                    <input
                      id="own-account-new-pass"
                      type={showNewPassword ? 'text' : 'password'}
                      minLength={6}
                      maxLength={120}
                      autoComplete="new-password"
                      value={newPasswordDraft}
                      onChange={(e) => setNewPasswordDraft(e.target.value)}
                      placeholder="Deixe vazio para manter a atual"
                      className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl pl-4 pr-11 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((p) => !p)}
                      aria-label={
                        showNewPassword
                          ? 'Ocultar nova senha'
                          : 'Mostrar nova senha'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="own-account-confirm-pass"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Confirmar Nova Senha
                  </label>
                  <input
                    id="own-account-confirm-pass"
                    type={showNewPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPasswordDraft}
                    onChange={(e) => setConfirmPasswordDraft(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-4 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
              </div>

              {accountErrorMsg && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
                >
                  {accountErrorMsg}
                </div>
              )}

              {accountSuccessMsg && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{accountSuccessMsg}</span>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingAccount
                      ? 'Salvando credenciais...'
                      : 'Salvar Login e Senha'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};
