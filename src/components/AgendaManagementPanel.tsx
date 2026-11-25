import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BellRing,
  CalendarOff,
  CalendarRange,
  CheckCircle2,
  Clock,
  Coffee,
  Copy,
  PauseCircle,
  Plus,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_PAUSE_WARNING_MINUTES,
  MAX_DAILY_PAUSE_PERIODS,
  MAX_HOLIDAY_DATES,
  WEEKDAYS_PT,
  formatCountdownClock,
  formatHolidayDateBR,
  formatHolidayWeekdayBR,
  formatMinutesSecondsClock,
  formatOperatingDaysLabel,
  getActiveDailyPause,
  getDateKeyInTimezone,
  getHolidayForDate,
  getNextAvailableTarget,
  getScheduleFromState,
  getUpcomingBlockWarning,
  isWeekdayBlockedNow,
  parseScheduleDays,
  sanitizeDailyPausePeriods,
  sanitizeDaysString,
  sanitizeHolidayDates,
  sanitizeTimeHHMM,
  sanitizeWeeklyBlockedDays,
} from '../lib/schedule';
import type {
  DailyPausePeriod,
  ScheduleHolidayDate,
  StudioState,
  StudioStateUpdatePatch,
} from '../types/studio';

interface AgendaManagementPanelProps {
  studioState: StudioState | null;
  modelName?: string;
  onUpdateStudioState: (patch: StudioStateUpdatePatch) => Promise<void>;
}

const PAUSE_PRESETS: ReadonlyArray<{
  label: string;
  startTime: string;
  endTime: string;
  days: string;
}> = [
  {
    label: 'Pausa Almoço',
    startTime: '12:00',
    endTime: '13:30',
    days: '1,2,3,4,5',
  },
  {
    label: 'Intervalo da Tarde',
    startTime: '17:00',
    endTime: '17:45',
    days: '0,1,2,3,4,5,6',
  },
  {
    label: 'Descanso Madrugada',
    startTime: '01:00',
    endTime: '09:00',
    days: '0,1,2,3,4,5,6',
  },
];

const DAY_GROUP_PRESETS: ReadonlyArray<{ label: string; days: string }> = [
  { label: 'Todos os dias', days: '0,1,2,3,4,5,6' },
  { label: 'Seg–Sex', days: '1,2,3,4,5' },
  { label: 'Fim de semana', days: '0,6' },
];

function createPauseId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `pausa_${Date.now().toString(36)}_${rand}`;
}

function isOvernightWindow(startTime: string, endTime: string): boolean {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  return sh * 60 + sm > eh * 60 + em;
}

function addDaysToYYYYMMDD(baseDateKey: string, deltaDays: number): string {
  const [y, m, d] = baseDateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays, 12, 0, 0));
  const yyyy = dt.getUTCFullYear().toString().padStart(4, '0');
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getNextFixedHolidayDate(
  todayKey: string,
  month: number,
  day: number
): string {
  const currentYear = Number(todayKey.slice(0, 4));
  const candidate = `${currentYear}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
  if (candidate >= todayKey) return candidate;
  return `${currentYear + 1}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

export const AgendaManagementPanel: React.FC<AgendaManagementPanelProps> = ({
  studioState,
  modelName = 'Lorena Noir',
  onUpdateStudioState,
}) => {
  const initialSchedule = useMemo(
    () => getScheduleFromState(studioState),
    [studioState]
  );

  const [dailyPauses, setDailyPauses] = useState<DailyPausePeriod[]>(
    initialSchedule.dailyPausePeriods
  );
  const [weeklyBlockedDays, setWeeklyBlockedDays] = useState<number[]>(
    initialSchedule.weeklyBlockedDays
  );
  const [holidayDates, setHolidayDates] = useState<ScheduleHolidayDate[]>(
    initialSchedule.holidayDates
  );
  const [pauseWarningEnabled, setPauseWarningEnabled] = useState<boolean>(
    initialSchedule.pauseWarningEnabled
  );
  const [pauseWarningMinutes, setPauseWarningMinutes] = useState<number>(
    initialSchedule.pauseWarningMinutes || DEFAULT_PAUSE_WARNING_MINUTES
  );
  const [pauseWarningMessage, setPauseWarningMessage] = useState<string>(
    initialSchedule.pauseWarningMessage
  );
  const [newHolidayDate, setNewHolidayDate] = useState<string>(() =>
    getDateKeyInTimezone(new Date(), initialSchedule.scheduleTimezone)
  );
  const [newHolidayLabel, setNewHolidayLabel] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    setDailyPauses(initialSchedule.dailyPausePeriods);
    setWeeklyBlockedDays(initialSchedule.weeklyBlockedDays);
    setHolidayDates(initialSchedule.holidayDates);
    setPauseWarningEnabled(initialSchedule.pauseWarningEnabled);
    setPauseWarningMinutes(
      initialSchedule.pauseWarningMinutes || DEFAULT_PAUSE_WARNING_MINUTES
    );
    setPauseWarningMessage(initialSchedule.pauseWarningMessage);
  }, [initialSchedule]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timezone = initialSchedule.scheduleTimezone;

  const draftPreviewState = useMemo<StudioState>(() => {
    const cleanPauses = sanitizeDailyPausePeriods(dailyPauses);
    const cleanBlockedDays = sanitizeWeeklyBlockedDays(weeklyBlockedDays);
    const cleanHolidays = sanitizeHolidayDates(holidayDates);
    return {
      modelUid: studioState?.modelUid || 'preview',
      modelName: studioState?.modelName || modelName,
      isLive: studioState?.isLive ?? true,
      callMode: studioState?.callMode ?? 'open',
      headline: studioState?.headline ?? '',
      updatedAt: studioState?.updatedAt as StudioState['updatedAt'],
      autoScheduleEnabled: studioState?.autoScheduleEnabled,
      scheduleStartTime: studioState?.scheduleStartTime,
      scheduleEndTime: studioState?.scheduleEndTime,
      scheduleDays: studioState?.scheduleDays,
      scheduleTimezone: timezone,
      schedulePeriods: studioState?.schedulePeriods,
      holidayDates: cleanHolidays,
      dailyPausePeriods: cleanPauses,
      weeklyBlockedDays: cleanBlockedDays,
      pauseWarningEnabled,
      pauseWarningMinutes,
      pauseWarningMessage,
      dndActive: studioState?.dndActive,
      dndUntilMs: studioState?.dndUntilMs,
      dndScheduleEnabled: studioState?.dndScheduleEnabled,
      dndStartTime: studioState?.dndStartTime,
      dndEndTime: studioState?.dndEndTime,
    };
  }, [
    dailyPauses,
    holidayDates,
    modelName,
    pauseWarningEnabled,
    pauseWarningMessage,
    pauseWarningMinutes,
    studioState,
    timezone,
    weeklyBlockedDays,
  ]);

  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = useMemo(
    () => getDateKeyInTimezone(nowDate, timezone),
    [nowDate, timezone]
  );
  const previewHolidayToday = useMemo(
    () => getHolidayForDate(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );
  const previewWeekdayBlocked = useMemo(
    () => isWeekdayBlockedNow(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );
  const previewActivePause = useMemo(
    () => getActiveDailyPause(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );
  const previewUpcomingWarning = useMemo(
    () => getUpcomingBlockWarning(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );
  const nextAvailable = useMemo(
    () => getNextAvailableTarget(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );

  const enabledPausesCount = useMemo(
    () =>
      dailyPauses.filter((p) => p.enabled && parseScheduleDays(p.days).length > 0)
        .length,
    [dailyPauses]
  );

  const upcomingHolidayPresets = useMemo(
    () => [
      { label: 'Hoje', date: todayKey, note: 'Descanso hoje' },
      {
        label: 'Amanhã',
        date: addDaysToYYYYMMDD(todayKey, 1),
        note: 'Folga agendada',
      },
      {
        label: 'Natal (25/12)',
        date: getNextFixedHolidayDate(todayKey, 12, 25),
        note: 'Natal',
      },
      {
        label: 'Ano Novo (01/01)',
        date: getNextFixedHolidayDate(todayKey, 1, 1),
        note: 'Ano Novo',
      },
    ],
    [todayKey]
  );

  const updatePause = (
    id: string,
    updater: (prev: DailyPausePeriod) => DailyPausePeriod
  ) => {
    setSavedBanner(null);
    setDailyPauses((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  };

  const togglePauseDay = (id: string, dayId: number) => {
    updatePause(id, (pause) => {
      const currentDays = parseScheduleDays(pause.days);
      const nextDays = currentDays.includes(dayId)
        ? currentDays.filter((d) => d !== dayId)
        : [...currentDays, dayId].sort((a, b) => a - b);
      return {
        ...pause,
        days: sanitizeDaysString(nextDays.join(','), ''),
      };
    });
  };

  const handleAddPause = (preset?: (typeof PAUSE_PRESETS)[number]) => {
    if (dailyPauses.length >= MAX_DAILY_PAUSE_PERIODS) return;
    setSavedBanner(null);
    const nextIdx = dailyPauses.length + 1;
    setDailyPauses((prev) => [
      ...prev,
      {
        id: createPauseId(),
        label: preset ? preset.label : `Pausa ${nextIdx}`,
        startTime: preset ? preset.startTime : '12:00',
        endTime: preset ? preset.endTime : '13:00',
        days: preset ? preset.days : '0,1,2,3,4,5,6',
        enabled: true,
      },
    ]);
  };

  const handleDuplicatePause = (source: DailyPausePeriod) => {
    if (dailyPauses.length >= MAX_DAILY_PAUSE_PERIODS) return;
    setSavedBanner(null);
    setDailyPauses((prev) => [
      ...prev,
      {
        ...source,
        id: createPauseId(),
        label: source.label
          ? `${source.label.slice(0, 32)} (cópia)`
          : `Pausa ${prev.length + 1}`,
      },
    ]);
  };

  const handleRemovePause = (id: string) => {
    setSavedBanner(null);
    setDailyPauses((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleWeeklyBlockedDay = (dayId: number) => {
    setSavedBanner(null);
    setWeeklyBlockedDays((prev) =>
      sanitizeWeeklyBlockedDays(
        prev.includes(dayId)
          ? prev.filter((d) => d !== dayId)
          : [...prev, dayId]
      )
    );
  };

  const upsertHolidayDate = (date: string, label?: string) => {
    if (!date || holidayDates.length >= MAX_HOLIDAY_DATES) return;
    setSavedBanner(null);
    setHolidayDates((prev) =>
      sanitizeHolidayDates([
        ...prev.filter((h) => h.date !== date),
        { date, label: label?.trim().slice(0, 40) },
      ])
    );
  };

  const handleAddHolidayFromInput = () => {
    if (!newHolidayDate) return;
    upsertHolidayDate(newHolidayDate, newHolidayLabel);
    setNewHolidayLabel('');
  };

  const handleRemoveHoliday = (date: string) => {
    setSavedBanner(null);
    setHolidayDates((prev) => prev.filter((h) => h.date !== date));
  };

  const handleSaveAgenda = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const cleanPauses = sanitizeDailyPausePeriods(dailyPauses);
    const cleanBlockedDays = sanitizeWeeklyBlockedDays(weeklyBlockedDays);
    const cleanHolidays = sanitizeHolidayDates(holidayDates);

    setSaving(true);
    setSavedBanner(null);
    try {
      const checkNow = new Date();
      const nextPreview: StudioState = {
        ...draftPreviewState,
        dailyPausePeriods: cleanPauses,
        weeklyBlockedDays: cleanBlockedDays,
        holidayDates: cleanHolidays,
      };
      const isHolidayNow = getHolidayForDate(nextPreview, checkNow) !== null;
      const isBlockedDayNow = isWeekdayBlockedNow(nextPreview, checkNow);
      const activePauseNow = getActiveDailyPause(nextPreview, checkNow);

      const patch: StudioStateUpdatePatch = {
        dailyPausePeriods: cleanPauses,
        weeklyBlockedDays: cleanBlockedDays,
        holidayDates: cleanHolidays,
        pauseWarningEnabled,
        pauseWarningMinutes: Math.max(
          1,
          Math.min(30, Math.round(pauseWarningMinutes || DEFAULT_PAUSE_WARNING_MINUTES))
        ),
        pauseWarningMessage: pauseWarningMessage.trim().slice(0, 160),
      };

      if (isHolidayNow || isBlockedDayNow) {
        patch.isLive = false;
        patch.callMode = 'paused';
      }
      if (activePauseNow !== null) {
        patch.dndActive = true;
      } else if (!studioState?.dndScheduleEnabled && !(studioState?.dndUntilMs && studioState.dndUntilMs > checkNow.getTime())) {
        patch.dndActive = false;
      }

      await onUpdateStudioState(patch);

      if (isHolidayNow) {
        setSavedBanner(
          'Agenda salva. Hoje está marcado como feriado/data específica — o estúdio entrou em Modo Descanso automaticamente.'
        );
      } else if (isBlockedDayNow) {
        setSavedBanner(
          'Agenda salva. O dia de hoje está marcado como bloqueio semanal — novas chamadas foram pausadas para este dia.'
        );
      } else if (activePauseNow) {
        setSavedBanner(
          `Agenda salva. A pausa "${activePauseNow.label || 'Pausa diária'}" está ativa agora (até ${activePauseNow.endTime}).`
        );
      } else {
        setSavedBanner(
          'Gerenciamento de Agenda salvo com sucesso. Pausas diárias, bloqueios semanais e feriados já estão valendo.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const isCurrentlyBlocked =
    Boolean(previewHolidayToday) ||
    previewWeekdayBlocked ||
    previewActivePause !== null;

  return (
    <div className="space-y-6">
      {/* Header + Live Agenda Status Card */}
      <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
              <CalendarRange className="w-4 h-4 shrink-0" />
              <span>Regras Automáticas de Pausa e Disponibilidade · {modelName}</span>
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
              Gerenciamento de Agenda
            </h2>
            <p className="text-sm text-[#C9BAC4] max-w-2xl leading-relaxed">
              Defina pausas diárias em horários fixos, bloqueios recorrentes por dia da semana e datas de feriado. Tudo é aplicado automaticamente na recepção dos internautas.
            </p>
          </div>

          {/* Live Status Summary Box */}
          <div className="p-4 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/25 flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                  previewHolidayToday || previewWeekdayBlocked
                    ? 'bg-[#21142D] border-[#FCD34D]/45 text-[#FCD34D]'
                    : previewActivePause
                      ? 'bg-[#21142D] border-[#F4C2D7]/45 text-[#F4C2D7]'
                      : 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC]'
                }`}
              >
                {previewHolidayToday ? (
                  <CalendarOff className="w-4 h-4" />
                ) : previewWeekdayBlocked ? (
                  <Ban className="w-4 h-4" />
                ) : previewActivePause ? (
                  <PauseCircle className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-[#FAF4F7]">
                  {previewHolidayToday
                    ? `Feriado hoje${
                        previewHolidayToday.label
                          ? ` (${previewHolidayToday.label})`
                          : ''
                      }`
                    : previewWeekdayBlocked
                      ? 'Dia bloqueado na agenda semanal'
                      : previewActivePause
                        ? `Pausa ativa agora: ${
                            previewActivePause.label || 'Pausa diária'
                          }`
                        : 'Nenhuma pausa ou bloqueio ativo agora'}
                </p>
                <p className="text-[11px] text-[#C9BAC4] font-mono tabular-nums">
                  {enabledPausesCount} pausa{enabledPausesCount === 1 ? '' : 's'} ·{' '}
                  {weeklyBlockedDays.length} dia
                  {weeklyBlockedDays.length === 1 ? '' : 's'} bloqueado
                  {weeklyBlockedDays.length === 1 ? '' : 's'} ·{' '}
                  {holidayDates.length} feriado
                  {holidayDates.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {isCurrentlyBlocked && nextAvailable.nextAvailableMs && (
              <div className="sm:pl-4 sm:border-l border-[#F4C2D7]/15 text-left sm:text-right">
                <p className="text-[10px] text-[#938291]">Retorno automático</p>
                <p className="text-base font-mono font-semibold tabular-nums text-[#F4C2D7]">
                  {formatCountdownClock(
                    Math.max(0, nextAvailable.nextAvailableMs - nowMs)
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <form onSubmit={handleSaveAgenda} className="space-y-6">
        {/* Section 1: Specific Daily Pause Periods */}
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#F4C2D7]/15">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4C2D7]">
                <Coffee className="w-4 h-4 shrink-0" />
                <span>Pausas Automáticas Durante o Dia</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#FAF4F7]">
                Períodos Específicos de Pausa Diária
              </h3>
              <p className="text-xs text-[#C9BAC4] leading-relaxed">
                Bloqueie intervalos específicos todos os dias ou apenas nos dias escolhidos (ex.: almoço, intervalo técnico ou descanso noturno).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {PAUSE_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={dailyPauses.length >= MAX_DAILY_PAUSE_PERIODS}
                  onClick={() => handleAddPause(preset)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/45 disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Clock className="w-3 h-3 text-[#F4C2D7]" />
                  <span>+ {preset.label}</span>
                </button>
              ))}
              <button
                type="button"
                disabled={dailyPauses.length >= MAX_DAILY_PAUSE_PERIODS}
                onClick={() => handleAddPause()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-40 transition-all whitespace-nowrap cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nova Pausa</span>
              </button>
            </div>
          </div>

          {dailyPauses.length === 0 ? (
            <div className="p-7 rounded-2xl bg-[#0B060F]/80 border border-dashed border-[#F4C2D7]/20 text-center space-y-3">
              <PauseCircle className="w-6 h-6 text-[#F4C2D7] mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#FAF4F7]">
                  Nenhuma pausa diária cadastrada
                </p>
                <p className="text-xs text-[#C9BAC4] max-w-md mx-auto">
                  Use um atalho acima ou clique em Nova Pausa para programar horários diários de intervalo automático.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {dailyPauses.map((pause, index) => {
                const activeDays = parseScheduleDays(pause.days);
                const overnight = isOvernightWindow(
                  pause.startTime,
                  pause.endTime
                );
                const noDaysWarning = pause.enabled && activeDays.length === 0;
                const isRunningNow =
                  previewActivePause?.id === pause.id && pause.enabled;

                return (
                  <article
                    key={pause.id}
                    className={`rounded-2xl border p-5 space-y-4 transition-colors ${
                      isRunningNow
                        ? 'bg-[#21142D]/85 border-[#F4C2D7]/55 shadow-[0_0_24px_-12px_rgba(244,194,215,0.4)]'
                        : pause.enabled
                          ? 'bg-[#0B060F]/90 border-[#F4C2D7]/20'
                          : 'bg-[#0B060F]/45 border-[#F4C2D7]/10 opacity-70'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                        <span className="text-xs font-mono tabular-nums text-[#F4C2D7] shrink-0">
                          #{index + 1}
                        </span>
                        <input
                          type="text"
                          maxLength={40}
                          value={pause.label ?? ''}
                          onChange={(e) =>
                            updatePause(pause.id, (prev) => ({
                              ...prev,
                              label: e.target.value,
                            }))
                          }
                          placeholder={`Motivo da pausa (ex.: Almoço, Descanso)`}
                          aria-label={`Nome da pausa ${index + 1}`}
                          className="flex-1 min-w-[180px] bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-1.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                        />
                        {isRunningNow && (
                          <span className="text-[11px] font-semibold text-[#FDE68A] whitespace-nowrap shrink-0">
                            · Ativa neste momento
                          </span>
                        )}
                        {overnight && (
                          <span className="text-[11px] text-[#C9BAC4] whitespace-nowrap shrink-0">
                            · Vira a noite
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          aria-pressed={pause.enabled}
                          onClick={() =>
                            updatePause(pause.id, (prev) => ({
                              ...prev,
                              enabled: !prev.enabled,
                            }))
                          }
                          className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            pause.enabled
                              ? 'bg-[#16A34A]/20 border-[#16A34A]/45 text-[#86EFAC]'
                              : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4]'
                          }`}
                        >
                          {pause.enabled ? 'Pausa Ativa' : 'Desativada'}
                        </button>

                        <button
                          type="button"
                          disabled={dailyPauses.length >= MAX_DAILY_PAUSE_PERIODS}
                          onClick={() => handleDuplicatePause(pause)}
                          title="Duplicar pausa"
                          aria-label={`Duplicar ${pause.label || `Pausa ${index + 1}`}`}
                          className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] disabled:opacity-35 transition-colors cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemovePause(pause.id)}
                          title="Remover pausa"
                          aria-label={`Remover ${pause.label || `Pausa ${index + 1}`}`}
                          className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                      <div className="md:col-span-3 space-y-1.5">
                        <label
                          htmlFor={`pause-start-${pause.id}`}
                          className="block text-xs font-medium text-[#C9BAC4]"
                        >
                          Início da pausa
                        </label>
                        <input
                          id={`pause-start-${pause.id}`}
                          type="time"
                          value={pause.startTime}
                          onChange={(e) =>
                            updatePause(pause.id, (prev) => ({
                              ...prev,
                              startTime: sanitizeTimeHHMM(
                                e.target.value,
                                prev.startTime
                              ),
                            }))
                          }
                          className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                        />
                      </div>

                      <div className="md:col-span-3 space-y-1.5">
                        <label
                          htmlFor={`pause-end-${pause.id}`}
                          className="block text-xs font-medium text-[#C9BAC4]"
                        >
                          Retorno automático
                        </label>
                        <input
                          id={`pause-end-${pause.id}`}
                          type="time"
                          value={pause.endTime}
                          onChange={(e) =>
                            updatePause(pause.id, (prev) => ({
                              ...prev,
                              endTime: sanitizeTimeHHMM(
                                e.target.value,
                                prev.endTime
                              ),
                            }))
                          }
                          className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
                        />
                      </div>

                      <div className="md:col-span-6 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[#C9BAC4]">
                            Repetir em ({formatOperatingDaysLabel(pause.days)})
                          </span>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {DAY_GROUP_PRESETS.map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() =>
                                  updatePause(pause.id, (prev) => ({
                                    ...prev,
                                    days: preset.days,
                                  }))
                                }
                                className="px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#150D1D] border border-[#F4C2D7]/15 rounded-2xl">
                          {WEEKDAYS_PT.map((day) => {
                            const isSelected = activeDays.includes(day.id);
                            return (
                              <button
                                key={day.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => togglePauseDay(pause.id, day.id)}
                                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  isSelected
                                    ? 'luxury-rose-cta font-semibold'
                                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                                }`}
                              >
                                {day.short}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {noDaysWarning && (
                      <p className="text-[11px] text-[#FCD34D]">
                        Selecione pelo menos um dia da semana para que esta pausa seja aplicada.
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 2: Recurring Weekly Blocked Days */}
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F4C2D7]/15">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4C2D7]">
                <Ban className="w-4 h-4 shrink-0" />
                <span>Folgas Semanais Recorrentes</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#FAF4F7]">
                Bloqueios Recorrentes por Dia da Semana
              </h3>
              <p className="text-xs text-[#C9BAC4] leading-relaxed">
                Clique nos dias da semana em que você não realiza atendimentos. Nos dias marcados como bloqueados, o estúdio fecha automaticamente o dia todo toda semana.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSavedBanner(null);
                  setWeeklyBlockedDays([0, 6]);
                }}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap cursor-pointer"
              >
                Bloquear Finais de Semana
              </button>
              <button
                type="button"
                onClick={() => {
                  setSavedBanner(null);
                  setWeeklyBlockedDays([]);
                }}
                disabled={weeklyBlockedDays.length === 0}
                className="px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer"
              >
                Limpar Bloqueios
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {WEEKDAYS_PT.map((day) => {
              const isBlocked = weeklyBlockedDays.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  aria-pressed={isBlocked}
                  onClick={() => toggleWeeklyBlockedDay(day.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer space-y-2 ${
                    isBlocked
                      ? 'bg-[#2A1320] border-[#FCA5A5]/50 text-[#FAF4F7] shadow-[0_0_20px_-10px_rgba(248,113,113,0.45)]'
                      : 'bg-[#0B060F]/85 border-[#F4C2D7]/15 text-[#C9BAC4] hover:border-[#F4C2D7]/40 hover:text-[#FAF4F7]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[#FAF4F7]">
                      {day.label}
                    </span>
                    {isBlocked ? (
                      <Ban className="w-4 h-4 text-[#FCA5A5] shrink-0" />
                    ) : (
                      <Sun className="w-4 h-4 text-[#86EFAC] shrink-0" />
                    )}
                  </div>
                  <p
                    className={`text-[11px] font-medium ${
                      isBlocked ? 'text-[#FCA5A5]' : 'text-[#86EFAC]'
                    }`}
                  >
                    {isBlocked ? 'Bloqueado toda semana' : 'Atendimento livre'}
                  </p>
                </button>
              );
            })}
          </div>

          {weeklyBlockedDays.length === 7 && (
            <p className="text-xs text-[#FCD34D]">
              Atenção: todos os 7 dias da semana estão bloqueados no momento — nenhuma chamada automática será liberada até desbloquear pelo menos um dia.
            </p>
          )}
        </section>

        {/* Section 3: Existing Holidays & Specific Dates Scheduling */}
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F4C2D7]/15">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4C2D7]">
                <CalendarOff className="w-4 h-4 shrink-0" />
                <span>Datas Pontuais e Feriados</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#FAF4F7]">
                Agendamento de Feriados e Folgas Específicas
              </h3>
              <p className="text-xs text-[#C9BAC4]">
                Marque datas exatas do calendário em que o estúdio permanecerá em Modo Descanso o dia inteiro.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#C9BAC4] whitespace-nowrap shrink-0">
              {holidayDates.length}/{MAX_HOLIDAY_DATES} datas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-2xl bg-[#0B060F]/90 border border-[#F4C2D7]/20">
            <div className="md:col-span-3 space-y-1.5">
              <label
                htmlFor="agenda-holiday-date-input"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Data do feriado / folga
              </label>
              <input
                id="agenda-holiday-date-input"
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="md:col-span-6 space-y-1.5">
              <label
                htmlFor="agenda-holiday-label-input"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Motivo ou nome do feriado (opcional)
              </label>
              <input
                id="agenda-holiday-label-input"
                type="text"
                maxLength={40}
                value={newHolidayLabel}
                onChange={(e) => setNewHolidayLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddHolidayFromInput();
                  }
                }}
                placeholder="Ex.: Natal, Recesso, Viagem, Folga"
                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="button"
                disabled={
                  !newHolidayDate || holidayDates.length >= MAX_HOLIDAY_DATES
                }
                onClick={handleAddHolidayFromInput}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-[#21142D] border border-[#F4C2D7]/30 text-[#FAF4F7] hover:bg-[#281837] disabled:opacity-40 transition-colors whitespace-nowrap cursor-pointer h-[38px]"
              >
                <Plus className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>Adicionar Feriado</span>
              </button>
            </div>

            <div className="md:col-span-12 flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-[#938291]">Atalhos:</span>
              {upcomingHolidayPresets.map((preset) => {
                const alreadyAdded = holidayDates.some(
                  (h) => h.date === preset.date
                );
                return (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={
                      alreadyAdded || holidayDates.length >= MAX_HOLIDAY_DATES
                    }
                    onClick={() => upsertHolidayDate(preset.date, preset.note)}
                    className={`px-3 py-1 text-[11px] font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      alreadyAdded
                        ? 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC] cursor-default'
                        : 'bg-[#1A1024] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/40'
                    }`}
                  >
                    {alreadyAdded ? `${preset.label} · Adicionado` : preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {holidayDates.length === 0 ? (
            <p className="text-xs text-[#938291]">
              Nenhum feriado ou data específica cadastrado no momento.
            </p>
          ) : (
            <div className="divide-y divide-[#F4C2D7]/10 rounded-2xl bg-[#0B060F]/75 border border-[#F4C2D7]/15 overflow-hidden">
              {holidayDates.map((holiday) => {
                const isToday = holiday.date === todayKey;
                const isPast = holiday.date < todayKey;
                return (
                  <div
                    key={holiday.date}
                    className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs font-medium text-[#FAF4F7] flex flex-wrap items-center gap-2">
                        <span className="font-mono tabular-nums text-[#F4C2D7]">
                          {formatHolidayDateBR(holiday.date)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize text-[#C9BAC4]">
                          {formatHolidayWeekdayBR(holiday.date)}
                        </span>
                        {holiday.label && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{holiday.label}</span>
                          </>
                        )}
                      </p>
                      <p className="text-[11px] text-[#938291]">
                        {isToday
                          ? 'Ativo hoje — estúdio em Modo Descanso durante todo o dia'
                          : isPast
                            ? 'Data anterior à data atual'
                            : 'Modo Descanso automático programado para o dia inteiro'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveHoliday(holiday.date)}
                      aria-label={`Remover feriado ${formatHolidayDateBR(holiday.date)}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 4: Automatic Pre-Pause Notification Settings */}
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#F4C2D7]/15">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#F4C2D7]">
                <BellRing className="w-4 h-4 shrink-0" />
                <span>Notificações Automáticas para Internautas</span>
              </div>
              <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#FAF4F7]">
                Aviso Automático de Pausa ({pauseWarningMinutes} min antes)
              </h3>
              <p className="text-xs text-[#C9BAC4] leading-relaxed max-w-2xl">
                Exibe automaticamente um alerta na tela dos internautas conectados antes de qualquer pausa diária, bloqueio semanal, feriado ou encerramento de turno começar.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full w-fit shrink-0">
              <button
                type="button"
                aria-pressed={pauseWarningEnabled}
                onClick={() => {
                  setPauseWarningEnabled(true);
                  setSavedBanner(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  pauseWarningEnabled
                    ? 'bg-[#16A34A] text-white font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                Aviso Ativado
              </button>
              <button
                type="button"
                aria-pressed={!pauseWarningEnabled}
                onClick={() => {
                  setPauseWarningEnabled(false);
                  setSavedBanner(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !pauseWarningEnabled
                    ? 'luxury-rose-cta font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                Desativado
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-5 space-y-1.5">
              <span className="block text-xs font-medium text-[#C9BAC4]">
                Antecedência antes do início do bloqueio
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {[5, 10, 15].map((mins) => {
                  const selected = pauseWarningMinutes === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      disabled={!pauseWarningEnabled}
                      aria-pressed={selected}
                      onClick={() => {
                        setPauseWarningMinutes(mins);
                        setSavedBanner(null);
                      }}
                      className={`px-3.5 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45 ${
                        selected
                          ? 'luxury-rose-cta border-transparent font-semibold'
                          : 'bg-[#0B060F] border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7]'
                      }`}
                    >
                      {mins} min antes{mins === 5 ? ' (Padrão)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="agenda-pause-warning-msg"
                  className="block text-xs font-medium text-[#C9BAC4]"
                >
                  Mensagem complementar para o internauta (opcional)
                </label>
                <span className="text-[11px] font-mono tabular-nums text-[#938291]">
                  {pauseWarningMessage.length}/160
                </span>
              </div>
              <input
                id="agenda-pause-warning-msg"
                type="text"
                maxLength={160}
                disabled={!pauseWarningEnabled}
                value={pauseWarningMessage}
                onChange={(e) => {
                  setPauseWarningMessage(e.target.value);
                  setSavedBanner(null);
                }}
                placeholder="Ex.: Entrarei em pausa em instantes. Aproveite estes minutos ou deixe recado!"
                className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] placeholder:text-[#938291] disabled:opacity-45 focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>
          </div>

          {/* Live / Preview Box showing exact visitor appearance */}
          <div className="rounded-2xl border border-[#FCD34D]/35 bg-[#1D121E]/90 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <BellRing className="w-4 h-4 text-[#FCD34D] shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-semibold text-[#FDE68A]">
                  {previewUpcomingWarning
                    ? `Disparando agora · ${previewUpcomingWarning.label}`
                    : pauseWarningEnabled
                      ? `Prévia do Aviso Automático (${pauseWarningMinutes} min antes do bloqueio)`
                      : 'Aviso automático desativado'}
                </p>
                <p className="text-xs text-[#C9BAC4] break-words">
                  {pauseWarningEnabled
                    ? pauseWarningMessage.trim() ||
                      `${modelName} iniciará uma pausa agendada em breve (${pauseWarningMinutes} minutos de aviso prévio).`
                    : 'Ative o aviso acima para notificar internautas automaticamente antes das pausas e bloqueios.'}
                </p>
              </div>
            </div>

            {pauseWarningEnabled && (
              <div className="text-left sm:text-right shrink-0">
                <p className="text-[10px] text-[#938291]">
                  {previewUpcomingWarning ? 'Inicia em' : 'Exemplo de contador'}
                </p>
                <p className="text-base font-mono font-semibold tabular-nums text-[#FDE68A]">
                  {previewUpcomingWarning
                    ? formatMinutesSecondsClock(
                        previewUpcomingWarning.remainingMs
                      )
                    : `${pauseWarningMinutes.toString().padStart(2, '0')}:00`}
                </p>
              </div>
            )}
          </div>
        </section>

        {savedBanner && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedBanner}</span>
          </div>
        )}

        {/* Save Bar */}
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-[#C9BAC4] font-mono tabular-nums">
            {dailyPauses.length} de {MAX_DAILY_PAUSE_PERIODS} pausas diárias ·{' '}
            {weeklyBlockedDays.length} dia
            {weeklyBlockedDays.length === 1 ? '' : 's'} bloqueado
            {weeklyBlockedDays.length === 1 ? '' : 's'} · {holidayDates.length}{' '}
            feriado{holidayDates.length === 1 ? '' : 's'} · Aviso:{' '}
            {pauseWarningEnabled ? `${pauseWarningMinutes} min antes` : 'desativado'}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarRange className="w-3.5 h-3.5" />
            <span>
              {saving ? 'Salvando agenda...' : 'Salvar Gerenciamento de Agenda'}
            </span>
          </button>
        </section>
      </form>
    </div>
  );
};
