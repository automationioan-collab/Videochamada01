import React, { useEffect, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_GALLERY_ITEMS,
  DEFAULT_STUDIO_CONFIG,
} from '../lib/studioDefaults';
import type {
  GalleryCategoryType,
  GalleryItemRecord,
  StudioConfig,
  StudioProfile,
} from '../types/studio';

interface AdminSiteEditorProps {
  modelProfile: StudioProfile | null;
  studioConfig: StudioConfig | null;
  galleryItems: GalleryItemRecord[];
  onSaveStudioConfig: (
    patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>>
  ) => Promise<void>;
  onSaveGalleryItem: (input: {
    id?: string;
    title: string;
    caption: string;
    category: GalleryCategoryType;
    specs: string;
    src: string;
    alt: string;
    sortOrder: number;
    active: boolean;
  }) => Promise<void>;
  onDeleteGalleryItem: (itemId: string) => Promise<void>;
  onRestoreDefaultGallery: () => Promise<void>;
}

const CATEGORY_LABELS: Record<GalleryCategoryType, string> = {
  editorial: 'Editorial',
  portraits: 'Retratos',
  studio: 'Estúdio ao Vivo',
};

export const AdminSiteEditor: React.FC<AdminSiteEditorProps> = ({
  modelProfile,
  studioConfig,
  galleryItems,
  onSaveStudioConfig,
  onSaveGalleryItem,
  onDeleteGalleryItem,
  onRestoreDefaultGallery,
}) => {
  const [studioBrand, setStudioBrand] = useState(
    DEFAULT_STUDIO_CONFIG.studioBrand
  );
  const [modelName, setModelName] = useState(DEFAULT_STUDIO_CONFIG.modelName);
  const [modelAvatarUrl, setModelAvatarUrl] = useState(
    DEFAULT_STUDIO_CONFIG.modelAvatarUrl
  );
  const [heroImageUrl, setHeroImageUrl] = useState(
    DEFAULT_STUDIO_CONFIG.heroImageUrl
  );
  const [loungeImageUrl, setLoungeImageUrl] = useState(
    DEFAULT_STUDIO_CONFIG.loungeImageUrl
  );
  const [modelBio, setModelBio] = useState(DEFAULT_STUDIO_CONFIG.modelBio);
  const [heroTitle, setHeroTitle] = useState(DEFAULT_STUDIO_CONFIG.heroTitle);
  const [heroSubtitle, setHeroSubtitle] = useState(
    DEFAULT_STUDIO_CONFIG.heroSubtitle
  );
  const [headline, setHeadline] = useState(DEFAULT_STUDIO_CONFIG.headline);
  const [groupButtonLabel, setGroupButtonLabel] = useState(
    DEFAULT_STUDIO_CONFIG.groupButtonLabel
  );
  const [privateButtonLabel, setPrivateButtonLabel] = useState(
    DEFAULT_STUDIO_CONFIG.privateButtonLabel
  );
  const [ratePerMinuteBrl, setRatePerMinuteBrl] = useState('15.00');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);

  // Gallery item editor state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showGalleryForm, setShowGalleryForm] = useState(false);
  const [itemTitle, setItemTitle] = useState('');
  const [itemCaption, setItemCaption] = useState('');
  const [itemCategory, setItemCategory] =
    useState<GalleryCategoryType>('editorial');
  const [itemSpecs, setItemSpecs] = useState('');
  const [itemSrc, setItemSrc] = useState('');
  const [itemAlt, setItemAlt] = useState('');
  const [itemOrder, setItemOrder] = useState('1');
  const [itemActive, setItemActive] = useState(true);
  const [savingGallery, setSavingGallery] = useState(false);
  const [galleryFeedback, setGalleryFeedback] = useState<string | null>(null);
  const [failedThumbIds, setFailedThumbIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    const cfg = studioConfig || DEFAULT_STUDIO_CONFIG;
    setStudioBrand(cfg.studioBrand || DEFAULT_STUDIO_CONFIG.studioBrand);
    setModelName(
      cfg.modelName ||
        modelProfile?.displayName ||
        DEFAULT_STUDIO_CONFIG.modelName
    );
    setModelAvatarUrl(
      cfg.modelAvatarUrl ||
        modelProfile?.photoUrl ||
        DEFAULT_STUDIO_CONFIG.modelAvatarUrl
    );
    setHeroImageUrl(cfg.heroImageUrl || DEFAULT_STUDIO_CONFIG.heroImageUrl);
    setLoungeImageUrl(
      cfg.loungeImageUrl || DEFAULT_STUDIO_CONFIG.loungeImageUrl
    );
    setModelBio(
      cfg.modelBio || modelProfile?.notes || DEFAULT_STUDIO_CONFIG.modelBio
    );
    setHeroTitle(cfg.heroTitle || DEFAULT_STUDIO_CONFIG.heroTitle);
    setHeroSubtitle(cfg.heroSubtitle || DEFAULT_STUDIO_CONFIG.heroSubtitle);
    setHeadline(cfg.headline || DEFAULT_STUDIO_CONFIG.headline);
    setGroupButtonLabel(
      cfg.groupButtonLabel || DEFAULT_STUDIO_CONFIG.groupButtonLabel
    );
    setPrivateButtonLabel(
      cfg.privateButtonLabel || DEFAULT_STUDIO_CONFIG.privateButtonLabel
    );
    setRatePerMinuteBrl(
      (
        (cfg.ratePerMinuteCents || DEFAULT_STUDIO_CONFIG.ratePerMinuteCents) /
        100
      ).toFixed(2)
    );
    setAvatarPreviewFailed(false);
  }, [modelProfile?.displayName, modelProfile?.notes, modelProfile?.photoUrl, studioConfig]);

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigFeedback(null);
    try {
      const normalized = Number(ratePerMinuteBrl.replace(',', '.'));
      const rateCents =
        Number.isFinite(normalized) && normalized > 0
          ? Math.round(normalized * 100)
          : 1500;
      await onSaveStudioConfig({
        studioBrand,
        modelName,
        modelAvatarUrl,
        heroImageUrl,
        loungeImageUrl,
        modelBio,
        heroTitle,
        heroSubtitle,
        headline,
        groupButtonLabel,
        privateButtonLabel,
        ratePerMinuteCents: rateCents,
      });
      setConfigFeedback(
        'Configurações do site, perfil e textos salvas com sucesso no Firebase.'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetDefaults = async () => {
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigFeedback(null);
    try {
      await onSaveStudioConfig({ ...DEFAULT_STUDIO_CONFIG });
      setConfigFeedback('Textos e imagens padrão restaurados.');
    } finally {
      setSavingConfig(false);
    }
  };

  const openCreateGalleryForm = () => {
    setEditingItemId(null);
    setItemTitle('');
    setItemCaption('');
    setItemCategory('editorial');
    setItemSpecs('Estúdio Oficial · HD');
    setItemSrc('');
    setItemAlt('');
    setItemOrder(String((galleryItems.length || DEFAULT_GALLERY_ITEMS.length) + 1));
    setItemActive(true);
    setShowGalleryForm(true);
    setGalleryFeedback(null);
  };

  const openEditGalleryForm = (item: GalleryItemRecord) => {
    setEditingItemId(item.id);
    setItemTitle(item.title);
    setItemCaption(item.caption);
    setItemCategory(item.category);
    setItemSpecs(item.specs);
    setItemSrc(item.src);
    setItemAlt(item.alt);
    setItemOrder(String(item.sortOrder));
    setItemActive(item.active);
    setShowGalleryForm(true);
    setGalleryFeedback(null);
  };

  const handleGallerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingGallery) return;
    setSavingGallery(true);
    setGalleryFeedback(null);
    try {
      await onSaveGalleryItem({
        id: editingItemId || undefined,
        title: itemTitle,
        caption: itemCaption,
        category: itemCategory,
        specs: itemSpecs,
        src: itemSrc,
        alt: itemAlt,
        sortOrder: Number(itemOrder) || 1,
        active: itemActive,
      });
      setShowGalleryForm(false);
      setEditingItemId(null);
      setGalleryFeedback('Galeria atualizada e sincronizada em tempo real.');
    } finally {
      setSavingGallery(false);
    }
  };

  const displayedGallery =
    galleryItems.length > 0
      ? galleryItems
      : DEFAULT_GALLERY_ITEMS.map((item) => ({ ...item }));

  return (
    <div className="space-y-8">
      {/* 1. Complete Site, Identity & Model Profile Form */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#F4C2D7]/15">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Editor Geral do Site, Perfil e Botões
            </h2>
            <p className="text-xs text-[#C9BAC4]">
              Edite nome artístico, foto de perfil, títulos da página pública, rótulos dos botões de chamada e imagens oficiais do estúdio.
            </p>
          </div>
          <button
            type="button"
            disabled={savingConfig}
            onClick={() => void handleResetDefaults()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrão</span>
          </button>
        </div>

        <form onSubmit={handleConfigSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Avatar Live Preview */}
            <div className="lg:col-span-3 flex flex-col items-center text-center gap-3 p-5 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/20">
              {!avatarPreviewFailed && modelAvatarUrl ? (
                <img
                  src={modelAvatarUrl}
                  alt={modelName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarPreviewFailed(true)}
                  className="w-24 h-24 rounded-full object-cover border border-[#F4C2D7]/50"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[#21142D] border border-[#F4C2D7]/30 flex items-center justify-center font-display text-3xl text-[#F4C2D7]">
                  {modelName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-[#FAF4F7]">
                  {modelName}
                </p>
                <p className="text-xs text-[#C9BAC4]">{studioBrand}</p>
              </div>
            </div>

            {/* Identity & Copy Fields */}
            <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-brand"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Nome do Estúdio / Marca
                </label>
                <input
                  id="edit-brand"
                  type="text"
                  maxLength={60}
                  required
                  value={studioBrand}
                  onChange={(e) => setStudioBrand(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-model-name"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Nome da Modelo
                </label>
                <input
                  id="edit-model-name"
                  type="text"
                  maxLength={80}
                  required
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-hero-title"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Título Principal da Página Pública (Hero)
                </label>
                <input
                  id="edit-hero-title"
                  type="text"
                  maxLength={120}
                  required
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-hero-subtitle"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Subtítulo / Descrição da Página Pública
                </label>
                <textarea
                  id="edit-hero-subtitle"
                  rows={2}
                  maxLength={300}
                  required
                  value={heroSubtitle}
                  onChange={(e) => setHeroSubtitle(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7] resize-none"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-headline"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Mensagem da Recepção (Visível após login)
                </label>
                <input
                  id="edit-headline"
                  type="text"
                  maxLength={140}
                  required
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-model-bio"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Bio Curta / Assinatura da Modelo
                </label>
                <input
                  id="edit-model-bio"
                  type="text"
                  maxLength={300}
                  value={modelBio}
                  onChange={(e) => setModelBio(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-group-btn"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Texto do Botão (Chamada Multi-Internautas)
                </label>
                <input
                  id="edit-group-btn"
                  type="text"
                  maxLength={60}
                  required
                  value={groupButtonLabel}
                  onChange={(e) => setGroupButtonLabel(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-private-btn"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Texto do Botão (Chamada Privativa 1-para-1)
                </label>
                <input
                  id="edit-private-btn"
                  type="text"
                  maxLength={60}
                  required
                  value={privateButtonLabel}
                  onChange={(e) => setPrivateButtonLabel(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-avatar-url"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  URL da Foto de Perfil (Avatar)
                </label>
                <input
                  id="edit-avatar-url"
                  type="text"
                  maxLength={500}
                  value={modelAvatarUrl}
                  onChange={(e) => {
                    setModelAvatarUrl(e.target.value);
                    setAvatarPreviewFailed(false);
                  }}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-rate-min"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Tarifa Padrão por Minuto (R$)
                </label>
                <input
                  id="edit-rate-min"
                  type="text"
                  value={ratePerMinuteBrl}
                  onChange={(e) => setRatePerMinuteBrl(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-hero-img"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  URL da Foto Principal (Capa Pública)
                </label>
                <input
                  id="edit-hero-img"
                  type="text"
                  maxLength={500}
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-lounge-img"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  URL da Foto do Salão (Recepção)
                </label>
                <input
                  id="edit-lounge-img"
                  type="text"
                  maxLength={500}
                  value={loungeImageUrl}
                  onChange={(e) => setLoungeImageUrl(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>
            </div>
          </div>

          {configFeedback && (
            <div
              role="status"
              className="p-3 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{configFeedback}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {savingConfig
                  ? 'Salvando alterações...'
                  : 'Salvar Todas as Alterações do Site'}
              </span>
            </button>
          </div>
        </form>
      </section>

      {/* 2. Full Editable Gallery Vitrine Manager */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Gerenciador da Vitrine de Fotos (GaleriaModelo)
            </h2>
            <p className="text-xs text-[#C9BAC4]">
              Adicione, edite, reordene ou oculte qualquer foto da galeria pública da modelo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void onRestoreDefaultGallery()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Fotos Padrão</span>
            </button>

            <button
              type="button"
              onClick={openCreateGalleryForm}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>Adicionar Foto</span>
            </button>
          </div>
        </div>

        {showGalleryForm && (
          <form
            onSubmit={handleGallerySubmit}
            className="p-6 bg-[#150D1D] border-b border-[#F4C2D7]/15 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#FAF4F7]">
                {editingItemId
                  ? 'Editar Foto da Galeria'
                  : 'Nova Foto para Vitrine'}
              </h3>
              <button
                type="button"
                onClick={() => setShowGalleryForm(false)}
                className="p-1.5 rounded-full text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                aria-label="Fechar editor de foto"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="gal-title"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Título da Foto
                </label>
                <input
                  id="gal-title"
                  type="text"
                  maxLength={80}
                  required
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="Ex.: Ensaio Noturno"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="gal-cat"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Categoria
                </label>
                <select
                  id="gal-cat"
                  value={itemCategory}
                  onChange={(e) =>
                    setItemCategory(e.target.value as GalleryCategoryType)
                  }
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                >
                  <option value="editorial">Editorial</option>
                  <option value="portraits">Retratos</option>
                  <option value="studio">Estúdio ao Vivo</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="gal-specs"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Detalhes Técnicos
                </label>
                <input
                  id="gal-specs"
                  type="text"
                  maxLength={80}
                  required
                  value={itemSpecs}
                  onChange={(e) => setItemSpecs(e.target.value)}
                  placeholder="Ex.: 50mm · f/1.4 · HD"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="gal-order"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Ordem de Exibição
                </label>
                <input
                  id="gal-order"
                  type="number"
                  min={0}
                  max={100}
                  value={itemOrder}
                  onChange={(e) => setItemOrder(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="gal-src"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  URL da Imagem
                </label>
                <input
                  id="gal-src"
                  type="text"
                  maxLength={500}
                  required
                  value={itemSrc}
                  onChange={(e) => setItemSrc(e.target.value)}
                  placeholder="https://... ou /src/assets/images/..."
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="gal-alt"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Texto Alternativo (Acessibilidade)
                </label>
                <input
                  id="gal-alt"
                  type="text"
                  maxLength={160}
                  value={itemAlt}
                  onChange={(e) => setItemAlt(e.target.value)}
                  placeholder="Descrição curta da cena"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <label
                  htmlFor="gal-caption"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Legenda Editorial
                </label>
                <input
                  id="gal-caption"
                  type="text"
                  maxLength={240}
                  required
                  value={itemCaption}
                  onChange={(e) => setItemCaption(e.target.value)}
                  placeholder="Descrição exibida ao ampliar a foto"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="flex items-end justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-[#FAF4F7] cursor-pointer h-[38px]">
                  <input
                    type="checkbox"
                    checked={itemActive}
                    onChange={(e) => setItemActive(e.target.checked)}
                    className="accent-[#F4C2D7] cursor-pointer"
                  />
                  <span>Visível no site</span>
                </label>

                <button
                  type="submit"
                  disabled={savingGallery}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap cursor-pointer h-[38px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingGallery ? 'Salvando...' : 'Salvar Foto'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {galleryFeedback && (
          <div className="px-6 py-3 border-b border-[#F4C2D7]/15 bg-[#16A34A]/10 text-xs text-[#86EFAC] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{galleryFeedback}</span>
          </div>
        )}

        <div className="divide-y divide-[#F4C2D7]/10">
          {displayedGallery.map((item) => {
            const thumbFailed = failedThumbIds.has(item.id);
            const isPersisted = galleryItems.some((g) => g.id === item.id);
            return (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-20 h-14 rounded-xl overflow-hidden bg-[#0B060F] border border-[#F4C2D7]/20 shrink-0 flex items-center justify-center">
                    {!thumbFailed ? (
                      <img
                        src={item.src}
                        alt={item.alt}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedThumbIds((prev) => new Set(prev).add(item.id))
                        }
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Camera className="w-5 h-5 text-[#F4C2D7]/60" />
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono tabular-nums text-[#F4C2D7]">
                        #{item.sortOrder}
                      </span>
                      <span className="font-semibold text-[#FAF4F7] truncate">
                        {item.title}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[#C9BAC4]">
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={
                          item.active ? 'text-[#86EFAC]' : 'text-[#938291]'
                        }
                      >
                        {item.active ? 'Visível' : 'Oculta'}
                      </span>
                    </div>
                    <p className="text-xs text-[#C9BAC4] truncate max-w-2xl">
                      {item.caption}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditGalleryForm(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#281837] transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#F4C2D7]" />
                    <span>Editar</span>
                  </button>

                  {isPersisted && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void onSaveGalleryItem({
                            id: item.id,
                            title: item.title,
                            caption: item.caption,
                            category: item.category,
                            specs: item.specs,
                            src: item.src,
                            alt: item.alt,
                            sortOrder: item.sortOrder,
                            active: !item.active,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors cursor-pointer"
                      >
                        {item.active ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5 text-[#86EFAC]" />
                        )}
                        <span>{item.active ? 'Ocultar' : 'Ativar'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void onDeleteGalleryItem(item.id)}
                        aria-label={`Remover ${item.title}`}
                        className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
