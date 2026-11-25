import React, { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  Film,
  ImagePlus,
  KeyRound,
  Lock,
  Pencil,
  QrCode,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_GALLERY_ITEMS,
  DEFAULT_STUDIO_CONFIG,
} from '../lib/studioDefaults';
import { StudioImageField } from './StudioImageField';
import { StudioMediaField } from './StudioMediaField';
import type {
  GalleryCategoryType,
  GalleryItemRecord,
  MediaAssetType,
  MediaVisibility,
  ModelBasicInfo,
  PixKeyType,
  PrivateAlbumItemRecord,
  PrivateAlbumSummary,
  PublicApprovalStatus,
  StudioConfig,
  StudioProfile,
} from '../types/studio';

interface AdminSiteEditorProps {
  modelId?: string;
  isSuperAdmin?: boolean;
  modelProfile: StudioProfile | null;
  studioConfig: StudioConfig | null;
  galleryItems: GalleryItemRecord[];
  privateAlbumSummary?: PrivateAlbumSummary | null;
  privateAlbumItems?: PrivateAlbumItemRecord[];
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
    patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>>
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
  onModerateGalleryItem?: (
    modelId: string,
    itemId: string,
    status: 'approved' | 'rejected',
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
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
  }) => Promise<{ ok: boolean; error?: string }>;
}

const CATEGORY_LABELS: Record<GalleryCategoryType, string> = {
  editorial: 'Editorial',
  portraits: 'Retratos',
  studio: 'Estúdio ao Vivo',
};

export const AdminSiteEditor: React.FC<AdminSiteEditorProps> = ({
  modelId = 'lorena_noir',
  isSuperAdmin = false,
  modelProfile,
  studioConfig,
  galleryItems,
  privateAlbumSummary = null,
  privateAlbumItems = [],
  onUploadImage,
  onUploadMedia,
  onSaveStudioConfig,
  onSaveGalleryItem,
  onDeleteGalleryItem,
  onRestoreDefaultGallery,
  onModerateGalleryItem,
  onSavePrivateAlbumSettings,
  onSavePrivateAlbumItem,
  onDeletePrivateAlbumItem,
  onToggleMediaVisibility,
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
  const [basicAge, setBasicAge] = useState('');
  const [basicLocation, setBasicLocation] = useState('');
  const [basicLanguages, setBasicLanguages] = useState('');
  const [basicHeight, setBasicHeight] = useState('');
  const [basicAppearance, setBasicAppearance] = useState('');
  const [basicSpecialty, setBasicSpecialty] = useState('');
  const [basicAvailabilityNote, setBasicAvailabilityNote] = useState('');

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
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('evp');
  const [pixKey, setPixKey] = useState('');
  const [pixMerchantName, setPixMerchantName] = useState('');
  const [pixMerchantCity, setPixMerchantCity] = useState('SAO PAULO');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [avatarPreviewFailed, setAvatarPreviewFailed] = useState(false);

  // Public gallery item editor state
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [showGalleryForm, setShowGalleryForm] = useState(false);
  const [itemTitle, setItemTitle] = useState('');
  const [itemCaption, setItemCaption] = useState('');
  const [itemCategory, setItemCategory] =
    useState<GalleryCategoryType>('editorial');
  const [itemMediaType, setItemMediaType] = useState<'photo' | 'video'>('photo');
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

  // Private album settings + item editor state
  const [privEnabled, setPrivEnabled] = useState(true);
  const [privPassword, setPrivPassword] = useState('');
  const [showPrivPassword, setShowPrivPassword] = useState(false);
  const [privHint, setPrivHint] = useState('');
  const [privPriceBrl, setPrivPriceBrl] = useState('39.00');
  const [savingPrivSettings, setSavingPrivSettings] = useState(false);
  const [privSettingsMsg, setPrivSettingsMsg] = useState<string | null>(null);

  const [showPrivForm, setShowPrivForm] = useState(false);
  const [editingPrivId, setEditingPrivId] = useState<string | null>(null);
  const [privTitle, setPrivTitle] = useState('');
  const [privCaption, setPrivCaption] = useState('');
  const [privMediaType, setPrivMediaType] = useState<MediaAssetType>('photo');
  const [privSrc, setPrivSrc] = useState('');
  const [privThumbUrl, setPrivThumbUrl] = useState('');
  const [privOrder, setPrivOrder] = useState('1');
  const [privActive, setPrivActive] = useState(true);
  const [savingPrivItem, setSavingPrivItem] = useState(false);
  const [privItemMsg, setPrivItemMsg] = useState<string | null>(null);

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
    const bi: ModelBasicInfo =
      'basicInfo' in cfg && cfg.basicInfo ? cfg.basicInfo : {};
    setBasicAge(bi.age || '');
    setBasicLocation(bi.location || '');
    setBasicLanguages(bi.languages || '');
    setBasicHeight(bi.height || '');
    setBasicAppearance(bi.appearance || '');
    setBasicSpecialty(bi.specialty || '');
    setBasicAvailabilityNote(bi.availabilityNote || '');
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
    setPixKeyType(studioConfig?.pixKeyType || 'evp');
    setPixKey(studioConfig?.pixKey || '');
    setPixMerchantName(studioConfig?.pixMerchantName || '');
    setPixMerchantCity(studioConfig?.pixMerchantCity || 'SAO PAULO');
    setAvatarPreviewFailed(false);
  }, [modelProfile?.displayName, modelProfile?.notes, modelProfile?.photoUrl, studioConfig]);

  useEffect(() => {
    if (privateAlbumSummary) {
      setPrivEnabled(privateAlbumSummary.enabled);
      setPrivHint(privateAlbumSummary.hint || '');
      const cents =
        privateAlbumSummary.priceCents ??
        studioConfig?.privateAlbumPriceCents ??
        3900;
      setPrivPriceBrl((cents / 100).toFixed(2));
    }
  }, [privateAlbumSummary, studioConfig?.privateAlbumPriceCents]);

  const handleConfigSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigFeedback(null);
    setConfigError(null);
    try {
      const normalized = Number(ratePerMinuteBrl.replace(',', '.'));
      const rateCents =
        Number.isFinite(normalized) && normalized > 0
          ? Math.round(normalized * 100)
          : 1500;
      const basicInfo: ModelBasicInfo = {};
      if (basicAge.trim()) basicInfo.age = basicAge.trim();
      if (basicLocation.trim()) basicInfo.location = basicLocation.trim();
      if (basicLanguages.trim()) basicInfo.languages = basicLanguages.trim();
      if (basicHeight.trim()) basicInfo.height = basicHeight.trim();
      if (basicAppearance.trim()) basicInfo.appearance = basicAppearance.trim();
      if (basicSpecialty.trim()) basicInfo.specialty = basicSpecialty.trim();
      if (basicAvailabilityNote.trim()) {
        basicInfo.availabilityNote = basicAvailabilityNote.trim();
      }
      const res = await onSaveStudioConfig({
        studioBrand,
        modelName,
        modelAvatarUrl,
        heroImageUrl,
        loungeImageUrl,
        modelBio,
        basicInfo,
        heroTitle,
        heroSubtitle,
        headline,
        groupButtonLabel,
        privateButtonLabel,
        ratePerMinuteCents: rateCents,
        pixKeyType,
        pixKey: pixKey.trim(),
        pixMerchantName: pixMerchantName.trim(),
        pixMerchantCity: pixMerchantCity.trim(),
      });
      if (res && !res.ok) {
        setConfigError(
          res.error || 'Não foi possível salvar as configurações do estúdio.'
        );
        return;
      }
      setConfigFeedback(
        'Perfil público, descrição, informações básicas, chave PIX, fotos e identidade da modelo salvos com sucesso.'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleResetDefaults = async () => {
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigFeedback(null);
    setConfigError(null);
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
    setItemMediaType('photo');
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
    setItemMediaType(item.mediaType === 'video' ? 'video' : 'photo');
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
      const result = await onSaveGalleryItem({
        id: editingItemId || undefined,
        title: itemTitle,
        caption: itemCaption,
        category: itemCategory,
        mediaType: itemMediaType,
        specs: itemSpecs,
        src: itemSrc,
        alt: itemAlt,
        sortOrder: Number(itemOrder) || 1,
        active: itemActive,
      });
      setShowGalleryForm(false);
      setEditingItemId(null);
      if (result && result.approvalStatus === 'pending') {
        setGalleryFeedback(
          'Mídia pública enviada para autorização do Administrador Geral. Ela ficará visível aos internautas assim que for aprovada.'
        );
      } else {
        setGalleryFeedback('Galeria pública atualizada com sucesso.');
      }
    } finally {
      setSavingGallery(false);
    }
  };

  const handleSavePrivSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSavePrivateAlbumSettings || savingPrivSettings) return;
    setSavingPrivSettings(true);
    setPrivSettingsMsg(null);
    try {
      const parsedPrice = Number(privPriceBrl.replace(',', '.'));
      const priceCents =
        Number.isFinite(parsedPrice) && parsedPrice >= 5
          ? Math.round(parsedPrice * 100)
          : 3900;
      const res = await onSavePrivateAlbumSettings({
        enabled: privEnabled,
        hint: privHint.trim(),
        priceCents,
        ...(privPassword.trim() ? { password: privPassword.trim() } : {}),
      });
      if (res.ok) {
        setPrivPassword('');
        setPrivSettingsMsg(
          'Configurações, valor e senha do Álbum Privativo atualizados.'
        );
      } else {
        setPrivSettingsMsg(res.error || 'Erro ao salvar configurações.');
      }
    } finally {
      setSavingPrivSettings(false);
    }
  };

  const openCreatePrivForm = () => {
    setEditingPrivId(null);
    setPrivTitle('');
    setPrivCaption('');
    setPrivMediaType('photo');
    setPrivSrc('');
    setPrivThumbUrl('');
    setPrivOrder(String(privateAlbumItems.length + 1));
    setPrivActive(true);
    setShowPrivForm(true);
    setPrivItemMsg(null);
  };

  const openEditPrivForm = (item: PrivateAlbumItemRecord) => {
    setEditingPrivId(item.id);
    setPrivTitle(item.title);
    setPrivCaption(item.caption);
    setPrivMediaType(item.mediaType);
    setPrivSrc(item.src);
    setPrivThumbUrl(item.thumbnailUrl || '');
    setPrivOrder(String(item.sortOrder));
    setPrivActive(item.active);
    setShowPrivForm(true);
    setPrivItemMsg(null);
  };

  const handleSavePrivItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSavePrivateAlbumItem || savingPrivItem) return;
    setSavingPrivItem(true);
    setPrivItemMsg(null);
    try {
      const res = await onSavePrivateAlbumItem({
        id: editingPrivId || undefined,
        title: privTitle.trim(),
        caption: privCaption.trim(),
        mediaType: privMediaType,
        src: privSrc.trim(),
        ...(privThumbUrl.trim() ? { thumbnailUrl: privThumbUrl.trim() } : {}),
        sortOrder: Number(privOrder) || 1,
        active: privActive,
      });
      if (res.ok) {
        setShowPrivForm(false);
        setEditingPrivId(null);
        setPrivItemMsg('Item adicionado/atualizado no Álbum Privativo.');
      } else {
        setPrivItemMsg(res.error || 'Erro ao salvar mídia privativa.');
      }
    } finally {
      setSavingPrivItem(false);
    }
  };

  const displayedGallery: GalleryItemRecord[] =
    galleryItems.length > 0
      ? galleryItems
      : DEFAULT_GALLERY_ITEMS.map((item) => ({
          ...item,
          mediaType: item.mediaType || 'photo',
          approvalStatus: item.approvalStatus || 'approved',
        }));

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
                  Descrição Completa da Modelo (Bio Pública)
                </label>
                <textarea
                  id="edit-model-bio"
                  rows={3}
                  maxLength={300}
                  value={modelBio}
                  onChange={(e) => setModelBio(e.target.value)}
                  placeholder="Conte sobre seu estilo de atendimento, personalidade e preferências..."
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7] resize-none"
                />
              </div>

              {/* Basic Information Grid */}
              <div className="sm:col-span-2 p-4 rounded-xl bg-[#0B060F]/75 border border-[#F4C2D7]/15 space-y-3">
                <p className="text-xs font-semibold text-[#F4C2D7]">
                  Informações Básicas do Perfil (Visíveis aos Internautas)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="basic-age"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Idade
                    </label>
                    <input
                      id="basic-age"
                      type="text"
                      maxLength={30}
                      value={basicAge}
                      onChange={(e) => setBasicAge(e.target.value)}
                      placeholder="Ex.: 24 anos"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="basic-location"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Cidade / Localização
                    </label>
                    <input
                      id="basic-location"
                      type="text"
                      maxLength={80}
                      value={basicLocation}
                      onChange={(e) => setBasicLocation(e.target.value)}
                      placeholder="Ex.: São Paulo · Brasil"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="basic-languages"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Idiomas
                    </label>
                    <input
                      id="basic-languages"
                      type="text"
                      maxLength={80}
                      value={basicLanguages}
                      onChange={(e) => setBasicLanguages(e.target.value)}
                      placeholder="Ex.: Português, Inglês"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="basic-height"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Altura
                    </label>
                    <input
                      id="basic-height"
                      type="text"
                      maxLength={30}
                      value={basicHeight}
                      onChange={(e) => setBasicHeight(e.target.value)}
                      placeholder="Ex.: 1,68m"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="basic-appearance"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Visual / Estilo
                    </label>
                    <input
                      id="basic-appearance"
                      type="text"
                      maxLength={100}
                      value={basicAppearance}
                      onChange={(e) => setBasicAppearance(e.target.value)}
                      placeholder="Ex.: Morena, olhos castanhos"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="basic-specialty"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Especialidade
                    </label>
                    <input
                      id="basic-specialty"
                      type="text"
                      maxLength={120}
                      value={basicSpecialty}
                      onChange={(e) => setBasicSpecialty(e.target.value)}
                      placeholder="Ex.: Videochamadas VIP e bate-papo"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <label
                      htmlFor="basic-avail"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Nota Rápida de Horários / Disponibilidade
                    </label>
                    <input
                      id="basic-avail"
                      type="text"
                      maxLength={120}
                      value={basicAvailabilityNote}
                      onChange={(e) => setBasicAvailabilityNote(e.target.value)}
                      placeholder="Ex.: Segunda a sábado, das 14h às 23h"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                </div>
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

              <div className="sm:col-span-2">
                <StudioImageField
                  label="Foto Pública de Perfil (Avatar)"
                  value={modelAvatarUrl}
                  onChange={(url) => {
                    setModelAvatarUrl(url);
                    setAvatarPreviewFailed(false);
                  }}
                  onUploadImage={onUploadImage}
                  previewShape="avatar"
                />
              </div>

              <div>
                <StudioImageField
                  label="Foto Principal (Capa Pública)"
                  value={heroImageUrl}
                  onChange={setHeroImageUrl}
                  onUploadImage={onUploadImage}
                  previewShape="landscape"
                />
              </div>

              <div>
                <StudioImageField
                  label="Foto do Salão (Recepção)"
                  value={loungeImageUrl}
                  onChange={setLoungeImageUrl}
                  onUploadImage={onUploadImage}
                  previewShape="landscape"
                />
              </div>
            </div>
          </div>

          {/* PIX Receiving Key & Merchant Details */}
          <div className="p-5 rounded-2xl bg-[#0B060F]/85 border border-[#38BDF8]/25 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#818CF8]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#0EA5E9]/15 border border-[#38BDF8]/30 flex items-center justify-center shrink-0">
                  <QrCode className="w-4 h-4 text-[#38BDF8]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#FAF4F7]">
                    Recebimento via PIX (Chave & QR Code)
                  </h3>
                  <p className="text-[11px] text-[#C9BAC4]">
                    Chave usada para gerar o QR Code e o Copia e Cola nos pagamentos desta modelo.
                  </p>
                </div>
              </div>
              <span
                className={`text-[11px] font-medium whitespace-nowrap shrink-0 ${
                  pixKey.trim() ? 'text-[#86EFAC]' : 'text-[#FCD34D]'
                }`}
              >
                {pixKey.trim()
                  ? 'Chave personalizada ativa'
                  : 'Usando QR Code padrão do estúdio'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-pix-type"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Tipo de Chave PIX
                </label>
                <select
                  id="edit-pix-type"
                  value={pixKeyType}
                  onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                >
                  <option value="evp">Chave Aleatória (EVP)</option>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone (+55)</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-pix-key"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Chave PIX de Recebimento
                </label>
                <input
                  id="edit-pix-key"
                  type="text"
                  maxLength={140}
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder="Ex.: email@dominio.com, CPF, telefone ou chave aleatória"
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs font-mono text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-pix-city"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Cidade do Titular
                </label>
                <input
                  id="edit-pix-city"
                  type="text"
                  maxLength={15}
                  value={pixMerchantCity}
                  onChange={(e) => setPixMerchantCity(e.target.value)}
                  placeholder="SAO PAULO"
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="edit-pix-name"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Nome do Beneficiário no Comprovante (até 25 caracteres)
                </label>
                <input
                  id="edit-pix-name"
                  type="text"
                  maxLength={25}
                  value={pixMerchantName}
                  onChange={(e) => setPixMerchantName(e.target.value)}
                  placeholder={modelName || 'Nome exibido no app bancário'}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
            </div>
          </div>

          {configError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
            >
              {configError}
            </div>
          )}

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

      {/* 2. Full Editable Public Gallery Vitrine Manager (Requires Super Admin Approval) */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Fotos Públicas da Vitrine (Aprovação do Administrador)
            </h2>
            <p className="text-xs text-[#C9BAC4]">
              Adicione fotos ou vídeos públicos enviando do seu dispositivo ou colando link.{' '}
              <strong className="font-medium text-[#F4C2D7]">
                Toda nova mídia pública enviada pela modelo precisa de autorização do Administrador Geral antes de aparecer no site.
              </strong>
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
              <span>Adicionar Foto Pública</span>
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
                  ? 'Editar Mídia Pública'
                  : 'Nova Mídia Pública (Sujeita a Autorização)'}
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
                  Título da Foto/Mídia
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
                  htmlFor="gal-type"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Tipo de Mídia
                </label>
                <select
                  id="gal-type"
                  value={itemMediaType}
                  onChange={(e) =>
                    setItemMediaType(
                      e.target.value === 'video' ? 'video' : 'photo'
                    )
                  }
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                >
                  <option value="photo">Foto Pública</option>
                  <option value="video">Vídeo Público</option>
                </select>
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

              <div className="sm:col-span-2 lg:col-span-3">
                <StudioMediaField
                  label="Arquivo (Foto/Vídeo para Servidor) ou Link Externo"
                  value={itemSrc}
                  mediaType={itemMediaType}
                  onChange={setItemSrc}
                  onChangeMediaType={setItemMediaType}
                  onUploadMedia={
                    onUploadMedia
                      ? (file, targetId, allowVid) =>
                          onUploadMedia(file, targetId || modelId, allowVid)
                      : undefined
                  }
                  targetModelId={modelId}
                  allowVideo={true}
                  showPresets={true}
                  required={true}
                />
              </div>

              <div className="space-y-3">
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
                    placeholder="Ex.: 50mm · HD"
                    className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="gal-alt"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Texto Alternativo
                  </label>
                  <input
                    id="gal-alt"
                    type="text"
                    maxLength={160}
                    value={itemAlt}
                    onChange={(e) => setItemAlt(e.target.value)}
                    placeholder="Descrição curta"
                    className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
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
                  placeholder="Descrição exibida ao ampliar a foto ou vídeo"
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
                  <span>Ativo</span>
                </label>

                <button
                  type="submit"
                  disabled={savingGallery}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap cursor-pointer h-[38px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingGallery
                      ? 'Enviando...'
                      : isSuperAdmin
                        ? 'Salvar e Publicar'
                        : 'Enviar p/ Autorização'}
                  </span>
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
            const approval = item.approvalStatus || 'approved';
            const isVideo = item.mediaType === 'video';
            return (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-20 h-14 rounded-xl overflow-hidden bg-[#0B060F] border border-[#F4C2D7]/20 shrink-0 flex items-center justify-center">
                    {!thumbFailed ? (
                      isVideo ? (
                        <video
                          src={item.src}
                          muted
                          playsInline
                          preload="metadata"
                          onError={() =>
                            setFailedThumbIds((prev) => new Set(prev).add(item.id))
                          }
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={item.src}
                          alt={item.alt}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedThumbIds((prev) => new Set(prev).add(item.id))
                          }
                          className="w-full h-full object-cover"
                        />
                      )
                    ) : isVideo ? (
                      <Film className="w-5 h-5 text-[#F4C2D7]/60" />
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
                        {isVideo ? 'Vídeo' : 'Foto'} ·{' '}
                        {CATEGORY_LABELS[item.category]}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={
                          approval === 'approved'
                            ? 'text-[#86EFAC] font-medium'
                            : approval === 'pending'
                              ? 'text-[#FCD34D] font-medium inline-flex items-center gap-1'
                              : 'text-[#FCA5A5] font-medium'
                        }
                      >
                        {approval === 'approved' ? (
                          'Autorizada (Pública)'
                        ) : approval === 'pending' ? (
                          <>
                            <Clock3 className="w-3 h-3" />
                            <span>Aguardando Administrador</span>
                          </>
                        ) : (
                          'Recusada pelo Administrador'
                        )}
                      </span>
                      <span className="text-[#938291]" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={
                          item.active ? 'text-[#C9BAC4]' : 'text-[#938291]'
                        }
                      >
                        {item.active ? 'Ativa' : 'Oculta'}
                      </span>
                    </div>
                    <p className="text-xs text-[#C9BAC4] truncate max-w-2xl">
                      {item.caption}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {isSuperAdmin &&
                    isPersisted &&
                    onModerateGalleryItem &&
                    approval !== 'approved' && (
                      <button
                        type="button"
                        onClick={() =>
                          void onModerateGalleryItem(modelId, item.id, 'approved')
                        }
                        className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full bg-[#16A34A]/20 border border-[#16A34A]/50 text-[#86EFAC] hover:bg-[#16A34A]/30 transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Autorizar</span>
                      </button>
                    )}

                  {isSuperAdmin &&
                    isPersisted &&
                    onModerateGalleryItem &&
                    approval === 'pending' && (
                      <button
                        type="button"
                        onClick={() =>
                          void onModerateGalleryItem(modelId, item.id, 'rejected')
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-full bg-red-950/50 border border-red-500/40 text-red-200 hover:bg-red-900/50 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Recusar</span>
                      </button>
                    )}

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
                            mediaType: item.mediaType,
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

                      {onToggleMediaVisibility && (
                        <button
                          type="button"
                          onClick={() =>
                            void onToggleMediaVisibility({
                              itemId: item.id,
                              fromVisibility: 'public',
                              toVisibility: 'private',
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#F4C2D7] hover:bg-[#281837] transition-colors cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Tornar Privado</span>
                        </button>
                      )}

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

      {/* 3. Password-Protected Private Album (Photos & Videos per Model) */}
      <section className="luxury-card border border-[#F4C2D7]/25 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
              <Lock className="w-3.5 h-3.5" />
              <span>Álbum Privativo com Senha · Fotos &amp; Vídeos</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Acervo Privado desta Modelo
            </h2>
            <p className="text-xs text-[#C9BAC4]">
              Configure uma senha exclusiva e envie arquivos de fotos ou vídeos diretamente para o servidor ou cole links externos. Somente quem digitar a senha correta poderá abrir este álbum.
            </p>
          </div>

          {onSavePrivateAlbumItem && (
            <button
              type="button"
              onClick={openCreatePrivForm}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              <span>Adicionar Foto/Vídeo Privado</span>
            </button>
          )}
        </div>

        {/* Album Password & Activation Controls */}
        {onSavePrivateAlbumSettings && (
          <form
            onSubmit={(e) => void handleSavePrivSettings(e)}
            className="p-6 bg-[#0B060F]/70 border-b border-[#F4C2D7]/15 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3 space-y-1.5">
                <span className="block text-xs font-medium text-[#C9BAC4]">
                  Status do Álbum Privado
                </span>
                <label className="flex items-center gap-2.5 h-[40px] px-3.5 rounded-xl bg-[#150D1D] border border-[#F4C2D7]/20 text-xs text-[#FAF4F7] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privEnabled}
                    onChange={(e) => setPrivEnabled(e.target.checked)}
                    className="accent-[#F4C2D7]"
                  />
                  <span>{privEnabled ? 'Álbum Ativo' : 'Álbum Desativado'}</span>
                </label>
              </div>

              <div className="md:col-span-4 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="priv-album-password"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    {privateAlbumSummary?.hasPassword
                      ? 'Alterar Senha (opcional)'
                      : 'Definir Senha do Álbum (mín. 4 chars)'}
                  </label>
                  <span
                    className={`text-[11px] font-medium ${
                      privateAlbumSummary?.hasPassword
                        ? 'text-[#86EFAC]'
                        : 'text-[#FCD34D]'
                    }`}
                  >
                    {privateAlbumSummary?.hasPassword
                      ? 'Senha configurada'
                      : 'Sem senha'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="priv-album-password"
                    type={showPrivPassword ? 'text' : 'password'}
                    minLength={4}
                    maxLength={64}
                    value={privPassword}
                    onChange={(e) => setPrivPassword(e.target.value)}
                    placeholder={
                      privateAlbumSummary?.hasPassword
                        ? 'Deixe vazio para manter a atual'
                        : 'Crie a senha de desbloqueio'
                    }
                    className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl pl-3.5 pr-10 py-2 text-sm font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivPassword((p) => !p)}
                    aria-label="Mostrar ou ocultar senha do álbum"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                  >
                    {showPrivPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 space-y-1.5">
                <label
                  htmlFor="priv-album-price"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Preço Acesso (R$)
                </label>
                <input
                  id="priv-album-price"
                  type="number"
                  min={5}
                  step="0.50"
                  required
                  value={privPriceBrl}
                  onChange={(e) => setPrivPriceBrl(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="md:col-span-3 space-y-1.5">
                <label
                  htmlFor="priv-album-hint"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Dica (Opcional)
                </label>
                <input
                  id="priv-album-hint"
                  type="text"
                  maxLength={120}
                  value={privHint}
                  onChange={(e) => setPrivHint(e.target.value)}
                  placeholder="Ex.: Conteúdo exclusivo VIP"
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="md:col-span-12 flex justify-end">
                <button
                  type="submit"
                  disabled={savingPrivSettings}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/40 text-[#FAF4F7] hover:border-[#F4C2D7] disabled:opacity-50 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#F4C2D7]" />
                  <span>{savingPrivSettings ? 'Salvando...' : 'Salvar Valor e Senha'}</span>
                </button>
              </div>
            </div>

            {privSettingsMsg && (
              <p className="text-xs text-[#86EFAC] flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{privSettingsMsg}</span>
              </p>
            )}
          </form>
        )}

        {/* Private Item Add/Edit Form */}
        {showPrivForm && (
          <form
            onSubmit={(e) => void handleSavePrivItem(e)}
            className="p-6 bg-[#150D1D] border-b border-[#F4C2D7]/15 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#FAF4F7]">
                {editingPrivId
                  ? 'Editar Mídia do Álbum Privativo'
                  : 'Nova Foto ou Vídeo Privado'}
              </h3>
              <button
                type="button"
                onClick={() => setShowPrivForm(false)}
                className="p-1.5 rounded-full text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                aria-label="Fechar editor do álbum privativo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label
                  htmlFor="priv-title"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Título da Foto ou Vídeo Privado
                </label>
                <input
                  id="priv-title"
                  type="text"
                  maxLength={80}
                  required
                  value={privTitle}
                  onChange={(e) => setPrivTitle(e.target.value)}
                  placeholder="Ex.: Bastidores Exclusivos #1"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="priv-type"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Tipo de Conteúdo
                </label>
                <select
                  id="priv-type"
                  value={privMediaType}
                  onChange={(e) =>
                    setPrivMediaType(
                      e.target.value === 'video' ? 'video' : 'photo'
                    )
                  }
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                >
                  <option value="photo">Foto Privada</option>
                  <option value="video">Vídeo Privado</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="priv-order"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Ordem
                </label>
                <input
                  id="priv-order"
                  type="number"
                  min={0}
                  max={100}
                  value={privOrder}
                  onChange={(e) => setPrivOrder(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <StudioMediaField
                  label="Enviar Foto/Vídeo para o Servidor ou Colar Link Externo"
                  value={privSrc}
                  mediaType={privMediaType}
                  onChange={setPrivSrc}
                  onChangeMediaType={setPrivMediaType}
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

              {privMediaType === 'video' && (
                <div className="sm:col-span-2 lg:col-span-4">
                  <StudioImageField
                    label="Imagem de Capa do Vídeo (Opcional)"
                    value={privThumbUrl}
                    onChange={setPrivThumbUrl}
                    onUploadImage={onUploadImage}
                    targetModelId={modelId}
                    showPresets={false}
                  />
                </div>
              )}

              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <label
                  htmlFor="priv-caption"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Descrição / Legenda Privada
                </label>
                <input
                  id="priv-caption"
                  type="text"
                  maxLength={240}
                  value={privCaption}
                  onChange={(e) => setPrivCaption(e.target.value)}
                  placeholder="Detalhes do ensaio ou duração do vídeo..."
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="flex items-end justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-[#FAF4F7] cursor-pointer h-[38px]">
                  <input
                    type="checkbox"
                    checked={privActive}
                    onChange={(e) => setPrivActive(e.target.checked)}
                    className="accent-[#F4C2D7]"
                  />
                  <span>Ativo</span>
                </label>
                <button
                  type="submit"
                  disabled={savingPrivItem}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 cursor-pointer h-[38px]"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingPrivItem ? 'Salvando...' : 'Salvar no Álbum'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {privItemMsg && (
          <div className="px-6 py-3 border-b border-[#F4C2D7]/15 bg-[#16A34A]/10 text-xs text-[#86EFAC] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{privItemMsg}</span>
          </div>
        )}

        {privateAlbumItems.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#C9BAC4]">
            Nenhuma foto ou vídeo cadastrado no álbum privativo desta modelo ainda.
          </div>
        ) : (
          <div className="divide-y divide-[#F4C2D7]/10">
            {privateAlbumItems.map((item) => (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-20 h-14 rounded-xl overflow-hidden bg-[#0B060F] border border-[#F4C2D7]/20 shrink-0 flex items-center justify-center">
                    {item.mediaType === 'video' ? (
                      item.thumbnailUrl ? (
                        <img
                          src={item.thumbnailUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="w-5 h-5 text-[#F4C2D7]" />
                      )
                    ) : (
                      <img
                        src={item.src}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
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
                      <span className="text-[#938291]">·</span>
                      <span className="text-[#F4C2D7]">
                        {item.mediaType === 'video'
                          ? 'Vídeo Privado'
                          : 'Foto Privada'}
                      </span>
                      <span className="text-[#938291]">·</span>
                      <span
                        className={
                          item.active ? 'text-[#86EFAC]' : 'text-[#938291]'
                        }
                      >
                        {item.active ? 'Ativo' : 'Oculto'}
                      </span>
                    </div>
                    {item.caption && (
                      <p className="text-xs text-[#C9BAC4] truncate max-w-2xl">
                        {item.caption}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {onToggleMediaVisibility && (
                    <button
                      type="button"
                      onClick={() =>
                        void onToggleMediaVisibility({
                          itemId: item.id,
                          fromVisibility: 'private',
                          toVisibility: 'public',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#86EFAC] hover:bg-[#281837] cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>
                        {isSuperAdmin ? 'Tornar Público' : 'Enviar p/ Público'}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEditPrivForm(item)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#281837] cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#F4C2D7]" />
                    <span>Editar</span>
                  </button>
                  {onDeletePrivateAlbumItem && (
                    <button
                      type="button"
                      onClick={() => void onDeletePrivateAlbumItem(item.id)}
                      aria-label={`Remover ${item.title}`}
                      className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
