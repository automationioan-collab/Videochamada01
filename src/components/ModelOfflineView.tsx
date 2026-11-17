import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, CalendarClock, CheckCircle2, Clock, Moon, Send } from 'lucide-react';
import { GaleriaModelo } from './GaleriaModelo';
import {
  WEEKDAYS_PT,
  formatCountdownClock,
  formatOperatingDaysLabel,
  getNextAvailableTarget,
  getScheduleFromState,
  isDndActiveNow,
  isWithinOperatingHours,
  parseScheduleDays,
  sanitizeDaysString,
  sanitizeTimeHHMM,
} from '../lib/schedule';
import type {
  InterestMessage,
  InterestMessageStatus,
  StudioCallMode,
  StudioProfile,
  StudioState,
} from '../types/studio';

interface ModelOfflineViewProps {
  isAdmin?: boolean;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  studioState: StudioState | null;
  modelOnline: boolean;
  myInterestMessages: InterestMessage[];
  onSendInterestMessage: (input: {
    preferredTime: string;
    message: string;
  }) => Promise<string | null>;
  onUpdateStudioState?: (
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

const PREFERRED_WINDOWS = [
  'Hoje mais tarde',
  'Amanhã à noite',
  'Fim de semana',
  'Qualquer horário',
] as const;

const TIMEZONE_OPTIONS = [
  { value: 'America/Sao_Paulo', label: 'Brasília (BRT)' },
  { value: 'America/Manaus', label: 'Manaus (AMT)' },
  { value: 'Europe/Lisbon', label: 'Lisboa (WET)' },
  { value: 'America/New_York', label: 'Nova York (EST)' },
] as const;

const SCHEDULE_PRESETS = [
  { label: 'Tarde (14:00–20:00)', start: '14:00', end: '20:00' },
  { label: 'Noite (19:00–02:00)', start: '19:00', end: '02:00' },
  { label: 'Madrugada (22:00–04:00)', start: '22:00', end: '04:00' },
] as const;

const INTEREST_STATUS_LABEL: Record<InterestMessageStatus, string> = {
  unread: 'Aguardando retorno',
  reviewed: 'Lida por Lorena Noir',
  contacted: 'Retorno encaminhado',
};

function formatMessageDate(msg: InterestMessage) {
  const date = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export const ModelOfflineView: React.FC<ModelOfflineViewProps> = ({
  isAdmin = false,
  myProfile,
  modelProfile,
  studioState,
  modelOnline,
  myInterestMessages,
  onSendInterestMessage,
  onUpdateStudioState,
}) => {
  const [preferredTime, setPreferredTime] = useState<string>(
    PREFERRED_WINDOWS[0]
  );
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [loungeFailed, setLoungeFailed] = useState(false);

  // Operating schedule draft state (for admin/model)
  const initialSchedule = useMemo(
    () => getScheduleFromState(studioState),
    [studioState]
  );
  const [autoEnabled, setAutoEnabled] = useState<boolean>(
    initialSchedule.autoScheduleEnabled
  );
  const [startTime, setStartTime] = useState<string>(
    initialSchedule.scheduleStartTime
  );
  const [endTime, setEndTime] = useState<string>(
    initialSchedule.scheduleEndTime
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(() =>
    parseScheduleDays(initialSchedule.scheduleDays)
  );
  const [timezone, setTimezone] = useState<string>(
    initialSchedule.scheduleTimezone
  );
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);

  useEffect(() => {
    setAutoEnabled(initialSchedule.autoScheduleEnabled);
    setStartTime(initialSchedule.scheduleStartTime);
    setEndTime(initialSchedule.scheduleEndTime);
    setSelectedDays(parseScheduleDays(initialSchedule.scheduleDays));
    setTimezone(initialSchedule.scheduleTimezone);
  }, [initialSchedule]);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const nowDate = useMemo(() => new Date(nowMs), [nowMs]);
  const dndActive = isDndActiveNow(studioState, nowDate);
  const nextAvailable = useMemo(
    () => getNextAvailableTarget(studioState, nowDate),
    [studioState, nowDate]
  );

  useEffect(() => {
    const intervalMs = nextAvailable.nextAvailableMs ? 1000 : 15000;
    const timerId = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => window.clearInterval(timerId);
  }, [nextAvailable.nextAvailableMs]);

  const remainingMs =
    nextAvailable.nextAvailableMs !== null
      ? Math.max(0, nextAvailable.nextAvailableMs - nowMs)
      : 0;

  const isBlocked = myProfile?.accessStatus === 'blocked';
  const displayModelName =
    studioState?.modelName || modelProfile?.displayName || 'Lorena Noir';

  const isExplicitRest =
    studioState !== null &&
    (!studioState.isLive || studioState.callMode === 'paused');

  const statusReason = dndActive
    ? 'Modo Não Perturbe'
    : isExplicitRest
      ? 'Em Descanso'
      : !modelOnline
        ? 'Offline no momento'
        : 'Sala Pausada';

  const draftScheduleDays = useMemo(
    () =>
      sanitizeDaysString(
        selectedDays.slice().sort((a, b) => a - b).join(','),
        ''
      ),
    [selectedDays]
  );

  const previewIsWithinWindow = useMemo(() => {
    const mockState: StudioState = {
      modelUid: studioState?.modelUid || 'preview',
      modelName: displayModelName,
      isLive: studioState?.isLive ?? true,
      callMode: studioState?.callMode ?? 'open',
      headline: studioState?.headline ?? '',
      updatedAt: studioState?.updatedAt as StudioState['updatedAt'],
      autoScheduleEnabled: autoEnabled,
      scheduleStartTime: sanitizeTimeHHMM(startTime, '14:00'),
      scheduleEndTime: sanitizeTimeHHMM(endTime, '23:00'),
      scheduleDays: draftScheduleDays,
      scheduleTimezone: timezone,
    };
    return isWithinOperatingHours(mockState, new Date());
  }, [
    autoEnabled,
    displayModelName,
    draftScheduleDays,
    endTime,
    startTime,
    studioState,
    timezone,
  ]);

  const toggleDay = (dayId: number) => {
    setScheduleSaved(false);
    setSelectedDays((prev) =>
      prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId].sort((a, b) => a - b)
    );
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !onUpdateStudioState || savingSchedule) return;

    const cleanStart = sanitizeTimeHHMM(startTime, '14:00');
    const cleanEnd = sanitizeTimeHHMM(endTime, '23:00');
    const cleanDays = sanitizeDaysString(draftScheduleDays, '');
    const cleanTz = timezone.trim().slice(0, 60) || 'America/Sao_Paulo';

    setSavingSchedule(true);
    setScheduleSaved(false);
    try {
      const patch: Partial<{
        isLive: boolean;
        callMode: StudioCallMode;
        autoScheduleEnabled: boolean;
        scheduleStartTime: string;
        scheduleEndTime: string;
        scheduleDays: string;
        scheduleTimezone: string;
      }> = {
        autoScheduleEnabled: autoEnabled,
        scheduleStartTime: cleanStart,
        scheduleEndTime: cleanEnd,
        scheduleDays: cleanDays,
        scheduleTimezone: cleanTz,
      };

      if (autoEnabled) {
        const shouldBeLive = previewIsWithinWindow;
        patch.isLive = shouldBeLive;
        patch.callMode = shouldBeLive ? 'open' : 'paused';
      }

      await onUpdateStudioState(patch);
      setScheduleSaved(true);
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSubmitInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || isBlocked || !message.trim()) return;
    setSubmitting(true);
    setSubmittedNotice(false);
    try {
      const id = await onSendInterestMessage({
        preferredTime,
        message: message.trim(),
      });
      if (id) {
        setMessage('');
        setSubmittedNotice(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const publishedSchedule = getScheduleFromState(studioState);
  const publishedDaysLabel = formatOperatingDaysLabel(
    publishedSchedule.scheduleDays
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Column: Schedule Selector (Model) OR Interest Form (Visitor) */}
        <section className="lg:col-span-7 bg-[#13151A] border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {!avatarFailed ? (
                <img
                  src="/src/assets/images/model_avatar_camila_1794946401641.jpg"
                  alt={displayModelName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-16 h-16 rounded-full object-cover border border-white/15 shrink-0 opacity-85"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#1B1E26] flex items-center justify-center font-display text-2xl text-[#C9A46B] shrink-0">
                  {displayModelName.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-[#E2C799] flex items-center gap-1.5">
                  {dndActive ? (
                    <BellOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {displayModelName} · {statusReason}
                  </span>
                </p>
                <h2 className="font-display text-3xl font-semibold text-[#F3EFE6] text-balance">
                  {isAdmin
                    ? 'Horários e Tela de Descanso'
                    : dndActive
                      ? 'Novas solicitações bloqueadas temporariamente'
                      : 'Atendimento em pausa temporária'}
                </h2>
              </div>
            </div>

            <p className="text-sm text-[#C8CCD4] leading-relaxed">
              {isAdmin
                ? 'Configure os dias e horários de funcionamento para alternar automaticamente entre Online e Modo Descanso na recepção dos internautas.'
                : dndActive
                  ? `${displayModelName} ativou o modo Não Perturbe agendado. Novas solicitações de chamada estão bloqueadas automaticamente até o próximo horário permitido, mas você pode deixar sua mensagem de interesse.`
                  : `${
                      studioState?.headline ||
                      `${displayModelName} não está recebendo videochamadas ao vivo neste instante.`
                    } Deixe sua mensagem de interesse abaixo para que ela priorize seu atendimento assim que retornar ao estúdio.`}
            </p>

            {/* Real-time Countdown Banner when next availability is known */}
            {!isAdmin && nextAvailable.nextAvailableMs && (
              <div className="p-4 rounded-lg bg-[#0B0C0F] border border-[#C9A46B]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-[#E2C799]">
                    Próximo horário de disponibilidade permitido
                  </p>
                  <p className="text-xs text-[#9BA1AE]">
                    Previsão de abertura: {nextAvailable.formattedReturnTime}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[11px] text-[#9BA1AE]">Contagem regressiva</p>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-[#F3EFE6]">
                    {formatCountdownClock(remainingMs)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {isAdmin && onUpdateStudioState ? (
            <form
              onSubmit={handleSaveSchedule}
              className="space-y-5 pt-4 border-t border-white/10"
            >
              {/* Automatic Mode Switch */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold text-[#F3EFE6] flex items-center gap-1.5">
                    <CalendarClock className="w-4 h-4 text-[#C9A46B]" />
                    <span>Alternância Automática (Online / Offline)</span>
                  </span>
                  <p className="text-xs text-[#9BA1AE]">
                    {autoEnabled
                      ? previewIsWithinWindow
                        ? 'Dentro do horário definido · Estúdio abre automaticamente'
                        : 'Fora do horário definido · Tela de Descanso ativa'
                      : 'Controle manual ativo pelos botões do estúdio'}
                  </p>
                </div>

                <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setAutoEnabled(true);
                      setScheduleSaved(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      autoEnabled
                        ? 'bg-[#16A34A] text-white'
                        : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                    }`}
                  >
                    Automático
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAutoEnabled(false);
                      setScheduleSaved(false);
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      !autoEnabled
                        ? 'bg-[#C9A46B] text-[#0B0C0F]'
                        : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                    }`}
                  >
                    Manual
                  </button>
                </div>
              </div>

              {/* Weekday Selector */}
              <div className="space-y-2">
                <span className="block text-xs font-medium text-[#9BA1AE]">
                  Dias de atendimento
                </span>
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
                  {WEEKDAYS_PT.map((day) => {
                    const active = selectedDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleDay(day.id)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#C9A46B] text-[#0B0C0F]'
                            : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Range + Timezone Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="schedule-start"
                    className="block text-xs font-medium text-[#9BA1AE]"
                  >
                    Início (Online)
                  </label>
                  <input
                    id="schedule-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      setScheduleSaved(false);
                    }}
                    className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="schedule-end"
                    className="block text-xs font-medium text-[#9BA1AE]"
                  >
                    Término (Descanso)
                  </label>
                  <input
                    id="schedule-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      setScheduleSaved(false);
                    }}
                    className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3.5 py-2 text-sm font-mono tabular-nums text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="schedule-tz"
                    className="block text-xs font-medium text-[#9BA1AE]"
                  >
                    Fuso horário
                  </label>
                  <select
                    id="schedule-tz"
                    value={timezone}
                    onChange={(e) => {
                      setTimezone(e.target.value);
                      setScheduleSaved(false);
                    }}
                    className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#F3EFE6] focus:outline-none focus:border-[#C9A46B]"
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
              </div>

              {/* Quick Turn Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[#727988]">Turnos rápidos:</span>
                {SCHEDULE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setStartTime(preset.start);
                      setEndTime(preset.end);
                      setScheduleSaved(false);
                    }}
                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#161920] border border-white/10 text-[#C8CCD4] hover:text-[#F3EFE6] hover:border-white/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {scheduleSaved && (
                <div
                  role="status"
                  className="p-3.5 rounded-lg bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Horários de funcionamento salvos.{' '}
                    {autoEnabled
                      ? previewIsWithinWindow
                        ? 'O estúdio está aberto agora conforme sua agenda.'
                        : 'O estúdio entrou em Modo Descanso conforme sua agenda.'
                      : 'Ative o modo Automático quando quiser delegar a abertura e pausa ao relógio.'}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <p className="text-xs text-[#9BA1AE] font-mono tabular-nums">
                  {formatOperatingDaysLabel(draftScheduleDays)} · {startTime} às{' '}
                  {endTime}
                </p>
                <button
                  type="submit"
                  disabled={savingSchedule}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>
                    {savingSchedule
                      ? 'Salvando horários...'
                      : 'Salvar Horários de Funcionamento'}
                  </span>
                </button>
              </div>
            </form>
          ) : isBlocked ? (
            <div className="p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200">
              Seu acesso às mensagens e videochamadas do estúdio foi suspenso pela moderação.
            </div>
          ) : (
            <form
              onSubmit={handleSubmitInterest}
              className="space-y-5 pt-4 border-t border-white/10"
            >
              {/* Published Operating Hours Summary for Visitors */}
              <div className="p-4 rounded-lg bg-[#0B0C0F] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <CalendarClock className="w-4 h-4 text-[#C9A46B] shrink-0" />
                  <div className="text-xs space-y-0.5">
                    <p className="font-medium text-[#F3EFE6]">
                      Horário de Funcionamento
                    </p>
                    <p className="text-[#9BA1AE] font-mono tabular-nums">
                      {publishedDaysLabel} · {publishedSchedule.scheduleStartTime}{' '}
                      às {publishedSchedule.scheduleEndTime}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-[#E2C799] whitespace-nowrap shrink-0">
                  {publishedSchedule.autoScheduleEnabled
                    ? 'Abertura automática programada'
                    : 'Retorno em breve'}
                </span>
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-[#9BA1AE]">
                  Melhor período para quando {displayModelName} voltar
                </span>
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
                  {PREFERRED_WINDOWS.map((windowOption) => (
                    <button
                      key={windowOption}
                      type="button"
                      onClick={() => setPreferredTime(windowOption)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        preferredTime === windowOption
                          ? 'bg-[#C9A46B] text-[#0B0C0F]'
                          : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                      }`}
                    >
                      {windowOption}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <label
                    htmlFor="interest-message"
                    className="block text-xs font-medium text-[#9BA1AE]"
                  >
                    Deixe uma mensagem de interesse para {displayModelName}
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-[#727988]">
                    {message.length}/500
                  </span>
                </div>
                <textarea
                  id="interest-message"
                  rows={4}
                  maxLength={500}
                  required
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (submittedNotice) setSubmittedNotice(false);
                  }}
                  placeholder={`Conte o que você gostaria de conversar na próxima videochamada com ${displayModelName}...`}
                  className="w-full bg-[#0B0C0F] border border-white/10 rounded-lg px-4 py-3 text-sm text-[#F3EFE6] placeholder:text-[#686E7C] focus:outline-none focus:border-[#C9A46B] resize-y"
                />
              </div>

              {submittedNotice && (
                <div
                  role="status"
                  className="p-3.5 rounded-lg bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Mensagem registrada. Assim que {displayModelName} voltar ao vivo, ela verá seu interesse na recepção.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-[#727988]">
                  A área de chamadas reabrirá automaticamente quando a modelo retornar.
                </p>
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {submitting ? 'Enviando...' : 'Enviar Mensagem de Interesse'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Right Column: Editorial Lounge Standby Visual */}
        <aside className="lg:col-span-5 relative rounded-xl overflow-hidden bg-[#13151A] border border-white/10 min-h-[340px]">
          {!loungeFailed ? (
            <img
              src="/src/assets/images/studio_backdrop_lounge_1794946401840.jpg"
              alt="Salão em pausa Maison Aura"
              referrerPolicy="no-referrer"
              onError={() => setLoungeFailed(true)}
              className="w-full h-full object-cover lg:absolute lg:inset-0 opacity-60"
            />
          ) : (
            <div className="w-full h-full bg-[#161920]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F] via-[#0B0C0F]/55 to-[#0B0C0F]/25 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 space-y-2">
            <p className="text-xs font-medium text-[#E2C799] font-mono tabular-nums">
              {publishedDaysLabel} · {publishedSchedule.scheduleStartTime} –{' '}
              {publishedSchedule.scheduleEndTime}
            </p>
            <p className="font-display text-2xl font-semibold text-[#F3EFE6]">
              Estúdio em Descanso
            </p>
            <p className="text-xs text-[#C8CCD4] leading-relaxed">
              Mensagens deixadas durante o período offline ficam destacadas no painel privado de {displayModelName} para retorno prioritário.
            </p>
          </div>
        </aside>
      </div>

      {/* Visitor's Own Submitted Interest Messages */}
      {!isAdmin && myInterestMessages.length > 0 && (
        <section className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#C9A46B]" />
              <h3 className="text-sm font-semibold text-[#F3EFE6]">
                Suas Mensagens de Interesse Enviadas
              </h3>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#9BA1AE]">
              {myInterestMessages.length} enviada
              {myInterestMessages.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="divide-y divide-white/5">
            {myInterestMessages.map((item) => (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-[#F3EFE6] break-words">
                    {item.message}
                  </p>
                  <p className="text-xs text-[#9BA1AE] tabular-nums">
                    Preferência: {item.preferredTime} · {formatMessageDate(item)}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                    item.status === 'contacted'
                      ? 'text-[#86EFAC]'
                      : item.status === 'reviewed'
                        ? 'text-[#E2C799]'
                        : 'text-[#9BA1AE]'
                  }`}
                >
                  {INTEREST_STATUS_LABEL[item.status]}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Visitor Model Photo Showcase */}
      {!isAdmin && (
        <GaleriaModelo
          modelName={displayModelName}
          ctaDisabled={isBlocked}
          ctaLabel="Deixar Mensagem de Interesse"
          onPrimaryAction={() => {
            const textarea = document.getElementById('interest-message');
            if (textarea) {
              textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
              textarea.focus();
            }
          }}
        />
      )}
    </div>
  );
};
