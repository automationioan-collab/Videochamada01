import React, { useEffect, useMemo, useState } from 'react';
import { Timestamp } from 'firebase/firestore';
import { BellOff, BellRing, CheckCircle2, Clock } from 'lucide-react';
import {
  formatCountdownClock,
  getDndFromState,
  getNextAvailableTarget,
  getScheduleFromState,
  isDndActiveNow,
  sanitizeTimeHHMM,
} from '../lib/schedule';
import type { StudioState, StudioStateUpdatePatch } from '../types/studio';

interface DoNotDisturbPanelProps {
  studioState: StudioState | null;
  onUpdateStudioState: (patch: StudioStateUpdatePatch) => Promise<void>;
}

const DND_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: '2 horas', minutes: 120 },
] as const;

export const DoNotDisturbPanel: React.FC<DoNotDisturbPanelProps> = ({
  studioState,
  onUpdateStudioState,
}) => {
  const initialDnd = useMemo(() => getDndFromState(studioState), [studioState]);
  const schedule = useMemo(
    () => getScheduleFromState(studioState),
    [studioState]
  );

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [customUntilTime, setCustomUntilTime] = useState('18:00');
  const [dailyEnabled, setDailyEnabled] = useState(
    initialDnd.dndScheduleEnabled
  );
  const [dailyStart, setDailyStart] = useState(initialDnd.dndStartTime);
  const [dailyEnd, setDailyEnd] = useState(initialDnd.dndEndTime);
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDailyEnabled(initialDnd.dndScheduleEnabled);
    setDailyStart(initialDnd.dndStartTime);
    setDailyEnd(initialDnd.dndEndTime);
  }, [initialDnd]);

  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const dndActive = isDndActiveNow(studioState, nowDate);
  const nextTarget = useMemo(
    () => getNextAvailableTarget(studioState, nowDate),
    [studioState, nowDate]
  );

  useEffect(() => {
    const intervalMs = dndActive || nextTarget.nextAvailableMs ? 1000 : 15000;
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [dndActive, nextTarget.nextAvailableMs]);

  const remainingMs =
    nextTarget.nextAvailableMs !== null
      ? Math.max(0, nextTarget.nextAvailableMs - nowMs)
      : 0;

  const handleActivateDuration = async (minutes: number) => {
    if (saving) return;
    setSaving(true);
    setSavedFeedback(null);
    try {
      const targetMs = Date.now() + minutes * 60_000;
      await onUpdateStudioState({
        dndActive: true,
        dndUntilMs: targetMs,
      });
      setSavedFeedback(
        `Não Perturbe ativado por ${minutes} minutos. Novas solicitações bloqueadas.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleActivateUntilTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const clean = sanitizeTimeHHMM(customUntilTime, '18:00');
    const [hh, mm] = clean.split(':').map(Number);
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hh,
      mm,
      0,
      0
    );
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    setSaving(true);
    setSavedFeedback(null);
    try {
      await onUpdateStudioState({
        dndActive: true,
        dndUntilMs: target.getTime(),
      });
      setSavedFeedback(
        `Não Perturbe agendado até às ${clean}. Novas chamadas bloqueadas.`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDailyDnd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const cleanStart = sanitizeTimeHHMM(dailyStart, '00:00');
    const cleanEnd = sanitizeTimeHHMM(dailyEnd, '09:00');
    setSaving(true);
    setSavedFeedback(null);
    try {
      const baseState: StudioState = studioState ?? {
        modelUid: 'preview',
        modelName: 'Lorena Noir',
        isLive: true,
        callMode: 'open',
        headline: '',
        autoScheduleEnabled: false,
        scheduleStartTime: schedule.scheduleStartTime,
        scheduleEndTime: schedule.scheduleEndTime,
        scheduleDays: schedule.scheduleDays,
        scheduleTimezone: schedule.scheduleTimezone,
        schedulePeriods: schedule.schedulePeriods,
        holidayDates: schedule.holidayDates,
        updatedAt: Timestamp.now(),
      };
      const nextStatePreview: StudioState = {
        ...baseState,
        dndScheduleEnabled: dailyEnabled,
        dndStartTime: cleanStart,
        dndEndTime: cleanEnd,
      };
      const willBeActive = isDndActiveNow(nextStatePreview, new Date());
      await onUpdateStudioState({
        dndScheduleEnabled: dailyEnabled,
        dndStartTime: cleanStart,
        dndEndTime: cleanEnd,
        dndActive: willBeActive,
      });
      setSavedFeedback(
        dailyEnabled
          ? `Janela diária de Não Perturbe salva (${cleanStart} às ${cleanEnd}).`
          : 'Janela diária de Não Perturbe desativada.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisableDnd = async () => {
    if (saving) return;
    setSaving(true);
    setSavedFeedback(null);
    try {
      await onUpdateStudioState({
        dndActive: false,
        dndUntilMs: 0,
        dndScheduleEnabled: false,
      });
      setSavedFeedback('Modo Não Perturbe encerrado. Novas chamadas liberadas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-6">
      {/* Header + Live Countdown Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-[#F4C2D7]/15">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {dndActive ? (
              <BellOff className="w-4 h-4 text-[#FCD34D] shrink-0" />
            ) : (
              <BellRing className="w-4 h-4 text-[#86EFAC] shrink-0" />
            )}
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Modo Não Perturbe Agendado
            </h2>
          </div>
          <p className="text-xs text-[#C9BAC4]">
            {dndActive
              ? 'Novas solicitações de videochamada estão bloqueadas automaticamente até o próximo horário permitido.'
              : 'Ative por duração determinada ou programe uma janela diária para bloquear novos pedidos automaticamente.'}
          </p>
        </div>

        {dndActive ? (
          <div className="flex flex-wrap items-center gap-4 bg-[#0B060F] border border-[#F4C2D7]/40 rounded-2xl px-4 py-3 shrink-0">
            <div className="space-y-0.5">
              <p className="text-[11px] text-[#F4C2D7]">
                {nextTarget.formattedReturnTime
                  ? `Próxima disponibilidade · ${nextTarget.formattedReturnTime}`
                  : 'Bloqueio ativo'}
              </p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
                {nextTarget.nextAvailableMs
                  ? formatCountdownClock(remainingMs)
                  : 'Manual'}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleDisableDnd()}
              className="px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Desativar Agora
            </button>
          </div>
        ) : (
          <div className="text-xs text-[#86EFAC] whitespace-nowrap shrink-0">
            Solicitações liberadas agora
          </div>
        )}
      </div>

      {/* Quick Duration & Custom End Time */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
        <div className="lg:col-span-6 space-y-2.5">
          <span className="block text-xs font-medium text-[#C9BAC4]">
            Bloquear chamadas imediatamente por período
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {DND_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                disabled={saving}
                onClick={() => void handleActivateDuration(preset.minutes)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:border-[#F4C2D7] hover:text-[#F4C2D7] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleActivateUntilTime}
          className="lg:col-span-6 flex flex-col sm:flex-row sm:items-end gap-3"
        >
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="dnd-until-time"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Agendar término hoje/amanhã até às
            </label>
            <input
              id="dnd-until-time"
              type="time"
              value={customUntilTime}
              onChange={(e) => setCustomUntilTime(e.target.value)}
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/25 text-[#FAF4F7] hover:bg-[#281837] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer h-[38px]"
          >
            Agendar Até Horário
          </button>
        </form>
      </div>

      {/* Recurring Daily DND Schedule */}
      <form
        onSubmit={handleSaveDailyDnd}
        className="pt-5 border-t border-[#F4C2D7]/15 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end"
      >
        <div className="lg:col-span-4 space-y-1.5">
          <span className="block text-xs font-medium text-[#C9BAC4]">
            Janela diária recorrente ({schedule.scheduleTimezone})
          </span>
          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full w-fit">
            <button
              type="button"
              onClick={() => setDailyEnabled(true)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                dailyEnabled
                  ? 'luxury-rose-cta font-semibold'
                  : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
              }`}
            >
              Ativada
            </button>
            <button
              type="button"
              onClick={() => setDailyEnabled(false)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !dailyEnabled
                  ? 'bg-[#281837] text-[#FAF4F7]'
                  : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
              }`}
            >
              Desativada
            </button>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-1.5">
          <label
            htmlFor="dnd-daily-start"
            className="block text-xs font-medium text-[#C9BAC4]"
          >
            Início diário
          </label>
          <input
            id="dnd-daily-start"
            type="time"
            value={dailyStart}
            onChange={(e) => setDailyStart(e.target.value)}
            className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
          />
        </div>

        <div className="lg:col-span-3 space-y-1.5">
          <label
            htmlFor="dnd-daily-end"
            className="block text-xs font-medium text-[#C9BAC4]"
          >
            Liberação automática
          </label>
          <input
            id="dnd-daily-end"
            type="time"
            value={dailyEnd}
            onChange={(e) => setDailyEnd(e.target.value)}
            className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
          />
        </div>

        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap cursor-pointer h-[38px]"
          >
            Salvar Janela
          </button>
        </div>
      </form>

      {savedFeedback && (
        <div
          role="status"
          className="p-3 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}
    </section>
  );
};
