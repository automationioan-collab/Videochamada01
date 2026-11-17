import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Video,
  X,
} from 'lucide-react';

type GalleryCategory = 'all' | 'editorial' | 'portraits' | 'studio';

interface GalleryItem {
  id: string;
  indexLabel: string;
  title: string;
  caption: string;
  category: Exclude<GalleryCategory, 'all'>;
  categoryLabel: string;
  specs: string;
  src: string;
  alt: string;
}

interface GaleriaModeloProps {
  modelName?: string;
  ctaLabel?: string;
  ctaDisabled?: boolean;
  onPrimaryAction?: () => void;
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

export const GaleriaModelo: React.FC<GaleriaModeloProps> = ({
  modelName = 'Lorena Noir',
  ctaLabel = 'Solicitar Videochamada',
  ctaDisabled = false,
  onPrimaryAction,
}) => {
  const [category, setCategory] = useState<GalleryCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  const items: GalleryItem[] = useMemo(
    () => [
      {
        id: 'editorial-noir',
        indexLabel: '01',
        title: 'Série Atelier Noir',
        caption:
          'Produção principal em alfaiataria de seda preta sob iluminação arquitetônica âmbar.',
        category: 'editorial',
        categoryLabel: 'Editorial',
        specs: 'Leica 50mm · f/1.4 · Luz Quente',
        src: '/src/assets/images/gallery_editorial_noir_1794948582472.jpg',
        alt: `${modelName} em retrato editorial no ateliê com blazer preto de seda`,
      },
      {
        id: 'atelier-vertical',
        indexLabel: '02',
        title: 'Luz Natural e Veludo',
        caption:
          'Composição vertical junto às cortinas de veludo escuro em iluminação suave de fim de tarde.',
        category: 'editorial',
        categoryLabel: 'Editorial',
        specs: 'Formato 3:4 · Luz Difusa de Janela',
        src: '/src/assets/images/gallery_atelier_candle_1794948583357.jpg',
        alt: `${modelName} em vestido longo preto junto a cortina de veludo no estúdio`,
      },
      {
        id: 'close-portrait',
        indexLabel: '03',
        title: 'Retrato Aproximado',
        caption:
          'Enquadramento íntimo de câmera com foco nítido e textura cinematográfica 35mm.',
        category: 'portraits',
        categoryLabel: 'Retratos',
        specs: '35mm · Grão Natural · Rim Âmbar',
        src: '/src/assets/images/gallery_close_portrait_1794948582088.jpg',
        alt: `Retrato em close-up editorial de ${modelName} com iluminação âmbar`,
      },
      {
        id: 'studio-hero',
        indexLabel: '04',
        title: 'Transmissão ao Vivo 1-para-1',
        caption:
          'Enquadramento real da bancada de videochamadas com áudio tratado e vídeo em alta definição.',
        category: 'portraits',
        categoryLabel: 'Retratos',
        specs: 'Câmera Principal · Áudio Studio HD',
        src: '/src/assets/images/model_studio_hero_1794946401293.jpg',
        alt: `${modelName} pronta para atendimento por videochamada ao vivo no estúdio`,
      },
      {
        id: 'private-suite',
        indexLabel: '05',
        title: 'Cabine de Transmissão 4K',
        caption:
          'Óptica mirrorless dedicada e mesa em nogueira escura preparados para sessões privadas.',
        category: 'studio',
        categoryLabel: 'Estúdio ao Vivo',
        specs: 'Sensor Full-Frame · Lente Prime',
        src: '/src/assets/images/gallery_private_suite_1794948582898.jpg',
        alt: `Cabine privada de transmissão com câmera cinema e luminária âmbar do estúdio de ${modelName}`,
      },
      {
        id: 'lounge-backdrop',
        indexLabel: '06',
        title: 'Salão Maison Aura',
        caption:
          'Ambiente reservado do estúdio com acústica tratada e atmosfera acolhedora para conversas exclusivas.',
        category: 'studio',
        categoryLabel: 'Estúdio ao Vivo',
        specs: 'Sala Privada · Acústica Tratada',
        src: '/src/assets/images/studio_backdrop_lounge_1794946401840.jpg',
        alt: 'Ambiente interno do salão privado Maison Aura',
      },
    ],
    [modelName]
  );

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
      className="space-y-8 border-t border-white/10 pt-12"
    >
      {/* Editorial Header + Interactive Category Filter */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-medium tracking-wide text-[#C9A46B]">
            Vitrine Editorial · {modelName}
          </p>
          <h2
            id="galeria-modelo-heading"
            className="font-display text-3xl sm:text-4xl font-semibold text-[#F3EFE6] text-balance"
          >
            Prévia Profissional do Estúdio e Retratos
          </h2>
          <p className="text-sm text-[#9BA1AE] leading-relaxed">
            Explore os ensaios recentes e o cenário oficial de transmissão antes de iniciar sua videochamada privada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label="Filtrar galeria da modelo"
            className="flex items-center gap-1 p-1 bg-[#13151A] border border-white/10 rounded-lg overflow-x-auto"
          >
            {GALLERY_CATEGORIES.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={category === tab.id}
                onClick={() => {
                  setCategory(tab.id);
                  setSelectedIndex(null);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === tab.id
                    ? 'bg-[#C9A46B] text-[#0B0C0F]'
                    : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {onPrimaryAction && (
            <button
              type="button"
              disabled={ctaDisabled}
              onClick={onPrimaryAction}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#1F232C] border border-white/15 text-[#F3EFE6] hover:bg-[#2A303C] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Video className="w-3.5 h-3.5 text-[#C9A46B]" />
              <span>{ctaLabel}</span>
            </button>
          )}
        </div>
      </div>

      {/* Bento Photography Grid */}
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
              )} group relative rounded-xl overflow-hidden bg-[#13151A] border border-white/10 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A46B]`}
            >
              {!isFailed ? (
                <img
                  src={item.src}
                  alt={item.alt}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={() => markFailed(item.id)}
                  className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#161920] to-[#0B0C0F] p-6 text-center space-y-2">
                  <Camera className="w-8 h-8 text-[#C9A46B]/60" />
                  <span className="text-xs font-medium text-[#9BA1AE]">
                    {item.title}
                  </span>
                </div>
              )}

              {/* Contrast Scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F]/95 via-[#0B0C0F]/25 to-transparent pointer-events-none" />

              {/* Top-Right Expand Affordance */}
              <span
                aria-hidden="true"
                className="absolute top-3.5 right-3.5 p-2 rounded-lg bg-[#0B0C0F]/75 border border-white/15 text-[#F3EFE6] opacity-80 group-hover:opacity-100 group-hover:border-[#C9A46B]/50 transition-opacity"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </span>

              {/* Clean Unboxed Metadata Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1">
                <p className="text-[11px] font-mono tabular-nums text-[#E2C799] truncate">
                  {item.indexLabel} · {item.categoryLabel} · {item.specs}
                </p>
                <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#F3EFE6]">
                  {item.title}
                </h3>
                {(idx === 0 || category !== 'all') && (
                  <p className="text-xs text-[#C8CCD4] line-clamp-2 max-w-md">
                    {item.caption}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {activePhoto && selectedIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lightbox-photo-title"
          onClick={handleCloseLightbox}
          className="fixed inset-0 z-50 bg-[#050608]/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-5xl w-full bg-[#13151A] border border-white/15 rounded-xl overflow-hidden flex flex-col max-h-[92vh]"
          >
            {/* Lightbox Header */}
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 text-xs">
                <span className="font-mono tabular-nums text-[#E2C799] shrink-0">
                  {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                  {String(visibleItems.length).padStart(2, '0')}
                </span>
                <span className="text-[#727988]" aria-hidden="true">
                  ·
                </span>
                <span className="text-[#9BA1AE] truncate">
                  {activePhoto.categoryLabel} · {activePhoto.specs}
                </span>
              </div>

              <button
                type="button"
                onClick={handleCloseLightbox}
                aria-label="Fechar visualização"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0B0C0F] border border-white/15 text-[#F3EFE6] hover:border-white/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Fechar</span>
              </button>
            </div>

            {/* Lightbox Photo Stage */}
            <div className="relative flex-1 bg-[#0B0C0F] flex items-center justify-center min-h-[280px] overflow-hidden">
              {!failedIds.has(activePhoto.id) ? (
                <img
                  src={activePhoto.src}
                  alt={activePhoto.alt}
                  referrerPolicy="no-referrer"
                  onError={() => markFailed(activePhoto.id)}
                  className="max-h-[62vh] w-auto max-w-full object-contain"
                />
              ) : (
                <div className="p-16 flex flex-col items-center justify-center text-center space-y-2">
                  <Camera className="w-10 h-10 text-[#C9A46B]/60" />
                  <p className="text-sm text-[#9BA1AE]">{activePhoto.title}</p>
                </div>
              )}

              {visibleItems.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Foto anterior"
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-[#0B0C0F]/80 border border-white/15 text-[#F3EFE6] hover:border-[#C9A46B] transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Próxima foto"
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-[#0B0C0F]/80 border border-white/15 text-[#F3EFE6] hover:border-[#C9A46B] transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Lightbox Footer Caption + Direct CTA */}
            <div className="p-5 sm:px-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <h3
                  id="lightbox-photo-title"
                  className="font-display text-2xl font-semibold text-[#F3EFE6]"
                >
                  {activePhoto.title}
                </h3>
                <p className="text-xs text-[#9BA1AE] leading-relaxed">
                  {activePhoto.caption}
                </p>
              </div>

              {onPrimaryAction && (
                <button
                  type="button"
                  disabled={ctaDisabled}
                  onClick={() => {
                    handleCloseLightbox();
                    onPrimaryAction();
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>{ctaLabel}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
