import React, { useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clock,
  Crown,
  Mic,
  MicOff,
  PhoneCall,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import type {
  AccessStatus,
  CallHistoryRecord,
  CallHistoryStatus,
  PresencePeer,
  StudioCallMode,
  StudioProfile,
  StudioState,
} from '../types/studio';
import type { ModerationEffect } from '../hooks/useWebSocketStudio';
import { RevenueDashboard } from './RevenueDashboard';

interface UserControlPanelProps {
  myUid: string;
  profiles: StudioProfile[];
  peers: PresencePeer[];
  studioState: StudioState | null;
  callHistory: CallHistoryRecord[];
  ratePerMinuteCents: number;
  onChangeRatePerMinuteCents: (cents: number) => void;
  onUpdateStudioState: (
    patch: Partial<{
      modelName: string;
      isLive: boolean;
      callMode: StudioCallMode;
      headline: string;
    }>
  ) => Promise<void>;
  onUpdateUserControl: (
    targetUid: string,
    patch: Partial<{ accessStatus: AccessStatus; notes: string }>
  ) => Promise<void>;
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
  onRecordCallHistory: (input: {
    callId: string;
    userId: string;
    userName: string;
    durationSeconds: number;
    amountCents: number;
  }) => Promise<void>;
  onUpdateCallHistoryStatus: (
    recordId: string,
    status: CallHistoryStatus
  ) => Promise<void>;
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
  ratePerMinuteCents,
  onChangeRatePerMinuteCents,
  onUpdateStudioState,
  onUpdateUserControl,
  onSendModeration,
  onDirectCallUser,
  onRecordCallHistory,
  onUpdateCallHistoryStatus,
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
    for (const rec of callHistory) {
      if (rec.status === 'completed') {
        completedCount += 1;
        totalDurationSeconds += rec.durationSeconds;
        netRevenueCents += rec.amountCents;
      }
    }
    return {
      totalRecords: callHistory.length,
      completedCount,
      totalDurationSeconds,
      netRevenueCents,
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
      <section className="bg-[#13151A] border border-white/10 rounded-xl p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-semibold text-[#F3EFE6]">
              Controle do Estúdio da Modelo
            </h2>
            <p className="text-xs text-[#9BA1AE]">
              Altere a disponibilidade da sala e controle usuários conectados em tempo real.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                void onUpdateStudioState({ isLive: !(studioState?.isLive ?? true) })
              }
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                studioState?.isLive
                  ? 'bg-[#16A34A]/20 border-[#16A34A]/50 text-[#86EFAC]'
                  : 'bg-[#1B1E26] border-white/15 text-[#9BA1AE]'
              }`}
            >
              {studioState?.isLive ? 'Estúdio Ao Vivo' : 'Estúdio Pausado'}
            </button>

            <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
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
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    studioState?.callMode === mode.id
                      ? 'bg-[#C9A46B] text-[#0B0C0F]'
                      : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
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
                className="block text-xs font-medium text-[#9BA1AE]"
              >
                Mensagem exibida aos usuários na recepção
              </label>
              <input
                id="studio-headline"
                type="text"
                maxLength={140}
                value={headlineDraft}
                onChange={(e) => setHeadlineDraft(e.target.value)}
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
              />
            </div>
            <button
              type="submit"
              disabled={savingHeadline}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1F232C] border border-white/15 text-[#F3EFE6] hover:bg-[#2A303C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {savingHeadline ? 'Salvando...' : 'Atualizar Mensagem'}
            </button>
          </form>

          <div className="lg:col-span-5 grid grid-cols-4 gap-4 pt-2 lg:pt-0">
            <div>
              <p className="text-[11px] text-[#9BA1AE]">Cadastrados</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#F3EFE6]">
                {metrics.total}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#9BA1AE]">Online</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#86EFAC]">
                {metrics.online}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#9BA1AE]">VIP</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#E2C799]">
                {metrics.vip}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#9BA1AE]">Restritos</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#FCA5A5]">
                {metrics.restricted}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Real-Time Users Table */}
      <section className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#727988] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar usuário por nome ou ID..."
              className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg pl-10 pr-3.5 py-2 text-sm text-[#F3EFE6] placeholder:text-[#686E7C] focus:outline-none focus:border-[#C9A46B]"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg overflow-x-auto">
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  filter === tab.id
                    ? 'bg-[#1F232C] text-[#F3EFE6]'
                    : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredParticipants.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-medium text-[#F3EFE6]">
              Nenhum usuário encontrado neste filtro.
            </p>
            <p className="text-xs text-[#9BA1AE]">
              Quando visitantes fizerem login na plataforma, eles aparecerão aqui em tempo real.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-medium text-[#9BA1AE]">
                  <th className="py-3 px-5">Usuário</th>
                  <th className="py-3 px-4">Presença em Tempo Real</th>
                  <th className="py-3 px-4">Status de Acesso</th>
                  <th className="py-3 px-5 text-right">Ações Instantâneas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredParticipants.map((member) => {
                  const livePeer = peerMap.get(member.uid);
                  const isOnline = Boolean(livePeer);
                  const inCall = Boolean(livePeer?.inCallWith);
                  const isVip = member.accessStatus === 'vip';
                  const isMuted = member.accessStatus === 'muted';
                  const isBlocked = member.accessStatus === 'blocked';

                  return (
                    <tr
                      key={member.uid}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          {member.photoUrl ? (
                            <img
                              src={member.photoUrl}
                              alt={member.displayName}
                              referrerPolicy="no-referrer"
                              className="w-8 h-8 rounded-full object-cover bg-[#1B1E26] shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#1B1E26] flex items-center justify-center text-xs font-semibold text-[#C9A46B] shrink-0">
                              {member.displayName.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-[#F3EFE6] truncate max-w-[200px]">
                              {member.displayName}
                            </p>
                            <p className="text-[11px] font-mono text-[#727988] truncate max-w-[180px]">
                              {member.uid.slice(0, 12)}
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
                          <span className="text-[#727988]">Offline</span>
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
                                  ? 'text-[#E2C799]'
                                  : 'text-[#C8CCD4]'
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
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-35 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isVip
                                ? 'bg-[#C9A46B]/15 border-[#C9A46B]/40 text-[#E2C799]'
                                : 'bg-[#161920] border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6]'
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
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isMuted
                                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                                : 'bg-[#161920] border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6]'
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
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Recharts Revenue & Call History Dashboard */}
      <RevenueDashboard callHistory={callHistory} />

      {/* Admin Call History & Finalized Transactions Panel */}
      <section
        aria-labelledby="call-history-heading"
        className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden"
      >
        <div className="p-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2
              id="call-history-heading"
              className="font-display text-2xl font-semibold text-[#F3EFE6]"
            >
              Histórico de Chamadas e Transações
            </h2>
            <p className="text-xs text-[#9BA1AE]">
              Registro automático de duração, data e valor finalizado ao encerrar cada videochamada.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-[11px] text-[#9BA1AE]">Finalizadas</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#F3EFE6]">
                {historyMetrics.completedCount}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#9BA1AE]">Tempo Total</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#C8CCD4]">
                {formatDurationClock(historyMetrics.totalDurationSeconds)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#9BA1AE]">Receita Finalizada</p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#86EFAC]">
                {BRL_FORMATTER.format(historyMetrics.netRevenueCents / 100)}
              </p>
            </div>
          </div>
        </div>

        {/* Tariff & Filter Toolbar */}
        <div className="p-5 border-b border-white/10 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[220px] max-w-xs">
              <Search className="w-4 h-4 text-[#727988] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Filtrar histórico por usuário..."
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg pl-10 pr-3.5 py-2 text-sm text-[#F3EFE6] placeholder:text-[#686E7C] focus:outline-none focus:border-[#C9A46B]"
              />
            </div>

            <div className="flex items-center gap-2 bg-[#0B0C0F] border border-white/10 rounded-lg px-3 py-1.5">
              <Clock className="w-3.5 h-3.5 text-[#C9A46B] shrink-0" />
              <label
                htmlFor="rate-per-min"
                className="text-xs text-[#9BA1AE] whitespace-nowrap"
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
                className="w-16 bg-transparent text-xs font-mono tabular-nums text-[#F3EFE6] focus:outline-none text-right"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
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
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    historyFilter === tab.id
                      ? 'bg-[#1F232C] text-[#F3EFE6]'
                      : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#161920] border border-white/15 text-[#F3EFE6] hover:bg-[#1F232C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#C9A46B]" />
                <span>{showManualForm ? 'Fechar Registro' : 'Registrar Chamada'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional Manual Transaction Log Form */}
        {showManualForm && participants.length > 0 && (
          <form
            onSubmit={handleManualRecordSubmit}
            className="p-5 bg-[#0F1116] border-b border-white/10 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
          >
            <div className="space-y-1.5">
              <label
                htmlFor="manual-user"
                className="block text-xs font-medium text-[#9BA1AE]"
              >
                Usuário
              </label>
              <select
                id="manual-user"
                value={manualUserId || participants[0]?.uid || ''}
                onChange={(e) => setManualUserId(e.target.value)}
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
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
                className="block text-xs font-medium text-[#9BA1AE]"
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
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="manual-amount"
                className="block text-xs font-medium text-[#9BA1AE]"
              >
                Valor Finalizado (R$)
              </label>
              <input
                id="manual-amount"
                type="text"
                value={manualAmountBrl}
                onChange={(e) => setManualAmountBrl(e.target.value)}
                className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
              />
            </div>

            <button
              type="submit"
              disabled={savingManual}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap cursor-pointer h-[38px]"
            >
              {savingManual ? 'Salvando...' : 'Salvar Transação'}
            </button>
          </form>
        )}

        {filteredHistory.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-medium text-[#F3EFE6]">
              Nenhuma chamada finalizada registrada ainda.
            </p>
            <p className="text-xs text-[#9BA1AE]">
              Ao encerrar uma videochamada com um usuário, a duração, data e valor da transação aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-medium text-[#9BA1AE]">
                  <th className="py-3 px-5">Participante</th>
                  <th className="py-3 px-4">Data e Hora</th>
                  <th className="py-3 px-4 text-right">Duração</th>
                  <th className="py-3 px-4 text-right">Valor Finalizado</th>
                  <th className="py-3 px-4">Transação</th>
                  <th className="py-3 px-5 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {filteredHistory.map((record) => {
                  const isCompleted = record.status === 'completed';
                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-5">
                        <div className="min-w-0">
                          <p className="font-medium text-[#F3EFE6] truncate max-w-[200px]">
                            {record.userName}
                          </p>
                          <p className="text-[11px] font-mono text-[#727988] truncate max-w-[180px]">
                            {record.callId}
                          </p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-[#C8CCD4] whitespace-nowrap">
                        {formatCallDate(record)}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-[#F3EFE6] text-right whitespace-nowrap">
                        {formatDurationClock(record.durationSeconds)}
                      </td>

                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-right whitespace-nowrap font-medium text-[#E2C799]">
                        {BRL_FORMATTER.format(record.amountCents / 100)}
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
                        <button
                          type="button"
                          onClick={() =>
                            void onUpdateCallHistoryStatus(
                              record.id,
                              isCompleted ? 'refunded' : 'completed'
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-[#161920] border border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{isCompleted ? 'Reembolsar' : 'Revalidar'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
