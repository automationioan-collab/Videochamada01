import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  Camera,
  Check,
  CreditCard,
  Lock,
  ShieldCheck,
  Star,
  Users,
  Video,
} from 'lucide-react';
import {
  DEFAULT_GALLERY_ITEMS,
  DEFAULT_STUDIO_CONFIG,
} from '../lib/studioDefaults';
import type { GalleryItemRecord, StudioConfig } from '../types/studio';
import { GaleriaModelo } from './GaleriaModelo';
import { TechOrbitHalo, TechSpotlightCard } from './TechEffects';

interface LoginViewProps {
  studioConfig?: StudioConfig | null;
  galleryItems?: GalleryItemRecord[];
  onEnterVideoCall: () => void;
  onEnterPrivateCall: () => void;
  authError: string | null;
}

interface PublicStudioStatus {
  modelOnline: boolean;
  modelInRoom: boolean;
  roomParticipantCount: number;
  activePeersCount: number;
}

export const LoginView: React.FC<LoginViewProps> = ({
  studioConfig,
  galleryItems,
  onEnterVideoCall,
  onEnterPrivateCall,
  authError,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [loungeImgFailed, setLoungeImgFailed] = useState(false);
  const [avatarImgFailed, setAvatarImgFailed] = useState(false);
  const [publicStatus, setPublicStatus] = useState<PublicStudioStatus | null>(
    null
  );

  const cfg = studioConfig || DEFAULT_STUDIO_CONFIG;
  const studioBrand = cfg.studioBrand || DEFAULT_STUDIO_CONFIG.studioBrand;
  const modelName = cfg.modelName || DEFAULT_STUDIO_CONFIG.modelName;
  const heroTitle = cfg.heroTitle || DEFAULT_STUDIO_CONFIG.heroTitle;
  const heroSubtitle = cfg.heroSubtitle || DEFAULT_STUDIO_CONFIG.heroSubtitle;
  const groupButtonLabel =
    cfg.groupButtonLabel || DEFAULT_STUDIO_CONFIG.groupButtonLabel;
  const privateButtonLabel =
    cfg.privateButtonLabel || DEFAULT_STUDIO_CONFIG.privateButtonLabel;
  const heroImageUrl =
    cfg.heroImageUrl || DEFAULT_STUDIO_CONFIG.heroImageUrl;
  const loungeImageUrl =
    cfg.loungeImageUrl || DEFAULT_STUDIO_CONFIG.loungeImageUrl;
  const modelAvatarUrl =
    cfg.modelAvatarUrl || DEFAULT_STUDIO_CONFIG.modelAvatarUrl;

  useEffect(() => {
    setHeroImgFailed(false);
  }, [heroImageUrl]);

  useEffect(() => {
    setLoungeImgFailed(false);
  }, [loungeImageUrl]);

  useEffect(() => {
    setAvatarImgFailed(false);
  }, [modelAvatarUrl]);

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/studio/public-status');
        if (!res.ok) return;
        const json = (await res.json()) as PublicStudioStatus & { ok?: boolean };
        if (!cancelled && json.ok) {
          setPublicStatus({
            modelOnline: Boolean(json.modelOnline),
            modelInRoom: Boolean(json.modelInRoom),
            roomParticipantCount: Number(json.roomParticipantCount || 0),
            activePeersCount: Number(json.activePeersCount || 0),
          });
        }
      } catch {
        // Ignore transient fetch errors on public landing
      }
    };

    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const roomCount = publicStatus?.roomParticipantCount ?? 0;

  // Split last word into italic rose-blush emphasis matching editorial pattern
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
    const activeCustom = (galleryItems || []).filter((item) => item.active);
    const source =
      activeCustom.length > 0 ? activeCustom : DEFAULT_GALLERY_ITEMS;
    return source.slice(0, 4);
  }, [galleryItems]);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="relative z-10 flex-1 flex flex-col">
      <main className="max-w-[1440px] w-full mx-auto px-6 pt-8 pb-16 lg:pt-12 space-y-16">
        {/* 1. Hero Section + 5-Pillar Strip */}
        <motion.section
          id="estudio"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-10"
        >
          <TechSpotlightCard className="rounded-3xl overflow-hidden border border-[#F4C2D7]/20 luxury-card">
            {/* Soft Plum & Rose Atmospheric Radial Backdrop */}
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none bg-[radial-gradient(680px_440px_at_76%_42%,rgba(244,194,215,0.2),transparent_68%),radial-gradient(520px_380px_at_12%_85%,rgba(168,85,140,0.18),transparent_70%)]"
            />
            <div
              aria-hidden="true"
              className="tech-ambient-layer tech-beam-pulse absolute top-0 inset-x-12 h-px bg-gradient-to-r from-transparent via-[#F8D6E3]/65 to-transparent pointer-events-none"
            />

            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch p-7 sm:p-10 lg:p-12">
              {/* Hero Left Column */}
              <div className="lg:col-span-6 flex flex-col justify-between space-y-8 z-10">
                <div className="space-y-5">
                  <div className="flex items-center gap-3 text-[11px] font-medium tracking-[0.18em] uppercase text-[#F4C2D7]">
                    <span
                      aria-hidden="true"
                      className="h-px w-8 bg-[#F4C2D7]/45 shrink-0"
                    />
                    <span className="truncate font-mono tabular-nums">
                      Estúdio Privado ·{' '}
                      {roomCount > 0
                        ? `${roomCount} na videochamada agora`
                        : publicStatus?.modelOnline
                          ? `${modelName} Online Agora`
                          : 'Sala Ao Vivo & Privativa'}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-px w-8 bg-[#F4C2D7]/45 shrink-0"
                    />
                  </div>

                  <h1 className="font-display text-4xl sm:text-5xl lg:text-[58px] font-semibold leading-[1.04] text-[#FAF4F7] [text-wrap:balance]">
                    {heroHeadingParts.lead ? `${heroHeadingParts.lead} ` : ''}
                    <span className="italic font-medium text-[#F4C2D7]">
                      {heroHeadingParts.accent}
                    </span>
                  </h1>

                  <p className="text-base text-[#C9BAC4] leading-relaxed max-w-lg">
                    {heroSubtitle}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3.5">
                    <button
                      type="button"
                      onClick={onEnterVideoCall}
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FAF4F7]"
                    >
                      <Users className="w-4 h-4 shrink-0" />
                      <span>{groupButtonLabel}</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>

                    <button
                      type="button"
                      onClick={onEnterPrivateCall}
                      className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 text-sm font-semibold rounded-full bg-[#120A19]/80 border border-[#F4C2D7]/35 text-[#FAF4F7] hover:bg-[#21132E] hover:border-[#F4C2D7]/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C2D7]"
                    >
                      <Lock className="w-4 h-4 text-[#F4C2D7] shrink-0" />
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

                  <p className="text-xs text-[#938291] font-mono tabular-nums">
                    {roomCount === 0
                      ? 'Sala em grupo aberta · Atendimento privativo 1-para-1 exclusivo com a modelo'
                      : `${roomCount} participante${roomCount === 1 ? '' : 's'} na sala ao vivo · Privativa 1-para-1 também disponível`}
                  </p>
                </div>
              </div>

              {/* Hero Right Column: Portrait Stage with Rotating Futuristic Orbital Halo */}
              <div className="lg:col-span-6 relative flex items-center justify-center min-h-[340px] lg:min-h-[450px]">
                <TechOrbitHalo className="hidden sm:flex absolute inset-0" />
                <div className="relative tech-reticle w-full h-full min-h-[340px] rounded-2xl overflow-hidden border border-[#F4C2D7]/30 bg-[#100916] shadow-[0_0_50px_-14px_rgba(244,194,215,0.28)] group">
                  {!heroImgFailed && heroImageUrl ? (
                    <img
                      src={heroImageUrl}
                      alt={`Modelo ${modelName} em estúdio privado`}
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onError={() => setHeroImgFailed(true)}
                      className="w-full h-full object-cover lg:absolute lg:inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1C1226] to-[#0B060F] p-12">
                      <Video className="w-12 h-12 text-[#F4C2D7]/60" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/95 via-[#0B060F]/25 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-display text-2xl font-semibold text-[#FAF4F7]">
                        {modelName}
                      </p>
                      <p className="text-xs text-[#C9BAC4] line-clamp-2 max-w-md">
                        {cfg.modelBio || DEFAULT_STUDIO_CONFIG.modelBio}
                      </p>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#F4C2D7] whitespace-nowrap shrink-0">
                      {roomCount > 0
                        ? `${roomCount} na sala`
                        : 'Vídeo HD · Áudio Estúdio'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Luminous Hairline Horizon */}
            <div aria-hidden="true" className="tech-ambient-layer tech-horizon-line opacity-60" />

            {/* Bottom 5-Column Pillar Strip inside Hero Shell */}
            <div className="relative bg-[#0F0816]/85 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#F4C2D7]/10">
              <div className="px-5 py-4 flex items-center gap-3">
                <Users className="w-5 h-5 text-[#F4C2D7] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#FAF4F7] truncate">
                    Sala ao Vivo
                  </p>
                  <p className="text-[11px] text-[#C9BAC4] truncate">
                    Múltiplos internautas
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 flex items-center gap-3">
                <Lock className="w-5 h-5 text-[#F4C2D7] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#FAF4F7] truncate">
                    Privativa 1-para-1
                  </p>
                  <p className="text-[11px] text-[#C9BAC4] truncate">
                    Só você e {modelName}
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 flex items-center gap-3">
                <CreditCard className="w-5 h-5 text-[#F4C2D7] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#FAF4F7] truncate">
                    Planos Claros
                  </p>
                  <p className="text-[11px] text-[#C9BAC4] truncate">
                    Pacotes pré-definidos
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 flex items-center gap-3">
                <Star className="w-5 h-5 text-[#F4C2D7] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#FAF4F7] truncate">
                    Qualidade Real
                  </p>
                  <p className="text-[11px] text-[#C9BAC4] truncate">
                    Avaliação pós-chamada
                  </p>
                </div>
              </div>

              <div className="px-5 py-4 flex items-center gap-3 col-span-2 sm:col-span-1">
                <ShieldCheck className="w-5 h-5 text-[#F4C2D7] shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#FAF4F7] truncate">
                    Estúdio Seguro
                  </p>
                  <p className="text-[11px] text-[#C9BAC4] truncate">
                    Controle em tempo real
                  </p>
                </div>
              </div>
            </div>
          </TechSpotlightCard>
        </motion.section>

        {/* 2. Dual Bento Spotlight ("Escolha Antes de Entrar" + "Destaques do Estúdio") */}
        <motion.section
          id="experiencias"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
        >
          {/* Left Bento: Private 1-on-1 Mode Spotlight */}
          <TechSpotlightCard
            enableHoverLift
            className="lg:col-span-6 rounded-2xl border border-[#F4C2D7]/20 luxury-card p-6 sm:p-8 flex flex-col justify-between gap-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
              <div className="sm:col-span-7 space-y-3">
                <p className="text-xs font-medium text-[#F4C2D7]">
                  Experiência Exclusiva
                </p>
                <h2 className="font-display text-3xl font-semibold text-[#FAF4F7] text-balance">
                  Atendimento{' '}
                  <span className="italic font-medium text-[#F4C2D7]">
                    Privativo
                  </span>{' '}
                  1-para-1
                </h2>
                <p className="text-xs sm:text-sm text-[#C9BAC4] leading-relaxed">
                  Converse em sala fechada com vídeo HD e chat exclusivo somente
                  entre você e {modelName}, escolhendo o plano ideal para o seu
                  momento.
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
                <div className="relative tech-reticle w-full aspect-[4/5] rounded-2xl overflow-hidden border border-[#F4C2D7]/25 bg-[#100916]">
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
                      <Camera className="w-8 h-8 text-[#F4C2D7]/60" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/85 via-transparent to-transparent pointer-events-none" />
                  <span className="absolute bottom-3 left-3 right-3 text-[11px] font-mono text-[#F4C2D7] truncate">
                    Sessão 1-para-1 · {modelName}
                  </span>
                </div>
              </div>
            </div>
          </TechSpotlightCard>

          {/* Right Bento: 4 Signature Showcase Thumbnails */}
          <TechSpotlightCard
            enableHoverLift
            className="lg:col-span-6 rounded-2xl border border-[#F4C2D7]/20 luxury-card p-6 sm:p-8 flex flex-col justify-between gap-5"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
                  Vitrine &amp; Modalidades
                </h2>
              </div>
              <button
                type="button"
                onClick={() => scrollToSection('galeria')}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F4C2D7] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Ver Galeria Completa</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {highlightGalleryCards.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection('galeria')}
                  className="group relative aspect-[3/4] rounded-xl overflow-hidden bg-[#100916] border border-[#F4C2D7]/20 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C2D7]"
                >
                  <img
                    src={item.src}
                    alt={item.alt || item.title}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/95 via-[#0B060F]/20 to-transparent pointer-events-none" />
                  <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-1.5">
                    <span className="text-[11px] font-medium text-[#FAF4F7] leading-tight line-clamp-2">
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
          </TechSpotlightCard>
        </motion.section>

        {/* 3. Studio Experience Split + Tabular Spec Strip */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-6 relative tech-reticle rounded-2xl overflow-hidden border border-[#F4C2D7]/25 bg-[#150D1D] min-h-[280px] sm:min-h-[340px] shadow-[0_18px_45px_-20px_rgba(192,98,162,0.3)] group">
            {!loungeImgFailed && loungeImageUrl ? (
              <img
                src={loungeImageUrl}
                alt={`Ambiente reservado ${studioBrand}`}
                referrerPolicy="no-referrer"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                onError={() => setLoungeImgFailed(true)}
                className="w-full h-full object-cover lg:absolute lg:inset-0"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#150D1D] p-12">
                <Video className="w-10 h-10 text-[#F4C2D7]/50" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#0B060F]/15 to-[#0B060F]/70 pointer-events-none" />
          </div>

          <div className="lg:col-span-6 space-y-6 lg:pl-4">
            <div className="space-y-3">
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#FAF4F7]">
                A Experiência{' '}
                <span className="italic font-medium text-[#F4C2D7]">
                  {studioBrand}
                </span>
              </h2>
              <p className="text-sm sm:text-base text-[#C9BAC4] leading-relaxed">
                {cfg.headline || DEFAULT_STUDIO_CONFIG.headline} Um ambiente
                reservado com transmissão em alta definição, sala coletiva ao
                vivo e atendimentos individuais com total discrição.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-[#F4C2D7]/15">
              <div className="space-y-0.5 pt-2">
                <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums text-[#F4C2D7]">
                  HD / 4K
                </p>
                <p className="text-[11px] text-[#C9BAC4]">
                  Qualidade de Vídeo
                </p>
              </div>
              <div className="space-y-0.5 pt-2">
                <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums text-[#FAF4F7]">
                  1-para-1
                </p>
                <p className="text-[11px] text-[#C9BAC4]">
                  Sala Privativa
                </p>
              </div>
              <div className="space-y-0.5 pt-2">
                <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums text-[#FAF4F7]">
                  Ao Vivo
                </p>
                <p className="text-[11px] text-[#C9BAC4]">
                  Sala Compartilhada
                </p>
              </div>
              <div className="space-y-0.5 pt-2">
                <p className="font-display text-2xl sm:text-3xl font-semibold tabular-nums text-[#F4C2D7]">
                  5.0 ★
                </p>
                <p className="text-[11px] text-[#C9BAC4]">
                  Avaliação Pós-Chamada
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Full Model Editorial Photo Showcase */}
        <GaleriaModelo
          modelName={modelName}
          items={galleryItems}
          ctaLabel={groupButtonLabel}
          privateCtaLabel={privateButtonLabel}
          onPrimaryAction={onEnterVideoCall}
          onPrivateAction={onEnterPrivateCall}
        />

        {/* 5. Why Choose + Exclusive Packages Highlight Row */}
        <section
          id="planos"
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch pt-4 border-t border-[#F4C2D7]/15"
        >
          {/* Left Checklist Card */}
          <TechSpotlightCard
            enableHoverLift
            className="lg:col-span-5 rounded-2xl border border-[#F4C2D7]/20 luxury-card p-6 sm:p-8 flex flex-col justify-between space-y-5"
          >
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-[#F4C2D7]">
                Diferenciais do Estúdio
              </p>
              <h2 className="font-display text-3xl font-semibold text-[#FAF4F7]">
                Por que escolher{' '}
                <span className="italic font-medium text-[#F4C2D7]">
                  {studioBrand}
                </span>
                ?
              </h2>
            </div>

            <ul className="space-y-3 text-sm text-[#FAF4F7]">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#F4C2D7] shrink-0 mt-0.5" />
                <span>
                  Sala ao vivo compartilhada para vários internautas simultâneos
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#F4C2D7] shrink-0 mt-0.5" />
                <span>
                  Botão dedicado para chamada privativa somente com {modelName}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#F4C2D7] shrink-0 mt-0.5" />
                <span>
                  Planos pré-definidos transparentes em PIX ou Cartão
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#F4C2D7] shrink-0 mt-0.5" />
                <span>
                  Sistema real de avaliação salva no histórico da sessão
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#F4C2D7] shrink-0 mt-0.5" />
                <span>
                  Ambiente privado com controle e moderação em tempo real
                </span>
              </li>
            </ul>
          </TechSpotlightCard>

          {/* Right Featured Package Promo Card */}
          <TechSpotlightCard
            enableHoverLift
            className="lg:col-span-7 relative rounded-2xl border border-[#F4C2D7]/25 overflow-hidden luxury-card p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center"
          >
            <div className="sm:col-span-7 space-y-4 z-10">
              <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.16em] uppercase text-[#F4C2D7]">
                <Award className="w-3.5 h-3.5 shrink-0" />
                <span>Pacotes Exclusivos</span>
              </div>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold text-[#FAF4F7] text-balance">
                Planos de{' '}
                <span className="italic font-medium text-[#F4C2D7]">
                  Videochamada
                </span>{' '}
                Sob Medida
              </h2>
              <p className="text-xs sm:text-sm text-[#C9BAC4] leading-relaxed">
                Entre com sua conta Google, selecione seu plano pré-definido e
                escolha entre a sala ao vivo coletiva ou chamada privativa 1-para-1.
              </p>
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full bg-[#120A19]/80 border border-[#F4C2D7]/35 text-[#FAF4F7] hover:border-[#F4C2D7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-[#F4C2D7]" />
                  <span>Ir Direto para Privativa</span>
                </button>
              </div>
            </div>

            <div className="sm:col-span-5 relative tech-reticle aspect-[4/3] sm:aspect-[3/4] rounded-xl overflow-hidden border border-[#F4C2D7]/20 bg-[#100916]">
              <img
                src={
                  highlightGalleryCards[1]?.src ||
                  DEFAULT_GALLERY_ITEMS[1].src
                }
                alt={`Atendimento privado com ${modelName}`}
                referrerPolicy="no-referrer"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F]/80 via-transparent to-transparent pointer-events-none" />
            </div>
          </TechSpotlightCard>
        </section>
      </main>

      {/* 6. Quiet Luxury Footer */}
      <footer className="mt-auto border-t border-[#F4C2D7]/15 bg-[#08040B]/90 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-2">
            <p className="font-display text-2xl font-semibold text-[#FAF4F7]">
              {studioBrand}
            </p>
            <p className="text-xs text-[#938291] max-w-sm leading-relaxed">
              Estúdio privado de videochamadas ao vivo e sessões individuais 1-para-1 com {modelName}.
            </p>
          </div>

          <div className="md:col-span-3 space-y-2 text-xs">
            <p className="font-semibold text-[#FAF4F7]">Navegação</p>
            <ul className="space-y-1.5 text-[#C9BAC4]">
              <li>
                <a
                  href="#estudio"
                  className="hover:text-[#F4C2D7] transition-colors"
                >
                  O Estúdio
                </a>
              </li>
              <li>
                <a
                  href="#experiencias"
                  className="hover:text-[#F4C2D7] transition-colors"
                >
                  Experiências
                </a>
              </li>
              <li>
                <a
                  href="#galeria"
                  className="hover:text-[#F4C2D7] transition-colors"
                >
                  Galeria da Modelo
                </a>
              </li>
              <li>
                <a
                  href="#planos"
                  className="hover:text-[#F4C2D7] transition-colors"
                >
                  Planos Pré-Definidos
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-2.5 text-xs">
            <p className="font-semibold text-[#FAF4F7]">Acesso Imediato</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onEnterVideoCall}
                className="px-4 py-2 rounded-full luxury-rose-cta font-semibold whitespace-nowrap cursor-pointer"
              >
                Sala ao Vivo
              </button>
              <button
                type="button"
                onClick={onEnterPrivateCall}
                className="px-4 py-2 rounded-full bg-[#150D1D] border border-[#F4C2D7]/30 text-[#FAF4F7] hover:border-[#F4C2D7] font-medium whitespace-nowrap cursor-pointer"
              >
                Chamada Privativa
              </button>
            </div>
            <p className="text-[11px] text-[#938291] pt-2">
              © {new Date().getFullYear()} {studioBrand} · Todos os direitos reservados
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};
