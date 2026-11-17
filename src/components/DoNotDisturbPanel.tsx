import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, BellRing, CheckCircle2, Clock } from 'lucide-react';
import {
  formatCountdownClock,
  getDndFromState,
  getNextAvailableTarget,
  getScheduleFromState,
  isDndActiveNow,
  sanitizeTimeHHMM,
} from '../lib/schedule';
import type { StudioCallMode, StudioState } from '../types/studio';

interface DoNotDisturbPanelProps {
  studioState: StudioState | null;
  onUpdateStudioState: (
    patch: Partial<{
      modelName: string;
      isLive: boolean;
      callMode: StudioCallMode;
      headline: string;
      autoScheduleEnabled: boolean;
      scheduleStartTime: string;
      scheduleEndTime: string;
      scheduleDays: string;
      scheduleTimezone: string;
      dndActive: boolean;
      dndUntilMs: number;
      dndScheduleEnabled: boolean;
      dndStartTime: string;
      dndEndTime: string;
    }>
  ) => Promise<void>;
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
      const nextStatePreview: StudioState = {
        ...(studioState as StudioState),
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
    <section className="bg-[#13151A] border border-white/10 rounded-xl p-6 space-y-6">
      {/* Header + Live Countdown Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-5 border-b border-white/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {dndActive ? (
              <BellOff className="w-4 h-4 text-[#FCD34D] shrink-0" />
            ) : (
              <BellRing className="w-4 h-4 text-[#86EFAC] shrink-0" />
            )}
            <h2 className="font-display text-2xl font-semibold text-[#F3EFE6]">
              Modo Não Perturbe Agendado
            </h2>
          </div>
          <p className="text-xs text-[#9BA1AE]">
            {dndActive
              ? 'Novas solicitações de videochamada estão bloqueadas automaticamente até o próximo horário permitido.'
              : 'Ative por duração determinada ou programe uma janela diária para bloquear novos pedidos automaticamente.'}
          </p>
        </div>

        {dndActive ? (
          <div className="flex flex-wrap items-center gap-4 bg-[#0B0C0F] border border-[#C9A46B]/40 rounded-lg px-4 py-3 shrink-0">
            <div className="space-y-0.5">
              <p className="text-[11px] text-[#E2C799]">
                {nextTarget.formattedReturnTime
                  ? `Próxima disponibilidade · ${nextTarget.formattedReturnTime}`
                  : 'Bloqueio ativo'}
              </p>
              <p className="text-xl font-semibold font-mono tabular-nums text-[#F3EFE6]">
                {nextTarget.nextAvailableMs
                  ? formatCountdownClock(remainingMs)
                  : 'Manual'}
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleDisableDnd()}
              className="px-3.5 py-2 text-xs font-semibold rounded-md bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          <span className="block text-xs font-medium text-[#9BA1AE]">
            Bloquear chamadas imediatamente por período
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {DND_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                disabled={saving}
                onClick={() => void handleActivateDuration(preset.minutes)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#0B0C0F] border border-white/10 text-[#F3EFE6] hover:border-[#C9A46B] hover:text-[#E2C799] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-[#C9A46B]" />
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
              className="block text-xs font-medium text-[#9BA1AE]"
            >
              Agendar término hoje/amanhã até às
            </label>
            <input
              id="dnd-until-time"
              type="time"
              value={customUntilTime}
              onChange={(e) => setCustomUntilTime(e.target.value)}
              className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1F232C] border border-white/15 text-[#F3EFE6] hover:bg-[#2A303C] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer h-[38px]"
          >
            Agendar Até Horário
          </button>
        </form>
      </div>

      {/* Recurring Daily DND Schedule */}
      <form
        onSubmit={handleSaveDailyDnd}
        className="pt-5 border-t border-white/10 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end"
      >
        <div className="lg:col-span-4 space-y-1.5">
          <span className="block text-xs font-medium text-[#9BA1AE]">
            Janela diária recorrente ({schedule.scheduleTimezone})
          </span>
          <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => setDailyEnabled(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                dailyEnabled
                  ? 'bg-[#C9A46B] text-[#0B0C0F]'
                  : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
              }`}
            >
              Ativada
            </button>
            <button
              type="button"
              onClick={() => setDailyEnabled(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !dailyEnabled
                  ? 'bg-[#1F232C] text-[#F3EFE6]'
                  : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
              }`}
            >
              Desativada
            </button>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-1.5">
          <label
            htmlFor="dnd-daily-start"
            className="block text-xs font-medium text-[#9BA1AE]"
          >
            Início diário
          </label>
          <input
            id="dnd-daily-start"
            type="time"
            value={dailyStart}
            onChange={(e) => setDailyStart(e.target.value)}
            className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
          />
        </div>

        <div className="lg:col-span-3 space-y-1.5">
          <label
            htmlFor="dnd-daily-end"
            className="block text-xs font-medium text-[#9BA1AE]"
          >
            Liberação automática
          </label>
          <input
            id="dnd-daily-end"
            type="time"
            value={dailyEnd}
            onChange={(e) => setDailyEnd(e.target.value)}
            className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
          />
        </div>

        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-45 transition-colors whitespace-nowrap cursor-pointer h-[38px]"
          >
            Salvar Janela
          </button>
        </div>
      </form>

      {savedFeedback && (
        <div
          role="status"
          className="p-3 rounded-lg bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedFeedback}</span>
        </div>
      )}
    </section>
  );
};
