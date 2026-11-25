import React, { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  Film,
  KeyRound,
  LayoutDashboard,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  ADMIN_MODEL_THEMES,
  getAdminModelTheme,
} from '../lib/modelThemes';
import { DEFAULT_STUDIO_CONFIG } from '../lib/studioDefaults';
import { StudioImageField } from './StudioImageField';
import type {
  ModelAccountSummary,
  ModelBasicInfo,
  PendingGalleryReviewItem,
} from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function computeScaledPlanBrlFromRate(rateBrlValue: string) {
  const parsed = Number(rateBrlValue.replace(',', '.'));
  const rateCents =
    Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed * 100) : 1500;
  if (rateCents === 1500) {
    return { express: '89.00', priv: '159.00', vip: '299.00' };
  }
  const scale = rateCents / 1500;
  const fmt = (base: number) =>
    Math.max(5, Math.round((base * scale) / 100)).toFixed(2);
  return {
    express: fmt(8900),
    priv: fmt(15900),
    vip: fmt(29900),
  };
}

interface SuperAdminModelsPanelProps {
  models: ModelAccountSummary[];
  currentOperatedModelId: string;
  pendingGalleryItems?: PendingGalleryReviewItem[];
  onUploadImage?: (
    file: File,
    targetModelId?: string
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onModerateGalleryItem?: (
    modelId: string,
    itemId: string,
    status: 'approved' | 'rejected',
    note?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  onCreateModel: (input: {
    displayName: string;
    loginUsername: string;
    password: string;
    studioBrand?: string;
    modelBio?: string;
    basicInfo?: ModelBasicInfo;
    headline?: string;
    heroTitle?: string;
    heroSubtitle?: string;
    groupButtonLabel?: string;
    privateButtonLabel?: string;
    avatarUrl?: string;
    heroImageUrl?: string;
    loungeImageUrl?: string;
    ratePerMinuteCents?: number;
    planPrices?: {
      express10Cents?: number;
      private20Cents?: number;
      vip45Cents?: number;
    };
    active?: boolean;
    adminThemeColor?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  onUpdateModel: (
    modelId: string,
    patch: {
      displayName?: string;
      loginUsername?: string;
      newPassword?: string;
      active?: boolean;
      studioBrand?: string;
      avatarUrl?: string;
      heroImageUrl?: string;
      loungeImageUrl?: string;
      modelBio?: string;
      basicInfo?: ModelBasicInfo;
      heroTitle?: string;
      heroSubtitle?: string;
      headline?: string;
      groupButtonLabel?: string;
      privateButtonLabel?: string;
      adminThemeColor?: string;
      ratePerMinuteCents?: number;
      recalculatePlans?: boolean;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  onDeleteModel: (modelId: string) => Promise<{ ok: boolean; error?: string }>;
  onSelectModelWorkspace: (
    modelId: string,
    targetSection?: 'private_calls' | 'plans' | 'site' | 'media'
  ) => void;
}

function generateStrongPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export const SuperAdminModelsPanel: React.FC<SuperAdminModelsPanelProps> = ({
  models,
  currentOperatedModelId,
  pendingGalleryItems = [],
  onUploadImage,
  onModerateGalleryItem,
  onCreateModel,
  onUpdateModel,
  onDeleteModel,
  onSelectModelWorkspace,
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [loginUsername, setLoginUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [studioBrand, setStudioBrand] = useState('Maison Aura');
  const [modelBio, setModelBio] = useState('');
  const [createBasicInfo, setCreateBasicInfo] = useState<ModelBasicInfo>({});
  const [createAvatarUrl, setCreateAvatarUrl] = useState(
    DEFAULT_STUDIO_CONFIG.modelAvatarUrl
  );
  const [createHeroImageUrl, setCreateHeroImageUrl] = useState(
    DEFAULT_STUDIO_CONFIG.heroImageUrl
  );
  const [createLoungeImageUrl, setCreateLoungeImageUrl] = useState(
    DEFAULT_STUDIO_CONFIG.loungeImageUrl
  );
  const [createHeadline, setCreateHeadline] = useState('');
  const [rateBrl, setRateBrl] = useState('15.00');
  const [expressPlanBrl, setExpressPlanBrl] = useState('89.00');
  const [privatePlanBrl, setPrivatePlanBrl] = useState('159.00');
  const [vipPlanBrl, setVipPlanBrl] = useState('299.00');
  const [customPlansTouched, setCustomPlansTouched] = useState(false);
  const [createThemeColor, setCreateThemeColor] = useState<string>('auto');
  const [creating, setCreating] = useState(false);
  const [moderatingKey, setModeratingKey] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Per-row full-control edit state
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editDrawerSection, setEditDrawerSection] = useState<
    'all' | 'photos' | 'profile' | 'pricing' | 'access'
  >('all');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editLoginUsername, setEditLoginUsername] = useState('');
  const [editStudioBrand, setEditStudioBrand] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editHeroImageUrl, setEditHeroImageUrl] = useState('');
  const [editLoungeImageUrl, setEditLoungeImageUrl] = useState('');
  const [editModelBio, setEditModelBio] = useState('');
  const [editBasicInfo, setEditBasicInfo] = useState<ModelBasicInfo>({});
  const [editHeroTitle, setEditHeroTitle] = useState('');
  const [editHeroSubtitle, setEditHeroSubtitle] = useState('');
  const [editHeadline, setEditHeadline] = useState('');
  const [editGroupButtonLabel, setEditGroupButtonLabel] = useState('');
  const [editPrivateButtonLabel, setEditPrivateButtonLabel] = useState('');
  const [editThemeColor, setEditThemeColor] = useState<string>('rose_velvet');
  const [editRateBrl, setEditRateBrl] = useState('15.00');
  const [editRecalculatePlans, setEditRecalculatePlans] = useState(true);
  const [editNewPassword, setEditNewPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const summaryStats = useMemo(() => {
    const total = models.length;
    const active = models.filter((m) => m.active).length;
    const online = models.filter((m) => m.metrics?.onlineNow).length;
    const revenueCents = models.reduce(
      (sum, m) => sum + (m.metrics?.totalRevenueCents || 0),
      0
    );
    return { total, active, online, revenueCents };
  }, [models]);

  const handleRateChange = (val: string) => {
    setRateBrl(val);
    if (!customPlansTouched) {
      const scaled = computeScaledPlanBrlFromRate(val);
      setExpressPlanBrl(scaled.express);
      setPrivatePlanBrl(scaled.priv);
      setVipPlanBrl(scaled.vip);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormFeedback(null);
    try {
      const parseCents = (raw: string, fallback: number) => {
        const num = Number(raw.replace(',', '.'));
        return Number.isFinite(num) && num >= 1
          ? Math.round(num * 100)
          : fallback;
      };
      const ratePerMinuteCents = parseCents(rateBrl, 1500);
      const planPrices = {
        express10Cents: parseCents(expressPlanBrl, 8900),
        private20Cents: parseCents(privatePlanBrl, 15900),
        vip45Cents: parseCents(vipPlanBrl, 29900),
      };

      const result = await onCreateModel({
        displayName: displayName.trim(),
        loginUsername: loginUsername.trim(),
        password,
        studioBrand: studioBrand.trim() || 'Maison Aura',
        modelBio: modelBio.trim() || undefined,
        basicInfo: createBasicInfo,
        headline: createHeadline.trim() || undefined,
        avatarUrl: createAvatarUrl.trim() || undefined,
        heroImageUrl: createHeroImageUrl.trim() || undefined,
        loungeImageUrl: createLoungeImageUrl.trim() || undefined,
        ratePerMinuteCents,
        planPrices,
        active: true,
        ...(createThemeColor !== 'auto'
          ? { adminThemeColor: createThemeColor }
          : {}),
      });

      if (!result.ok) {
        setFormFeedback({
          type: 'error',
          text: result.error || 'Não foi possível cadastrar a modelo.',
        });
        return;
      }

      setFormFeedback({
        type: 'success',
        text: `Modelo "${displayName.trim()}" cadastrada com fotos públicas, preços exclusivos, cor visual própria e estúdio isolado pronto.`,
      });
      setDisplayName('');
      setLoginUsername('');
      setPassword('');
      setModelBio('');
      setCreateBasicInfo({});
      setCreateHeadline('');
      setCreateAvatarUrl(DEFAULT_STUDIO_CONFIG.modelAvatarUrl);
      setCreateHeroImageUrl(DEFAULT_STUDIO_CONFIG.heroImageUrl);
      setCreateLoungeImageUrl(DEFAULT_STUDIO_CONFIG.loungeImageUrl);
      setRateBrl('15.00');
      setExpressPlanBrl('89.00');
      setPrivatePlanBrl('159.00');
      setVipPlanBrl('299.00');
      setCustomPlansTouched(false);
      setCreateThemeColor('auto');
      setShowCreateForm(false);
    } finally {
      setCreating(false);
    }
  };

  const startEditing = (model: ModelAccountSummary, fallbackIndex: number) => {
    setEditingModelId(model.id);
    setEditDrawerSection('all');
    setEditDisplayName(model.displayName);
    setEditLoginUsername(model.loginUsername);
    setEditStudioBrand(model.studioBrand);
    setEditAvatarUrl(model.avatarUrl || '');
    setEditHeroImageUrl(model.heroImageUrl || '');
    setEditLoungeImageUrl(model.loungeImageUrl || '');
    setEditModelBio(model.modelBio || '');
    setEditBasicInfo(model.basicInfo || {});
    setEditHeroTitle(
      model.heroTitle || `Videochamada ao vivo com ${model.displayName}.`
    );
    setEditHeroSubtitle(
      model.heroSubtitle || DEFAULT_STUDIO_CONFIG.heroSubtitle
    );
    setEditHeadline(model.headline || '');
    setEditGroupButtonLabel(
      model.groupButtonLabel || DEFAULT_STUDIO_CONFIG.groupButtonLabel
    );
    setEditPrivateButtonLabel(
      model.privateButtonLabel || DEFAULT_STUDIO_CONFIG.privateButtonLabel
    );
    setEditThemeColor(getAdminModelTheme(model.adminThemeColor, fallbackIndex).id);
    setEditRateBrl(((model.ratePerMinuteCents || 1500) / 100).toFixed(2));
    setEditRecalculatePlans(true);
    setEditNewPassword('');
    setShowEditPassword(false);
    setEditError(null);
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async (e: React.FormEvent, modelId: string) => {
    e.preventDefault();
    if (savingEdit) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      const parsedEditRate = Number(editRateBrl.replace(',', '.'));
      const ratePerMinuteCents =
        Number.isFinite(parsedEditRate) && parsedEditRate >= 1
          ? Math.round(parsedEditRate * 100)
          : undefined;
      const result = await onUpdateModel(modelId, {
        displayName: editDisplayName.trim(),
        loginUsername: editLoginUsername.trim(),
        studioBrand: editStudioBrand.trim(),
        avatarUrl: editAvatarUrl.trim(),
        heroImageUrl: editHeroImageUrl.trim(),
        loungeImageUrl: editLoungeImageUrl.trim(),
        modelBio: editModelBio.trim(),
        basicInfo: editBasicInfo,
        heroTitle: editHeroTitle.trim(),
        heroSubtitle: editHeroSubtitle.trim(),
        headline: editHeadline.trim(),
        groupButtonLabel: editGroupButtonLabel.trim(),
        privateButtonLabel: editPrivateButtonLabel.trim(),
        adminThemeColor: editThemeColor,
        ...(ratePerMinuteCents !== undefined
          ? {
              ratePerMinuteCents,
              recalculatePlans: editRecalculatePlans,
            }
          : {}),
        ...(editNewPassword ? { newPassword: editNewPassword } : {}),
      });
      if (!result.ok) {
        setEditError(result.error || 'Falha ao salvar alterações.');
        return;
      }
      setEditingModelId(null);
      setEditNewPassword('');
      setFormFeedback({
        type: 'success',
        text: 'Fotos públicas, descrição, informações básicas, preços, cor visual e credenciais atualizados com sucesso.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleModerate = async (
    modelId: string,
    itemId: string,
    status: 'approved' | 'rejected'
  ) => {
    if (!onModerateGalleryItem || moderatingKey) return;
    const key = `${modelId}:${itemId}`;
    setModeratingKey(key);
    setFormFeedback(null);
    try {
      const res = await onModerateGalleryItem(modelId, itemId, status);
      if (res.ok) {
        setFormFeedback({
          type: 'success',
          text:
            status === 'approved'
              ? 'Mídia autorizada e publicada na vitrine pública da modelo.'
              : 'Mídia recusada e mantida fora da vitrine pública.',
        });
      } else {
        setFormFeedback({
          type: 'error',
          text: res.error || 'Falha ao atualizar autorização da mídia.',
        });
      }
    } finally {
      setModeratingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Summary Strip */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Administração Geral · Controle Multi-Modelos</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Cadastro de Modelos e Senhas Individuais
            </h2>
            <p className="text-xs sm:text-sm text-[#C9BAC4] max-w-2xl leading-relaxed">
              Cada modelo cadastrada acessa o estúdio com seu próprio login e senha exclusiva, enxergando apenas sua fila, planos, receita, agenda e internautas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowCreateForm((prev) => !prev);
              setFormFeedback(null);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            {showCreateForm ? (
              <>
                <X className="w-4 h-4" />
                <span>Fechar Formulário</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Cadastrar Nova Modelo</span>
              </>
            )}
          </button>
        </div>

        {/* Clean 4-Metric Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-[#F4C2D7]/15">
          <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-1">
            <p className="text-xs text-[#C9BAC4]">Modelos Cadastradas</p>
            <p className="font-display text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
              {summaryStats.total}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-1">
            <p className="text-xs text-[#C9BAC4]">Contas Ativas</p>
            <p className="font-display text-2xl font-semibold font-mono tabular-nums text-[#86EFAC]">
              {summaryStats.active}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-1">
            <p className="text-xs text-[#C9BAC4]">Online no Momento</p>
            <p className="font-display text-2xl font-semibold font-mono tabular-nums text-[#F4C2D7]">
              {summaryStats.online}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-1">
            <p className="text-xs text-[#C9BAC4]">Receita Consolidada</p>
            <p className="font-display text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
              {BRL_FORMATTER.format(summaryStats.revenueCents / 100)}
            </p>
          </div>
        </div>
      </section>

      {formFeedback && (
        <div
          role={formFeedback.type === 'error' ? 'alert' : 'status'}
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-3 ${
            formFeedback.type === 'error'
              ? 'bg-red-950/40 border-red-500/35 text-red-200'
              : 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{formFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFormFeedback(null)}
            className="text-current opacity-80 hover:opacity-100 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Pending Public Gallery Authorization Queue */}
      {pendingGalleryItems.length > 0 && (
        <section className="luxury-card border border-[#FCD34D]/35 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#FCD34D]/20 bg-[#21142D]/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Clock3 className="w-4 h-4 text-[#FCD34D] shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-[#FAF4F7]">
                  Autorizações de Fotos e Vídeos Públicos Pendentes
                </h3>
                <p className="text-xs text-[#C9BAC4]">
                  Envios públicos feitos pelas modelos ficam ocultos dos internautas até a sua autorização expressa.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#FDE68A]">
              {pendingGalleryItems.length} pendente
              {pendingGalleryItems.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="divide-y divide-[#F4C2D7]/10">
            {pendingGalleryItems.map((entry) => {
              const key = `${entry.modelId}:${entry.item.id}`;
              const isBusy = moderatingKey === key;
              const isVideo = entry.item.mediaType === 'video';
              return (
                <div
                  key={key}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-[#100916] border border-[#F4C2D7]/20 shrink-0 relative flex items-center justify-center">
                      {isVideo ? (
                        <video
                          src={entry.item.src}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <img
                          src={entry.item.src}
                          alt={entry.item.alt || entry.item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      )}
                      {isVideo && (
                        <span className="absolute bottom-1 right-1 bg-[#0B060F]/85 text-[#F4C2D7] p-1 rounded">
                          <Film className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#F4C2D7]">
                          {entry.modelName}
                        </span>
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-[#FDE68A]">
                          Aguardando Autorização
                        </span>
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-[#C9BAC4]">
                          {isVideo ? 'Vídeo Público' : 'Foto Pública'}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[#FAF4F7] truncate">
                        {entry.item.title}
                      </h4>
                      {entry.item.caption && (
                        <p className="text-xs text-[#C9BAC4] line-clamp-2 max-w-xl">
                          {entry.item.caption}
                        </p>
                      )}
                      <p className="text-[11px] font-mono text-[#938291] truncate max-w-md">
                        {entry.item.src}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {onModerateGalleryItem && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleModerate(
                              entry.modelId,
                              entry.item.id,
                              'approved'
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-[#16A34A] text-white hover:bg-[#15803D] disabled:opacity-45 whitespace-nowrap cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Autorizar Pública</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            void handleModerate(
                              entry.modelId,
                              entry.item.id,
                              'rejected'
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-red-400/30 text-red-200 hover:bg-red-950/50 disabled:opacity-45 whitespace-nowrap cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Recusar</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        onSelectModelWorkspace(entry.modelId, 'site')
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] whitespace-nowrap cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>Ver Galeria</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Create New Model Form */}
      {showCreateForm && (
        <section className="luxury-card border border-[#F4C2D7]/30 rounded-2xl p-6 space-y-5">
          <div className="space-y-1 pb-4 border-b border-[#F4C2D7]/15">
            <h3 className="text-base font-semibold text-[#FAF4F7] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#F4C2D7]" />
              <span>Nova Modelo com Acesso e Painel Isolado</span>
            </h3>
            <p className="text-xs text-[#C9BAC4]">
              Ao salvar, a modelo já pode entrar em /admin usando o login e a senha definidos abaixo.
            </p>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="new-model-name"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Nome Artístico da Modelo
                </label>
                <input
                  id="new-model-name"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ex.: Camila Laurent"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-model-login"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Login ou E-mail de Acesso
                </label>
                <input
                  id="new-model-login"
                  type="text"
                  required
                  minLength={3}
                  maxLength={120}
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Ex.: camila@studio.com ou camila"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="new-model-pass"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Senha Exclusiva (mín. 6 caracteres)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generateStrongPassword());
                      setShowPassword(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[#F4C2D7] hover:text-[#FAF4F7] cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Gerar</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="new-model-pass"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={80}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Defina a senha desta modelo"
                    className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl pl-3.5 pr-10 py-2.5 text-sm font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-model-brand"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Nome do Estúdio / Marca
                </label>
                <input
                  id="new-model-brand"
                  type="text"
                  maxLength={60}
                  value={studioBrand}
                  onChange={(e) => setStudioBrand(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-model-rate"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Tarifa Padrão/Minuto (R$)
                </label>
                <input
                  id="new-model-rate"
                  type="text"
                  value={rateBrl}
                  onChange={(e) => handleRateChange(e.target.value)}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="new-model-bio"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Bio Curta (Opcional)
                </label>
                <input
                  id="new-model-bio"
                  type="text"
                  maxLength={300}
                  value={modelBio}
                  onChange={(e) => setModelBio(e.target.value)}
                  placeholder="Atendimento exclusivo em vídeo HD..."
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>
            </div>

            {/* Per-Model Custom Plan Prices at Creation */}
            <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#FAF4F7]">
                  Tabela de Preços Exclusiva desta Modelo
                </span>
                {customPlansTouched && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomPlansTouched(false);
                      const scaled = computeScaledPlanBrlFromRate(rateBrl);
                      setExpressPlanBrl(scaled.express);
                      setPrivatePlanBrl(scaled.priv);
                      setVipPlanBrl(scaled.vip);
                    }}
                    className="text-[11px] text-[#F4C2D7] hover:underline cursor-pointer"
                  >
                    Recalcular pela tarifa/min
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="new-plan-express"
                    className="block text-[11px] text-[#C9BAC4]"
                  >
                    Express 10 min (R$)
                  </label>
                  <input
                    id="new-plan-express"
                    type="text"
                    value={expressPlanBrl}
                    onChange={(e) => {
                      setCustomPlansTouched(true);
                      setExpressPlanBrl(e.target.value);
                    }}
                    className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="new-plan-private"
                    className="block text-[11px] text-[#C9BAC4]"
                  >
                    Privada 20 min (R$)
                  </label>
                  <input
                    id="new-plan-private"
                    type="text"
                    value={privatePlanBrl}
                    onChange={(e) => {
                      setCustomPlansTouched(true);
                      setPrivatePlanBrl(e.target.value);
                    }}
                    className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="new-plan-vip"
                    className="block text-[11px] text-[#C9BAC4]"
                  >
                    VIP 45 min (R$)
                  </label>
                  <input
                    id="new-plan-vip"
                    type="text"
                    value={vipPlanBrl}
                    onChange={(e) => {
                      setCustomPlansTouched(true);
                      setVipPlanBrl(e.target.value);
                    }}
                    className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#FAF4F7]">
                  Fotos Públicas e Recado Inicial
                </span>
                <span className="text-[11px] text-[#C9BAC4]">
                  Exibidas para os internautas na página pública e seletor de modelos
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <StudioImageField
                  label="Foto de Perfil Pública (Avatar)"
                  value={createAvatarUrl}
                  onChange={setCreateAvatarUrl}
                  onUploadImage={onUploadImage}
                  previewShape="avatar"
                />
                <StudioImageField
                  label="Foto Principal (Capa Pública)"
                  value={createHeroImageUrl}
                  onChange={setCreateHeroImageUrl}
                  onUploadImage={onUploadImage}
                  previewShape="landscape"
                />
                <StudioImageField
                  label="Foto do Salão (Recepção)"
                  value={createLoungeImageUrl}
                  onChange={setCreateLoungeImageUrl}
                  onUploadImage={onUploadImage}
                  previewShape="landscape"
                />
              </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="new-model-headline"
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Frase de Destaque na Recepção (Opcional)
                  </label>
                  <input
                    id="new-model-headline"
                    type="text"
                    maxLength={140}
                    value={createHeadline}
                    onChange={(e) => setCreateHeadline(e.target.value)}
                    placeholder="Ex.: Atendimento VIP 1-para-1 e transmissões exclusivas em vídeo HD"
                    className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-[#F4C2D7]/10">
                  <div className="space-y-1">
                    <label
                      htmlFor="new-model-age"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Idade (Opcional)
                    </label>
                    <input
                      id="new-model-age"
                      type="text"
                      maxLength={30}
                      value={createBasicInfo.age || ''}
                      onChange={(e) =>
                        setCreateBasicInfo((prev) => ({
                          ...prev,
                          age: e.target.value,
                        }))
                      }
                      placeholder="Ex.: 25 anos"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="new-model-location"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Cidade / Localização
                    </label>
                    <input
                      id="new-model-location"
                      type="text"
                      maxLength={80}
                      value={createBasicInfo.location || ''}
                      onChange={(e) =>
                        setCreateBasicInfo((prev) => ({
                          ...prev,
                          location: e.target.value,
                        }))
                      }
                      placeholder="Ex.: São Paulo, SP"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="new-model-languages"
                      className="block text-[11px] text-[#C9BAC4]"
                    >
                      Idiomas
                    </label>
                    <input
                      id="new-model-languages"
                      type="text"
                      maxLength={80}
                      value={createBasicInfo.languages || ''}
                      onChange={(e) =>
                        setCreateBasicInfo((prev) => ({
                          ...prev,
                          languages: e.target.value,
                        }))
                      }
                      placeholder="Ex.: Português, Inglês"
                      className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                    />
                  </div>
                </div>
              </div>

            <div className="p-4 rounded-xl bg-[#0B060F]/80 border border-[#F4C2D7]/15 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#FAF4F7]">
                  Cor Visual Exclusiva do Painel desta Modelo
                </span>
                <span className="text-[11px] text-[#C9BAC4]">
                  {createThemeColor === 'auto'
                    ? 'Automático (atribui a próxima cor livre)'
                    : getAdminModelTheme(createThemeColor).label}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCreateThemeColor('auto')}
                  aria-pressed={createThemeColor === 'auto'}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    createThemeColor === 'auto'
                      ? 'bg-[#21142D] border-[#F4C2D7] text-[#FAF4F7]'
                      : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  Automático
                </button>
                {ADMIN_MODEL_THEMES.map((theme) => {
                  const selected = createThemeColor === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setCreateThemeColor(theme.id)}
                      aria-pressed={selected}
                      title={theme.label}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${
                        selected
                          ? 'bg-[#21142D] border-[#FAF4F7] text-[#FAF4F7] font-semibold'
                          : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                        style={{ backgroundColor: theme.swatchHex }}
                      />
                      <span>{theme.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 px-6 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{creating ? 'Cadastrando...' : 'Criar Conta da Modelo'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Registered Models Directory */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#F4C2D7]/15 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-4 h-4 text-[#F4C2D7]" />
            <h3 className="text-base font-semibold text-[#FAF4F7]">
              Modelos Cadastradas e Credenciais
            </h3>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#C9BAC4]">
            {models.length} conta{models.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="divide-y divide-[#F4C2D7]/10">
          {models.map((model, idx) => {
            const isEditing = editingModelId === model.id;
            const isOperatedNow = currentOperatedModelId === model.id;
            const modelTheme = getAdminModelTheme(model.adminThemeColor, idx);
            return (
              <div key={model.id} className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {model.avatarUrl ? (
                      <img
                        src={model.avatarUrl}
                        alt={model.displayName}
                        referrerPolicy="no-referrer"
                        draggable={false}
                        className="w-12 h-12 rounded-full object-cover border-2 shrink-0 bg-[#1A1024]"
                        style={{ borderColor: modelTheme.swatchHex }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full bg-[#21142D] border-2 flex items-center justify-center font-display text-lg font-semibold shrink-0"
                        style={{
                          borderColor: modelTheme.swatchHex,
                          color: modelTheme.accentText,
                        }}
                      >
                        {model.displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                          style={{ backgroundColor: modelTheme.swatchHex }}
                        />
                        <h4 className="text-base font-semibold text-[#FAF4F7] truncate">
                          {model.displayName}
                        </h4>
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className="text-xs font-medium"
                          style={{ color: modelTheme.accentText }}
                        >
                          {modelTheme.label}
                        </span>
                        <span className="text-[#938291]" aria-hidden="true">
                          ·
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            model.active ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'
                          }`}
                        >
                          {model.active ? 'Ativa' : 'Desativada'}
                        </span>
                        {model.isPrimary && (
                          <>
                            <span className="text-[#938291]" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs font-medium text-[#F4C2D7]">
                              Modelo Principal
                            </span>
                          </>
                        )}
                        {model.metrics?.onlineNow && (
                          <>
                            <span className="text-[#938291]" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-xs font-medium text-[#86EFAC]">
                              Online agora
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#C9BAC4]">
                        <span>
                          Login:{' '}
                          <code className="font-mono text-[#FAF4F7]">
                            {model.loginUsername}
                          </code>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="w-3 h-3 text-[#F4C2D7]" />
                          <span>
                            {model.hasPassword
                              ? 'Senha configurada'
                              : 'Sem senha definida (acesso Google Admin)'}
                          </span>
                        </span>
                        <span className="font-mono tabular-nums text-[#F4C2D7]">
                          {BRL_FORMATTER.format(
                            (model.ratePerMinuteCents || 1500) / 100
                          )}
                          /min · a partir de{' '}
                          {BRL_FORMATTER.format(
                            (model.minPlanPriceCents || 8900) / 100
                          )}
                        </span>
                        <span className="font-mono tabular-nums text-[#C9BAC4]">
                          {model.metrics?.totalCalls ?? 0} chamadas ·{' '}
                          {BRL_FORMATTER.format(
                            (model.metrics?.totalRevenueCents || 0) / 100
                          )}
                        </span>
                        {(model.metrics?.pendingGalleryCount || 0) > 0 && (
                          <span className="font-medium text-[#FDE68A]">
                            · {model.metrics?.pendingGalleryCount} aguardando autorização
                          </span>
                        )}
                        {(model.metrics?.privateAlbumCount || 0) > 0 && (
                          <span className="text-[#C9BAC4]">
                            · {model.metrics?.privateAlbumCount} itens privados
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectModelWorkspace(model.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
                        isOperatedNow
                          ? 'bg-[#21142D] border-[#F4C2D7]/50 text-[#F4C2D7]'
                          : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D]'
                      }`}
                    >
                      <LayoutDashboard className="w-3.5 h-3.5" />
                      <span>
                        {isOperatedNow ? 'Painel Aberto' : 'Abrir Painel'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectModelWorkspace(model.id, 'site')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>Perfil e Galeria</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectModelWorkspace(model.id, 'media')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Film className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>Mídias</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectModelWorkspace(model.id, 'plans')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>Preços</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        isEditing ? setEditingModelId(null) : startEditing(model, idx)
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#21142D] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      <span>{isEditing ? 'Fechar Controle' : 'Controle Total'}</span>
                    </button>

                    {!model.isPrimary && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateModel(model.id, {
                              active: !model.active,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap cursor-pointer ${
                            model.active
                              ? 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FCD34D]'
                              : 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC]'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>{model.active ? 'Desativar' : 'Ativar'}</span>
                        </button>

                        {confirmDeleteId === model.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                void onDeleteModel(model.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-3 py-2 text-xs font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                            >
                              Confirmar Exclusão
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2.5 py-2 text-xs text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(model.id)}
                            aria-label={`Excluir ${model.displayName}`}
                            className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Inline Full-Control Profile, Photos, Copy, Pricing & Access Drawer */}
                {isEditing && (
                  <form
                    onSubmit={(e) => void handleSaveEdit(e, model.id)}
                    className="p-5 rounded-xl bg-[#0B060F]/95 border border-[#F4C2D7]/25 space-y-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#F4C2D7]/15">
                      <div>
                        <p className="text-sm font-semibold text-[#FAF4F7]">
                          Controle Total do Perfil · {model.displayName}
                        </p>
                        <p className="text-[11px] text-[#C9BAC4]">
                          Altere fotos públicas, bio, textos da vitrine, botões, tarifa, cor e credenciais desta modelo.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(
                          [
                            { id: 'all', label: 'Ver Tudo' },
                            { id: 'photos', label: 'Fotos Públicas' },
                            { id: 'profile', label: 'Perfil e Textos' },
                            { id: 'pricing', label: 'Preços e Cor' },
                            { id: 'access', label: 'Login e Senha' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setEditDrawerSection(tab.id)}
                            className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors cursor-pointer ${
                              editDrawerSection === tab.id
                                ? 'bg-[#21142D] border-[#F4C2D7] text-[#FAF4F7]'
                                : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(editDrawerSection === 'all' ||
                      editDrawerSection === 'photos') && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#F4C2D7]">
                            Fotos Públicas do Perfil, Capa e Recepção
                          </span>
                          <button
                            type="button"
                            onClick={() => onSelectModelWorkspace(model.id, 'site')}
                            className="text-[11px] text-[#F4C2D7] hover:underline cursor-pointer"
                          >
                            Abrir Gerenciador Completo da Galeria →
                          </button>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                          <StudioImageField
                            label="Foto de Perfil Pública (Avatar)"
                            value={editAvatarUrl}
                            onChange={setEditAvatarUrl}
                            onUploadImage={onUploadImage}
                            targetModelId={model.id}
                            previewShape="avatar"
                          />
                          <StudioImageField
                            label="Foto Principal (Capa Pública)"
                            value={editHeroImageUrl}
                            onChange={setEditHeroImageUrl}
                            onUploadImage={onUploadImage}
                            targetModelId={model.id}
                            previewShape="landscape"
                          />
                          <StudioImageField
                            label="Foto do Salão (Recepção)"
                            value={editLoungeImageUrl}
                            onChange={setEditLoungeImageUrl}
                            onUploadImage={onUploadImage}
                            targetModelId={model.id}
                            previewShape="landscape"
                          />
                        </div>
                      </div>
                    )}

                    {(editDrawerSection === 'all' ||
                      editDrawerSection === 'profile') && (
                      <div className="space-y-3 pt-1">
                        <span className="block text-xs font-semibold text-[#F4C2D7]">
                          Identidade Pública, Bio, Vitrine e Botões
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-name-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Nome Artístico Público
                            </label>
                            <input
                              id={`edit-name-${model.id}`}
                              type="text"
                              required
                              value={editDisplayName}
                              onChange={(e) => setEditDisplayName(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-brand-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Nome do Estúdio / Marca
                            </label>
                            <input
                              id={`edit-brand-${model.id}`}
                              type="text"
                              required
                              value={editStudioBrand}
                              onChange={(e) => setEditStudioBrand(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-2">
                            <label
                              htmlFor={`edit-bio-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Descrição / Biografia Completa da Modelo
                            </label>
                            <textarea
                              id={`edit-bio-${model.id}`}
                              rows={3}
                              maxLength={1200}
                              value={editModelBio}
                              onChange={(e) => setEditModelBio(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7] resize-none"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-age-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Idade
                            </label>
                            <input
                              id={`edit-age-${model.id}`}
                              type="text"
                              maxLength={30}
                              value={editBasicInfo.age || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  age: e.target.value,
                                }))
                              }
                              placeholder="Ex.: 25 anos"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-location-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Localização / Cidade
                            </label>
                            <input
                              id={`edit-location-${model.id}`}
                              type="text"
                              maxLength={80}
                              value={editBasicInfo.location || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  location: e.target.value,
                                }))
                              }
                              placeholder="Ex.: São Paulo, SP"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-languages-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Idiomas
                            </label>
                            <input
                              id={`edit-languages-${model.id}`}
                              type="text"
                              maxLength={80}
                              value={editBasicInfo.languages || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  languages: e.target.value,
                                }))
                              }
                              placeholder="Ex.: Português, Inglês"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-height-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Altura / Medidas
                            </label>
                            <input
                              id={`edit-height-${model.id}`}
                              type="text"
                              maxLength={40}
                              value={editBasicInfo.height || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  height: e.target.value,
                                }))
                              }
                              placeholder="Ex.: 1,70 m"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-appearance-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Visual / Estilo
                            </label>
                            <input
                              id={`edit-appearance-${model.id}`}
                              type="text"
                              maxLength={80}
                              value={editBasicInfo.appearance || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  appearance: e.target.value,
                                }))
                              }
                              placeholder="Ex.: Morenos, Olhos castanhos"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-specialty-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Especialidade / Atendimento
                            </label>
                            <input
                              id={`edit-specialty-${model.id}`}
                              type="text"
                              maxLength={120}
                              value={editBasicInfo.specialty || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  specialty: e.target.value,
                                }))
                              }
                              placeholder="Ex.: Conversa VIP 1-para-1 e ensaios ao vivo"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-2">
                            <label
                              htmlFor={`edit-avail-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Nota de Horários / Disponibilidade
                            </label>
                            <input
                              id={`edit-avail-${model.id}`}
                              type="text"
                              maxLength={120}
                              value={editBasicInfo.availabilityNote || ''}
                              onChange={(e) =>
                                setEditBasicInfo((p) => ({
                                  ...p,
                                  availabilityNote: e.target.value,
                                }))
                              }
                              placeholder="Ex.: Segunda a Sábado, das 18h às 02h"
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-2">
                            <label
                              htmlFor={`edit-hero-title-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Título Principal da Vitrine Pública (Hero)
                            </label>
                            <input
                              id={`edit-hero-title-${model.id}`}
                              type="text"
                              maxLength={120}
                              value={editHeroTitle}
                              onChange={(e) => setEditHeroTitle(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-2">
                            <label
                              htmlFor={`edit-hero-sub-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Subtítulo / Descrição da Página Pública
                            </label>
                            <textarea
                              id={`edit-hero-sub-${model.id}`}
                              rows={2}
                              maxLength={300}
                              value={editHeroSubtitle}
                              onChange={(e) => setEditHeroSubtitle(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7] resize-none"
                            />
                          </div>

                          <div className="space-y-1.5 sm:col-span-2">
                            <label
                              htmlFor={`edit-headline-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Mensagem da Recepção (Visível aos Internautas)
                            </label>
                            <input
                              id={`edit-headline-${model.id}`}
                              type="text"
                              maxLength={160}
                              value={editHeadline}
                              onChange={(e) => setEditHeadline(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-btn-group-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Rótulo Botão Sala Ao Vivo
                            </label>
                            <input
                              id={`edit-btn-group-${model.id}`}
                              type="text"
                              maxLength={60}
                              value={editGroupButtonLabel}
                              onChange={(e) =>
                                setEditGroupButtonLabel(e.target.value)
                              }
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-btn-priv-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Rótulo Botão Chamada Privativa
                            </label>
                            <input
                              id={`edit-btn-priv-${model.id}`}
                              type="text"
                              maxLength={60}
                              value={editPrivateButtonLabel}
                              onChange={(e) =>
                                setEditPrivateButtonLabel(e.target.value)
                              }
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {(editDrawerSection === 'all' ||
                      editDrawerSection === 'pricing') && (
                      <div className="space-y-4 pt-1">
                        <span className="block text-xs font-semibold text-[#F4C2D7]">
                          Tarifas, Pacotes e Cor Visual
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-rate-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Tarifa por Minuto (R$)
                            </label>
                            <input
                              id={`edit-rate-${model.id}`}
                              type="text"
                              value={editRateBrl}
                              onChange={(e) => setEditRateBrl(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <label className="flex items-center gap-2.5 text-xs text-[#C9BAC4] cursor-pointer py-2">
                            <input
                              type="checkbox"
                              checked={editRecalculatePlans}
                              onChange={(e) =>
                                setEditRecalculatePlans(e.target.checked)
                              }
                              className="rounded border-[#F4C2D7]/30 bg-[#150D1D] accent-[#F4C2D7]"
                            />
                            <span>
                              Recalcular pacotes desta modelo ao alterar a tarifa
                            </span>
                          </label>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[#C9BAC4]">
                              Cor de Identificação Visual do Painel
                            </span>
                            <span className="text-[11px] font-medium text-[#FAF4F7]">
                              {getAdminModelTheme(editThemeColor).label}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {ADMIN_MODEL_THEMES.map((theme) => {
                              const selected = editThemeColor === theme.id;
                              return (
                                <button
                                  key={theme.id}
                                  type="button"
                                  onClick={() => setEditThemeColor(theme.id)}
                                  aria-pressed={selected}
                                  title={theme.label}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-all cursor-pointer ${
                                    selected
                                      ? 'bg-[#21142D] border-[#FAF4F7] text-[#FAF4F7] font-semibold'
                                      : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                                  }`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="w-3 h-3 rounded-full shrink-0 border border-white/25"
                                    style={{ backgroundColor: theme.swatchHex }}
                                  />
                                  <span>{theme.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {(editDrawerSection === 'all' ||
                      editDrawerSection === 'access') && (
                      <div className="space-y-3 pt-1">
                        <span className="block text-xs font-semibold text-[#F4C2D7]">
                          Credenciais de Login Exclusivo da Modelo
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label
                              htmlFor={`edit-login-${model.id}`}
                              className="block text-xs font-medium text-[#C9BAC4]"
                            >
                              Login / E-mail
                            </label>
                            <input
                              id={`edit-login-${model.id}`}
                              type="text"
                              required
                              value={editLoginUsername}
                              onChange={(e) => setEditLoginUsername(e.target.value)}
                              className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <label
                                htmlFor={`edit-pass-${model.id}`}
                                className="block text-xs font-medium text-[#C9BAC4]"
                              >
                                Nova Senha (opcional)
                              </label>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditNewPassword(generateStrongPassword());
                                  setShowEditPassword(true);
                                }}
                                className="text-[11px] font-medium text-[#F4C2D7] hover:text-[#FAF4F7] cursor-pointer"
                              >
                                Gerar
                              </button>
                            </div>
                            <div className="relative">
                              <input
                                id={`edit-pass-${model.id}`}
                                type={showEditPassword ? 'text' : 'password'}
                                minLength={6}
                                value={editNewPassword}
                                onChange={(e) => setEditNewPassword(e.target.value)}
                                placeholder="Deixe vazio para manter"
                                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl pl-3 pr-9 py-2 text-sm font-mono text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                              />
                              <button
                                type="button"
                                onClick={() => setShowEditPassword((p) => !p)}
                                aria-label="Mostrar ou ocultar nova senha"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                              >
                                {showEditPassword ? (
                                  <EyeOff className="w-4 h-4" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {editError && (
                      <p role="alert" className="text-xs text-red-300">
                        {editError}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 pt-2 border-t border-[#F4C2D7]/15">
                      <button
                        type="button"
                        onClick={() => setEditingModelId(null)}
                        className="px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 cursor-pointer"
                      >
                        {savingEdit ? 'Salvando...' : 'Salvar Tudo do Perfil'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
