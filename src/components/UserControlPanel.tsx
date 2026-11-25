import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Crown,
  Mic,
  MicOff,
  Pencil,
  PhoneCall,
  Plus,
  RotateCcw,
  Save,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AccessStatus,
  CallHistoryRecord,
  CallHistoryStatus,
  CallPlan,
  InterestMessage,
  InterestMessageStatus,
  PresencePeer,
  StudioProfile,
  StudioRole,
  StudioState,
  StudioStateUpdatePatch,
} from '../types/studio';
import type { ModerationEffect } from '../hooks/useWebSocketStudio';
import { CallPlansManager } from './CallPlansManager';
import { DoNotDisturbPanel } from './DoNotDisturbPanel';
import { InterestMessagesPanel } from './InterestMessagesPanel';
import { RevenueDashboard } from './RevenueDashboard';

interface UserControlPanelProps {
  myUid: string;
  profiles: StudioProfile[];
  peers: PresencePeer[];
  studioState: StudioState | null;
  callHistory: CallHistoryRecord[];
  interestMessages: InterestMessage[];
  callPlans: CallPlan[];
  ratePerMinuteCents: number;
  onChangeRatePerMinuteCents: (cents: number) => void;
  onUpdateStudioState: (patch: StudioStateUpdatePatch) => Promise<void>;
  onUpdateUserControl: (
    targetUid: string,
    patch: Partial<{
      displayName: string;
      photoUrl: string;
      role: StudioRole;
      accessStatus: AccessStatus;
      notes: string;
    }>
  ) => Promise<void>;
  onDeleteUserProfile?: (targetUid: string) => Promise<void>;
  onSendModeration: (
    targetUid: string,
    action: ModerationEffect['action'],
    reason?: string
  ) => void;
  onDirectCallUser: (target: {
    uid: string;
    displayName: string;
    photoUrl?: string;
  }) => Promise<void>;
  onSavePlan: (input: {
    id?: string;
    name: string;
    description: string;
    durationMinutes: number;
    priceCents: number;
    active: boolean;
    sortOrder: number;
  }) => Promise<void>;
  onDeletePlan: (planId: string) => Promise<void>;
  onRecordCallHistory: (input: {
    callId: string;
    userId: string;
    userName: string;
    durationSeconds: number;
    amountCents: number;
    planId?: string;
    planName?: string;
    planDurationMinutes?: number;
  }) => Promise<void>;
  onUpdateCallHistoryStatus: (
    recordId: string,
    status: CallHistoryStatus
  ) => Promise<void>;
  onUpdateCallHistoryRecord?: (
    recordId: string,
    patch: Partial<{
      durationSeconds: number;
      amountCents: number;
      status: CallHistoryStatus;
    }>
  ) => Promise<void>;
  onDeleteCallHistoryRecord?: (recordId: string) => Promise<void>;
  onUpdateInterestMessageStatus: (
    messageId: string,
    status: InterestMessageStatus
  ) => Promise<void>;
  onDeleteInterestMessage: (messageId: string) => Promise<void>;
  showStudioControls?: boolean;
  showDndPanel?: boolean;
  showUsersTable?: boolean;
  showRevenueDashboard?: boolean;
  showCallPlans?: boolean;
  showCallHistory?: boolean;
  showInterestMessages?: boolean;
}

type UserFilter = 'all' | 'online' | 'vip' | 'restricted';
type HistoryFilter = 'all' | 'completed' | 'refunded';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatDurationClock(totalSeconds: number) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatCallDate(record: CallHistoryRecord) {
  const date = record.endedAt?.toDate ? record.endedAt.toDate() : new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const STATUS_LABELS: Record<AccessStatus, string> = {
  active: 'Ativo',
  vip: 'VIP',
  muted: 'Silenciado',
  blocked: 'Bloqueado',
};

export const UserControlPanel: React.FC<UserControlPanelProps> = ({
  myUid,
  profiles,
  peers,
  studioState,
  callHistory,
  interestMessages,
  callPlans,
  ratePerMinuteCents,
  onChangeRatePerMinuteCents,
  onUpdateStudioState,
  onUpdateUserControl,
  onDeleteUserProfile,
  onSendModeration,
  onDirectCallUser,
  onSavePlan,
  onDeletePlan,
  onRecordCallHistory,
  onUpdateCallHistoryStatus,
  onUpdateCallHistoryRecord,
  onDeleteCallHistoryRecord,
  onUpdateInterestMessageStatus,
  onDeleteInterestMessage,
  showStudioControls = true,
  showDndPanel = true,
  showUsersTable = true,
  showRevenueDashboard = true,
  showCallPlans = true,
  showCallHistory = true,
  showInterestMessages = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualUserId, setManualUserId] = useState('');
  const [manualMinutes, setManualMinutes] = useState('10');
  const [manualAmountBrl, setManualAmountBrl] = useState('150.00');
  const [savingManual, setSavingManual] = useState(false);
  const [headlineDraft, setHeadlineDraft] = useState(
    studioState?.headline || 'Atendimento privado por videochamada em tempo real.'
  );
  const [savingHeadline, setSavingHeadline] = useState(false);

  // User inline edit state
  const [editingUserUid, setEditingUserUid] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState<StudioRole>('viewer');
  const [editUserStatus, setEditUserStatus] = useState<AccessStatus>('active');
  const [editUserNotes, setEditUserNotes] = useState('');
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Call history inline edit state
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
  const [editHistMinutes, setEditHistMinutes] = useState('10');
  const [editHistAmountBrl, setEditHistAmountBrl] = useState('0.00');
  const [editHistStatus, setEditHistStatus] =
    useState<CallHistoryStatus>('completed');
  const [savingHistEdit, setSavingHistEdit] = useState(false);

  const peerMap = useMemo(() => {
    const map = new Map<string, PresencePeer>();
    for (const peer of peers) {
      map.set(peer.uid, peer);
    }
    return map;
  }, [peers]);

  const participants = useMemo(() => {
    return profiles.filter((p) => p.uid !== myUid);
  }, [profiles, myUid]);

  const metrics = useMemo(() => {
    let onlineCount = 0;
    let vipCount = 0;
    let restrictedCount = 0;
    for (const p of participants) {
      if (peerMap.has(p.uid)) onlineCount += 1;
      if (p.accessStatus === 'vip') vipCount += 1;
      if (p.accessStatus === 'muted' || p.accessStatus === 'blocked') {
        restrictedCount += 1;
      }
    }
    return {
      total: participants.length,
      online: onlineCount,
      vip: vipCount,
      restricted: restrictedCount,
    };
  }, [participants, peerMap]);

  const filteredParticipants = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return participants.filter((p) => {
      const isOnline = peerMap.has(p.uid);
      if (filter === 'online' && !isOnline) return false;
      if (filter === 'vip' && p.accessStatus !== 'vip') return false;
      if (
        filter === 'restricted' &&
        p.accessStatus !== 'muted' &&
        p.accessStatus !== 'blocked'
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.uid.toLowerCase().includes(q)
      );
    });
  }, [participants, peerMap, filter, searchTerm]);

  const handleSaveHeadline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!headlineDraft.trim() || savingHeadline) return;
    setSavingHeadline(true);
    try {
      await onUpdateStudioState({ headline: headlineDraft.trim().slice(0, 140) });
    } finally {
      setSavingHeadline(false);
    }
  };

  const historyMetrics = useMemo(() => {
    let completedCount = 0;
    let totalDurationSeconds = 0;
    let netRevenueCents = 0;
    let ratingSum = 0;
    let ratingCount = 0;
    for (const rec of callHistory) {
      if (rec.status === 'completed') {
        completedCount += 1;
        totalDurationSeconds += rec.durationSeconds;
        netRevenueCents += rec.amountCents;
      }
      if (typeof rec.rating === 'number' && rec.rating >= 1) {
        ratingSum += rec.rating;
        ratingCount += 1;
      }
    }
    return {
      totalRecords: callHistory.length,
      completedCount,
      totalDurationSeconds,
      netRevenueCents,
      ratingCount,
      averageRating: ratingCount > 0 ? ratingSum / ratingCount : null,
    };
  }, [callHistory]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return callHistory.filter((rec) => {
      if (historyFilter !== 'all' && rec.status !== historyFilter) return false;
      if (!q) return true;
      return (
        rec.userName.toLowerCase().includes(q) ||
        rec.callId.toLowerCase().includes(q)
      );
    });
  }, [callHistory, historyFilter, historySearch]);

  const handleManualRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingManual) return;
    const selectedParticipant =
      participants.find((p) => p.uid === manualUserId) || participants[0];
    if (!selectedParticipant) return;

    const mins = Math.max(1, Math.min(1440, Number(manualMinutes) || 0));
    const parsedBrl = Number(manualAmountBrl.replace(',', '.'));
    const cents = Math.max(0, Math.round((Number.isFinite(parsedBrl) ? parsedBrl : 0) * 100));

    setSavingManual(true);
    try {
      await onRecordCallHistory({
        callId: `manual_${Date.now()}`,
        userId: selectedParticipant.uid,
        userName: selectedParticipant.displayName,
        durationSeconds: Math.round(mins * 60),
        amountCents: cents,
      });
      setShowManualForm(false);
    } finally {
      setSavingManual(false);
    }
  };

  const handleAction = async (
    target: StudioProfile,
    nextStatus: AccessStatus,
    wsAction: ModerationEffect['action']
  ) => {
    await onUpdateUserControl(target.uid, { accessStatus: nextStatus });
    onSendModeration(target.uid, wsAction);
  };

  return (
    <div className="space-y-8">
      {/* Studio Availability Controls */}
      {showStudioControls && (
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-[#F4C2D7]/15">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Controle do Estúdio da Modelo
            </h2>
            <p className="text-xs text-[#C9BAC4]">
              Altere a disponibilidade da sala e controle usuários conectados em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void onUpdateStudioState({
                  isLive: !(studioState?.isLive ?? true),
                  autoScheduleEnabled: false,
                })
              }
              className={`px-4 py-2 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                studioState?.isLive
                  ? 'bg-[#16A34A]/20 border-[#16A34A]/50 text-[#86EFAC]'
                  : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4]'
              }`}
            >
              {studioState?.isLive ? 'Estúdio Ao Vivo' : 'Modo Descanso (Offline)'}
            </button>

            <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full">
              {(
                [
                  { id: 'open', label: 'Aberto' },
                  { id: 'queue_only', label: 'Somente Fila' },
                  { id: 'paused', label: 'Fechado' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => void onUpdateStudioState({ callMode: mode.id })}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    studioState?.callMode === mode.id
                      ? 'luxury-rose-cta font-semibold'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <form
            onSubmit={handleSaveHeadline}
            className="lg:col-span-7 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
          >
            <div className="flex-1 space-y-1.5">
              <label
                htmlFor="studio-headline"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Mensagem exibida aos usuários na recepção
              </label>
              <input
                id="studio-headline"
                type="text"
                maxLength={140}
                value={headlineDraft}
                onChange={(e) => setHeadlineDraft(e.target.value)}
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>
            <button
              type="submit"
              disabled={savingHeadline}
              className="px-4 py-2 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {savingHeadline ? 'Salvando...' : 'Atualizar Mensagem'}
            </button>
          </form>

          <div className="lg:col-span-5 grid grid-cols-4 gap-4 pt-2 lg:pt-0">
            <div>
              <p className="text-[11px] text-[#938291]">Cadastrados</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
                {metrics.total}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#938291]">Online</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#86EFAC]">
                {metrics.online}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#938291]">VIP</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#F4C2D7]">
                {metrics.vip}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#938291]">Restritos</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#FCA5A5]">
                {metrics.restricted}
              </p>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Scheduled Do Not Disturb Mode */}
      {showDndPanel && (
        <DoNotDisturbPanel
          studioState={studioState}
          onUpdateStudioState={onUpdateStudioState}
        />
      )}

      {/* Real-Time Users Table */}
      {showUsersTable && (
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-[#F4C2D7]/15 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#938291] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar usuário por nome ou ID..."
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full pl-10 pr-4 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full overflow-x-auto">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'online', label: 'Online agora' },
                { id: 'vip', label: 'VIP' },
                { id: 'restricted', label: 'Restritos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-[#281837] text-[#FAF4F7]'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredParticipants.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-medium text-[#FAF4F7]">
              Nenhum usuário encontrado neste filtro.
            </p>
            <p className="text-xs text-[#C9BAC4]">
              Quando visitantes fizerem login na plataforma, eles aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F4C2D7]/15 text-[11px] font-medium text-[#C9BAC4]">
                  <th className="py-3 px-5">Usuário</th>
                  <th className="py-3 px-4">Presença em Tempo Real</th>
                  <th className="py-3 px-4">Status de Acesso</th>
                  <th className="py-3 px-5 text-right">Ações Instantâneas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4C2D7]/10 text-sm">
                {filteredParticipants.map((member) => {
                  const livePeer = peerMap.get(member.uid);
                  const isOnline = Boolean(livePeer);
                  const inCall = Boolean(livePeer?.inCallWith);
                  const isVip = member.accessStatus === 'vip';
                  const isMuted = member.accessStatus === 'muted';
                  const isBlocked = member.accessStatus === 'blocked';
                  const isEditingThisUser = editingUserUid === member.uid;

                  return (
                    <React.Fragment key={member.uid}>
                      <tr className="hover:bg-[#FAF4F7]/[0.02] transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            {member.photoUrl ? (
                              <img
                                src={member.photoUrl}
                                alt={member.displayName}
                                referrerPolicy="no-referrer"
                                className="w-8 h-8 rounded-full object-cover bg-[#21142D] border border-[#F4C2D7]/25 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-[#21142D] border border-[#F4C2D7]/25 flex items-center justify-center text-xs font-semibold text-[#F4C2D7] shrink-0">
                                {member.displayName.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-[#FAF4F7] truncate max-w-[200px]">
                                {member.displayName}
                              </p>
                              <p className="text-[11px] font-mono text-[#938291] truncate max-w-[210px]">
                                {member.role === 'moderator' ? 'Moderador · ' : ''}
                                {member.notes
                                  ? member.notes
                                  : member.uid.slice(0, 12)}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-xs">
                          {isOnline ? (
                            <span className="text-[#86EFAC]">
                              Online{inCall ? ' · Em videochamada' : ' · Conectado'}
                            </span>
                          ) : (
                            <span className="text-[#938291]">Offline</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-xs">
                          <span
                            className={
                              isBlocked
                                ? 'text-[#FCA5A5]'
                                : isMuted
                                  ? 'text-[#FCD34D]'
                                  : isVip
                                    ? 'text-[#F4C2D7]'
                                    : 'text-[#C9BAC4]'
                            }
                          >
                            {STATUS_LABELS[member.accessStatus]}
                          </span>
                        </td>

                        <td className="py-3.5 px-5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={!isOnline || isBlocked}
                              onClick={() =>
                                void onDirectCallUser({
                                  uid: member.uid,
                                  displayName: member.displayName,
                                  photoUrl: member.photoUrl,
                                })
                              }
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-35 disabled:cursor-not-allowed transition-all whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              <span>Chamar</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleAction(
                                  member,
                                  isVip ? 'active' : 'vip',
                                  isVip ? 'unblock' : 'vip'
                                )
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isVip
                                  ? 'bg-[#281837] border-[#F4C2D7]/45 text-[#F4C2D7]'
                                  : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7]'
                              }`}
                            >
                              <Crown className="w-3.5 h-3.5" />
                              <span>{isVip ? 'Remover VIP' : 'VIP'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleAction(
                                  member,
                                  isMuted ? 'active' : 'muted',
                                  isMuted ? 'unmute' : 'mute'
                                )
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isMuted
                                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                                  : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7]'
                              }`}
                            >
                              {isMuted ? (
                                <Mic className="w-3.5 h-3.5" />
                              ) : (
                                <MicOff className="w-3.5 h-3.5" />
                              )}
                              <span>{isMuted ? 'Ativar voz' : 'Silenciar'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                void handleAction(
                                  member,
                                  isBlocked ? 'active' : 'blocked',
                                  isBlocked ? 'unblock' : 'block'
                                )
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                isBlocked
                                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                                  : 'bg-red-950/30 border-red-500/30 text-red-300 hover:bg-red-950/50'
                              }`}
                            >
                              {isBlocked ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Ban className="w-3.5 h-3.5" />
                              )}
                              <span>{isBlocked ? 'Liberar' : 'Bloquear'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (isEditingThisUser) {
                                  setEditingUserUid(null);
                                } else {
                                  setEditingUserUid(member.uid);
                                  setEditUserName(member.displayName);
                                  setEditUserRole(
                                    member.role === 'model'
                                      ? 'viewer'
                                      : member.role
                                  );
                                  setEditUserStatus(member.accessStatus);
                                  setEditUserNotes(member.notes || '');
                                }
                              }}
                              aria-label={`Editar ficha de ${member.displayName}`}
                              className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#F4C2D7] transition-colors shrink-0 cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {onDeleteUserProfile && (
                              <button
                                type="button"
                                onClick={() =>
                                  void onDeleteUserProfile(member.uid)
                                }
                                aria-label={`Excluir perfil de ${member.displayName}`}
                                className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditingThisUser && (
                        <tr className="bg-[#150D1D]">
                          <td colSpan={4} className="p-4 border-t border-[#F4C2D7]/15">
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (savingUserEdit) return;
                                setSavingUserEdit(true);
                                try {
                                  await onUpdateUserControl(member.uid, {
                                    displayName: editUserName,
                                    role: editUserRole,
                                    accessStatus: editUserStatus,
                                    notes: editUserNotes,
                                  });
                                  setEditingUserUid(null);
                                } finally {
                                  setSavingUserEdit(false);
                                }
                              }}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                            >
                              <div className="sm:col-span-3 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Nome exibido
                                </label>
                                <input
                                  type="text"
                                  maxLength={80}
                                  required
                                  value={editUserName}
                                  onChange={(e) =>
                                    setEditUserName(e.target.value)
                                  }
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-1.5 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                />
                              </div>

                              <div className="sm:col-span-2 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Papel
                                </label>
                                <select
                                  value={editUserRole}
                                  onChange={(e) =>
                                    setEditUserRole(
                                      e.target.value as StudioRole
                                    )
                                  }
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-2.5 py-1.5 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                >
                                  <option value="viewer">Internauta</option>
                                  <option value="moderator">Moderador</option>
                                </select>
                              </div>

                              <div className="sm:col-span-2 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Status
                                </label>
                                <select
                                  value={editUserStatus}
                                  onChange={(e) =>
                                    setEditUserStatus(
                                      e.target.value as AccessStatus
                                    )
                                  }
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-2.5 py-1.5 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                >
                                  <option value="active">Ativo</option>
                                  <option value="vip">VIP</option>
                                  <option value="muted">Silenciado</option>
                                  <option value="blocked">Bloqueado</option>
                                </select>
                              </div>

                              <div className="sm:col-span-3 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Notas internas da modelo
                                </label>
                                <input
                                  type="text"
                                  maxLength={300}
                                  value={editUserNotes}
                                  onChange={(e) =>
                                    setEditUserNotes(e.target.value)
                                  }
                                  placeholder="Preferências, observações..."
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-1.5 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                />
                              </div>

                              <div className="sm:col-span-2 flex items-center justify-end gap-2">
                                <button
                                  type="submit"
                                  disabled={savingUserEdit}
                                  className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta cursor-pointer"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>Salvar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingUserUid(null)}
                                  aria-label="Cancelar edição"
                                  className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Recharts Revenue & Call History Dashboard */}
      {showRevenueDashboard && <RevenueDashboard callHistory={callHistory} />}

      {/* Predefined Paid Call Plans Manager */}
      {showCallPlans && (
        <CallPlansManager
          plans={callPlans}
          onSavePlan={onSavePlan}
          onDeletePlan={onDeletePlan}
        />
      )}

      {/* Admin Call History & Finalized Transactions Panel */}
      {showCallHistory && (
        <section
          aria-labelledby="call-history-heading"
          className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
        >
        <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2
              id="call-history-heading"
              className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
            >
              Histórico de Chamadas e Transações
            </h2>
            <p className="text-xs text-[#C9BAC4]">
              Registro automático de duração, data e valor finalizado ao encerrar cada videochamada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[11px] text-[#938291]">Finalizadas</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
                {historyMetrics.completedCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#938291]">Tempo Total</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#C9BAC4]">
                {formatDurationClock(historyMetrics.totalDurationSeconds)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#938291]">Receita Finalizada</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#86EFAC]">
                {BRL_FORMATTER.format(historyMetrics.netRevenueCents / 100)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#938291]">Avaliação Média</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#F4C2D7]">
                {historyMetrics.averageRating !== null
                  ? `${historyMetrics.averageRating.toFixed(1)}/5`
                  : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Tariff & Filter Toolbar */}
        <div className="p-5 border-b border-[#F4C2D7]/15 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[220px] max-w-xs">
              <Search className="w-4 h-4 text-[#938291] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Filtrar histórico por usuário..."
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full pl-10 pr-4 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="flex items-center gap-2 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full px-3.5 py-1.5">
              <Clock className="w-3.5 h-3.5 text-[#F4C2D7] shrink-0" />
              <label
                htmlFor="rate-per-min"
                className="text-xs text-[#C9BAC4] whitespace-nowrap"
              >
                Tarifa/min (R$):
              </label>
              <input
                id="rate-per-min"
                type="number"
                min={0}
                step={1}
                value={Math.round(ratePerMinuteCents / 100)}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  onChangeRatePerMinuteCents(Math.round(val * 100));
                }}
                className="w-16 bg-transparent text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none text-right"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full">
              {(
                [
                  { id: 'all', label: 'Todas' },
                  { id: 'completed', label: 'Finalizadas' },
                  { id: 'refunded', label: 'Reembolsadas' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistoryFilter(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    historyFilter === tab.id
                      ? 'bg-[#281837] text-[#FAF4F7]'
                      : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {participants.length > 0 && (
              <button
                type="button"
                onClick={() => setShowManualForm((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>{showManualForm ? 'Fechar Registro' : 'Registrar Chamada'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional Manual Transaction Log Form */}
        {showManualForm && participants.length > 0 && (
          <form
            onSubmit={handleManualRecordSubmit}
            className="p-5 bg-[#150D1D] border-b border-[#F4C2D7]/15 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="manual-user"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Usuário
              </label>
              <select
                id="manual-user"
                value={manualUserId || participants[0]?.uid || ''}
                onChange={(e) => setManualUserId(e.target.value)}
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              >
                {participants.map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="manual-duration"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Duração (minutos)
              </label>
              <input
                id="manual-duration"
                type="number"
                min={1}
                max={1440}
                value={manualMinutes}
                onChange={(e) => {
                  setManualMinutes(e.target.value);
                  const mins = Math.max(0, Number(e.target.value) || 0);
                  setManualAmountBrl(
                    ((mins * ratePerMinuteCents) / 100).toFixed(2)
                  );
                }}
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="manual-amount"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Valor Finalizado (R$)
              </label>
              <input
                id="manual-amount"
                type="text"
                value={manualAmountBrl}
                onChange={(e) => setManualAmountBrl(e.target.value)}
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <button
              type="submit"
              disabled={savingManual}
              className="px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap cursor-pointer h-[38px]"
            >
              {savingManual ? 'Salvando...' : 'Salvar Transação'}
            </button>
          </form>
        )}

        {filteredHistory.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-medium text-[#FAF4F7]">
              Nenhuma chamada finalizada registrada ainda.
            </p>
            <p className="text-xs text-[#C9BAC4]">
              Ao encerrar uma videochamada com um usuário, a duração, data e valor da transação aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#F4C2D7]/15 text-[11px] font-medium text-[#C9BAC4]">
                  <th className="py-3 px-5">Participante</th>
                  <th className="py-3 px-4">Data e Hora</th>
                  <th className="py-3 px-4 text-right">Duração</th>
                  <th className="py-3 px-4 text-right">Valor Finalizado</th>
                  <th className="py-3 px-4">Avaliação</th>
                  <th className="py-3 px-4">Transação</th>
                  <th className="py-3 px-5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4C2D7]/10 text-sm">
                {filteredHistory.map((record) => {
                  const isCompleted = record.status === 'completed';
                  const isEditingThisRecord = editingHistoryId === record.id;
                  return (
                    <React.Fragment key={record.id}>
                      <tr className="hover:bg-[#FAF4F7]/[0.02] transition-colors">
                        <td className="py-3.5 px-5">
                          <div className="min-w-0">
                            <p className="font-medium text-[#FAF4F7] truncate max-w-[200px]">
                              {record.userName}
                            </p>
                            <p className="text-[11px] font-mono text-[#938291] truncate max-w-[220px]">
                              {record.planName
                                ? `${record.planName} · ${record.callId}`
                                : record.callId}
                            </p>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-[#C9BAC4] whitespace-nowrap">
                          {formatCallDate(record)}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-[#FAF4F7] text-right whitespace-nowrap">
                          {formatDurationClock(record.durationSeconds)}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-right whitespace-nowrap font-medium text-[#F4C2D7]">
                          {BRL_FORMATTER.format(record.amountCents / 100)}
                        </td>

                        <td className="py-3.5 px-4 text-xs">
                          {typeof record.rating === 'number' &&
                          record.rating > 0 ? (
                            <div className="space-y-0.5 max-w-[200px]">
                              <div className="flex items-center gap-1.5">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                      key={star}
                                      className={`w-3.5 h-3.5 ${
                                        star <= (record.rating ?? 0)
                                          ? 'fill-[#F4C2D7] text-[#F4C2D7]'
                                          : 'text-[#938291]/40'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="font-mono tabular-nums text-[#F4C2D7]">
                                  {record.rating}/5
                                </span>
                              </div>
                              {record.ratingComment && (
                                <p
                                  title={record.ratingComment}
                                  className="text-[11px] text-[#C9BAC4] truncate"
                                >
                                  "{record.ratingComment}"
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#938291] whitespace-nowrap">
                              Não avaliada
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                          <span
                            className={
                              isCompleted ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'
                            }
                          >
                            {isCompleted ? 'Finalizada' : 'Reembolsada'}
                          </span>
                        </td>

                        <td className="py-3.5 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void onUpdateCallHistoryStatus(
                                  record.id,
                                  isCompleted ? 'refunded' : 'completed'
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>
                                {isCompleted ? 'Reembolsar' : 'Revalidar'}
                              </span>
                            </button>

                            {onUpdateCallHistoryRecord && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isEditingThisRecord) {
                                    setEditingHistoryId(null);
                                  } else {
                                    setEditingHistoryId(record.id);
                                    setEditHistMinutes(
                                      String(
                                        Math.max(
                                          1,
                                          Math.round(
                                            record.durationSeconds / 60
                                          )
                                        )
                                      )
                                    );
                                    setEditHistAmountBrl(
                                      (record.amountCents / 100).toFixed(2)
                                    );
                                    setEditHistStatus(record.status);
                                  }
                                }}
                                aria-label={`Editar transação de ${record.userName}`}
                                className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#F4C2D7] transition-colors shrink-0 cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {onDeleteCallHistoryRecord && (
                              <button
                                type="button"
                                onClick={() =>
                                  void onDeleteCallHistoryRecord(record.id)
                                }
                                aria-label={`Remover transação de ${record.userName}`}
                                className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors shrink-0 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isEditingThisRecord && onUpdateCallHistoryRecord && (
                        <tr className="bg-[#150D1D]">
                          <td colSpan={7} className="p-4 border-t border-[#F4C2D7]/15">
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (savingHistEdit) return;
                                setSavingHistEdit(true);
                                try {
                                  const mins = Math.max(
                                    0,
                                    Math.min(
                                      1440,
                                      Number(editHistMinutes) || 0
                                    )
                                  );
                                  const parsedBrl = Number(
                                    editHistAmountBrl.replace(',', '.')
                                  );
                                  const cents = Math.max(
                                    0,
                                    Math.round(
                                      (Number.isFinite(parsedBrl)
                                        ? parsedBrl
                                        : 0) * 100
                                    )
                                  );
                                  await onUpdateCallHistoryRecord(record.id, {
                                    durationSeconds: Math.round(mins * 60),
                                    amountCents: cents,
                                    status: editHistStatus,
                                  });
                                  setEditingHistoryId(null);
                                } finally {
                                  setSavingHistEdit(false);
                                }
                              }}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
                            >
                              <div className="sm:col-span-3 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Duração (minutos)
                                </label>
                                <input
                                  type="number"
                                  min={0}
                                  max={1440}
                                  value={editHistMinutes}
                                  onChange={(e) =>
                                    setEditHistMinutes(e.target.value)
                                  }
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-1.5 text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                />
                              </div>

                              <div className="sm:col-span-3 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Valor Finalizado (R$)
                                </label>
                                <input
                                  type="text"
                                  value={editHistAmountBrl}
                                  onChange={(e) =>
                                    setEditHistAmountBrl(e.target.value)
                                  }
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3 py-1.5 text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                />
                              </div>

                              <div className="sm:col-span-3 space-y-1">
                                <label className="block text-[11px] text-[#C9BAC4]">
                                  Status da Transação
                                </label>
                                <select
                                  value={editHistStatus}
                                  onChange={(e) =>
                                    setEditHistStatus(
                                      e.target.value as CallHistoryStatus
                                    )
                                  }
                                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-2.5 py-1.5 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                                >
                                  <option value="completed">Finalizada</option>
                                  <option value="refunded">Reembolsada</option>
                                </select>
                              </div>

                              <div className="sm:col-span-3 flex items-center justify-end gap-2">
                                <button
                                  type="submit"
                                  disabled={savingHistEdit}
                                  className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-semibold rounded-full luxury-rose-cta cursor-pointer"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>Salvar</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingHistoryId(null)}
                                  aria-label="Cancelar edição da transação"
                                  className="p-1.5 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* Offline Interest Messages */}
      {showInterestMessages && (
        <InterestMessagesPanel
          messages={interestMessages}
          peers={peers}
          onUpdateStatus={onUpdateInterestMessageStatus}
          onDeleteMessage={onDeleteInterestMessage}
          onDirectCallUser={onDirectCallUser}
        />
      )}
    </div>
  );
};
