import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Copy,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import {
  MAX_HOLIDAY_DATES,
  MAX_SCHEDULE_PERIODS,
  WEEKDAYS_PT,
  formatCountdownClock,
  formatHolidayDateBR,
  formatHolidayWeekdayBR,
  formatOperatingDaysLabel,
  getDateKeyInTimezone,
  getHolidayForDate,
  getNextAvailableTarget,
  getScheduleFromState,
  isWithinOperatingHours,
  parseScheduleDays,
  sanitizeDaysString,
  sanitizeHolidayDates,
  sanitizeSchedulePeriods,
  sanitizeTimeHHMM,
} from '../lib/schedule';
import type {
  ScheduleHolidayDate,
  SchedulePeriod,
  StudioState,
  StudioStateUpdatePatch,
} from '../types/studio';

interface OperatingSchedulePanelProps {
  studioState: StudioState | null;
  onUpdateStudioState: (patch: StudioStateUpdatePatch) => Promise<void>;
}

const TIMEZONE_OPTIONS = [
  { value: 'America/Sao_Paulo', label: 'Brasília (BRT)' },
  { value: 'America/Manaus', label: 'Manaus (AMT)' },
  { value: 'Europe/Lisbon', label: 'Lisboa (WET)' },
  { value: 'America/New_York', label: 'Nova York (EST)' },
] as const;

const DAY_GROUP_PRESETS: ReadonlyArray<{ label: string; days: string }> = [
  { label: 'Seg–Sex', days: '1,2,3,4,5' },
  { label: 'Seg–Sáb', days: '1,2,3,4,5,6' },
  { label: 'Fim de semana', days: '0,6' },
  { label: 'Todos', days: '0,1,2,3,4,5,6' },
];

const TURN_TIME_PRESETS: ReadonlyArray<{
  label: string;
  start: string;
  end: string;
}> = [
  { label: 'Manhã (09h–13h)', start: '09:00', end: '13:00' },
  { label: 'Tarde (14h–19h)', start: '14:00', end: '19:00' },
  { label: 'Noite (20h–00h)', start: '20:00', end: '00:00' },
  { label: 'Madrugada (22h–04h)', start: '22:00', end: '04:00' },
];

function createPeriodId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `periodo_${Date.now().toString(36)}_${rand}`;
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

export const OperatingSchedulePanel: React.FC<OperatingSchedulePanelProps> = ({
  studioState,
  onUpdateStudioState,
}) => {
  const initialSchedule = useMemo(
    () => getScheduleFromState(studioState),
    [studioState]
  );

  const [autoEnabled, setAutoEnabled] = useState<boolean>(
    initialSchedule.autoScheduleEnabled
  );
  const [timezone, setTimezone] = useState<string>(
    initialSchedule.scheduleTimezone
  );
  const [periods, setPeriods] = useState<SchedulePeriod[]>(
    initialSchedule.schedulePeriods
  );
  const [holidayDates, setHolidayDates] = useState<ScheduleHolidayDate[]>(
    initialSchedule.holidayDates
  );
  const [newHolidayDate, setNewHolidayDate] = useState<string>(() =>
    getDateKeyInTimezone(new Date(), initialSchedule.scheduleTimezone)
  );
  const [newHolidayLabel, setNewHolidayLabel] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    setAutoEnabled(initialSchedule.autoScheduleEnabled);
    setTimezone(initialSchedule.scheduleTimezone);
    setPeriods(initialSchedule.schedulePeriods);
    setHolidayDates(initialSchedule.holidayDates);
  }, [initialSchedule]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const draftPreviewState = useMemo<StudioState>(() => {
    const cleanPeriods = sanitizeSchedulePeriods(periods);
    const cleanHolidays = sanitizeHolidayDates(holidayDates);
    const primary = cleanPeriods.find((p) => p.enabled) ?? cleanPeriods[0];
    return {
      modelUid: studioState?.modelUid || 'preview',
      modelName: studioState?.modelName || 'Lorena Noir',
      isLive: studioState?.isLive ?? true,
      callMode: studioState?.callMode ?? 'open',
      headline: studioState?.headline ?? '',
      updatedAt: studioState?.updatedAt as StudioState['updatedAt'],
      autoScheduleEnabled: autoEnabled,
      scheduleStartTime: primary?.startTime ?? '14:00',
      scheduleEndTime: primary?.endTime ?? '23:00',
      scheduleDays: primary?.days ?? '',
      scheduleTimezone: timezone,
      schedulePeriods: cleanPeriods,
      holidayDates: cleanHolidays,
      dndActive: studioState?.dndActive,
      dndUntilMs: studioState?.dndUntilMs,
      dndScheduleEnabled: studioState?.dndScheduleEnabled,
      dndStartTime: studioState?.dndStartTime,
      dndEndTime: studioState?.dndEndTime,
    };
  }, [autoEnabled, holidayDates, periods, studioState, timezone]);

  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const todayKey = useMemo(
    () => getDateKeyInTimezone(nowDate, timezone),
    [nowDate, timezone]
  );
  const previewHolidayToday = useMemo(
    () => getHolidayForDate(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );
  const previewIsOpen = useMemo(
    () => isWithinOperatingHours(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );
  const nextOpening = useMemo(
    () => getNextAvailableTarget(draftPreviewState, nowDate),
    [draftPreviewState, nowDate]
  );

  const enabledPeriodsCount = useMemo(
    () =>
      periods.filter((p) => p.enabled && parseScheduleDays(p.days).length > 0)
        .length,
    [periods]
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

  const updatePeriod = (
    id: string,
    updater: (prev: SchedulePeriod) => SchedulePeriod
  ) => {
    setSavedBanner(null);
    setPeriods((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
  };

  const togglePeriodDay = (id: string, dayId: number) => {
    updatePeriod(id, (period) => {
      const currentDays = parseScheduleDays(period.days);
      const nextDays = currentDays.includes(dayId)
        ? currentDays.filter((d) => d !== dayId)
        : [...currentDays, dayId].sort((a, b) => a - b);
      return {
        ...period,
        days: sanitizeDaysString(nextDays.join(','), ''),
      };
    });
  };

  const handleAddPeriod = () => {
    if (periods.length >= MAX_SCHEDULE_PERIODS) return;
    setSavedBanner(null);
    const nextIdx = periods.length + 1;
    setPeriods((prev) => [
      ...prev,
      {
        id: createPeriodId(),
        label: `Período ${nextIdx}`,
        startTime: '19:00',
        endTime: '23:30',
        days: '1,2,3,4,5',
        enabled: true,
      },
    ]);
  };

  const handleDuplicatePeriod = (source: SchedulePeriod) => {
    if (periods.length >= MAX_SCHEDULE_PERIODS) return;
    setSavedBanner(null);
    setPeriods((prev) => [
      ...prev,
      {
        ...source,
        id: createPeriodId(),
        label: source.label
          ? `${source.label.slice(0, 32)} (cópia)`
          : `Período ${prev.length + 1}`,
      },
    ]);
  };

  const handleRemovePeriod = (id: string) => {
    setSavedBanner(null);
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  };

  const applyDualShiftTemplate = () => {
    setSavedBanner(null);
    setPeriods([
      {
        id: 'turno_tarde',
        label: 'Turno Tarde',
        startTime: '14:00',
        endTime: '18:00',
        days: '1,2,3,4,5',
        enabled: true,
      },
      {
        id: 'turno_noite',
        label: 'Sessão Noturna',
        startTime: '20:30',
        endTime: '01:30',
        days: '1,2,3,4,5,6',
        enabled: true,
      },
      {
        id: 'turno_fim_semana',
        label: 'Plantão Fim de Semana',
        startTime: '16:00',
        endTime: '02:00',
        days: '0,6',
        enabled: true,
      },
    ]);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const cleanPeriods = sanitizeSchedulePeriods(periods);
    const cleanHolidays = sanitizeHolidayDates(holidayDates);
    const primary = cleanPeriods.find((p) => p.enabled) ?? cleanPeriods[0];
    const cleanTz = timezone.trim().slice(0, 60) || 'America/Sao_Paulo';

    setSaving(true);
    setSavedBanner(null);
    try {
      const patch: StudioStateUpdatePatch = {
        autoScheduleEnabled: autoEnabled,
        scheduleTimezone: cleanTz,
        schedulePeriods: cleanPeriods,
        holidayDates: cleanHolidays,
        scheduleStartTime: primary ? primary.startTime : '14:00',
        scheduleEndTime: primary ? primary.endTime : '23:00',
        scheduleDays: primary ? primary.days : '',
      };

      const checkNow = new Date();
      const previewNextState: StudioState = {
        ...draftPreviewState,
        schedulePeriods: cleanPeriods,
        holidayDates: cleanHolidays,
        scheduleTimezone: cleanTz,
        autoScheduleEnabled: autoEnabled,
      };
      const isHolidayNow = getHolidayForDate(previewNextState, checkNow) !== null;

      if (isHolidayNow) {
        patch.isLive = false;
        patch.callMode = 'paused';
      } else if (autoEnabled) {
        const shouldBeLive = isWithinOperatingHours(previewNextState, checkNow);
        patch.isLive = shouldBeLive;
        patch.callMode = shouldBeLive ? 'open' : 'paused';
      }

      await onUpdateStudioState(patch);

      if (isHolidayNow) {
        setSavedBanner(
          'Agenda e feriados salvos. Como hoje está marcado como feriado/data específica, o estúdio entrou automaticamente em Modo Descanso.'
        );
      } else if (autoEnabled) {
        setSavedBanner(
          previewIsOpen
            ? 'Agenda salva. O estúdio está aberto agora dentro de um período configurado.'
            : 'Agenda salva. Como você está fora dos períodos ativos, o estúdio entrou automaticamente em Modo Descanso.'
        );
      } else {
        setSavedBanner(
          'Horários e feriados salvos. Feriados ativam o Modo Descanso automaticamente na data marcada; para turnos semanais, ative o modo Automático.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="luxury-card tech-reticle border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-6">
      {/* Header + Live Automatic Rest Mode Status */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 pb-5 border-b border-[#F4C2D7]/15">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
            <CalendarClock className="w-4 h-4 shrink-0" />
            <span>Múltiplos Períodos, Feriados e Modo Descanso Automático</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]">
            Horários de Funcionamento do Estúdio
          </h2>
          <p className="text-xs text-[#C9BAC4] max-w-2xl leading-relaxed">
            Configure quantos turnos e dias da semana desejar, além de feriados ou datas específicas de pausa. Em feriados ou fora dos períodos ativos, o estúdio entra automaticamente em{' '}
            <strong className="text-[#FAF4F7] font-semibold">Modo Descanso</strong>.
          </p>
        </div>

        {/* Real-Time Status Card */}
        <div className="p-4 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/25 flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                previewHolidayToday
                  ? 'bg-[#21142D] border-[#FCD34D]/45 text-[#FCD34D]'
                  : previewIsOpen
                    ? 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC]'
                    : 'bg-[#21142D] border-[#F4C2D7]/30 text-[#F4C2D7]'
              }`}
            >
              {previewHolidayToday ? (
                <CalendarOff className="w-4 h-4" />
              ) : previewIsOpen ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </div>
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#FAF4F7]">
                {previewHolidayToday
                  ? `Feriado hoje${
                      previewHolidayToday.label
                        ? ` (${previewHolidayToday.label})`
                        : ''
                    } · Modo Descanso`
                  : autoEnabled
                    ? previewIsOpen
                      ? 'Aberto agora pela agenda'
                      : 'Em Modo Descanso agora'
                    : 'Modo Manual ativo'}
              </p>
              <p className="text-[11px] text-[#C9BAC4] font-mono tabular-nums">
                {enabledPeriodsCount} período
                {enabledPeriodsCount === 1 ? '' : 's'} · {holidayDates.length}{' '}
                feriado{holidayDates.length === 1 ? '' : 's'}
                {!previewIsOpen && nextOpening.nextAvailableMs
                  ? ` · Abre ${nextOpening.formattedReturnTime}`
                  : ''}
              </p>
            </div>
          </div>

          {(previewHolidayToday || (!previewIsOpen && autoEnabled)) &&
            nextOpening.nextAvailableMs && (
              <div className="sm:pl-4 sm:border-l border-[#F4C2D7]/15 text-left sm:text-right">
                <p className="text-[10px] text-[#938291]">Próxima abertura</p>
                <p className="text-base font-mono font-semibold tabular-nums text-[#F4C2D7]">
                  {formatCountdownClock(
                    Math.max(0, nextOpening.nextAvailableMs - nowMs)
                  )}
                </p>
              </div>
            )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Global Controls: Auto Switch + Timezone + Quick Template */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <div className="lg:col-span-5 space-y-1.5">
            <span className="block text-xs font-medium text-[#C9BAC4]">
              Regra de Modo Descanso
            </span>
            <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full w-fit">
              <button
                type="button"
                onClick={() => {
                  setAutoEnabled(true);
                  setSavedBanner(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  autoEnabled
                    ? 'bg-[#16A34A] text-white font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                Automático (Modo Descanso)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoEnabled(false);
                  setSavedBanner(null);
                }}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  !autoEnabled
                    ? 'luxury-rose-cta font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                Manual
              </button>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label
              htmlFor="multi-schedule-tz"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Fuso horário da agenda
            </label>
            <select
              id="multi-schedule-tz"
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setSavedBanner(null);
              }}
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
            >
              {!TIMEZONE_OPTIONS.some((tz) => tz.value === timezone) && (
                <option value={timezone}>{timezone}</option>
              )}
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-4 flex flex-wrap lg:justify-end items-center gap-2">
            <button
              type="button"
              onClick={applyDualShiftTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/25 text-[#F4C2D7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Modelo 3 Turnos</span>
            </button>
            <button
              type="button"
              disabled={periods.length >= MAX_SCHEDULE_PERIODS}
              onClick={handleAddPeriod}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-40 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Período</span>
            </button>
          </div>
        </div>

        {/* Configured Operating Periods List */}
        {periods.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0B060F]/80 border border-dashed border-[#F4C2D7]/25 text-center space-y-3">
            <Moon className="w-6 h-6 text-[#F4C2D7] mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#FAF4F7]">
                Nenhum período de funcionamento configurado
              </p>
              <p className="text-xs text-[#C9BAC4] max-w-md mx-auto">
                Com a lista vazia e o modo automático ativo, o estúdio permanece em Modo Descanso integralmente até que você adicione um turno.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddPeriod}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar Primeiro Período</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {periods.map((period, index) => {
              const activeDays = parseScheduleDays(period.days);
              const overnight = isOvernightWindow(
                period.startTime,
                period.endTime
              );
              const noDaysWarning = period.enabled && activeDays.length === 0;

              return (
                <article
                  key={period.id}
                  className={`rounded-2xl border p-5 space-y-4 transition-colors ${
                    period.enabled
                      ? 'bg-[#0B060F]/90 border-[#F4C2D7]/25'
                      : 'bg-[#0B060F]/50 border-[#F4C2D7]/10 opacity-75'
                  }`}
                >
                  {/* Period Card Top Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-0">
                      <span className="text-xs font-mono tabular-nums px-2.5 py-1 rounded-full bg-[#21142D] text-[#F4C2D7] border border-[#F4C2D7]/20 shrink-0">
                        #{index + 1}
                      </span>
                      <input
                        type="text"
                        maxLength={40}
                        value={period.label ?? ''}
                        onChange={(e) =>
                          updatePeriod(period.id, (prev) => ({
                            ...prev,
                            label: e.target.value,
                          }))
                        }
                        placeholder={`Nome do período (ex.: Turno ${index + 1})`}
                        aria-label={`Nome do período ${index + 1}`}
                        className="flex-1 min-w-[180px] bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-1.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                      />
                      {overnight && (
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-[#21142D] text-[#F4C2D7] whitespace-nowrap shrink-0">
                          Avança madrugada
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        aria-pressed={period.enabled}
                        onClick={() =>
                          updatePeriod(period.id, (prev) => ({
                            ...prev,
                            enabled: !prev.enabled,
                          }))
                        }
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          period.enabled
                            ? 'bg-[#16A34A]/20 border-[#16A34A]/45 text-[#86EFAC]'
                            : 'bg-[#1A1024] border-[#F4C2D7]/20 text-[#C9BAC4]'
                        }`}
                      >
                        {period.enabled ? 'Período Ativo' : 'Pausado'}
                      </button>

                      <button
                        type="button"
                        disabled={periods.length >= MAX_SCHEDULE_PERIODS}
                        onClick={() => handleDuplicatePeriod(period)}
                        title="Duplicar período"
                        aria-label={`Duplicar ${period.label || `Período ${index + 1}`}`}
                        className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] disabled:opacity-35 transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRemovePeriod(period.id)}
                        title="Remover período"
                        aria-label={`Remover ${period.label || `Período ${index + 1}`}`}
                        className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Weekday Picker + Quick Group Presets */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#C9BAC4]">
                        Dias da semana ({formatOperatingDaysLabel(period.days)})
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {DAY_GROUP_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              updatePeriod(period.id, (prev) => ({
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
                            onClick={() => togglePeriodDay(period.id, day.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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

                    {noDaysWarning && (
                      <p className="text-[11px] text-[#FCD34D]">
                        Selecione pelo menos um dia da semana para que este período abra o estúdio.
                      </p>
                    )}
                  </div>

                  {/* Start / End Time Inputs + Turn Presets */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                    <div className="md:col-span-3 space-y-1.5">
                      <label
                        htmlFor={`period-start-${period.id}`}
                        className="block text-xs font-medium text-[#C9BAC4]"
                      >
                        Início (Online)
                      </label>
                      <input
                        id={`period-start-${period.id}`}
                        type="time"
                        value={period.startTime}
                        onChange={(e) =>
                          updatePeriod(period.id, (prev) => ({
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
                        htmlFor={`period-end-${period.id}`}
                        className="block text-xs font-medium text-[#C9BAC4]"
                      >
                        Término (Descanso)
                      </label>
                      <input
                        id={`period-end-${period.id}`}
                        type="time"
                        value={period.endTime}
                        onChange={(e) =>
                          updatePeriod(period.id, (prev) => ({
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

                    <div className="md:col-span-6 flex flex-wrap items-center gap-1.5">
                      {TURN_TIME_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() =>
                            updatePeriod(period.id, (prev) => ({
                              ...prev,
                              startTime: preset.start,
                              endTime: preset.end,
                            }))
                          }
                          className="px-3 py-1.5 text-[11px] font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Holidays & Specific Dates Automatic Rest Mode Field */}
        <div className="pt-6 border-t border-[#F4C2D7]/15 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#FAF4F7]">
                <CalendarOff className="w-4 h-4 text-[#F4C2D7] shrink-0" />
                <span>Feriados e Datas Específicas (Modo Descanso Automático)</span>
              </div>
              <p className="text-xs text-[#C9BAC4]">
                Defina datas exatas em que o estúdio deve permanecer em{' '}
                <strong className="text-[#FAF4F7] font-medium">Modo Descanso</strong> o dia inteiro, mesmo que caiam dentro de um horário de funcionamento configurado.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#C9BAC4] whitespace-nowrap shrink-0">
              {holidayDates.length}/{MAX_HOLIDAY_DATES} datas
            </span>
          </div>

          {/* Add Holiday Date Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end p-4 rounded-2xl bg-[#0B060F]/90 border border-[#F4C2D7]/20">
            <div className="md:col-span-3 space-y-1.5">
              <label
                htmlFor="holiday-date-input"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Data do feriado / folga
              </label>
              <input
                id="holiday-date-input"
                type="date"
                value={newHolidayDate}
                onChange={(e) => setNewHolidayDate(e.target.value)}
                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
              />
            </div>

            <div className="md:col-span-6 space-y-1.5">
              <label
                htmlFor="holiday-label-input"
                className="block text-xs font-medium text-[#C9BAC4]"
              >
                Motivo ou nome do feriado (opcional)
              </label>
              <input
                id="holiday-label-input"
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
                <span>Adicionar Data</span>
              </button>
            </div>

            {/* Quick Holiday Suggestions */}
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

          {/* Configured Holiday Dates List */}
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
                          ? 'Ativo hoje — estúdio entra automaticamente em Modo Descanso durante todo o dia'
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
        </div>

        {savedBanner && (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2.5"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedBanner}</span>
          </div>
        )}

        {/* Footer Summary + Save CTA */}
        <div className="pt-2 border-t border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-xs text-[#C9BAC4] tabular-nums">
            {periods.length} de {MAX_SCHEDULE_PERIODS} períodos ·{' '}
            {holidayDates.length} feriado{holidayDates.length === 1 ? '' : 's'}
            {' · '}
            {previewHolidayToday
              ? 'Hoje marcado como descanso automático'
              : autoEnabled
                ? 'Modo Descanso automático ativo fora dos horários'
                : 'Ative Automático acima para delegar turnos semanais ao relógio'}
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            <span>
              {saving ? 'Salvando agenda...' : 'Salvar Horários e Feriados'}
            </span>
          </button>
        </div>
      </form>
    </section>
  );
};
