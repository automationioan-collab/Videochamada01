import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Film,
  Lock,
  Maximize2,
  Video,
  X,
} from 'lucide-react';
import { DEFAULT_GALLERY_ITEMS } from '../lib/studioDefaults';
import type {
  GalleryCategoryType,
  GalleryItemRecord,
  MediaAssetType,
} from '../types/studio';

type GalleryCategory = 'all' | GalleryCategoryType;

interface GalleryDisplayItem {
  id: string;
  indexLabel: string;
  title: string;
  caption: string;
  category: GalleryCategoryType;
  categoryLabel: string;
  mediaType: MediaAssetType;
  specs: string;
  src: string;
  alt: string;
}

interface GaleriaModeloProps {
  modelName?: string;
  items?: GalleryItemRecord[];
  hasCustomSource?: boolean;
  ctaLabel?: string;
  privateCtaLabel?: string;
  ctaDisabled?: boolean;
  onPrimaryAction?: () => void;
  onPrivateAction?: () => void;
}

const GALLERY_CATEGORIES: ReadonlyArray<{
  id: GalleryCategory;
  label: string;
}> = [
  { id: 'all', label: 'Todas as Fotos' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'portraits', label: 'Retratos' },
  { id: 'studio', label: 'Estúdio ao Vivo' },
];

const CATEGORY_LABEL_MAP: Record<GalleryCategoryType, string> = {
  editorial: 'Editorial',
  portraits: 'Retratos',
  studio: 'Estúdio ao Vivo',
};

export const GaleriaModelo: React.FC<GaleriaModeloProps> = ({
  modelName = 'Lorena Noir',
  items: customItems,
  hasCustomSource = false,
  ctaLabel = 'Solicitar Videochamada',
  privateCtaLabel,
  ctaDisabled = false,
  onPrimaryAction,
  onPrivateAction,
}) => {
  const [category, setCategory] = useState<GalleryCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  const items: GalleryDisplayItem[] = useMemo(() => {
    const activeApproved = (customItems || []).filter(
      (item) =>
        item.active &&
        (!item.approvalStatus || item.approvalStatus === 'approved')
    );
    const hasCustomDataset =
      hasCustomSource || (Array.isArray(customItems) && customItems.length > 0);
    const source =
      activeApproved.length > 0
        ? activeApproved
        : hasCustomDataset
          ? []
          : DEFAULT_GALLERY_ITEMS;

    return source.map((item, idx) => ({
      id: item.id,
      indexLabel: String(idx + 1).padStart(2, '0'),
      title: item.title,
      caption: item.caption,
      category: item.category,
      categoryLabel: CATEGORY_LABEL_MAP[item.category] || 'Estúdio',
      mediaType:
        'mediaType' in item && item.mediaType === 'video' ? 'video' : 'photo',
      specs: item.specs,
      src: item.src,
      alt: item.alt || `${modelName} · ${item.title}`,
    }));
  }, [customItems, hasCustomSource, modelName]);

  const visibleItems = useMemo(() => {
    if (category === 'all') return items;
    return items.filter((item) => item.category === category);
  }, [category, items]);

  const activePhoto =
    selectedIndex !== null ? visibleItems[selectedIndex] ?? null : null;

  const markFailed = useCallback((id: string) => {
    setFailedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setSelectedIndex(null);
  }, []);

  const handlePrev = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null || visibleItems.length === 0) return null;
      return (prev - 1 + visibleItems.length) % visibleItems.length;
    });
  }, [visibleItems.length]);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null || visibleItems.length === 0) return null;
      return (prev + 1) % visibleItems.length;
    });
  }, [visibleItems.length]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseLightbox();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCloseLightbox, handleNext, handlePrev, selectedIndex]);

  const getBentoClass = (index: number) => {
    if (category !== 'all') {
      return 'col-span-12 md:col-span-6 aspect-[4/3]';
    }
    if (index === 0) {
      return 'col-span-12 lg:col-span-6 lg:row-span-2 min-h-[340px] lg:min-h-[460px]';
    }
    if (index === 1) {
      return 'col-span-12 sm:col-span-6 lg:col-span-3 lg:row-span-2 min-h-[320px] lg:min-h-[460px]';
    }
    if (index === 2 || index === 3) {
      return 'col-span-12 sm:col-span-6 lg:col-span-3 min-h-[220px]';
    }
    return 'col-span-12 md:col-span-6 min-h-[260px] lg:min-h-[290px]';
  };

  return (
    <section
      id="galeria"
      aria-labelledby="galeria-modelo-heading"
      className="space-y-8 border-t border-[#818CF8]/15 pt-12"
    >
      {/* Editorial Header + Interactive Category Filter */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-[#38BDF8]">
            Vitrine Editorial · {modelName}
          </p>
          <h2
            id="galeria-modelo-heading"
            className="font-display text-3xl sm:text-4xl font-bold text-[#F8FAFC] text-balance"
          >
            Prévia Profissional do{' '}
            <span className="neo-gradient-text">Estúdio</span> e Retratos
          </h2>
          <p className="text-sm text-[#B6C2E2] leading-relaxed">
            Explore os ensaios recentes e o cenário oficial de transmissão antes
            de iniciar sua videochamada privativa 1-para-1.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Filtrar galeria da modelo"
            className="flex items-center gap-1 p-1 bg-[#080C1F] border border-[#818CF8]/25 rounded-full overflow-x-auto"
          >
            {GALLERY_CATEGORIES.map((tab) => {
              const isSelected = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setCategory(tab.id);
                    setSelectedIndex(null);
                  }}
                  className={`relative px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'text-white font-semibold'
                      : 'text-[#B6C2E2] hover:text-[#F8FAFC]'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="galeria-active-tab"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-full luxury-rose-cta"
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {onPrimaryAction && (
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full bg-[#0D1330] border border-[#818CF8]/35 text-[#F8FAFC] hover:border-[#38BDF8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>{ctaLabel}</span>
            </button>
          )}

          {onPrivateAction && privateCtaLabel && (
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={onPrivateAction}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{privateCtaLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bento Photography Grid */}
      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-[#818CF8]/25 luxury-glass-rim p-10 text-center space-y-2">
          <Camera className="w-8 h-8 text-[#A5B4FC]/60 mx-auto" />
          <p className="text-sm font-medium text-[#F8FAFC]">
            Nenhuma foto ou vídeo público disponível para {modelName}{' '}
            {category === 'all' ? 'no momento' : 'nesta categoria'}.
          </p>
          <p className="text-xs text-[#94A3B8]">
            As mídias públicas aparecem aqui assim que forem aprovadas pela
            administração do estúdio.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-5">
          {visibleItems.map((item, idx) => {
            const isFailed = failedIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                aria-label={`Ampliar ${item.title}`}
                className={`${getBentoClass(
                  idx
                )} group relative tech-reticle tech-glass-interactive rounded-2xl overflow-hidden bg-[#0A0F24] border border-[#818CF8]/25 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]`}
              >
                {!isFailed ? (
                  item.mediaType === 'video' ? (
                    <video
                      src={item.src}
                      muted
                      playsInline
                      preload="metadata"
                      onError={() => markFailed(item.id)}
                      className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <img
                      src={item.src}
                      alt={item.alt}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onError={() => markFailed(item.id)}
                      className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#131C42] to-[#060816] p-6 text-center space-y-2">
                    {item.mediaType === 'video' ? (
                      <Film className="w-8 h-8 text-[#A5B4FC]/60" />
                    ) : (
                      <Camera className="w-8 h-8 text-[#A5B4FC]/60" />
                    )}
                    <span className="text-xs font-medium text-[#B6C2E2]">
                      {item.title}
                    </span>
                  </div>
                )}

                {/* Contrast Scrim */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/25 to-transparent pointer-events-none" />

                {/* Top-Right Expand Affordance */}
                <span
                  aria-hidden="true"
                  className="absolute top-3.5 right-3.5 p-2 rounded-full bg-[#060816]/75 border border-[#818CF8]/30 text-[#F8FAFC] opacity-85 group-hover:opacity-100 group-hover:border-[#38BDF8]/70 transition-opacity"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </span>

                {/* Clean Unboxed Metadata Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1">
                  <p className="text-[11px] font-mono tabular-nums text-[#38BDF8] truncate">
                    {item.indexLabel} · {item.categoryLabel} · {item.specs}
                  </p>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#F8FAFC]">
                    {item.title}
                  </h3>
                  {(idx === 0 || category !== 'all') && (
                    <p className="text-xs text-[#B6C2E2] line-clamp-2 max-w-md">
                      {item.caption}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      <AnimatePresence>
        {activePhoto && selectedIndex !== null && (
          <motion.div
            key="lightbox-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lightbox-photo-title"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={handleCloseLightbox}
            className="fixed inset-0 z-50 bg-[#040611]/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-5xl w-full luxury-card tech-reticle border border-[#818CF8]/35 rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              {/* Lightbox Header */}
              <div className="px-5 py-3.5 border-b border-[#818CF8]/20 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0 text-xs">
                  <span className="font-mono tabular-nums text-[#38BDF8] shrink-0">
                    {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                    {String(visibleItems.length).padStart(2, '0')}
                  </span>
                  <span className="text-[#94A3B8]" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-[#B6C2E2] truncate">
                    {activePhoto.categoryLabel} · {activePhoto.specs}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCloseLightbox}
                  aria-label="Fechar visualização"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#070B1E] border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8]/70 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Fechar</span>
                </button>
              </div>

              {/* Lightbox Photo Stage */}
              <div
                data-protected-media="true"
                onContextMenu={(e) => e.preventDefault()}
                className="relative flex-1 bg-[#060816] flex items-center justify-center min-h-[280px] overflow-hidden select-none"
              >
                {!failedIds.has(activePhoto.id) ? (
                  activePhoto.mediaType === 'video' ? (
                    <video
                      key={activePhoto.id}
                      src={activePhoto.src}
                      controls
                      autoPlay
                      playsInline
                      controlsList="nodownload"
                      onContextMenu={(e) => e.preventDefault()}
                      onError={() => markFailed(activePhoto.id)}
                      className="max-h-[62vh] w-auto max-w-full"
                    />
                  ) : (
                    <img
                      src={activePhoto.src}
                      alt={activePhoto.alt}
                      referrerPolicy="no-referrer"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onError={() => markFailed(activePhoto.id)}
                      className="max-h-[62vh] w-auto max-w-full object-contain"
                    />
                  )
                ) : (
                  <div className="p-16 flex flex-col items-center justify-center text-center space-y-2">
                    <Camera className="w-10 h-10 text-[#A5B4FC]/60" />
                    <p className="text-sm text-[#B6C2E2]">{activePhoto.title}</p>
                  </div>
                )}

                {activePhoto.mediaType !== 'video' && (
                  <div
                    aria-hidden="true"
                    onContextMenu={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    className="absolute inset-0 z-10 select-none"
                  />
                )}

                {visibleItems.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrev}
                      aria-label="Foto anterior"
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-[#060816]/85 border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      aria-label="Próxima foto"
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-[#060816]/85 border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              {/* Lightbox Footer Caption + Direct CTA */}
              <div className="p-5 sm:px-6 border-t border-[#818CF8]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <h3
                    id="lightbox-photo-title"
                    className="font-display text-2xl font-bold text-[#F8FAFC]"
                  >
                    {activePhoto.title}
                  </h3>
                  <p className="text-xs text-[#B6C2E2] leading-relaxed">
                    {activePhoto.caption}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {onPrimaryAction && (
                    <button
                      type="button"
                      disabled={ctaDisabled}
                      onClick={() => {
                        handleCloseLightbox();
                        onPrimaryAction();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>{ctaLabel}</span>
                    </button>
                  )}

                  {onPrivateAction && privateCtaLabel && (
                    <button
                      type="button"
                      disabled={ctaDisabled}
                      onClick={() => {
                        handleCloseLightbox();
                        onPrivateAction();
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-full bg-[#0D1330] border border-[#818CF8]/40 text-[#F8FAFC] hover:border-[#38BDF8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Lock className="w-3.5 h-3.5 text-[#38BDF8]" />
                      <span>{privateCtaLabel}</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};
