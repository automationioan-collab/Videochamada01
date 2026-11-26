import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  MessageCircle,
  Phone,
  Save,
  Send,
  Share2,
  Sparkles,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { DEFAULT_STUDIO_CONFIG } from '../lib/studioDefaults';
import { StudioImageField } from './StudioImageField';
import type {
  CallEntryIntent,
  CallPlan,
  GalleryItemRecord,
  PresencePeer,
  PrivateAlbumItemRecord,
  StudioConfig,
  StudioProfile,
  WhatsappInviteRecord,
  WhatsappInviteStatus,
} from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatWhatsappDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  if (digits.length >= 12 && digits.length <= 15) {
    return digits;
  }
  return '';
}

function buildInviteAbsoluteUrl(invitePathOrId: string): string {
  const path = invitePathOrId.startsWith('/')
    ? invitePathOrId
    : `/convite/${invitePathOrId}`;
  if (typeof window === 'undefined') return path;
  return `${window.location.origin}${path}`;
}

function buildWhatsappShareUrl(phoneDigits: string, text: string): string {
  const encoded = encodeURIComponent(text);
  return phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

interface PhotoCandidate {
  id: string;
  label: string;
  sourceLabel: string;
  url: string;
}

export interface WhatsappInvitePanelProps {
  modelId: string;
  modelName: string;
  studioBrand: string;
  studioConfig: StudioConfig | null;
  galleryItems: GalleryItemRecord[];
  privateAlbumItems?: PrivateAlbumItemRecord[];
  callPlans: CallPlan[];
  allProfiles: StudioProfile[];
  peers: PresencePeer[];
  whatsappInvites: WhatsappInviteRecord[];
  onUploadImage?: (
    file: File,
    targetModelId?: string
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  onSaveStudioConfig: (
    patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>>
  ) => Promise<{ ok: boolean; error?: string } | void>;
  onCreateWhatsappInvite: (input: {
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
  onDeleteWhatsappInvite: (inviteId: string) => Promise<void>;
}

const STATUS_META: Record<
  WhatsappInviteStatus,
  { label: string; className: string }
> = {
  pending: { label: 'Aguardando abertura', className: 'text-[#FCD34D]' },
  viewed: { label: 'Visualizado pelo internauta', className: 'text-[#38BDF8]' },
  paid: { label: 'Pago e contratado', className: 'text-[#86EFAC]' },
};

export const WhatsappInvitePanel: React.FC<WhatsappInvitePanelProps> = ({
  modelId,
  modelName,
  studioBrand,
  studioConfig,
  galleryItems,
  privateAlbumItems = [],
  callPlans,
  allProfiles,
  peers,
  whatsappInvites,
  onUploadImage,
  onSaveStudioConfig,
  onCreateWhatsappInvite,
  onDeleteWhatsappInvite,
}) => {
  const defaultPhoto =
    studioConfig?.whatsappInvitePhotoUrl ||
    studioConfig?.heroImageUrl ||
    studioConfig?.modelAvatarUrl ||
    DEFAULT_STUDIO_CONFIG.heroImageUrl;

  const defaultMessage =
    studioConfig?.whatsappInviteMessage ||
    `Oi {internauta}! Aqui é a ${modelName}. Separei esta foto especial para te convidar para uma videochamada exclusiva comigo agora. Toque no link abaixo para realizar o pagamento e entrar na sala ao vivo:`;

  const [photoUrl, setPhotoUrl] = useState<string>(defaultPhoto);
  const [messageTemplate, setMessageTemplate] = useState<string>(defaultMessage);
  const [recipientName, setRecipientName] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    studioConfig?.whatsappInvitePlanId || ''
  );
  const [callMode, setCallMode] = useState<CallEntryIntent>(
    studioConfig?.whatsappInviteCallMode === 'group' ? 'group' : 'private'
  );
  const [saveDefaultsOnCreate, setSaveDefaultsOnCreate] = useState<boolean>(true);

  const [savingDefaults, setSavingDefaults] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [sharingNative, setSharingNative] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewImgFailed, setPreviewImgFailed] = useState(false);
  const [activeInvite, setActiveInvite] = useState<WhatsappInviteRecord | null>(
    null
  );

  useEffect(() => {
    setPhotoUrl(
      studioConfig?.whatsappInvitePhotoUrl ||
        studioConfig?.heroImageUrl ||
        studioConfig?.modelAvatarUrl ||
        DEFAULT_STUDIO_CONFIG.heroImageUrl
    );
    setMessageTemplate(
      studioConfig?.whatsappInviteMessage ||
        `Oi {internauta}! Aqui é a ${modelName}. Separei esta foto especial para te convidar para uma sala privativa 1-para-1 comigo agora. Toque no link abaixo para realizar o pagamento e iniciar sua sessão:`
    );
    setSelectedPlanId(studioConfig?.whatsappInvitePlanId || '');
    setCallMode('private');
    setActiveInvite(null);
    setErrorMsg(null);
    setFeedbackMsg(null);
  }, [
    modelId,
    modelName,
    studioConfig?.heroImageUrl,
    studioConfig?.modelAvatarUrl,
    studioConfig?.whatsappInviteCallMode,
    studioConfig?.whatsappInviteMessage,
    studioConfig?.whatsappInvitePhotoUrl,
    studioConfig?.whatsappInvitePlanId,
  ]);

  useEffect(() => {
    setPreviewImgFailed(false);
  }, [photoUrl]);

  const activePlans = useMemo(
    () => callPlans.filter((p) => p.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [callPlans]
  );

  const selectedPlan = useMemo(
    () => activePlans.find((p) => p.id === selectedPlanId) || null,
    [activePlans, selectedPlanId]
  );

  const photoCandidates = useMemo<PhotoCandidate[]>(() => {
    const seen = new Set<string>();
    const list: PhotoCandidate[] = [];
    const push = (
      id: string,
      label: string,
      sourceLabel: string,
      url?: string
    ) => {
      const clean = (url || '').trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      list.push({ id, label, sourceLabel, url: clean });
    };

    push(
      'default_invite',
      'Foto Padrão do Convite',
      'Padrão',
      studioConfig?.whatsappInvitePhotoUrl
    );
    push('hero', 'Foto de Capa', 'Perfil', studioConfig?.heroImageUrl);
    push('avatar', 'Avatar da Modelo', 'Perfil', studioConfig?.modelAvatarUrl);
    push('lounge', 'Sala Privada', 'Perfil', studioConfig?.loungeImageUrl);

    for (const item of galleryItems) {
      if ((item.mediaType || 'photo') !== 'photo') continue;
      push(item.id, item.title || 'Foto Pública', 'Pública', item.src);
    }

    for (const item of privateAlbumItems) {
      if (item.mediaType !== 'photo') continue;
      push(item.id, item.title || 'Foto Privada', 'Privada', item.src);
    }

    return list;
  }, [
    galleryItems,
    privateAlbumItems,
    studioConfig?.heroImageUrl,
    studioConfig?.loungeImageUrl,
    studioConfig?.modelAvatarUrl,
    studioConfig?.whatsappInvitePhotoUrl,
  ]);

  const visitorSuggestions = useMemo(() => {
    const list: Array<{ uid: string; displayName: string; online: boolean }> = [];
    const seen = new Set<string>();
    for (const peer of peers) {
      if (peer.role === 'model' || seen.has(peer.uid)) continue;
      seen.add(peer.uid);
      list.push({ uid: peer.uid, displayName: peer.displayName, online: true });
    }
    for (const prof of allProfiles) {
      if (prof.role === 'model' || prof.accessStatus === 'blocked' || seen.has(prof.uid)) {
        continue;
      }
      seen.add(prof.uid);
      list.push({ uid: prof.uid, displayName: prof.displayName, online: false });
    }
    return list.slice(0, 8);
  }, [allProfiles, peers]);

  const resolvedMessage = useMemo(() => {
    const visitorLabel = recipientName.trim() || 'você';
    const planLabel = selectedPlan
      ? `${selectedPlan.name} (${BRL_FORMATTER.format(selectedPlan.priceCents / 100)})`
      : 'o pacote que preferir';

    return messageTemplate
      .replace(/\{internauta\}/gi, visitorLabel)
      .replace(/\{modelo\}/gi, modelName)
      .replace(/\{plano\}/gi, planLabel)
      .trim();
  }, [messageTemplate, modelName, recipientName, selectedPlan]);

  const normalizedPhoneDigits = useMemo(
    () => formatWhatsappDigits(recipientPhone),
    [recipientPhone]
  );

  const previewLinkUrl = useMemo(() => {
    if (activeInvite) {
      return buildInviteAbsoluteUrl(activeInvite.id);
    }
    if (whatsappInvites[0]) {
      return buildInviteAbsoluteUrl(whatsappInvites[0].id);
    }
    return buildInviteAbsoluteUrl('seu-convite');
  }, [activeInvite, whatsappInvites]);

  const buildFullWhatsappText = (msgText: string, linkUrl: string, plan?: CallPlan | null) => {
    const modeLabel = 'Sala Privativa 1-para-1 (mediante pagamento)';
    const planLine = plan
      ? `\n\nPacote selecionado: ${plan.name} · ${plan.durationMinutes} min · ${BRL_FORMATTER.format(
          plan.priceCents / 100
        )} (${modeLabel})`
      : `\n\nModalidade: ${modeLabel}`;
    return `${msgText}${planLine}\n\nPagamento e contratação da videochamada com ${modelName}:\n${linkUrl}`;
  };

  const handleSaveDefaults = async () => {
    if (!photoUrl.trim()) {
      setErrorMsg('Escolha ou envie uma foto padrão para o convite.');
      return;
    }
    if (!messageTemplate.trim()) {
      setErrorMsg('Escreva a mensagem padrão antes de salvar.');
      return;
    }
    setSavingDefaults(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await onSaveStudioConfig({
        whatsappInvitePhotoUrl: photoUrl.trim(),
        whatsappInviteMessage: messageTemplate.trim().slice(0, 600),
        whatsappInvitePlanId: selectedPlanId || '',
        whatsappInviteCallMode: callMode,
      });
      if (res && !res.ok) {
        setErrorMsg(res.error || 'Não foi possível salvar foto e mensagem padrão.');
      } else {
        setFeedbackMsg(
          `Foto e mensagem padrão de ${modelName} salvas no banco de dados.`
        );
      }
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleCreateInvite = async (): Promise<WhatsappInviteRecord | null> => {
    if (!photoUrl.trim()) {
      setErrorMsg('Selecione ou envie uma foto antes de gerar o convite.');
      return null;
    }
    if (!resolvedMessage) {
      setErrorMsg('Escreva sua mensagem personalizada antes de gerar o convite.');
      return null;
    }
    if (recipientPhone.trim() && !normalizedPhoneDigits) {
      setErrorMsg(
        'Número de WhatsApp inválido. Informe DDD + número (ex.: 11999998888) ou deixe em branco.'
      );
      return null;
    }

    setCreatingInvite(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      if (saveDefaultsOnCreate) {
        await onSaveStudioConfig({
          whatsappInvitePhotoUrl: photoUrl.trim(),
          whatsappInviteMessage: messageTemplate.trim().slice(0, 600),
          whatsappInvitePlanId: selectedPlanId || '',
          whatsappInviteCallMode: callMode,
        });
      }

      const res = await onCreateWhatsappInvite({
        recipientName: recipientName.trim() || undefined,
        recipientPhone: normalizedPhoneDigits || undefined,
        photoUrl: photoUrl.trim(),
        message: resolvedMessage,
        planId: selectedPlanId || undefined,
        callMode,
        saveAsDefault: false,
      });

      if (!res.ok || !res.invite) {
        setErrorMsg(res.error || 'Não foi possível gerar o convite.');
        return null;
      }

      setActiveInvite(res.invite);
      setFeedbackMsg(
        'Convite exclusivo gerado! Clique em "Abrir e Enviar no WhatsApp" ou compartilhe com sua foto.'
      );
      return res.invite;
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      setErrorMsg('Não foi possível copiar automaticamente no navegador.');
    }
  };

  const handleNativeShareWithPhoto = async (invite: WhatsappInviteRecord) => {
    if (typeof navigator === 'undefined' || !navigator.share) {
      setErrorMsg(
        'Seu navegador não suporta compartilhamento direto de arquivo. Use o botão "Abrir e Enviar no WhatsApp".'
      );
      return;
    }
    setSharingNative(true);
    setErrorMsg(null);
    try {
      const inviteUrl = buildInviteAbsoluteUrl(invite.id);
      const shareText = buildFullWhatsappText(
        invite.message,
        inviteUrl,
        invite.planName && invite.planPriceCents
          ? {
              id: invite.planId || '',
              name: invite.planName,
              description: '',
              durationMinutes: invite.planDurationMinutes || 20,
              priceCents: invite.planPriceCents,
              currency: 'BRL',
              active: true,
              sortOrder: 1,
              createdAt: studioConfig?.updatedAt as never,
              updatedAt: studioConfig?.updatedAt as never,
            }
          : null
      );

      let files: File[] = [];
      try {
        const resp = await fetch(invite.photoUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          const ext = blob.type.includes('png')
            ? 'png'
            : blob.type.includes('webp')
              ? 'webp'
              : 'jpg';
          files = [
            new File([blob], `convite-${modelId}.${ext}`, {
              type: blob.type || 'image/jpeg',
            }),
          ];
        }
      } catch {
        // Fallback to URL + text share when CORS blocks direct image fetch
      }

      const canShareFiles =
        files.length > 0 &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files });

      await navigator.share(
        canShareFiles
          ? {
              title: `Convite de ${modelName} · ${studioBrand}`,
              text: shareText,
              url: inviteUrl,
              files,
            }
          : {
              title: `Convite de ${modelName} · ${studioBrand}`,
              text: shareText,
              url: inviteUrl,
            }
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setErrorMsg(
        'Não foi possível abrir o menu nativo de compartilhamento. Use o botão do WhatsApp abaixo.'
      );
    } finally {
      setSharingNative(false);
    }
  };

  const insertToken = (token: string) => {
    setMessageTemplate((prev) =>
      prev.endsWith(' ') || prev.length === 0 ? `${prev}${token}` : `${prev} ${token}`
    );
  };

  const activeInviteUrl = activeInvite
    ? buildInviteAbsoluteUrl(activeInvite.id)
    : '';
  const activeInvitePlanObj =
    activeInvite?.planName && activeInvite?.planPriceCents !== undefined
      ? ({
          id: activeInvite.planId || '',
          name: activeInvite.planName,
          description: '',
          durationMinutes: activeInvite.planDurationMinutes || 20,
          priceCents: activeInvite.planPriceCents,
          currency: 'BRL',
          active: true,
          sortOrder: 1,
        } as CallPlan)
      : selectedPlan;

  const activeWhatsappText = activeInvite
    ? buildFullWhatsappText(
        activeInvite.message,
        activeInviteUrl,
        activeInvitePlanObj
      )
    : '';
  const activeWhatsappHref = activeInvite
    ? buildWhatsappShareUrl(
        activeInvite.recipientPhone || normalizedPhoneDigits,
        activeWhatsappText
      )
    : '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Convite Exclusivo para WhatsApp · {modelName}
            </h2>
            <p className="text-sm text-[#C9BAC4]">
              Pré-selecione sua foto e sua mensagem personalizada para enviar o link direto de pagamento e contratação da videochamada no WhatsApp do internauta.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
            {whatsappInvites.length} convite
            {whatsappInvites.length === 1 ? '' : 's'} registrado
            {whatsappInvites.length === 1 ? '' : 's'}
          </span>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Form Column: Photo, Message, Recipient & Plan */}
        <section className="xl:col-span-7 luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-6">
          {/* 1. Photo Pre-Selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#F4C2D7]" />
                <h3 className="text-sm font-semibold text-[#FAF4F7]">
                  1. Foto pré-selecionada do convite
                </h3>
              </div>
              <span className="text-[11px] text-[#938291]">
                Aparece na prévia do link e na tela de pagamento
              </span>
            </div>

            {photoCandidates.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                {photoCandidates.slice(0, 10).map((cand) => {
                  const isSelected = photoUrl === cand.url;
                  return (
                    <button
                      key={`${cand.id}-${cand.url}`}
                      type="button"
                      onClick={() => {
                        setPhotoUrl(cand.url);
                        setActiveInvite(null);
                      }}
                      aria-pressed={isSelected}
                      className={`group rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#F4C2D7] ring-1 ring-[#F4C2D7]'
                          : 'border-[#F4C2D7]/15 hover:border-[#F4C2D7]/50'
                      }`}
                    >
                      <div className="relative aspect-[4/3] w-full bg-[#150D1D] overflow-hidden">
                        <img
                          src={cand.url}
                          alt={cand.label}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        {isSelected && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#F4C2D7] text-[#1A0D1B] flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      <div className="px-2 py-1.5 bg-[#0B060F]">
                        <p className="text-[10px] font-medium text-[#FAF4F7] truncate">
                          {cand.label}
                        </p>
                        <p className="text-[10px] text-[#938291] truncate">
                          {cand.sourceLabel}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <StudioImageField
              label="Ou envie uma foto exclusiva do dispositivo / cole o link"
              value={photoUrl}
              onChange={(nextUrl) => {
                setPhotoUrl(nextUrl);
                setActiveInvite(null);
              }}
              onUploadImage={onUploadImage}
              previewShape="landscape"
            />
          </div>

          <div className="border-t border-[#F4C2D7]/10 pt-5 space-y-3">
            {/* 2. Message Editor */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#F4C2D7]" />
                <label
                  htmlFor="whatsapp-invite-message"
                  className="text-sm font-semibold text-[#FAF4F7]"
                >
                  2. Mensagem da modelo para o internauta
                </label>
              </div>
              <span className="text-[11px] font-mono tabular-nums text-[#938291]">
                {messageTemplate.length}/600
              </span>
            </div>

            <textarea
              id="whatsapp-invite-message"
              rows={4}
              maxLength={600}
              value={messageTemplate}
              onChange={(e) => {
                setMessageTemplate(e.target.value);
                setActiveInvite(null);
              }}
              placeholder={`Escreva seu convite pessoal de ${modelName}...`}
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-4 py-3 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#C9BAC4]">
                <span className="text-[#938291] mr-1">Variáveis rápidas:</span>
                {(
                  [
                    { token: '{internauta}', label: '+ Nome do internauta' },
                    { token: '{modelo}', label: '+ Seu nome' },
                    { token: '{plano}', label: '+ Plano escolhido' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.token}
                    type="button"
                    onClick={() => insertToken(item.token)}
                    className="px-2.5 py-1 rounded-lg bg-[#150D1D] border border-[#F4C2D7]/20 text-[#F4C2D7] hover:border-[#F4C2D7]/55 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={savingDefaults}
                onClick={() => void handleSaveDefaults()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:border-[#F4C2D7] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>
                  {savingDefaults ? 'Salvando...' : 'Salvar Foto e Mensagem Padrão'}
                </span>
              </button>
            </div>
          </div>

          <div className="border-t border-[#F4C2D7]/10 pt-5 space-y-4">
            {/* 3. Recipient & Call Plan */}
            <h3 className="text-sm font-semibold text-[#FAF4F7]">
              3. Destinatário no WhatsApp e Pacote de Videochamada
            </h3>

            {visitorSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] text-[#938291] flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-[#86EFAC]" />
                  <span>Preencher rapidamente com internauta do estúdio:</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {visitorSuggestions.map((v) => (
                    <button
                      key={v.uid}
                      type="button"
                      onClick={() => {
                        setRecipientName(v.displayName);
                        setActiveInvite(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B060F] border border-[#F4C2D7]/15 text-xs text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/45 transition-colors cursor-pointer"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          v.online ? 'bg-[#86EFAC]' : 'bg-[#938291]'
                        }`}
                      />
                      <span>{v.displayName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="invite-recipient-name"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Nome do internauta (opcional)
                </label>
                <input
                  id="invite-recipient-name"
                  type="text"
                  maxLength={80}
                  value={recipientName}
                  onChange={(e) => {
                    setRecipientName(e.target.value);
                    setActiveInvite(null);
                  }}
                  placeholder="Ex.: Rafael"
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="invite-recipient-phone"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  WhatsApp com DDD (opcional)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-[#938291] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="invite-recipient-phone"
                    type="tel"
                    maxLength={24}
                    value={recipientPhone}
                    onChange={(e) => {
                      setRecipientPhone(e.target.value);
                      setActiveInvite(null);
                    }}
                    placeholder="Ex.: (11) 99999-8888"
                    className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                  />
                </div>
                <p className="text-[11px] text-[#938291]">
                  {recipientPhone.trim()
                    ? normalizedPhoneDigits
                      ? `Envio direto para +${normalizedPhoneDigits}`
                      : 'Informe DDD + 8 ou 9 dígitos'
                    : 'Se deixar vazio, você escolhe o contato direto no seu WhatsApp.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="invite-call-plan"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Plano sugerido para contratação
                </label>
                <select
                  id="invite-call-plan"
                  value={selectedPlanId}
                  onChange={(e) => {
                    setSelectedPlanId(e.target.value);
                    setActiveInvite(null);
                  }}
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                >
                  <option value="">Deixar internauta escolher no link</option>
                  {activePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} · {plan.durationMinutes} min ·{' '}
                      {BRL_FORMATTER.format(plan.priceCents / 100)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-[#C9BAC4]">
                  Modalidade exclusiva da videochamada
                </span>
                <div className="px-3.5 py-2.5 rounded-xl border border-[#F4C2D7]/45 bg-[#21142D] text-xs font-semibold text-[#FAF4F7] flex items-center justify-between gap-2">
                  <span>Sala Privativa 1-para-1 (mediante pagamento)</span>
                  <span className="text-[11px] font-normal text-[#F4C2D7]">
                    1 internauta por vez
                  </span>
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-[#C9BAC4] cursor-pointer">
              <input
                type="checkbox"
                checked={saveDefaultsOnCreate}
                onChange={(e) => setSaveDefaultsOnCreate(e.target.checked)}
                className="accent-[#F4C2D7] cursor-pointer"
              />
              <span>
                Manter esta foto e mensagem salvas como meu modelo padrão para próximos convites
              </span>
            </label>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
            >
              {errorMsg}
            </div>
          )}

          {feedbackMsg && (
            <div
              role="status"
              className="p-3.5 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{feedbackMsg}</span>
            </div>
          )}

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={creatingInvite}
              onClick={() => void handleCreateInvite()}
              className="inline-flex items-center gap-2 px-6 py-3 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {creatingInvite
                  ? 'Gerando convite exclusivo...'
                  : 'Gerar Convite com Link de Pagamento'}
              </span>
            </button>
          </div>

          {activeInvite && (
            <div className="pt-4 border-t border-[#F4C2D7]/15 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-[#86EFAC]">
                  Convite pronto para envio no WhatsApp
                </span>
                <span className="font-mono text-[#938291]">
                  {activeInviteUrl}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href={activeWhatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full bg-[#16A34A] text-white hover:bg-[#15803D] transition-colors whitespace-nowrap shrink-0"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Abrir e Enviar no WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() =>
                    void handleCopyText(activeWhatsappText, 'active_full')
                  }
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:border-[#F4C2D7] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedKey === 'active_full' ? (
                    <Check className="w-3.5 h-3.5 text-[#86EFAC]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-[#F4C2D7]" />
                  )}
                  <span>
                    {copiedKey === 'active_full'
                      ? 'Mensagem + Link copiados!'
                      : 'Copiar Mensagem + Link'}
                  </span>
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    disabled={sharingNative}
                    onClick={() => void handleNativeShareWithPhoto(activeInvite)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#38BDF8]/35 text-[#E0F2FE] hover:border-[#38BDF8] disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5 text-[#38BDF8]" />
                    <span>
                      {sharingNative
                        ? 'Preparando foto...'
                        : 'Enviar Foto + Mensagem (App)'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Right Preview Column: Exact WhatsApp / Landing Card Preview */}
        <aside className="xl:col-span-5 luxury-card border border-[#F4C2D7]/15 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#F4C2D7] inline-flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Prévia do Convite para o Internauta</span>
            </p>
            <span className="text-[11px] text-[#938291]">
              Sala Privativa 1-para-1
            </span>
          </div>

          <div className="rounded-2xl overflow-hidden bg-[#0B060F] border border-[#F4C2D7]/20">
            <div className="aspect-[4/3] w-full bg-[#150D1D] overflow-hidden flex items-center justify-center">
              {photoUrl && !previewImgFailed ? (
                <img
                  src={photoUrl}
                  alt={`Foto pré-selecionada de ${modelName}`}
                  referrerPolicy="no-referrer"
                  onError={() => setPreviewImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center space-y-1.5 p-6">
                  <ImageIcon className="w-8 h-8 text-[#F4C2D7]/50 mx-auto" />
                  <p className="text-xs text-[#938291]">
                    Selecione ou envie uma foto ao lado
                  </p>
                </div>
              )}
            </div>

            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-xl font-semibold text-[#FAF4F7] truncate">
                  {modelName}
                </p>
                <span className="text-[11px] font-mono tabular-nums text-[#F4C2D7] whitespace-nowrap">
                  {selectedPlan
                    ? BRL_FORMATTER.format(selectedPlan.priceCents / 100)
                    : 'Escolha o plano'}
                </span>
              </div>

              <p className="text-xs text-[#C9BAC4] whitespace-pre-line leading-relaxed">
                {resolvedMessage || 'Sua mensagem aparecerá aqui...'}
              </p>

              <div className="pt-3 border-t border-[#F4C2D7]/10 space-y-1 text-[11px]">
                <p className="text-[#938291]">
                  {selectedPlan
                    ? `Plano: ${selectedPlan.name} (${selectedPlan.durationMinutes} min)`
                    : 'O internauta escolherá o pacote na abertura do link'}
                </p>
                <p className="font-mono text-[#38BDF8] truncate">
                  {previewLinkUrl}
                </p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-[#938291] leading-relaxed">
            Ao abrir o link no WhatsApp, o internauta visualiza esta foto pré-selecionada e sua mensagem, realiza o pagamento via PIX QR Code ou Cartão e entra na contratação da videochamada com você.
          </p>
        </aside>
      </div>

      {/* Sent Invites History */}
      <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-[#F4C2D7]/15 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-display text-xl font-semibold text-[#FAF4F7]">
              Convites Gerados e Status de Pagamento
            </h3>
            <p className="text-xs text-[#C9BAC4]">
              Acompanhe visualizações e confirmações de pagamento PIX ou Cartão em tempo real.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-[#C9BAC4]">
            {whatsappInvites.filter((i) => i.status === 'paid').length} pago
            {whatsappInvites.filter((i) => i.status === 'paid').length === 1
              ? ''
              : 's'}
          </span>
        </div>

        {whatsappInvites.length === 0 ? (
          <div className="p-8 text-center space-y-1.5">
            <p className="text-sm font-medium text-[#FAF4F7]">
              Nenhum convite de WhatsApp gerado ainda
            </p>
            <p className="text-xs text-[#C9BAC4]">
              Escolha sua foto e mensagem acima e clique em "Gerar Convite com Link de Pagamento".
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F4C2D7]/10">
            {whatsappInvites.map((inv) => {
              const inviteUrl = buildInviteAbsoluteUrl(inv.id);
              const invPlanObj =
                inv.planName && inv.planPriceCents !== undefined
                  ? ({
                      id: inv.planId || '',
                      name: inv.planName,
                      description: '',
                      durationMinutes: inv.planDurationMinutes || 20,
                      priceCents: inv.planPriceCents,
                      currency: 'BRL',
                      active: true,
                      sortOrder: 1,
                    } as CallPlan)
                  : null;
              const fullText = buildFullWhatsappText(
                inv.message,
                inviteUrl,
                invPlanObj
              );
              const waHref = buildWhatsappShareUrl(
                inv.recipientPhone || '',
                fullText
              );
              const statusMeta = STATUS_META[inv.status] || STATUS_META.pending;

              return (
                <div
                  key={inv.id}
                  className="px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <img
                      src={inv.photoUrl}
                      alt={inv.recipientName || modelName}
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 rounded-xl object-cover border border-[#F4C2D7]/20 shrink-0 bg-[#150D1D]"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-[#FAF4F7]">
                          {inv.recipientName || 'Internauta convidado'}
                        </span>
                        <span className="text-[#938291]">·</span>
                        <span className={`font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                        {inv.paidByName && (
                          <>
                            <span className="text-[#938291]">·</span>
                            <span className="text-[#86EFAC]">
                              por {inv.paidByName}
                            </span>
                          </>
                        )}
                      </div>

                      <p className="text-xs text-[#C9BAC4] line-clamp-2">
                        {inv.message}
                      </p>

                      <p className="text-[11px] font-mono tabular-nums text-[#938291]">
                        {DATE_TIME_FORMATTER.format(new Date(inv.createdAt))} ·{' '}
                        {inv.planName
                          ? `${inv.planName} (${BRL_FORMATTER.format(
                              (inv.planPriceCents || 0) / 100
                            )})`
                          : 'Plano aberto'}{' '}
                        · {inv.clickCount || 0} acesso
                        {(inv.clickCount || 0) === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <a
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-full bg-[#16A34A]/20 border border-[#16A34A]/45 text-[#86EFAC] hover:bg-[#16A34A]/30 transition-colors whitespace-nowrap shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Enviar no WhatsApp</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => void handleCopyText(fullText, inv.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:border-[#F4C2D7] whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedKey === inv.id ? (
                        <Check className="w-3.5 h-3.5 text-[#86EFAC]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-[#F4C2D7]" />
                      )}
                      <span>
                        {copiedKey === inv.id ? 'Copiado!' : 'Copiar'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void onDeleteWhatsappInvite(inv.id)}
                      title="Excluir convite"
                      aria-label={`Excluir convite ${inv.id}`}
                      className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
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
