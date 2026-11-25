import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Film,
  Globe,
  Lock,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { StudioMediaField } from './StudioMediaField';
import type {
  GalleryCategoryType,
  GalleryItemRecord,
  MediaAssetType,
  MediaVisibility,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
  PublicApprovalStatus,
} from '../types/studio';

interface MediaManagementPanelProps {
  modelId: string;
  isSuperAdmin?: boolean;
  galleryItems: GalleryItemRecord[];
  privateAlbumItems: PrivateAlbumItemRecord[];
  privateAlbumSummary?: PrivateAlbumSummary | null;
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
  onSavePrivateAlbumItem: (input: {
    id?: string;
    title: string;
    caption: string;
    mediaType: MediaAssetType;
    src: string;
    thumbnailUrl?: string;
    sortOrder: number;
    active: boolean;
  }) => Promise<{ ok: boolean; error?: string }>;
  onDeletePrivateAlbumItem: (itemId: string) => Promise<void>;
  onToggleMediaVisibility: (input: {
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
  onSavePrivateAlbumSettings: (input: {
    enabled?: boolean;
    priceCents?: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  onModerateGalleryItem?: (
    modelId: string,
    itemId: string,
    status: 'approved' | 'rejected',
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

type MediaFilter = 'all' | 'public' | 'private' | 'pending';

interface UnifiedMediaEntry {
  key: string;
  id: string;
  title: string;
  caption: string;
  mediaType: MediaAssetType;
  src: string;
  thumbnailUrl?: string;
  sortOrder: number;
  active: boolean;
  visibility: MediaVisibility;
  category?: GalleryCategoryType;
  specs?: string;
  alt?: string;
  approvalStatus?: PublicApprovalStatus;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const MediaManagementPanel: React.FC<MediaManagementPanelProps> = ({
  modelId,
  isSuperAdmin = false,
  galleryItems,
  privateAlbumItems,
  privateAlbumSummary = null,
  onUploadMedia,
  onSaveGalleryItem,
  onDeleteGalleryItem,
  onSavePrivateAlbumItem,
  onDeletePrivateAlbumItem,
  onToggleMediaVisibility,
  onSavePrivateAlbumSettings,
  onModerateGalleryItem,
}) => {
  const [filter, setFilter] = useState<MediaFilter>('all');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [realtimeMsg, setRealtimeMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [failedPreviewKeys, setFailedPreviewKeys] = useState<Set<string>>(
    new Set()
  );

  const [priceBrl, setPriceBrl] = useState('39.00');
  const [albumEnabled, setAlbumEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCaption, setNewCaption] = useState('');
  const [newVisibility, setNewVisibility] = useState<MediaVisibility>('private');
  const [newMediaType, setNewMediaType] = useState<MediaAssetType>('photo');
  const [newCategory, setNewCategory] =
    useState<GalleryCategoryType>('editorial');
  const [newSrc, setNewSrc] = useState('');
  const [newSortOrder, setNewSortOrder] = useState('1');
  const [newActive, setNewActive] = useState(true);
  const [savingNew, setSavingNew] = useState(false);

  useEffect(() => {
    const cents = privateAlbumSummary?.priceCents ?? 3900;
    setPriceBrl((cents / 100).toFixed(2));
    setAlbumEnabled(privateAlbumSummary?.enabled !== false);
  }, [privateAlbumSummary?.enabled, privateAlbumSummary?.priceCents]);

  const unifiedItems = useMemo<UnifiedMediaEntry[]>(() => {
    const publicEntries: UnifiedMediaEntry[] = galleryItems.map((g) => ({
      key: `pub_${g.id}`,
      id: g.id,
      title: g.title,
      caption: g.caption,
      mediaType: g.mediaType === 'video' ? 'video' : 'photo',
      src: g.src,
      sortOrder: g.sortOrder,
      active: g.active,
      visibility: 'public',
      category: g.category,
      specs: g.specs,
      alt: g.alt,
      approvalStatus: g.approvalStatus || 'approved',
    }));

    const privateEntries: UnifiedMediaEntry[] = privateAlbumItems.map((p) => ({
      key: `priv_${p.id}`,
      id: p.id,
      title: p.title,
      caption: p.caption,
      mediaType: p.mediaType === 'video' ? 'video' : 'photo',
      src: p.src,
      thumbnailUrl: p.thumbnailUrl,
      sortOrder: p.sortOrder,
      active: p.active,
      visibility: 'private',
    }));

    return [...publicEntries, ...privateEntries].sort((a, b) => {
      if (a.visibility !== b.visibility) {
        return a.visibility === 'private' ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder;
    });
  }, [galleryItems, privateAlbumItems]);

  const counts = useMemo(() => {
    const pub = unifiedItems.filter((i) => i.visibility === 'public');
    const priv = unifiedItems.filter((i) => i.visibility === 'private');
    const pending = pub.filter((i) => i.approvalStatus === 'pending');
    return {
      total: unifiedItems.length,
      publicCount: pub.length,
      privateCount: priv.length,
      pendingCount: pending.length,
    };
  }, [unifiedItems]);

  const filteredItems = useMemo(() => {
    if (filter === 'public') {
      return unifiedItems.filter((i) => i.visibility === 'public');
    }
    if (filter === 'private') {
      return unifiedItems.filter((i) => i.visibility === 'private');
    }
    if (filter === 'pending') {
      return unifiedItems.filter(
        (i) => i.visibility === 'public' && i.approvalStatus === 'pending'
      );
    }
    return unifiedItems;
  }, [filter, unifiedItems]);

  const handleVisibilitySwitch = async (
    entry: UnifiedMediaEntry,
    targetVisibility: MediaVisibility
  ) => {
    if (entry.visibility === targetVisibility || busyKey) return;
    setBusyKey(entry.key);
    setRealtimeMsg(null);
    setErrorMsg(null);
    try {
      const res = await onToggleMediaVisibility({
        itemId: entry.id,
        fromVisibility: entry.visibility,
        toVisibility: targetVisibility,
        category: entry.category || 'editorial',
      });
      if (res.ok) {
        if (targetVisibility === 'private') {
          setRealtimeMsg(
            `"${entry.title}" movido para Privado em tempo real (visível somente após pagamento).`
          );
        } else if (res.approvalStatus === 'pending') {
          setRealtimeMsg(
            `"${entry.title}" movido para Público e enviado para autorização do Administrador.`
          );
        } else {
          setRealtimeMsg(
            `"${entry.title}" publicado como Público em tempo real.`
          );
        }
      } else {
        setErrorMsg(res.error || 'Erro ao salvar alteração no banco de dados.');
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleActive = async (entry: UnifiedMediaEntry) => {
    if (busyKey) return;
    setBusyKey(entry.key);
    setRealtimeMsg(null);
    setErrorMsg(null);
    try {
      if (entry.visibility === 'public') {
        const res = await onSaveGalleryItem({
          id: entry.id,
          title: entry.title,
          caption: entry.caption || entry.title,
          category: entry.category || 'editorial',
          mediaType: entry.mediaType,
          specs: entry.specs || 'Estúdio Oficial',
          src: entry.src,
          alt: entry.alt || entry.title,
          sortOrder: entry.sortOrder,
          active: !entry.active,
        });
        if (res && !res.ok) {
          setErrorMsg(res.error || 'Erro ao atualizar status da mídia.');
          return;
        }
      } else {
        const res = await onSavePrivateAlbumItem({
          id: entry.id,
          title: entry.title,
          caption: entry.caption || '',
          mediaType: entry.mediaType,
          src: entry.src,
          thumbnailUrl: entry.thumbnailUrl,
          sortOrder: entry.sortOrder,
          active: !entry.active,
        });
        if (!res.ok) {
          setErrorMsg(res.error || 'Erro ao atualizar status da mídia.');
          return;
        }
      }
      setRealtimeMsg(
        `"${entry.title}" ${!entry.active ? 'ativado' : 'ocultado'} no banco de dados em tempo real.`
      );
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteEntry = async (entry: UnifiedMediaEntry) => {
    if (busyKey) return;
    setBusyKey(entry.key);
    setRealtimeMsg(null);
    setErrorMsg(null);
    try {
      if (entry.visibility === 'public') {
        await onDeleteGalleryItem(entry.id);
      } else {
        await onDeletePrivateAlbumItem(entry.id);
      }
      setRealtimeMsg(`"${entry.title}" removido do banco de dados.`);
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveAlbumPricing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingSettings) return;
    setSavingSettings(true);
    setRealtimeMsg(null);
    setErrorMsg(null);
    try {
      const parsed = Number(priceBrl.replace(',', '.'));
      const priceCents =
        Number.isFinite(parsed) && parsed >= 5
          ? Math.round(parsed * 100)
          : 3900;
      const res = await onSavePrivateAlbumSettings({
        enabled: albumEnabled,
        priceCents,
      });
      if (res.ok) {
        setRealtimeMsg(
          `Álbum privado atualizado: ${BRL_FORMATTER.format(priceCents / 100)} · ${albumEnabled ? 'Ativo' : 'Desativado'}.`
        );
      } else {
        setErrorMsg(res.error || 'Erro ao atualizar valor do álbum.');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingNew || !newTitle.trim() || !newSrc.trim()) return;
    setSavingNew(true);
    setRealtimeMsg(null);
    setErrorMsg(null);
    try {
      const sortOrder = Math.max(
        0,
        Math.min(100, Math.round(Number(newSortOrder) || 1))
      );
      if (newVisibility === 'public') {
        const res = await onSaveGalleryItem({
          title: newTitle.trim(),
          caption: newCaption.trim() || newTitle.trim(),
          category: newCategory,
          mediaType: newMediaType,
          specs: isSuperAdmin ? 'Publicado pelo Administrador' : 'Estúdio Oficial',
          src: newSrc.trim(),
          alt: newTitle.trim(),
          sortOrder,
          active: newActive,
        });
        if (!res || res.ok) {
          setShowAddForm(false);
          setNewTitle('');
          setNewCaption('');
          setNewSrc('');
          setRealtimeMsg(
            isSuperAdmin
              ? 'Mídia pública salva e liberada imediatamente.'
              : 'Mídia pública salva e enviada para autorização do Administrador.'
          );
        } else {
          setErrorMsg(res.error || 'Erro ao salvar mídia pública.');
        }
      } else {
        const res = await onSavePrivateAlbumItem({
          title: newTitle.trim(),
          caption: newCaption.trim(),
          mediaType: newMediaType,
          src: newSrc.trim(),
          sortOrder,
          active: newActive,
        });
        if (res.ok) {
          setShowAddForm(false);
          setNewTitle('');
          setNewCaption('');
          setNewSrc('');
          setRealtimeMsg(
            'Mídia salva como Privada em tempo real (visível após pagamento).'
          );
        } else {
          setErrorMsg(res.error || 'Erro ao salvar mídia privada.');
        }
      }
    } finally {
      setSavingNew(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Real-time Summary */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
              <Globe className="w-3.5 h-3.5" />
              <span>Filtro Automático de Visibilidade · Banco de Dados em Tempo Real</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Gerenciamento de Mídia
            </h2>
            <p className="text-xs text-[#C9BAC4] max-w-2xl">
              Marque individualmente cada foto ou vídeo como{' '}
              <strong className="text-[#FAF4F7]">Público</strong> (todos veem após
              autorização do Administrador) ou{' '}
              <strong className="text-[#F4C2D7]">Privado</strong> (somente
              internautas que pagarem podem visualizar). As alterações filtram a
              vitrine instantaneamente.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setNewSortOrder(String(unifiedItems.length + 1));
              setShowAddForm((prev) => !prev);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showAddForm ? (
              <>
                <X className="w-3.5 h-3.5" />
                <span>Fechar Formulário</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Foto ou Vídeo</span>
              </>
            )}
          </button>
        </div>

        {/* Metrics & Album Paywall Price Bar */}
        <div className="grid grid-cols-1 xl:grid-cols-12 border-b border-[#F4C2D7]/15 bg-[#0B060F]/70">
          <div className="xl:col-span-6 grid grid-cols-3 divide-x divide-[#F4C2D7]/15 py-4 px-2">
            <div className="px-4 text-center sm:text-left">
              <p className="text-[11px] text-[#938291] uppercase tracking-wider">
                Total de Mídias
              </p>
              <p className="font-display text-2xl font-semibold text-[#FAF4F7] tabular-nums">
                {counts.total}
              </p>
            </div>
            <div className="px-4 text-center sm:text-left">
              <p className="text-[11px] text-[#938291] uppercase tracking-wider">
                Públicas
              </p>
              <p className="font-display text-2xl font-semibold text-[#86EFAC] tabular-nums">
                {counts.publicCount}
              </p>
            </div>
            <div className="px-4 text-center sm:text-left">
              <p className="text-[11px] text-[#938291] uppercase tracking-wider">
                Privadas (Pagas)
              </p>
              <p className="font-display text-2xl font-semibold text-[#F4C2D7] tabular-nums">
                {counts.privateCount}
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSaveAlbumPricing(e)}
            className="xl:col-span-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t xl:border-t-0 xl:border-l border-[#F4C2D7]/15"
          >
            <label className="inline-flex items-center gap-2 text-xs text-[#FAF4F7] cursor-pointer">
              <input
                type="checkbox"
                checked={albumEnabled}
                onChange={(e) => setAlbumEnabled(e.target.checked)}
                className="accent-[#F4C2D7]"
              />
              <span>Álbum Privado Ativo</span>
            </label>

            <div className="flex items-center gap-2">
              <label
                htmlFor="media-album-price"
                className="text-xs text-[#C9BAC4] whitespace-nowrap"
              >
                Valor p/ Desbloquear (R$):
              </label>
              <input
                id="media-album-price"
                type="number"
                min={5}
                step="0.50"
                required
                value={priceBrl}
                onChange={(e) => setPriceBrl(e.target.value)}
                className="w-24 bg-[#150D1D] border border-[#F4C2D7]/25 rounded-xl px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
              <button
                type="submit"
                disabled={savingSettings}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/40 text-[#FAF4F7] hover:border-[#F4C2D7] whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>{savingSettings ? 'Salvando...' : 'Salvar Preço'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Quick Add Form */}
        {showAddForm && (
          <form
            onSubmit={(e) => void handleCreateMedia(e)}
            className="p-6 bg-[#150D1D] border-b border-[#F4C2D7]/15 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#FAF4F7]">
                Enviar Nova Foto ou Vídeo
              </h3>

              <div className="inline-flex rounded-full bg-[#0B060F] border border-[#F4C2D7]/20 p-1">
                <button
                  type="button"
                  onClick={() => setNewVisibility('public')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    newVisibility === 'public'
                      ? 'bg-[#16A34A]/25 text-[#86EFAC]'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Público</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewVisibility('private')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    newVisibility === 'private'
                      ? 'bg-[#F4C2D7]/25 text-[#F4C2D7]'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Privado (Pago)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="mm-title"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Título da Mídia
                </label>
                <input
                  id="mm-title"
                  type="text"
                  maxLength={80}
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex.: Ensaio Exclusivo Noite"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="mm-type"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Formato
                </label>
                <select
                  id="mm-type"
                  value={newMediaType}
                  onChange={(e) =>
                    setNewMediaType(
                      e.target.value === 'video' ? 'video' : 'photo'
                    )
                  }
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                >
                  <option value="photo">Foto</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="mm-order"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Ordem / Categoria
                </label>
                <div className="flex gap-2">
                  <input
                    id="mm-order"
                    type="number"
                    min={0}
                    max={100}
                    value={newSortOrder}
                    onChange={(e) => setNewSortOrder(e.target.value)}
                    className="w-20 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-2.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                  {newVisibility === 'public' && (
                    <select
                      aria-label="Categoria da galeria pública"
                      value={newCategory}
                      onChange={(e) =>
                        setNewCategory(e.target.value as GalleryCategoryType)
                      }
                      className="flex-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-2.5 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    >
                      <option value="editorial">Editorial</option>
                      <option value="portraits">Retratos</option>
                      <option value="studio">Estúdio</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <StudioMediaField
                  label="Enviar Arquivo para o Servidor ou Inserir URL"
                  value={newSrc}
                  mediaType={newMediaType}
                  onChange={setNewSrc}
                  onChangeMediaType={setNewMediaType}
                  onUploadMedia={
                    onUploadMedia
                      ? (file, targetId, allowVid) =>
                          onUploadMedia(file, targetId || modelId, allowVid)
                      : undefined
                  }
                  targetModelId={modelId}
                  allowVideo={true}
                  showPresets={false}
                  required={true}
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <label
                  htmlFor="mm-caption"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Legenda / Descrição
                </label>
                <input
                  id="mm-caption"
                  type="text"
                  maxLength={240}
                  value={newCaption}
                  onChange={(e) => setNewCaption(e.target.value)}
                  placeholder="Descrição exibida na vitrine ou álbum..."
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="flex items-end justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-[#FAF4F7] cursor-pointer h-[38px]">
                  <input
                    type="checkbox"
                    checked={newActive}
                    onChange={(e) => setNewActive(e.target.checked)}
                    className="accent-[#F4C2D7]"
                  />
                  <span>Ativa</span>
                </label>

                <button
                  type="submit"
                  disabled={savingNew}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 whitespace-nowrap cursor-pointer h-[38px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingNew
                      ? 'Salvando...'
                      : newVisibility === 'private'
                        ? 'Salvar Privado'
                        : isSuperAdmin
                          ? 'Publicar Agora'
                          : 'Enviar p/ Aprovação'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Filter Bar & Feedback */}
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#F4C2D7]/15">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: `Todas (${counts.total})` },
                { id: 'public', label: `Públicas (${counts.publicCount})` },
                { id: 'private', label: `Privadas (${counts.privateCount})` },
                ...(counts.pendingCount > 0
                  ? [
                      {
                        id: 'pending' as MediaFilter,
                        label: `Aguardando Admin (${counts.pendingCount})`,
                      },
                    ]
                  : []),
              ] as Array<{ id: MediaFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
                  filter === tab.id
                    ? 'bg-[#21142D] border-[#F4C2D7]/60 text-[#FAF4F7]'
                    : 'bg-[#0B060F] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {realtimeMsg && (
            <p className="text-xs text-[#86EFAC] inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{realtimeMsg}</span>
            </p>
          )}
          {errorMsg && (
            <p className="text-xs text-red-300">{errorMsg}</p>
          )}
        </div>

        {/* Media List with Real-time Publico | Privado Switch */}
        {filteredItems.length === 0 ? (
          <div className="p-10 text-center text-xs text-[#C9BAC4]">
            Nenhuma mídia encontrada neste filtro. Adicione fotos ou vídeos acima.
          </div>
        ) : (
          <div className="divide-y divide-[#F4C2D7]/10">
            {filteredItems.map((entry) => {
              const isBusy = busyKey === entry.key;
              const previewFailed = failedPreviewKeys.has(entry.key);
              const isVideo = entry.mediaType === 'video';
              const isPublic = entry.visibility === 'public';

              return (
                <div
                  key={entry.key}
                  className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-[#1B1026]/40 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-24 h-16 rounded-xl overflow-hidden bg-[#0B060F] border border-[#F4C2D7]/20 shrink-0 flex items-center justify-center relative">
                      {!previewFailed ? (
                        isVideo ? (
                          <video
                            src={entry.src}
                            poster={entry.thumbnailUrl}
                            muted
                            playsInline
                            preload="metadata"
                            onError={() =>
                              setFailedPreviewKeys((prev) =>
                                new Set(prev).add(entry.key)
                              )
                            }
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img
                            src={entry.src}
                            alt={entry.title}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedPreviewKeys((prev) =>
                                new Set(prev).add(entry.key)
                              )
                            }
                            className="w-full h-full object-cover"
                          />
                        )
                      ) : isVideo ? (
                        <Film className="w-5 h-5 text-[#F4C2D7]/70" />
                      ) : (
                        <Camera className="w-5 h-5 text-[#F4C2D7]/70" />
                      )}
                      {isVideo && (
                        <span className="absolute bottom-1 right-1 bg-[#0B060F]/85 text-[#F4C2D7] p-0.5 rounded">
                          <Film className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#FAF4F7] truncate">
                          {entry.title}
                        </span>
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-[#C9BAC4]">
                          {isVideo ? 'Vídeo' : 'Foto'}
                        </span>
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        {isPublic ? (
                          entry.approvalStatus === 'approved' ? (
                            <span className="text-[#86EFAC] font-medium">
                              Público (Visível a todos)
                            </span>
                          ) : entry.approvalStatus === 'pending' ? (
                            <span className="text-[#FDE68A] inline-flex items-center gap-1 font-medium">
                              <Clock3 className="w-3 h-3" />
                              <span>Aguardando Autorização Admin</span>
                            </span>
                          ) : (
                            <span className="text-[#FCA5A5] font-medium">
                              Público Recusado
                            </span>
                          )
                        ) : (
                          <span className="text-[#F4C2D7] font-medium inline-flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            <span>Privado (Somente quem pagar)</span>
                          </span>
                        )}
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={
                            entry.active ? 'text-[#C9BAC4]' : 'text-[#938291]'
                          }
                        >
                          {entry.active ? 'Ativa' : 'Oculta'}
                        </span>
                      </div>
                      {entry.caption && (
                        <p className="text-xs text-[#C9BAC4] truncate max-w-2xl">
                          {entry.caption}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Segmented Public | Private Switch + Row Actions */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <div
                      role="group"
                      aria-label={`Visibilidade de ${entry.title}`}
                      className="inline-flex items-center rounded-full bg-[#0B060F] border border-[#F4C2D7]/25 p-0.5"
                    >
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleVisibilitySwitch(entry, 'public')}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                          isPublic
                            ? 'bg-[#16A34A]/25 text-[#86EFAC] shadow-sm'
                            : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                        } disabled:opacity-50`}
                      >
                        <Globe className="w-3 h-3" />
                        <span>Público</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleVisibilitySwitch(entry, 'private')}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                          !isPublic
                            ? 'bg-[#F4C2D7]/25 text-[#F4C2D7] shadow-sm'
                            : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                        } disabled:opacity-50`}
                      >
                        <Lock className="w-3 h-3" />
                        <span>Privado</span>
                      </button>
                    </div>

                    {isSuperAdmin &&
                      isPublic &&
                      onModerateGalleryItem &&
                      entry.approvalStatus !== 'approved' && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void onModerateGalleryItem(
                              modelId,
                              entry.id,
                              'approved'
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full bg-[#16A34A]/20 border border-[#16A34A]/50 text-[#86EFAC] hover:bg-[#16A34A]/30 whitespace-nowrap cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Autorizar</span>
                        </button>
                      )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleToggleActive(entry)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] whitespace-nowrap cursor-pointer"
                    >
                      {entry.active ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-[#86EFAC]" />
                      )}
                      <span>{entry.active ? 'Ocultar' : 'Ativar'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleDeleteEntry(entry)}
                      aria-label={`Excluir ${entry.title}`}
                      className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
