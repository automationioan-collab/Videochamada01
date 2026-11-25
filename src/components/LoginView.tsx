import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Camera,
  Check,
  CreditCard,
  Image as ImageIcon,
  Lock,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Video,
} from 'lucide-react';
import {
  DEFAULT_GALLERY_ITEMS,
  DEFAULT_STUDIO_CONFIG,
} from '../lib/studioDefaults';
import type {
  CallPlan,
  GalleryItemRecord,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
  PublicModelSummary,
  PublicRatingRecord,
  StudioConfig,
  StudioState,
} from '../types/studio';
import { GaleriaModelo } from './GaleriaModelo';
import { ModelProfileBioSection } from './ModelProfileBioSection';
import { PrivateAlbumViewer } from './PrivateAlbumViewer';
import { PublicModelScheduleCard } from './PublicModelScheduleCard';
import { TechOrbitHalo, TechSpotlightCard } from './TechEffects';
import { TipGoalProgressCard } from './TipGoalProgressCard';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

type PublicViewMode = 'directory' | 'profile';
type DirectoryFilter = 'all' | 'online' | 'live' | 'private_album';
type ProfileSectionTab =
  | 'all'
  | 'bio_schedule'
  | 'gallery'
  | 'private_album'
  | 'plans'
  | 'ratings';

interface LoginViewProps {
  studioConfig?: StudioConfig | null;
  studioState?: StudioState | null;
  galleryItems?: GalleryItemRecord[];
  callPlans?: CallPlan[];
  publicModels?: PublicModelSummary[];
  publicRatings?: PublicRatingRecord[];
  publicShowcaseLoading?: boolean;
  selectedModelId?: string;
  onSelectModel?: (modelId: string) => void;
  privateAlbumSummary?: PrivateAlbumSummary | null;
  onUnlockPrivateAlbum?: (
    modelId: string,
    password: string
  ) => Promise<{
    ok: boolean;
    albumToken?: string;
    items?: PrivateAlbumItemRecord[];
    summary?: PrivateAlbumSummary;
    error?: string;
  }>;
  onRequirePrivateAlbumAuth?: () => void;
  onEnterVideoCall: () => void;
  onEnterPrivateCall: () => void;
  onNavigateToAdmin?: () => void;
  authError: string | null;
}

interface PublicStudioStatus {
  modelOnline: boolean;
  modelInRoom: boolean;
  roomParticipantCount: number;
  activePeersCount: number;
  tipGoal?: {
    enabled: boolean;
    title: string;
    description?: string;
    targetCents: number;
    currentCents: number;
    rewardText?: string;
    contributorsCount?: number;
    lastTipName?: string;
    lastTipAmountCents?: number;
    updatedAt?: number;
  } | null;
}

function hasExplicitModelQueryParam(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(new URLSearchParams(window.location.search).get('modelo'));
  } catch {
    return false;
  }
}

export const LoginView: React.FC<LoginViewProps> = ({
  studioConfig,
  studioState = null,
  galleryItems,
  callPlans = [],
  publicModels = [],
  publicRatings = [],
  publicShowcaseLoading = false,
  selectedModelId,
  onSelectModel,
  privateAlbumSummary = null,
  onUnlockPrivateAlbum,
  onRequirePrivateAlbumAuth,
  onEnterVideoCall,
  onEnterPrivateCall,
  onNavigateToAdmin,
  authError,
}) => {
  const [viewMode, setViewMode] = useState<PublicViewMode>(() =>
    hasExplicitModelQueryParam() ? 'profile' : 'directory'
  );
  const [directoryFilter, setDirectoryFilter] =
    useState<DirectoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [profileSectionTab, setProfileSectionTab] =
    useState<ProfileSectionTab>('all');

  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [loungeImgFailed, setLoungeImgFailed] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);
  const [directoryHeroImgFailed, setDirectoryHeroImgFailed] = useState(false);
  const [directoryLoungeImgFailed, setDirectoryLoungeImgFailed] =
    useState(false);
  const [publicStatus, setPublicStatus] = useState<PublicStudioStatus | null>(
    null
  );

  const selectedModelSummary = useMemo(
    () => publicModels.find((m) => m.id === selectedModelId) || null,
    [publicModels, selectedModelId]
  );

  const featuredDirectoryModel = useMemo(
    () =>
      publicModels.find((m) => m.modelOnline) ||
      publicModels.find((m) => m.isLive) ||
      publicModels[0] ||
      null,
    [publicModels]
  );

  const isPrimaryModel =
    !selectedModelId || selectedModelId === 'lorena_noir';

  const cfg = studioConfig || DEFAULT_STUDIO_CONFIG;
  const studioBrand =
    studioConfig?.studioBrand ||
    selectedModelSummary?.studioBrand ||
    DEFAULT_STUDIO_CONFIG.studioBrand;
  const modelName =
    studioConfig?.modelName ||
    selectedModelSummary?.displayName ||
    DEFAULT_STUDIO_CONFIG.modelName;
  const heroTitle =
    studioConfig?.heroTitle ||
    (isPrimaryModel
      ? DEFAULT_STUDIO_CONFIG.heroTitle
      : `Atendimento Exclusivo com ${modelName}`);
  const heroSubtitle =
    studioConfig?.heroSubtitle ||
    selectedModelSummary?.headline ||
    DEFAULT_STUDIO_CONFIG.heroSubtitle;
  const groupButtonLabel =
    studioConfig?.groupButtonLabel || DEFAULT_STUDIO_CONFIG.groupButtonLabel;
  const privateButtonLabel =
    studioConfig?.privateButtonLabel ||
    DEFAULT_STUDIO_CONFIG.privateButtonLabel;
  const heroImageUrl =
    studioConfig?.heroImageUrl ||
    selectedModelSummary?.heroImageUrl ||
    selectedModelSummary?.avatarUrl ||
    (isPrimaryModel ? DEFAULT_STUDIO_CONFIG.heroImageUrl : '');
  const loungeImageUrl =
    studioConfig?.loungeImageUrl ||
    heroImageUrl ||
    (isPrimaryModel ? DEFAULT_STUDIO_CONFIG.loungeImageUrl : '');
  const modelAvatarUrl =
    studioConfig?.modelAvatarUrl ||
    selectedModelSummary?.avatarUrl ||
    (isPrimaryModel ? DEFAULT_STUDIO_CONFIG.modelAvatarUrl : '');

  const directoryShowcaseImage =
    featuredDirectoryModel?.heroImageUrl ||
    featuredDirectoryModel?.avatarUrl ||
    DEFAULT_STUDIO_CONFIG.heroImageUrl;

  const syncUrlModelParam = (modelId: string | null) => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (modelId) {
        url.searchParams.set('modelo', modelId);
      } else {
        url.searchParams.delete('modelo');
      }
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    } catch {
      // Ignore history restrictions in sandboxed environments
    }
  };

  const handleOpenProfessionalProfile = (modelId: string) => {
    onSelectModel?.(modelId);
    setProfileSectionTab('all');
    setViewMode('profile');
    syncUrlModelParam(modelId);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBackToDirectory = () => {
    setViewMode('directory');
    syncUrlModelParam(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    setHeroImgFailed(false);
  }, [heroImageUrl, selectedModelId]);

  useEffect(() => {
    setLoungeImgFailed(false);
  }, [loungeImageUrl, selectedModelId]);

  useEffect(() => {
    setAvatarImgFailed(false);
  }, [modelAvatarUrl, selectedModelId]);

  useEffect(() => {
    setDirectoryHeroImgFailed(false);
  }, [directoryShowcaseImage]);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const query = selectedModelId
          ? `?modelId=${encodeURIComponent(selectedModelId)}`
          : '';
        const res = await fetch(`/api/studio/public-status${query}`);
        if (!res.ok) return;
        const json = (await res.json()) as PublicStudioStatus & { ok?: boolean };
        if (!cancelled && json.ok) {
          setPublicStatus({
            modelOnline: Boolean(json.modelOnline),
            modelInRoom: Boolean(json.modelInRoom),
            roomParticipantCount: Number(json.roomParticipantCount || 0),
            activePeersCount: Number(json.activePeersCount || 0),
            tipGoal: json.tipGoal ?? null,
          });
        }
      } catch {
        // Ignore transient fetch errors on public landing
      }
    };

    void loadStatus();
    const intervalMs = viewMode === 'profile' ? 5000 : 15000;
    const timer = window.setInterval(() => void loadStatus(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedModelId, viewMode]);

  const liveStudioState = useMemo<StudioState | null>(() => {
    if (!publicStatus?.tipGoal) return studioState;
    const base: StudioState = studioState ?? {
      modelUid: selectedModelId || 'lorena_noir',
      modelName,
      isLive: true,
      callMode: 'open',
      headline: '',
      updatedAt: Timestamp.fromMillis(
        publicStatus.tipGoal.updatedAt || Date.now()
      ),
    };
    return {
      ...base,
      tipGoalEnabled: Boolean(publicStatus.tipGoal.enabled),
      tipGoalTitle: publicStatus.tipGoal.title,
      tipGoalDescription:
        publicStatus.tipGoal.description ?? studioState?.tipGoalDescription ?? '',
      tipGoalTargetCents: publicStatus.tipGoal.targetCents,
      tipGoalCurrentCents: publicStatus.tipGoal.currentCents,
      tipGoalRewardText: publicStatus.tipGoal.rewardText || '',
      tipGoalContributorsCount: publicStatus.tipGoal.contributorsCount || 0,
      tipGoalLastTipName: publicStatus.tipGoal.lastTipName || '',
      tipGoalLastTipAmountCents: publicStatus.tipGoal.lastTipAmountCents || 0,
    };
  }, [modelName, publicStatus?.tipGoal, selectedModelId, studioState]);

  const roomCount = publicStatus?.roomParticipantCount ?? 0;

  const heroHeadingParts = useMemo(() => {
    const trimmed = heroTitle.trim();
    const words = trimmed.split(/\s+/);
    if (words.length <= 2) {
      return { lead: '', accent: trimmed };
    }
    const accent = words.slice(-2).join(' ');
    const lead = words.slice(0, -2).join(' ');
    return { lead, accent };
  }, [heroTitle]);

  const highlightGalleryCards = useMemo(() => {
    const activeCustom = (galleryItems || []).filter(
      (item) =>
        item.active &&
        (!item.approvalStatus || item.approvalStatus === 'approved')
    );
    if (activeCustom.length > 0) {
      return activeCustom.slice(0, 4);
    }
    if (studioConfig || !isPrimaryModel) {
      return [];
    }
    return DEFAULT_GALLERY_ITEMS.slice(0, 4);
  }, [galleryItems, isPrimaryModel, studioConfig]);

  const activeShowcasePlans = useMemo(
    () =>
      [...callPlans]
        .filter((p) => p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [callPlans]
  );

  const selectedModelRateCents = cfg.ratePerMinuteCents || 1500;

  const ratingStats = useMemo(() => {
    if (publicRatings.length > 0) {
      const sum = publicRatings.reduce((acc, r) => acc + r.rating, 0);
      return {
        average: Number((sum / publicRatings.length).toFixed(1)),
        count: publicRatings.length,
      };
    }
    return {
      average: selectedModelSummary?.ratingAverage ?? null,
      count: selectedModelSummary?.ratingCount ?? 0,
    };
  }, [publicRatings, selectedModelSummary]);

  const directoryStats = useMemo(() => {
    const onlineCount = publicModels.filter((m) => m.modelOnline).length;
    const liveRoomsCount = publicModels.filter(
      (m) => m.isLive || m.modelOnline
    ).length;
    const privateAlbumsCount = publicModels.filter(
      (m) =>
        Boolean(m.privateAlbumSummary?.enabled) &&
        (m.privateAlbumSummary?.itemCount ?? 0) > 0
    ).length;
    const startingPrices = publicModels
      .map(
        (m) =>
          m.minPlanPriceCents ||
          (m.ratePerMinuteCents ? m.ratePerMinuteCents * 10 : 8900)
      )
      .filter((v) => Number.isFinite(v) && v > 0);
    const lowestPlanCents =
      startingPrices.length > 0 ? Math.min(...startingPrices) : 8900;

    return {
      totalCount: publicModels.length,
      onlineCount,
      liveRoomsCount,
      privateAlbumsCount,
      lowestPlanCents,
    };
  }, [publicModels]);

  const filteredDirectoryModels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return publicModels.filter((model) => {
      if (directoryFilter === 'online' && !model.modelOnline) return false;
      if (directoryFilter === 'live' && !model.isLive && !model.modelOnline) {
        return false;
      }
      if (
        directoryFilter === 'private_album' &&
        !(
          model.privateAlbumSummary?.enabled &&
          model.privateAlbumSummary.itemCount > 0
        )
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        model.displayName,
        model.studioBrand,
        model.headline,
        model.bio,
        model.basicInfo?.specialty,
        model.basicInfo?.location,
        model.basicInfo?.languages,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [directoryFilter, publicModels, searchQuery]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const showSection = (target: Exclude<ProfileSectionTab, 'all'>) =>
    profileSectionTab === 'all' || profileSectionTab === target;

  return (
    <div className="relative z-10 flex-1 flex flex-col">
      {viewMode === 'directory' ? (
        <main className="max-w-[1440px] w-full mx-auto px-6 pt-6 pb-16 lg:pt-10 space-y-12">
          {/* 1. Split Cosmic Hero Showcase + Floating Live HUD */}
          <motion.section
            id="profissionais"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-0"
          >
            <TechSpotlightCard className="rounded-3xl overflow-hidden border border-[#818CF8]/25 luxury-glass-rim">
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(680px_440px_at_78%_28%,rgba(56,189,248,0.16),transparent_65%),radial-gradient(560px_400px_at_12%_82%,rgba(124,58,237,0.22),transparent_70%)]"
              />
              <div
                aria-hidden="true"
                className="tech-ambient-layer tech-beam-pulse absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/75 to-transparent pointer-events-none"
              />

              <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch p-7 sm:p-10 lg:p-12 pb-12 lg:pb-14">
                {/* Left Column: High-Impact Headline + Dual CTAs */}
                <div className="lg:col-span-6 flex flex-col justify-between space-y-8 z-10">
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 text-[11px] font-medium tracking-[0.18em] uppercase text-[#A5B4FC]">
                      <span
                        aria-hidden="true"
                        className="h-px w-8 bg-[#38BDF8]/55 shrink-0"
                      />
                      <span className="truncate font-mono tabular-nums">
                        {studioBrand} · Catálogo Individual ao Vivo HD
                      </span>
                    </div>

                    <h1 className="font-display text-4xl sm:text-5xl lg:text-[58px] font-bold leading-[1.03] text-[#F8FAFC] [text-wrap:balance]">
                      Experiências Privativas{' '}
                      <span className="neo-gradient-text font-bold">
                        ao Vivo Sob Medida.
                      </span>
                    </h1>

                    <p className="text-base text-[#B6C2E2] leading-relaxed max-w-xl">
                      Selecione o profissional que deseja para ver tudo
                      separadamente: biografia completa, agenda de horários e
                      pausas, galeria pública, álbum privativo, planos de chamada
                      e avaliações verificadas.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3.5">
                      <button
                        type="button"
                        onClick={() => scrollToSection('catalogo-profissionais')}
                        className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-full neo-light-cta whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                      >
                        <span>Explorar Profissionais</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (featuredDirectoryModel) {
                            onSelectModel?.(featuredDirectoryModel.id);
                          }
                          onEnterPrivateCall();
                        }}
                        className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-full bg-[#0D1330]/85 border border-[#818CF8]/35 text-[#F8FAFC] hover:bg-[#161F49] hover:border-[#38BDF8]/65 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                      >
                        <Lock className="w-4 h-4 text-[#38BDF8] shrink-0" />
                        <span>Entrar na Sala Privativa</span>
                      </button>
                    </div>

                    {authError && (
                      <div
                        role="alert"
                        className="p-3.5 rounded-xl bg-red-950/45 border border-red-500/40 text-xs text-red-200"
                      >
                        {authError}
                      </div>
                    )}

                    <p className="text-xs text-[#94A3B8] font-mono tabular-nums">
                      {directoryStats.totalCount} profissionais cadastrados ·{' '}
                      {directoryStats.onlineCount} online agora · PIX e Cartão
                      instantâneos
                    </p>
                  </div>
                </div>

                {/* Right Column: Luminous Frame + Translucent Live HUD Card */}
                <div className="lg:col-span-6 relative flex items-center justify-center min-h-[340px] lg:min-h-[430px]">
                  <TechOrbitHalo className="hidden sm:flex absolute inset-0" />

                  <div className="relative tech-reticle w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-[#818CF8]/35 bg-[#0A0F24] shadow-[0_0_55px_-14px_rgba(56,189,248,0.28)] group">
                    {!directoryHeroImgFailed && directoryShowcaseImage ? (
                      <img
                        src={directoryShowcaseImage}
                        alt={
                          featuredDirectoryModel
                            ? `Estúdio ao vivo de ${featuredDirectoryModel.displayName}`
                            : 'Ambiente ao vivo Maison Aura'
                        }
                        referrerPolicy="no-referrer"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        onError={() => setDirectoryHeroImgFailed(true)}
                        className="w-full h-full object-cover lg:absolute lg:inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#131C42] to-[#060816] p-12">
                        <Video className="w-12 h-12 text-[#38BDF8]/70" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/25 to-[#060816]/25 pointer-events-none" />

                    {/* Top-Right Floating Live Studio HUD Card (Inspired by Ref 2) */}
                    <div className="hidden sm:block absolute top-4 right-4 w-56 rounded-2xl bg-[#0B1028]/78 backdrop-blur-xl border border-[#38BDF8]/35 p-3.5 shadow-[0_16px_38px_-14px_rgba(2,6,23,0.9)] z-10">
                      <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#818CF8]/20">
                        <span className="w-8 h-8 rounded-xl neo-icon-badge inline-flex items-center justify-center shrink-0">
                          <Radio className="w-4 h-4 text-[#38BDF8]" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#F8FAFC] truncate">
                            Estúdio Conectado
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-[#38BDF8] truncate">
                            {directoryStats.onlineCount > 0
                              ? `${directoryStats.onlineCount} online agora`
                              : 'Transmissão HD'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2.5 space-y-2 text-[11px]">
                        <div className="flex items-center justify-between gap-2 text-[#B6C2E2]">
                          <span>Perfis Ativos</span>
                          <span className="font-mono font-semibold tabular-nums text-[#F8FAFC]">
                            {directoryStats.totalCount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[#B6C2E2]">
                          <span>Salas Abertas</span>
                          <span className="font-mono font-semibold tabular-nums text-[#F8FAFC]">
                            {directoryStats.liveRoomsCount}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[#B6C2E2]">
                          <span>Álbuns Privativos</span>
                          <span className="font-mono font-semibold tabular-nums text-[#C4B5FD]">
                            {directoryStats.privateAlbumsCount}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Spotlight Action Bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <p className="text-[11px] font-mono text-[#38BDF8]">
                          {featuredDirectoryModel?.modelOnline
                            ? 'Destaque Online Agora'
                            : 'Destaque do Estúdio'}
                        </p>
                        <p className="font-display text-2xl font-bold text-[#F8FAFC] truncate">
                          {featuredDirectoryModel?.displayName || modelName}
                        </p>
                      </div>

                      {featuredDirectoryModel && (
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenProfessionalProfile(
                              featuredDirectoryModel.id
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>Abrir Perfil</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </TechSpotlightCard>

            {/* Floating High-Contrast Search & Filter Dock (Inspired by Ref 1) */}
            <div className="relative z-20 -mt-7 mx-auto max-w-5xl px-3 sm:px-6">
              <div className="rounded-3xl lg:rounded-full bg-[#0C122D]/95 backdrop-blur-2xl border border-[#818CF8]/35 p-2 shadow-[0_24px_50px_-14px_rgba(2,6,23,0.92),0_0_32px_-12px_rgba(56,189,248,0.28)] flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
                <div className="relative flex-1 bg-[#F8FAFC] rounded-full flex items-center px-4 py-2.5 shadow-inner">
                  <Search className="w-4 h-4 text-[#475569] shrink-0 mr-2.5 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por nome, especialidade, idioma ou cidade..."
                    aria-label="Buscar profissional"
                    className="w-full bg-transparent text-xs sm:text-sm font-medium text-[#090C1F] placeholder:text-[#64748B] focus:outline-none"
                  />
                </div>

                <div
                  role="tablist"
                  aria-label="Filtrar profissionais"
                  className="flex items-center gap-1 p-1 bg-[#080C1F] border border-[#818CF8]/20 rounded-full overflow-x-auto"
                >
                  {(
                    [
                      { id: 'all', label: 'Todos' },
                      { id: 'online', label: 'Online Agora' },
                      { id: 'live', label: 'Sala Aberta' },
                      { id: 'private_album', label: 'Álbum Privativo' },
                    ] as const
                  ).map((tab) => {
                    const active = directoryFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setDirectoryFilter(tab.id)}
                        className={`px-3.5 py-2 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'luxury-rose-cta font-semibold'
                            : 'text-[#B6C2E2] hover:text-[#F8FAFC]'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>

          {/* 2. 4-Column Frosted Glass KPI Strip (Inspired by Ref 1 & Ref 2) */}
          <section
            aria-label="Indicadores reais do estúdio"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
          >
            <div className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-[#A5B4FC]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-2xl font-bold tabular-nums text-[#F8FAFC]">
                  {directoryStats.totalCount}
                </p>
                <p className="text-xs font-semibold text-[#E2E8F0]">
                  Profissionais Ativos
                </p>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  Perfis individuais no catálogo
                </p>
              </div>
            </div>

            <div className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                <Video className="w-5 h-5 text-[#38BDF8]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-2xl font-bold tabular-nums text-[#38BDF8]">
                  {directoryStats.onlineCount}
                </p>
                <p className="text-xs font-semibold text-[#E2E8F0]">
                  Online Agora
                </p>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  Prontas para chamada ao vivo
                </p>
              </div>
            </div>

            <div className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5 text-[#C4B5FD]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-2xl font-bold tabular-nums text-[#C4B5FD]">
                  {directoryStats.privateAlbumsCount}
                </p>
                <p className="text-xs font-semibold text-[#E2E8F0]">
                  Álbuns Privativos
                </p>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  Fotos e vídeos protegidos
                </p>
              </div>
            </div>

            <div className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5 text-[#A5B4FC]" />
              </div>
              <div className="min-w-0">
                <p className="font-mono text-2xl font-bold tabular-nums text-[#F8FAFC]">
                  {BRL_FORMATTER.format(directoryStats.lowestPlanCents / 100)}
                </p>
                <p className="text-xs font-semibold text-[#E2E8F0]">
                  Planos a Partir de
                </p>
                <p className="text-[11px] text-[#94A3B8] truncate">
                  Liberação imediata via PIX ou Cartão
                </p>
              </div>
            </div>
          </section>

          {/* 3. Featured Professional Showcase Cards Grid (Ref 2 Card Precision) */}
          <section
            id="catalogo-profissionais"
            aria-label="Lista de profissionais disponíveis"
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-[0.16em] uppercase text-[#38BDF8]">
                  Vitrine Individual · Perfis Verificados
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#F8FAFC] [text-wrap:balance]">
                  Profissionais em{' '}
                  <span className="neo-gradient-text">Destaque</span>
                </h2>
              </div>

              <p className="text-xs font-mono tabular-nums text-[#B6C2E2]">
                Exibindo {filteredDirectoryModels.length} de{' '}
                {publicModels.length} profissionais
              </p>
            </div>

            {filteredDirectoryModels.length === 0 ? (
              <div className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-12 text-center space-y-3">
                <Users className="w-9 h-9 text-[#A5B4FC]/70 mx-auto" />
                <h3 className="font-display text-2xl font-semibold text-[#F8FAFC]">
                  Nenhum profissional encontrado com esse filtro
                </h3>
                <p className="text-xs text-[#B6C2E2]">
                  Limpe a busca ou troque o filtro para visualizar todos os
                  profissionais disponíveis no estúdio.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setDirectoryFilter('all');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Mostrar Todos os Profissionais
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredDirectoryModels.map((model) => {
                  const previewImage = model.heroImageUrl || model.avatarUrl;
                  const minPrice =
                    model.minPlanPriceCents ||
                    model.ratePerMinuteCents * 10 ||
                    8900;
                  const privCount = model.privateAlbumSummary?.enabled
                    ? model.privateAlbumSummary.itemCount
                    : 0;
                  const privPrice =
                    model.privateAlbumSummary?.priceCents || 3900;
                  const firstName =
                    model.displayName.trim().split(/\s+/)[0] ||
                    model.displayName;
                  const metaParts = [
                    model.basicInfo?.location,
                    model.basicInfo?.languages,
                    model.basicInfo?.specialty,
                  ].filter(Boolean);

                  return (
                    <TechSpotlightCard
                      key={model.id}
                      enableHoverLift
                      className="rounded-2xl border border-[#818CF8]/25 luxury-glass-rim overflow-hidden flex flex-col justify-between"
                    >
                      <div>
                        {/* Card Portrait Stage */}
                        <div className="relative aspect-[4/3] bg-[#0A0F24] overflow-hidden border-b border-[#818CF8]/20">
                          {previewImage ? (
                            <img
                              src={previewImage}
                              alt={`Perfil de ${model.displayName}`}
                              referrerPolicy="no-referrer"
                              draggable={false}
                              onContextMenu={(e) => e.preventDefault()}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#131C42] to-[#060816]">
                              <Camera className="w-10 h-10 text-[#A5B4FC]/60" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/25 to-transparent pointer-events-none" />

                          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              {model.avatarUrl ? (
                                <img
                                  src={model.avatarUrl}
                                  alt={model.displayName}
                                  referrerPolicy="no-referrer"
                                  draggable={false}
                                  className="w-11 h-11 rounded-full object-cover border border-[#38BDF8]/55 shrink-0 bg-[#0B1026]"
                                />
                              ) : (
                                <div className="w-11 h-11 rounded-full bg-[#131C42] border border-[#818CF8]/50 flex items-center justify-center font-display text-lg font-bold text-[#A5B4FC] shrink-0">
                                  {model.displayName.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0">
                                <h3 className="font-display text-2xl font-bold text-[#F8FAFC] truncate">
                                  {model.displayName}
                                </h3>
                                <p className="text-[11px] text-[#B6C2E2] truncate">
                                  {model.studioBrand}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                                model.modelOnline
                                  ? 'text-[#38BDF8]'
                                  : model.isLive
                                    ? 'text-[#C4B5FD]'
                                    : 'text-[#94A3B8]'
                              }`}
                            >
                              {model.modelOnline
                                ? 'Online agora'
                                : model.isLive
                                  ? 'Sala aberta'
                                  : 'Em descanso'}
                            </span>
                          </div>
                        </div>

                        {/* Card Body Details */}
                        <div className="p-5 space-y-4">
                          <p className="text-xs text-[#E2E8F0]/90 line-clamp-2 min-h-[2.25rem]">
                            {model.bio || model.headline}
                          </p>

                          {metaParts.length > 0 && (
                            <p className="text-[11px] text-[#94A3B8] truncate">
                              {metaParts.join(' · ')}
                            </p>
                          )}

                          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#818CF8]/15 text-xs">
                            <div>
                              <p className="text-[10px] text-[#94A3B8]">
                                Planos desde
                              </p>
                              <p className="font-mono font-semibold tabular-nums text-[#F8FAFC]">
                                {BRL_FORMATTER.format(minPrice / 100)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#94A3B8]">
                                Valor / min
                              </p>
                              <p className="font-mono font-semibold tabular-nums text-[#38BDF8]">
                                {BRL_FORMATTER.format(
                                  model.ratePerMinuteCents / 100
                                )}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#94A3B8]">
                                Avaliação
                              </p>
                              <p className="font-mono font-semibold tabular-nums text-[#F8FAFC]">
                                {model.ratingAverage
                                  ? `${model.ratingAverage.toFixed(1)} ★ (${model.ratingCount})`
                                  : 'Novo perfil'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#B6C2E2]">
                            <span>
                              {model.publicGalleryCount ?? 0} mídias públicas
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {privCount > 0
                                ? `Álbum Privativo: ${privCount} (${BRL_FORMATTER.format(
                                    privPrice / 100
                                  )})`
                                : 'Sem álbum privativo'}
                            </span>
                          </div>

                          {model.tipGoal?.enabled && (
                            <div className="rounded-xl bg-[#070B1E]/85 border border-[#818CF8]/25 p-3 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="font-medium text-[#C4B5FD] truncate">
                                  Meta: {model.tipGoal.title}
                                </span>
                                <span className="font-mono font-semibold tabular-nums text-[#F8FAFC] shrink-0">
                                  {Math.min(
                                    100,
                                    Math.round(
                                      (model.tipGoal.currentCents /
                                        Math.max(
                                          500,
                                          model.tipGoal.targetCents
                                        )) *
                                        100
                                    )
                                  )}
                                  %
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-[#131C42] overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] via-[#6366F1] to-[#38BDF8]"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.round(
                                        (model.tipGoal.currentCents /
                                          Math.max(
                                            500,
                                            model.tipGoal.targetCents
                                          )) *
                                          100
                                      )
                                    )}%`,
                                  }}
                                />
                              </div>
                              {model.tipGoal.description && (
                                <p className="text-[11px] text-[#94A3B8] line-clamp-1">
                                  {model.tipGoal.description}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="px-5 pb-5 pt-2 flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleOpenProfessionalProfile(model.id)}
                          className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <span>Ver Perfil de {firstName}</span>
                          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onSelectModel?.(model.id);
                            onEnterVideoCall();
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium rounded-full bg-[#0D1330] border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Video className="w-3.5 h-3.5 text-[#38BDF8]" />
                          <span>Entrar</span>
                        </button>
                      </div>
                    </TechSpotlightCard>
                  );
                })}
              </div>
            )}
          </section>

          {/* 4. Asymmetric Showcase & Feature Stack (Inspired by Ref 2 "Why Choose Us" + Ref 1 "What We Do") */}
          <section
            aria-label="Diferenciais do estúdio"
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
          >
            <TechSpotlightCard
              enableHoverLift
              className="lg:col-span-6 relative rounded-3xl overflow-hidden border border-[#818CF8]/25 luxury-glass-rim min-h-[340px] flex flex-col justify-end"
            >
              {!directoryLoungeImgFailed ? (
                <img
                  src={DEFAULT_STUDIO_CONFIG.loungeImageUrl}
                  alt="Sala privativa de atendimento Maison Aura"
                  referrerPolicy="no-referrer"
                  draggable={false}
                  onError={() => setDirectoryLoungeImgFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#131C42] to-[#060816]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/65 to-[#060816]/20 pointer-events-none" />

              <div className="relative p-7 sm:p-9 space-y-4 z-10">
                <p className="text-xs font-medium tracking-[0.16em] uppercase text-[#38BDF8]">
                  Estrutura Privada em Alta Definição
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#F8FAFC] [text-wrap:balance]">
                  Mais que Videochamada,{' '}
                  <span className="neo-gradient-text">
                    Conexão Exclusiva ao Vivo.
                  </span>
                </h2>
                <p className="text-sm text-[#B6C2E2] leading-relaxed max-w-lg">
                  Cada profissional mantém sua própria vitrine com horários reais,
                  metas interativas, galerias públicas aprovadas e acervo
                  privativo protegido.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (featuredDirectoryModel) {
                        onSelectModel?.(featuredDirectoryModel.id);
                      }
                      onEnterVideoCall();
                    }}
                    className="inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold rounded-full luxury-rose-cta whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Video className="w-3.5 h-3.5 shrink-0" />
                    <span>Entrar na Videochamada</span>
                    <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                  </button>
                </div>
              </div>
            </TechSpotlightCard>

            <div className="lg:col-span-6 flex flex-col justify-between gap-4">
              {[
                {
                  icon: <Lock className="w-5 h-5 text-[#38BDF8]" />,
                  title: 'Sala 1-para-1 Exclusiva',
                  description:
                    'Converse com áudio e vídeo em sala fechada com duração escolhida e privacidade garantida.',
                },
                {
                  icon: <Users className="w-5 h-5 text-[#A5B4FC]" />,
                  title: 'Sala Compartilhada ao Vivo',
                  description:
                    'Participe da transmissão aberta do estúdio com interação em chat e envio de gorjetas em tempo real.',
                },
                {
                  icon: <Sparkles className="w-5 h-5 text-[#C4B5FD]" />,
                  title: 'Álbum Privativo com Liberação Direta',
                  description:
                    'Acesse fotos e vídeos exclusivos mediante pagamento único ou senha VIP fornecida pela profissional.',
                },
                {
                  icon: <ShieldCheck className="w-5 h-5 text-[#38BDF8]" />,
                  title: 'Checkout PIX e Cartão Transparente',
                  description:
                    'Escolha pacotes de minutos ou envie incentivos para a meta ao vivo sem cobranças ocultas.',
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="luxury-glass-rim border border-[#818CF8]/20 hover:border-[#38BDF8]/45 rounded-2xl p-5 flex items-start gap-4 transition-colors"
                >
                  <div className="w-11 h-11 rounded-full neo-icon-badge flex items-center justify-center shrink-0">
                    {feature.icon}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h3 className="font-display text-lg font-semibold text-[#F8FAFC]">
                      {feature.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#B6C2E2] leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 5. Luminous Twilight Horizon CTA Banner (Inspired by Ref 1 Bottom Banner) */}
          <section
            aria-label="Convite ao estúdio"
            className="relative overflow-hidden rounded-3xl border border-[#818CF8]/30 bg-gradient-to-br from-[#131A40] via-[#0B1028] to-[#070B1E] p-8 sm:p-12 shadow-[0_24px_60px_-24px_rgba(79,70,229,0.55)]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none bg-[radial-gradient(620px_320px_at_84%_22%,rgba(56,189,248,0.22),transparent_65%),radial-gradient(540px_300px_at_22%_88%,rgba(139,92,246,0.22),transparent_70%)]"
            />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="space-y-3 max-w-2xl">
                <p className="text-xs font-medium tracking-[0.16em] uppercase text-[#C4B5FD]">
                  Atendimento Personalizado
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#F8FAFC] [text-wrap:balance]">
                  Conecte-se ao Vivo com{' '}
                  <span className="neo-gradient-text">Total Privacidade.</span>
                </h2>
                <p className="text-sm text-[#B6C2E2] leading-relaxed">
                  Abra o perfil do profissional desejado para conferir agenda,
                  galeria pública, metas e valores antes de iniciar sua sessão.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => scrollToSection('catalogo-profissionais')}
                  className="inline-flex items-center gap-2 px-6 py-3 text-xs sm:text-sm font-semibold rounded-full neo-light-cta whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Escolher Profissional</span>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                </button>
                {onNavigateToAdmin && (
                  <button
                    type="button"
                    onClick={onNavigateToAdmin}
                    className="inline-flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold rounded-full bg-[#0D1330]/85 border border-[#818CF8]/35 text-[#F8FAFC] hover:border-[#38BDF8]/65 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Acesso da Modelo</span>
                  </button>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        <main className="max-w-[1440px] w-full mx-auto px-6 pt-6 pb-16 lg:pt-8 space-y-10">
          {/* Individual Professional Sticky Context & Switcher Bar */}
          <section
            aria-label="Navegação do profissional selecionado"
            className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-4 sm:p-5 space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleBackToDirectory}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full bg-[#0D1330] border border-[#818CF8]/35 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#38BDF8]" />
                  <span>Todos os Profissionais</span>
                </button>

                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xs text-[#94A3B8]">·</span>
                  <span className="text-xs font-medium text-[#F8FAFC] truncate">
                    Visualizando perfil exclusivo de{' '}
                    <strong className="text-[#38BDF8]">{modelName}</strong>
                  </span>
                  {publicShowcaseLoading && (
                    <span className="text-[11px] font-mono text-[#B6C2E2]">
                      Atualizando dados...
                    </span>
                  )}
                </div>
              </div>

              {publicModels.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
                  <span className="text-[11px] text-[#94A3B8] whitespace-nowrap shrink-0">
                    Trocar:
                  </span>
                  {publicModels.map((model) => {
                    const active = model.id === selectedModelId;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => handleOpenProfessionalProfile(model.id)}
                        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#161F49] border-[#38BDF8] text-[#F8FAFC]'
                            : 'bg-[#080C1F]/80 border-[#818CF8]/25 text-[#B6C2E2] hover:border-[#38BDF8]/55 hover:text-[#F8FAFC]'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            model.modelOnline
                              ? 'bg-[#38BDF8]'
                              : model.isLive
                                ? 'bg-[#C4B5FD]'
                                : 'bg-[#64748B]'
                          }`}
                        />
                        <span>{model.displayName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Section Focus Tabs for the Selected Professional */}
            <div
              role="tablist"
              aria-label={`Seções de ${modelName}`}
              className="flex items-center gap-1.5 p-1 bg-[#080C1F]/85 border border-[#818CF8]/20 rounded-full overflow-x-auto"
            >
              {(
                [
                  { id: 'all', label: 'Tudo Sobre o Profissional' },
                  { id: 'bio_schedule', label: 'Sobre & Agenda' },
                  { id: 'gallery', label: 'Galeria Pública' },
                  { id: 'private_album', label: 'Álbum Privativo' },
                  { id: 'plans', label: 'Planos & Preços' },
                  {
                    id: 'ratings',
                    label: `Avaliações (${ratingStats.count})`,
                  },
                ] as const
              ).map((tab) => {
                const active = profileSectionTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setProfileSectionTab(tab.id)}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'luxury-rose-cta font-semibold'
                        : 'text-[#B6C2E2] hover:text-[#F8FAFC]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* 1. Hero Exclusivo do Profissional Selecionado */}
          <motion.section
            id="estudio"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-8"
          >
            <TechSpotlightCard className="rounded-3xl overflow-hidden border border-[#818CF8]/25 luxury-glass-rim">
              <div
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none bg-[radial-gradient(680px_440px_at_76%_42%,rgba(56,189,248,0.16),transparent_68%),radial-gradient(520px_380px_at_12%_85%,rgba(124,58,237,0.2),transparent_70%)]"
              />
              <div
                aria-hidden="true"
                className="tech-ambient-layer tech-beam-pulse absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-[#38BDF8]/70 to-transparent pointer-events-none"
              />

              <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch p-7 sm:p-10 lg:p-12">
                <div className="lg:col-span-6 flex flex-col justify-between space-y-8 z-10">
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 text-[11px] font-medium tracking-[0.18em] uppercase text-[#A5B4FC]">
                      <span
                        aria-hidden="true"
                        className="h-px w-8 bg-[#38BDF8]/50 shrink-0"
                      />
                      <span className="truncate font-mono tabular-nums">
                        {studioBrand} ·{' '}
                        {roomCount > 0
                          ? `${roomCount} na videochamada agora`
                          : publicStatus?.modelOnline
                            ? `${modelName} Online Agora`
                            : 'Perfil Individual & Atendimento'}
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-px w-8 bg-[#38BDF8]/50 shrink-0"
                      />
                    </div>

                    <h1 className="font-display text-4xl sm:text-5xl lg:text-[56px] font-bold leading-[1.04] text-[#F8FAFC] [text-wrap:balance]">
                      {heroHeadingParts.lead ? `${heroHeadingParts.lead} ` : ''}
                      <span className="neo-gradient-text font-bold">
                        {heroHeadingParts.accent}
                      </span>
                    </h1>

                    <p className="text-base text-[#B6C2E2] leading-relaxed max-w-lg">
                      {heroSubtitle}
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3.5">
                      <button
                        type="button"
                        onClick={onEnterVideoCall}
                        className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F8FAFC]"
                      >
                        <Users className="w-4 h-4 shrink-0" />
                        <span>{groupButtonLabel}</span>
                        <ArrowRight className="w-4 h-4 shrink-0" />
                      </button>

                      <button
                        type="button"
                        onClick={onEnterPrivateCall}
                        className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-full bg-[#0D1330]/85 border border-[#818CF8]/35 text-[#F8FAFC] hover:bg-[#161F49] hover:border-[#38BDF8]/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                      >
                        <Lock className="w-4 h-4 text-[#38BDF8] shrink-0" />
                        <span>{privateButtonLabel}</span>
                      </button>
                    </div>

                    {authError && (
                      <div
                        role="alert"
                        className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
                      >
                        {authError}
                      </div>
                    )}

                    <p className="text-xs text-[#94A3B8] font-mono tabular-nums">
                      Valor base: {BRL_FORMATTER.format(selectedModelRateCents / 100)}
                      /min · {activeShowcasePlans.length} plano(s) ativo(s) ·{' '}
                      {roomCount === 0
                        ? `Atendimento exclusivo com ${modelName}`
                        : `${roomCount} participante(s) na sala agora`}
                    </p>
                  </div>
                </div>

                {/* Right Portrait Stage + Live HUD */}
                <div className="lg:col-span-6 relative flex items-center justify-center min-h-[340px] lg:min-h-[440px]">
                  <TechOrbitHalo className="hidden sm:flex absolute inset-0" />
                  <div className="relative tech-reticle w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-[#818CF8]/35 bg-[#0A0F24] shadow-[0_0_50px_-14px_rgba(56,189,248,0.28)] group">
                    {!heroImgFailed && heroImageUrl ? (
                      <img
                        src={heroImageUrl}
                        alt={`Profissional ${modelName}`}
                        referrerPolicy="no-referrer"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                        onError={() => setHeroImgFailed(true)}
                        className="w-full h-full object-cover lg:absolute lg:inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#131C42] to-[#060816] p-12">
                        <Video className="w-12 h-12 text-[#38BDF8]/65" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/25 to-transparent pointer-events-none" />

                    {/* Top-right Live Status HUD */}
                    <div className="hidden sm:block absolute top-4 right-4 w-52 rounded-2xl bg-[#0B1028]/80 backdrop-blur-xl border border-[#38BDF8]/35 p-3 shadow-[0_14px_34px_-12px_rgba(2,6,23,0.9)]">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg neo-icon-badge inline-flex items-center justify-center shrink-0">
                          <Radio className="w-3.5 h-3.5 text-[#38BDF8]" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-[#F8FAFC] truncate">
                            {publicStatus?.modelOnline
                              ? 'Online no Estúdio'
                              : 'Sala Configurada'}
                          </p>
                          <p className="text-[10px] font-mono tabular-nums text-[#38BDF8] truncate">
                            {roomCount > 0
                              ? `${roomCount} participante(s)`
                              : 'Vídeo HD 1080p'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-display text-2xl font-bold text-[#F8FAFC]">
                          {modelName}
                        </p>
                        <p className="text-xs text-[#B6C2E2] line-clamp-2 max-w-md">
                          {cfg.modelBio ||
                            selectedModelSummary?.bio ||
                            'Atendimento personalizado em vídeo HD.'}
                        </p>
                      </div>
                      <span className="text-xs font-mono tabular-nums text-[#38BDF8] whitespace-nowrap shrink-0">
                        {ratingStats.average
                          ? `${ratingStats.average.toFixed(1)} ★ (${ratingStats.count})`
                          : 'Vídeo HD · Áudio Estúdio'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="tech-ambient-layer tech-horizon-line opacity-65"
              />

              {/* Per-Model KPI Strip */}
              <div className="relative bg-[#070B1E]/90 grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#818CF8]/15">
                <div className="px-5 py-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                    <CreditCard className="w-4 h-4 text-[#38BDF8]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold tabular-nums text-[#F8FAFC] truncate">
                      {BRL_FORMATTER.format(selectedModelRateCents / 100)}/min
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">
                      Tarifa de {modelName}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                    <ImageIcon className="w-4 h-4 text-[#A5B4FC]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold tabular-nums text-[#F8FAFC] truncate">
                      {(galleryItems || []).length} mídias públicas
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">
                      Acesso livre
                    </p>
                  </div>
                </div>

                <div className="px-5 py-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-[#C4B5FD]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold tabular-nums text-[#F8FAFC] truncate">
                      {privateAlbumSummary?.enabled
                        ? `${privateAlbumSummary.itemCount} itens privados`
                        : 'Desativado'}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">
                      {privateAlbumSummary?.enabled
                        ? BRL_FORMATTER.format(
                            (privateAlbumSummary.priceCents || 3900) / 100
                          )
                        : 'Álbum privativo'}
                    </p>
                  </div>
                </div>

                <div className="px-5 py-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl neo-icon-badge flex items-center justify-center shrink-0">
                    <Star className="w-4 h-4 text-[#38BDF8]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono font-semibold tabular-nums text-[#F8FAFC] truncate">
                      {ratingStats.average
                        ? `${ratingStats.average.toFixed(1)} ★ (${ratingStats.count})`
                        : 'Sem notas ainda'}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">
                      Avaliações reais
                    </p>
                  </div>
                </div>
              </div>
            </TechSpotlightCard>
          </motion.section>

          {/* 2. Dual Bento Overview (only when viewing 'all') */}
          {profileSectionTab === 'all' && (
            <motion.section
              id="experiencias"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
            >
              <TechSpotlightCard
                enableHoverLift
                className="lg:col-span-6 rounded-2xl border border-[#818CF8]/25 luxury-glass-rim p-6 sm:p-8 flex flex-col justify-between gap-6"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                  <div className="sm:col-span-7 space-y-3">
                    <p className="text-xs font-medium text-[#38BDF8]">
                      Experiência Exclusiva · {modelName}
                    </p>
                    <h2 className="font-display text-3xl font-bold text-[#F8FAFC] [text-wrap:balance]">
                      Atendimento{' '}
                      <span className="neo-gradient-text">Privativo</span>{' '}
                      1-para-1
                    </h2>
                    <p className="text-xs sm:text-sm text-[#B6C2E2] leading-relaxed">
                      Converse em sala fechada com vídeo HD e chat exclusivo
                      somente entre você e {modelName}, escolhendo um dos planos
                      definidos por ela.
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={onEnterPrivateCall}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{privateButtonLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-5 flex items-center gap-3">
                    <div className="relative tech-reticle w-full aspect-[4/5] rounded-2xl overflow-hidden border border-[#818CF8]/30 bg-[#0A0F24]">
                      {!avatarImgFailed && modelAvatarUrl ? (
                        <img
                          src={modelAvatarUrl}
                          alt={modelName}
                          referrerPolicy="no-referrer"
                          draggable={false}
                          onContextMenu={(e) => e.preventDefault()}
                          onError={() => setAvatarImgFailed(true)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-8 h-8 text-[#A5B4FC]/60" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/85 via-transparent to-transparent pointer-events-none" />
                      <span className="absolute bottom-3 left-3 right-3 text-[11px] font-mono text-[#38BDF8] truncate">
                        Sessão 1-para-1 · {modelName}
                      </span>
                    </div>
                  </div>
                </div>
              </TechSpotlightCard>

              <TechSpotlightCard
                enableHoverLift
                className="lg:col-span-6 rounded-2xl border border-[#818CF8]/25 luxury-glass-rim p-6 sm:p-8 flex flex-col justify-between gap-5"
              >
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]">
                    Prévia Pública de {modelName}
                  </h2>
                  <button
                    type="button"
                    onClick={() => scrollToSection('galeria')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[#38BDF8] hover:text-[#F8FAFC] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Ver Galeria Completa</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {highlightGalleryCards.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {highlightGalleryCards.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => scrollToSection('galeria')}
                        className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-[#0A0F24] border border-[#818CF8]/25 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
                      >
                        {item.mediaType === 'video' ? (
                          <video
                            src={item.src}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                          />
                        ) : (
                          <img
                            src={item.src}
                            alt={item.alt || item.title}
                            referrerPolicy="no-referrer"
                            draggable={false}
                            onContextMenu={(e) => e.preventDefault()}
                            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/20 to-transparent pointer-events-none" />
                        <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-1.5">
                          <span className="text-[11px] font-medium text-[#F8FAFC] leading-tight line-clamp-2">
                            {item.title}
                          </span>
                          <span
                            aria-hidden="true"
                            className="w-6 h-6 rounded-full luxury-rose-cta flex items-center justify-center shrink-0"
                          >
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-[#818CF8]/20 bg-[#070B1E]/75 p-6 text-center space-y-1.5">
                    <Camera className="w-7 h-7 text-[#A5B4FC]/60" />
                    <p className="text-xs font-medium text-[#F8FAFC]">
                      Nenhuma mídia pública publicada ainda por {modelName}.
                    </p>
                  </div>
                )}
              </TechSpotlightCard>
            </motion.section>
          )}

          {/* 3. Model Profile Bio & Basic Info + Schedule */}
          {showSection('bio_schedule') && (
            <div className="space-y-8">
              <ModelProfileBioSection
                modelName={modelName}
                studioBrand={studioBrand}
                modelBio={cfg.modelBio || selectedModelSummary?.bio}
                basicInfo={cfg.basicInfo || selectedModelSummary?.basicInfo}
                avatarUrl={modelAvatarUrl}
              />

              <PublicModelScheduleCard
                modelName={modelName}
                studioState={liveStudioState}
                modelOnline={Boolean(publicStatus?.modelOnline)}
              />
            </div>
          )}

          {/* 4. Exclusive Public Gallery of This Professional */}
          {showSection('gallery') && (
            <GaleriaModelo
              modelName={modelName}
              items={galleryItems}
              hasCustomSource={Boolean(studioConfig) || !isPrimaryModel}
              ctaLabel={groupButtonLabel}
              privateCtaLabel={privateButtonLabel}
              onPrimaryAction={onEnterVideoCall}
              onPrivateAction={onEnterPrivateCall}
            />
          )}

          {/* 5. Exclusive Private Photo & Video Album (Paid Access Gate) */}
          {showSection('private_album') &&
            privateAlbumSummary?.enabled !== false && (
              <div id="album-privativo">
                <PrivateAlbumViewer
                  modelId={selectedModelId || 'lorena_noir'}
                  modelName={modelName}
                  summary={privateAlbumSummary}
                  isAuthenticated={false}
                  onRequireAuth={onRequirePrivateAlbumAuth || onEnterVideoCall}
                  onUnlock={onUnlockPrivateAlbum}
                />
              </div>
            )}

          {/* 5.5 Real-Time Tip Goal Progress Bar */}
          {(profileSectionTab === 'all' || profileSectionTab === 'plans') &&
            liveStudioState?.tipGoalEnabled && (
              <div id="meta-gorjeta">
                <TipGoalProgressCard
                  modelId={selectedModelId || 'lorena_noir'}
                  modelName={modelName}
                  studioState={liveStudioState}
                  isAuthenticated={false}
                  onRequireAuth={onRequirePrivateAlbumAuth || onEnterVideoCall}
                />
              </div>
            )}

          {/* 6. Individual Call Plans & Pricing */}
          {showSection('plans') && (
            <section
              id="planos"
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pt-4 border-t border-[#818CF8]/15"
            >
              <TechSpotlightCard
                enableHoverLift
                className="lg:col-span-5 rounded-2xl border border-[#818CF8]/25 luxury-glass-rim p-6 sm:p-8 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-[#38BDF8]">
                    Atendimento de {modelName}
                  </p>
                  <h2 className="font-display text-3xl font-bold text-[#F8FAFC]">
                    Como funciona a{' '}
                    <span className="neo-gradient-text">Videochamada</span>
                  </h2>
                </div>

                <ul className="space-y-3 text-sm text-[#F8FAFC]">
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                    <span>
                      Escolha o pacote de tempo com os valores próprios de{' '}
                      {modelName}
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                    <span>
                      Acesse a sala ao vivo em grupo ou chame na sala privativa
                      1-para-1
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#38BDF8] shrink-0 mt-0.5" />
                    <span>
                      Pagamento claro via PIX ou Cartão diretamente antes da
                      entrada
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#A5B4FC] shrink-0 mt-0.5" />
                    <span>
                      Avaliação real pós-sessão visível neste perfil individual
                    </span>
                  </li>
                </ul>
              </TechSpotlightCard>

              <TechSpotlightCard
                enableHoverLift
                className="lg:col-span-7 relative rounded-2xl border border-[#818CF8]/25 overflow-hidden luxury-glass-rim p-6 sm:p-8 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] uppercase text-[#A5B4FC]">
                      <Award className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
                      <span>
                        Valores de {modelName} ·{' '}
                        {BRL_FORMATTER.format(selectedModelRateCents / 100)}/min
                      </span>
                    </div>
                    <h2 className="font-display text-3xl font-bold text-[#F8FAFC] mt-1">
                      Planos de Videochamada
                    </h2>
                  </div>

                  {loungeImageUrl && !loungeImgFailed && (
                    <img
                      src={loungeImageUrl}
                      alt={modelName}
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onError={() => setLoungeImgFailed(true)}
                      className="w-16 h-16 rounded-xl object-cover border border-[#818CF8]/30 shrink-0 hidden sm:block"
                    />
                  )}
                </div>

                {activeShowcasePlans.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {activeShowcasePlans.map((plan) => (
                      <div
                        key={plan.id}
                        className="rounded-xl bg-[#070B1E]/85 border border-[#818CF8]/25 p-4 flex flex-col justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-[#F8FAFC]">
                            {plan.name}
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-[#38BDF8]">
                            {plan.durationMinutes} minutos
                          </p>
                          <p className="text-[11px] text-[#B6C2E2] line-clamp-2">
                            {plan.description}
                          </p>
                        </div>
                        <p className="font-mono text-lg font-semibold tabular-nums text-[#F8FAFC]">
                          {BRL_FORMATTER.format(plan.priceCents / 100)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#B6C2E2]">
                    Atendimento calculado pela taxa por minuto:{' '}
                    {BRL_FORMATTER.format(selectedModelRateCents / 100)}/min.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onEnterVideoCall}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Entrar e Escolher Plano</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onEnterPrivateCall}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full bg-[#0D1330]/85 border border-[#818CF8]/35 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>Ir Direto para Privativa</span>
                  </button>
                </div>
              </TechSpotlightCard>
            </section>
          )}

          {/* 7. Public Verified Ratings & Comments for This Professional */}
          {showSection('ratings') && (
            <section
              id="avaliacoes"
              aria-labelledby="avaliacoes-modelo-heading"
              className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-6 sm:p-8 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#818CF8]/15">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#38BDF8]">
                    Opinião dos Internautas · {modelName}
                  </p>
                  <h2
                    id="avaliacoes-modelo-heading"
                    className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]"
                  >
                    Avaliações das Videochamadas
                  </h2>
                </div>

                <div className="text-left sm:text-right">
                  <p className="font-display text-2xl sm:text-3xl font-bold tabular-nums text-[#38BDF8]">
                    {ratingStats.average
                      ? `${ratingStats.average.toFixed(1)} ★`
                      : 'Sem avaliações'}
                  </p>
                  <p className="text-[11px] font-mono tabular-nums text-[#B6C2E2]">
                    {ratingStats.count}{' '}
                    {ratingStats.count === 1
                      ? 'sessão avaliada'
                      : 'sessões avaliadas'}
                  </p>
                </div>
              </div>

              {publicRatings.length === 0 ? (
                <p className="text-xs text-[#B6C2E2]">
                  As avaliações verificadas aparecerão aqui conforme os
                  internautas avaliarem seus atendimentos com {modelName}.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {publicRatings.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl bg-[#070B1E]/85 border border-[#818CF8]/20 p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-[#38BDF8]">
                          {'★'.repeat(Math.max(1, Math.min(5, item.rating)))}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-[#94A3B8]">
                          {new Intl.DateTimeFormat('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          }).format(new Date(item.createdAtMs))}
                        </span>
                      </div>
                      {item.planName && (
                        <p className="text-[11px] text-[#A5B4FC]">
                          {item.planName}
                        </p>
                      )}
                      {item.comment && (
                        <p className="text-xs text-[#F8FAFC]/90 leading-relaxed">
                          “{item.comment}”
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      )}

      {/* Structured Twilight Indigo Footer */}
      <footer className="mt-auto border-t border-[#818CF8]/20 bg-[#050714]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-2">
            <p className="font-display text-2xl font-bold text-[#F8FAFC]">
              {studioBrand}
            </p>
            <p className="text-xs text-[#94A3B8] max-w-sm leading-relaxed">
              {viewMode === 'directory'
                ? 'Catálogo privado de profissionais para videochamadas ao vivo, sessões 1-para-1 e álbuns exclusivos.'
                : `Página pública individual de ${modelName} com agenda, galeria, álbum privativo e planos sob medida.`}
            </p>
          </div>

          <div className="md:col-span-3 space-y-2 text-xs">
            <p className="font-semibold text-[#F8FAFC]">Navegação</p>
            <ul className="space-y-1.5 text-[#B6C2E2]">
              {viewMode === 'directory' ? (
                <>
                  <li>
                    <a
                      href="#profissionais"
                      className="hover:text-[#38BDF8] transition-colors"
                    >
                      Início
                    </a>
                  </li>
                  <li>
                    <a
                      href="#catalogo-profissionais"
                      className="hover:text-[#38BDF8] transition-colors"
                    >
                      Profissionais Disponíveis
                    </a>
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={handleBackToDirectory}
                      className="hover:text-[#38BDF8] transition-colors cursor-pointer"
                    >
                      Todos os Profissionais
                    </button>
                  </li>
                  <li>
                    <a
                      href="#estudio"
                      className="hover:text-[#38BDF8] transition-colors"
                    >
                      Perfil de {modelName}
                    </a>
                  </li>
                  <li>
                    <a
                      href="#galeria"
                      className="hover:text-[#38BDF8] transition-colors"
                    >
                      Galeria Pública
                    </a>
                  </li>
                  <li>
                    <a
                      href="#album-privativo"
                      className="hover:text-[#38BDF8] transition-colors"
                    >
                      Álbum Privativo
                    </a>
                  </li>
                  <li>
                    <a
                      href="#planos"
                      className="hover:text-[#38BDF8] transition-colors"
                    >
                      Planos e Avaliações
                    </a>
                  </li>
                </>
              )}
            </ul>
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs">
            <p className="font-semibold text-[#F8FAFC]">Acesso Imediato</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onEnterVideoCall}
                className="px-4 py-2 rounded-full luxury-rose-cta font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sala ao Vivo
              </button>
              <button
                type="button"
                onClick={onEnterPrivateCall}
                className="px-4 py-2 rounded-full bg-[#0D1330] border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8] font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                Chamada Privativa
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#94A3B8] pt-2">
              <span>
                © {new Date().getFullYear()} {studioBrand} · Todos os direitos
                reservados
              </span>
              {onNavigateToAdmin && (
                <button
                  type="button"
                  onClick={onNavigateToAdmin}
                  className="text-[#B6C2E2]/85 hover:text-[#38BDF8] underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Acesso da Modelo
                </button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
