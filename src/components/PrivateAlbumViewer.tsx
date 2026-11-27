import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Film,
  KeyRound,
  Lock,
  QrCode,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import {
  MercadoPagoMethodSelector,
  getMercadoPagoMethodActionLabel,
} from './MercadoPagoMethodSelector';
import { PixPaymentModal, type PixConfirmationResponse } from './PixPaymentModal';
import type {
  MercadoPagoPaymentMethod,
  PixChargeKind,
  PixChargeRecord,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
} from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

interface PrivateAlbumViewerProps {
  modelId: string;
  modelName: string;
  summary: PrivateAlbumSummary | null;
  isAuthenticated?: boolean;
  mercadoPagoConfigured?: boolean;
  authError?: string | null;
  initialUnlockedItems?: PrivateAlbumItemRecord[];
  onPurchaseAlbum?: (
    modelId: string,
    paymentMethod: 'pix' | 'card'
  ) => Promise<{
    ok: boolean;
    albumToken?: string;
    items?: PrivateAlbumItemRecord[];
    summary?: PrivateAlbumSummary;
    error?: string;
  }>;
  onCreatePixCharge?: (input: {
    modelId: string;
    kind: PixChargeKind;
    amountCents?: number;
    planId?: string;
    topic?: string;
    callMode?: 'group' | 'private';
    note?: string;
    preferredPaymentMethod?: MercadoPagoPaymentMethod;
  }) => Promise<{
    ok: boolean;
    charge?: PixChargeRecord;
    error?: string;
    requiresMercadoPagoToken?: boolean;
  }>;
  onCheckPixCharge?: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onConfirmPixCharge?: (
    modelId: string,
    chargeId: string
  ) => Promise<PixConfirmationResponse>;
  onCancelPixCharge?: (modelId: string, chargeId: string) => Promise<void>;
  onRequireAuth?: () => void;
  onUnlock?: (
    modelId: string,
    password: string
  ) => Promise<{
    ok: boolean;
    albumToken?: string;
    items?: PrivateAlbumItemRecord[];
    summary?: PrivateAlbumSummary;
    error?: string;
  }>;
}

function getEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      parsed.hostname.includes('youtube.com') &&
      parsed.searchParams.get('v')
    ) {
      return `https://www.youtube.com/embed/${encodeURIComponent(
        parsed.searchParams.get('v')!
      )}`;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (id && /^\d+$/.test(id)) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export const PrivateAlbumViewer: React.FC<PrivateAlbumViewerProps> = ({
  modelId,
  modelName,
  summary,
  isAuthenticated = false,
  mercadoPagoConfigured = false,
  authError = null,
  initialUnlockedItems,
  onPurchaseAlbum,
  onCreatePixCharge,
  onCheckPixCharge,
  onConfirmPixCharge,
  onCancelPixCharge,
  onRequireAuth,
  onUnlock,
}) => {
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<MercadoPagoPaymentMethod>('pix');
  const [purchasing, setPurchasing] = useState(false);
  const [activePixCharge, setActivePixCharge] = useState<PixChargeRecord | null>(
    null
  );
  const [requiresTokenFallback, setRequiresTokenFallback] = useState(false);
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockedItems, setUnlockedItems] = useState<
    PrivateAlbumItemRecord[] | null
  >(() =>
    summary?.hasPaidAccess && initialUnlockedItems
      ? initialUnlockedItems
      : null
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  // Reset modal & local selection ONLY when switching models (not on workspace background refreshes!)
  useEffect(() => {
    setActivePixCharge(null);
    setRequiresTokenFallback(false);
    setPassword('');
    setSelectedIndex(null);
    setUnlockError(null);
  }, [modelId]);

  // Sync unlocked vault whenever paid access is granted or refreshed from server
  useEffect(() => {
    if (summary?.hasPaidAccess && initialUnlockedItems) {
      setUnlockedItems(initialUnlockedItems);
      setUnlockError(null);
      setActivePixCharge(null);
    } else if (!summary?.hasPaidAccess) {
      setUnlockedItems((prev) => (prev !== null && summary ? null : prev));
    }
  }, [initialUnlockedItems, summary, summary?.hasPaidAccess]);

  const generateAlbumCharge = async (
    methodOverride?: MercadoPagoPaymentMethod
  ) => {
    if (!onCreatePixCharge) {
      setUnlockError('Serviço de pagamento temporariamente indisponível.');
      return;
    }
    const methodToUse = methodOverride || selectedPaymentMethod;
    setPurchasing(true);
    setUnlockError(null);
    setRequiresTokenFallback(false);
    try {
      const res = await onCreatePixCharge({
        modelId,
        kind: 'private_album',
        preferredPaymentMethod: methodToUse,
      });
      if (res.ok && res.charge) {
        setActivePixCharge(res.charge);
      } else {
        setRequiresTokenFallback(Boolean(res.requiresMercadoPagoToken));
        setUnlockError(
          res.error || 'Não foi possível gerar o pagamento no Mercado Pago.'
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handlePayAndUnlock = async () => {
    if (!isAuthenticated) {
      onRequireAuth?.();
      return;
    }
    if (purchasing) return;

    if (onCreatePixCharge) {
      await generateAlbumCharge(selectedPaymentMethod);
      return;
    }

    if (!onPurchaseAlbum) {
      setUnlockError('Serviço de pagamento indisponível no momento.');
      return;
    }
    setPurchasing(true);
    setUnlockError(null);
    try {
      const res = await onPurchaseAlbum(modelId, 'pix');
      if (res.ok) {
        setUnlockedItems(res.items || []);
      } else {
        setUnlockError(
          res.error || 'Não foi possível concluir o pagamento do álbum privativo.'
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUnlock || unlocking || !password.trim()) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await onUnlock(modelId, password.trim());
      if (res.ok) {
        setUnlockedItems(res.items || []);
        setPassword('');
      } else {
        setUnlockError(res.error || 'Senha incorreta para o álbum privativo.');
      }
    } finally {
      setUnlocking(false);
    }
  };

  const handleLock = () => {
    setUnlockedItems(null);
    setSelectedIndex(null);
    setUnlockError(null);
  };

  const handlePrev = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null || !unlockedItems || unlockedItems.length === 0)
        return null;
      return (prev - 1 + unlockedItems.length) % unlockedItems.length;
    });
  }, [unlockedItems]);

  const handleNext = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev === null || !unlockedItems || unlockedItems.length === 0)
        return null;
      return (prev + 1) % unlockedItems.length;
    });
  }, [unlockedItems]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedIndex(null);
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNext, handlePrev, selectedIndex]);

  if (!summary || !summary.enabled) {
    return null;
  }

  const priceCents = summary.priceCents ?? 3900;
  const activeItem =
    unlockedItems && selectedIndex !== null
      ? unlockedItems[selectedIndex] ?? null
      : null;

  const isUnlocked = unlockedItems !== null;

  return (
    <section
      id="album-privativo"
      aria-labelledby="album-privativo-heading"
      className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#818CF8]/15">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#38BDF8]">
            {isUnlocked ? (
              <Unlock className="w-4 h-4 shrink-0 text-[#86EFAC]" />
            ) : (
              <Lock className="w-4 h-4 shrink-0" />
            )}
            <span>Álbum Privado Pago · {modelName}</span>
          </div>
          <h2
            id="album-privativo-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]"
          >
            Acervo <span className="neo-gradient-text">Privado</span> de Fotos e
            Vídeos
          </h2>
          <p className="text-xs sm:text-sm text-[#B6C2E2]">
            {summary.photoCount} foto{summary.photoCount === 1 ? '' : 's'} e{' '}
            {summary.videoCount} vídeo{summary.videoCount === 1 ? '' : 's'}{' '}
            privados · acesso liberado exclusivamente mediante pagamento.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isUnlocked ? (
            <div className="text-left md:text-right">
              <p className="text-[11px] uppercase tracking-wider text-[#94A3B8]">
                Acesso Completo
              </p>
              <p className="font-display text-2xl font-bold tabular-nums text-[#38BDF8]">
                {BRL_FORMATTER.format(priceCents / 100)}
              </p>
            </div>
          ) : summary.hasPaidAccess ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#86EFAC]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Acesso Pago Liberado</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleLock}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-full bg-[#0D1330] border border-[#818CF8]/35 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Trancar Álbum</span>
            </button>
          )}
        </div>
      </div>

      {!isUnlocked ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="inline-flex items-center gap-2 text-xs font-medium text-[#F8FAFC]">
                <ShieldCheck className="w-4 h-4 text-[#38BDF8] shrink-0" />
                <span>Conteúdo Privado Protegido</span>
              </div>
              <p className="text-sm text-[#B6C2E2] leading-relaxed">
                Enquanto as fotos públicas podem ser vistas por todos os
                visitantes, as fotos e vídeos privados de{' '}
                <strong className="text-[#F8FAFC]">{modelName}</strong> são
                liberados somente para internautas que efetuarem o pagamento do
                álbum.
              </p>
              {summary.hint && (
                <p className="text-xs text-[#C4B5FD]">
                  Nota da modelo: {summary.hint}
                </p>
              )}
            </div>

            <div className="lg:col-span-5 rounded-2xl bg-[#070B1E]/90 border border-[#818CF8]/25 p-5 space-y-4">
              <MercadoPagoMethodSelector
                value={selectedPaymentMethod}
                onChange={(next) => {
                  setSelectedPaymentMethod(next);
                  setUnlockError(null);
                  setRequiresTokenFallback(false);
                }}
                mercadoPagoConfigured={mercadoPagoConfigured}
                disabled={purchasing}
                compact
                theme="indigo"
              />

              {(unlockError || authError) && (
                <div
                  role="alert"
                  className="p-3 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200 space-y-2"
                >
                  <p>{unlockError || authError}</p>
                  {requiresTokenFallback && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPaymentMethod('pix');
                        void generateAlbumCharge('pix');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-full bg-[#0EA5E9]/20 border border-[#38BDF8]/50 text-[#E0F2FE] hover:bg-[#0EA5E9]/30 transition-colors cursor-pointer"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Pagar agora via PIX QR Code</span>
                    </button>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={purchasing}
                onClick={() => void handlePayAndUnlock()}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all cursor-pointer"
              >
                {isAuthenticated ? (
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {purchasing
                    ? 'Preparando pagamento Mercado Pago...'
                    : !isAuthenticated
                      ? `Entrar com Google e Pagar ${BRL_FORMATTER.format(priceCents / 100)}`
                      : `${getMercadoPagoMethodActionLabel(selectedPaymentMethod)} · ${BRL_FORMATTER.format(priceCents / 100)}`}
                </span>
              </button>

              {summary.hasPassword && onUnlock && (
                <div className="pt-2 border-t border-[#818CF8]/15">
                  <button
                    type="button"
                    onClick={() => setShowPasswordFallback((prev) => !prev)}
                    className="text-[11px] font-medium text-[#B6C2E2] hover:text-[#38BDF8] underline underline-offset-2 cursor-pointer"
                  >
                    {showPasswordFallback
                      ? 'Ocultar senha VIP'
                      : 'Possui senha VIP enviada pela modelo?'}
                  </button>

                  {showPasswordFallback && (
                    <form
                      onSubmit={(e) => void handleUnlockSubmit(e)}
                      className="mt-3 space-y-2.5"
                    >
                      <div className="relative">
                        <label
                          htmlFor={`private-album-pass-${modelId}`}
                          className="sr-only"
                        >
                          Senha VIP do Álbum
                        </label>
                        <input
                          id={`private-album-pass-${modelId}`}
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Digite a senha VIP"
                          className="w-full bg-[#0D1330] border border-[#818CF8]/30 rounded-xl pl-3.5 pr-10 py-2 text-xs text-[#F8FAFC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#38BDF8]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B6C2E2] hover:text-[#F8FAFC] cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={unlocking || !password.trim()}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#131C42] border border-[#818CF8]/35 text-[#F8FAFC] hover:border-[#38BDF8] disabled:opacity-50 cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-[#38BDF8]" />
                        <span>
                          {unlocking ? 'Verificando...' : 'Desbloquear com Senha VIP'}
                        </span>
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : unlockedItems.length === 0 ? (
        <p className="text-sm text-[#B6C2E2] py-4">
          Seu acesso está liberado, mas a modelo ainda não adicionou fotos ou
          vídeos privados nesta seleção.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {unlockedItems.map((item, idx) => {
            const isVideo = item.mediaType === 'video';
            const isFailed = failedIds.has(item.id);
            const previewSrc = isVideo
              ? item.thumbnailUrl || item.src
              : item.src;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedIndex(idx)}
                className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#0A0F24] border border-[#818CF8]/25 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8]"
              >
                {!isFailed ? (
                  isVideo && !item.thumbnailUrl ? (
                    getEmbedUrl(item.src) ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#131C42] gap-2 p-4 text-center">
                        <Film className="w-9 h-9 text-[#38BDF8]" />
                        <span className="text-xs text-[#B6C2E2]">
                          Vídeo Privado · Clique para assistir
                        </span>
                      </div>
                    ) : (
                      <video
                        src={item.src}
                        muted
                        playsInline
                        preload="metadata"
                        onError={() =>
                          setFailedIds((prev) => new Set(prev).add(item.id))
                        }
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <img
                      src={previewSrc}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      onError={() =>
                        setFailedIds((prev) => new Set(prev).add(item.id))
                      }
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-2">
                    {isVideo ? (
                      <Film className="w-8 h-8 text-[#A5B4FC]/60" />
                    ) : (
                      <Camera className="w-8 h-8 text-[#A5B4FC]/60" />
                    )}
                    <span className="text-xs text-[#B6C2E2]">{item.title}</span>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#060816]/95 via-[#060816]/25 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-4 space-y-1">
                  <p className="text-[11px] font-mono tabular-nums text-[#38BDF8]">
                    {String(idx + 1).padStart(2, '0')} ·{' '}
                    {isVideo ? 'Vídeo Privado' : 'Foto Privada'}
                  </p>
                  <h3 className="font-display text-lg font-bold text-[#F8FAFC] truncate">
                    {item.title}
                  </h3>
                  {item.caption && (
                    <p className="text-xs text-[#B6C2E2] line-clamp-1">
                      {item.caption}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Lightbox for Unlocked Private Photos & Videos */}
      <AnimatePresence>
        {activeItem && unlockedItems && selectedIndex !== null && (
          <motion.div
            key="private-lightbox"
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedIndex(null)}
            className="fixed inset-0 z-50 bg-[#040611]/92 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-5xl w-full luxury-card border border-[#818CF8]/35 rounded-2xl overflow-hidden flex flex-col max-h-[92vh]"
            >
              <div className="px-5 py-3.5 border-b border-[#818CF8]/20 flex items-center justify-between gap-4">
                <div className="text-xs flex items-center gap-3">
                  <span className="font-mono tabular-nums text-[#38BDF8]">
                    {String(selectedIndex + 1).padStart(2, '0')} /{' '}
                    {String(unlockedItems.length).padStart(2, '0')}
                  </span>
                  <span className="text-[#94A3B8]">·</span>
                  <span className="text-[#B6C2E2]">
                    {activeItem.mediaType === 'video'
                      ? 'Vídeo Privado'
                      : 'Foto Privada'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedIndex(null)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#070B1E] border border-[#818CF8]/30 text-[#F8FAFC] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Fechar</span>
                </button>
              </div>

              <div className="relative flex-1 bg-[#060816] flex items-center justify-center min-h-[280px] overflow-hidden">
                {activeItem.mediaType === 'video' ? (
                  (() => {
                    const embed = getEmbedUrl(activeItem.src);
                    if (embed) {
                      return (
                        <iframe
                          src={embed}
                          title={activeItem.title}
                          allow="autoplay; fullscreen; picture-in-picture"
                          allowFullScreen
                          className="w-full h-[60vh] border-0"
                        />
                      );
                    }
                    return (
                      <video
                        key={activeItem.id}
                        src={activeItem.src}
                        controls
                        autoPlay
                        playsInline
                        controlsList="nodownload"
                        onContextMenu={(e) => e.preventDefault()}
                        className="max-h-[62vh] w-auto max-w-full"
                      />
                    );
                  })()
                ) : (
                  <img
                    src={activeItem.src}
                    alt={activeItem.title}
                    referrerPolicy="no-referrer"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                    className="max-h-[62vh] w-auto max-w-full object-contain"
                  />
                )}

                {unlockedItems.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrev}
                      aria-label="Anterior"
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-[#060816]/85 border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8] cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      aria-label="Próximo"
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2.5 rounded-full bg-[#060816]/85 border border-[#818CF8]/30 text-[#F8FAFC] hover:border-[#38BDF8] cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              <div className="p-5 border-t border-[#818CF8]/20 space-y-1">
                <h3 className="font-display text-xl font-bold text-[#F8FAFC]">
                  {activeItem.title}
                </h3>
                {activeItem.caption && (
                  <p className="text-xs text-[#B6C2E2]">{activeItem.caption}</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {activePixCharge && onCheckPixCharge && onConfirmPixCharge && (
        <PixPaymentModal
          charge={activePixCharge}
          title={
            activePixCharge.preferredPaymentMethod &&
            activePixCharge.preferredPaymentMethod !== 'pix'
              ? 'Checkout Mercado Pago · Álbum Privativo'
              : 'Pagamento PIX · Álbum Privativo'
          }
          subtitle={`Desbloqueio exclusivo do acervo de ${modelName}`}
          confirmLabel={
            activePixCharge.preferredPaymentMethod &&
            activePixCharge.preferredPaymentMethod !== 'pix'
              ? 'Já Paguei no Mercado Pago · Liberar Álbum'
              : 'Já Paguei via PIX · Liberar Álbum'
          }
          onClose={() => setActivePixCharge(null)}
          onCancelCharge={onCancelPixCharge}
          onCheckStatus={onCheckPixCharge}
          onConfirmPayment={onConfirmPixCharge}
          onRegenerate={() =>
            generateAlbumCharge(activePixCharge.preferredPaymentMethod)
          }
          onPaid={(res) => {
            setUnlockedItems(res.items || []);
            setActivePixCharge(null);
          }}
        />
      )}
    </section>
  );
};
