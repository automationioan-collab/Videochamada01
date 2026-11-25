import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, CalendarClock, CheckCircle2, Clock, Moon, Send } from 'lucide-react';
import { GaleriaModelo } from './GaleriaModelo';
import { OperatingSchedulePanel } from './OperatingSchedulePanel';
import {
  formatCountdownClock,
  getActiveDailyPause,
  getHolidayForDate,
  getNextAvailableTarget,
  getOperatingPeriodSummaryLines,
  getScheduleFromState,
  isDndActiveNow,
  isWeekdayBlockedNow,
} from '../lib/schedule';
import type {
  InterestMessage,
  InterestMessageStatus,
  StudioProfile,
  StudioState,
  StudioStateUpdatePatch,
} from '../types/studio';

interface ModelOfflineViewProps {
  isAdmin?: boolean;
  myProfile: StudioProfile | null;
  modelProfile: StudioProfile | null;
  modelAvatarUrl?: string;
  loungeImageUrl?: string;
  studioState: StudioState | null;
  modelOnline: boolean;
  myInterestMessages: InterestMessage[];
  onSendInterestMessage: (input: {
    preferredTime: string;
    message: string;
  }) => Promise<string | null>;
  onUpdateStudioState?: (patch: StudioStateUpdatePatch) => Promise<void>;
}

const PREFERRED_WINDOWS = [
  'Hoje mais tarde',
  'Amanhã à noite',
  'Fim de semana',
  'Qualquer horário',
] as const;

function getInterestStatusLabel(
  status: InterestMessageStatus,
  modelName: string
): string {
  if (status === 'contacted') return 'Retorno encaminhado';
  if (status === 'reviewed') return `Lida por ${modelName}`;
  return 'Aguardando retorno';
}

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
  modelAvatarUrl,
  loungeImageUrl,
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
  const holidayToday = useMemo(
    () => getHolidayForDate(studioState, nowDate),
    [studioState, nowDate]
  );
  const weekdayBlockedToday = useMemo(
    () => isWeekdayBlockedNow(studioState, nowDate),
    [studioState, nowDate]
  );
  const activeDailyPause = useMemo(
    () => getActiveDailyPause(studioState, nowDate),
    [studioState, nowDate]
  );

  const statusReason = activeDailyPause
    ? activeDailyPause.label
      ? `Pausa Diária · ${activeDailyPause.label}`
      : `Pausa Diária até ${activeDailyPause.endTime}`
    : dndActive
      ? 'Modo Não Perturbe'
      : holidayToday
        ? holidayToday.label
          ? `Feriado · ${holidayToday.label}`
          : 'Feriado / Data de Descanso'
        : weekdayBlockedToday
          ? 'Folga Semanal Programada'
          : isExplicitRest
            ? 'Em Descanso'
            : !modelOnline
              ? 'Offline no momento'
              : 'Sala Pausada';

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
  const publishedPeriodLines = useMemo(
    () => getOperatingPeriodSummaryLines(studioState),
    [studioState]
  );

  if (isAdmin && onUpdateStudioState) {
    return (
      <OperatingSchedulePanel
        studioState={studioState}
        onUpdateStudioState={onUpdateStudioState}
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left Column: Interest Form & Published Multi-Period Schedule */}
        <section className="lg:col-span-7 luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              {!avatarFailed ? (
                <img
                  src={
                    modelAvatarUrl ||
                    modelProfile?.photoUrl ||
                    '/src/assets/images/model_avatar_camila_1794946401641.jpg'
                  }
                  alt={displayModelName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-16 h-16 rounded-full object-cover border border-[#F4C2D7]/30 shrink-0 opacity-90"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-[#21142D] flex items-center justify-center font-display text-2xl text-[#F4C2D7] shrink-0">
                  {displayModelName.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div className="space-y-1 min-w-0">
                <p className="text-xs font-medium text-[#F4C2D7] flex items-center gap-1.5">
                  {dndActive ? (
                    <BellOff className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Moon className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {displayModelName} · {statusReason}
                  </span>
                </p>
                <h2 className="font-display text-3xl font-semibold text-[#FAF4F7] text-balance">
                  {activeDailyPause
                    ? `Em pausa diária programada até ${activeDailyPause.endTime}`
                    : dndActive
                      ? 'Novas solicitações bloqueadas temporariamente'
                      : holidayToday
                        ? 'Estúdio em descanso por data programada'
                        : weekdayBlockedToday
                          ? 'Dia reservado para descanso semanal'
                          : 'Atendimento em pausa temporária'}
                </h2>
              </div>
            </div>

            <p className="text-sm text-[#C9BAC4] leading-relaxed">
              {activeDailyPause
                ? `${displayModelName} está em pausa diária${
                    activeDailyPause.label ? ` (${activeDailyPause.label})` : ''
                  } das ${activeDailyPause.startTime} às ${activeDailyPause.endTime}. Deixe sua mensagem abaixo para atendimento prioritário no retorno.`
                : dndActive
                  ? `${displayModelName} ativou o modo Não Perturbe agendado. Novas solicitações de chamada estão bloqueadas automaticamente até o próximo horário permitido, mas você pode deixar sua mensagem de interesse.`
                  : holidayToday
                    ? `${displayModelName} reservou a data de hoje${
                        holidayToday.label ? ` (${holidayToday.label})` : ''
                      } para descanso programado. Deixe sua mensagem de interesse abaixo para atendimento prioritário no retorno.`
                    : weekdayBlockedToday
                      ? `${displayModelName} não atende neste dia da semana conforme sua agenda recorrente. Deixe sua mensagem de interesse abaixo para ser chamado no próximo dia útil.`
                      : `${
                          studioState?.headline ||
                          `${displayModelName} não está recebendo videochamadas ao vivo neste instante.`
                        } Deixe sua mensagem de interesse abaixo para que ela priorize seu atendimento assim que retornar ao estúdio.`}
            </p>

            {/* Real-time Countdown Banner when next availability is known */}
            {!isAdmin && nextAvailable.nextAvailableMs && (
              <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-[#F4C2D7]">
                    Próximo horário de disponibilidade permitido
                  </p>
                  <p className="text-xs text-[#C9BAC4]">
                    Previsão de abertura: {nextAvailable.formattedReturnTime}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[11px] text-[#C9BAC4]">Contagem regressiva</p>
                  <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
                    {formatCountdownClock(remainingMs)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {isBlocked ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200">
              Seu acesso às mensagens e videochamadas do estúdio foi suspenso pela moderação.
            </div>
          ) : (
            <form
              onSubmit={handleSubmitInterest}
              className="space-y-5 pt-4 border-t border-[#F4C2D7]/15"
            >
              {/* Published Operating Hours Summary for Visitors */}
              <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/15 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-[#F4C2D7] shrink-0" />
                    <p className="text-xs font-medium text-[#FAF4F7]">
                      Horários de Funcionamento
                    </p>
                  </div>
                  <span className="text-[11px] text-[#F4C2D7] whitespace-nowrap shrink-0">
                    {publishedSchedule.autoScheduleEnabled
                      ? 'Abertura automática programada'
                      : 'Retorno em breve'}
                  </span>
                </div>

                {publishedPeriodLines.length > 0 ? (
                  <div className="space-y-1.5">
                    {publishedPeriodLines.map((line) => (
                      <div
                        key={line.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#C9BAC4]"
                      >
                        <span>
                          <strong className="text-[#FAF4F7] font-medium">
                            {line.label}:
                          </strong>{' '}
                          {line.daysLabel}
                        </span>
                        <span className="font-mono tabular-nums text-[#F4C2D7]">
                          {line.startTime} às {line.endTime}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#C9BAC4]">
                    Atendimento sob agenda especial. Deixe sua mensagem abaixo.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <span className="block text-xs font-medium text-[#C9BAC4]">
                  Melhor período para quando {displayModelName} voltar
                </span>
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#0B060F] border border-[#F4C2D7]/15 rounded-full">
                  {PREFERRED_WINDOWS.map((windowOption) => (
                    <button
                      key={windowOption}
                      type="button"
                      onClick={() => setPreferredTime(windowOption)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        preferredTime === windowOption
                          ? 'luxury-rose-cta font-semibold'
                          : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
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
                    className="block text-xs font-medium text-[#C9BAC4]"
                  >
                    Deixe uma mensagem de interesse para {displayModelName}
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-[#938291]">
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
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-4 py-3 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7] resize-y"
                />
              </div>

              {submittedNotice && (
                <div
                  role="status"
                  className="p-3.5 rounded-xl bg-[#16A34A]/15 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2.5"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Mensagem registrada. Assim que {displayModelName} voltar ao vivo, ela verá seu interesse na recepção.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs text-[#938291]">
                  A área de chamadas reabrirá automaticamente quando a modelo retornar.
                </p>
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
        <aside className="lg:col-span-5 relative rounded-2xl overflow-hidden bg-[#150D1D] border border-[#F4C2D7]/20 min-h-[340px]">
          {!loungeFailed ? (
            <img
              src={
                loungeImageUrl ||
                '/src/assets/images/studio_backdrop_lounge_1794946401840.jpg'
              }
              alt="Salão em pausa"
              referrerPolicy="no-referrer"
              onError={() => setLoungeFailed(true)}
              className="w-full h-full object-cover lg:absolute lg:inset-0 opacity-65"
            />
          ) : (
            <div className="w-full h-full bg-[#1A1024]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F] via-[#0B060F]/55 to-[#0B060F]/25 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 space-y-2">
            <div className="space-y-0.5">
              {publishedPeriodLines.slice(0, 3).map((line) => (
                <p
                  key={line.id}
                  className="text-xs font-medium text-[#F4C2D7] font-mono tabular-nums"
                >
                  {line.daysLabel} · {line.startTime} – {line.endTime}
                </p>
              ))}
            </div>
            <p className="font-display text-2xl font-semibold text-[#FAF4F7]">
              Estúdio em Descanso
            </p>
            <p className="text-xs text-[#C9BAC4] leading-relaxed">
              Mensagens deixadas durante o período offline ficam destacadas no painel privado de {displayModelName} para retorno prioritário.
            </p>
          </div>
        </aside>
      </div>

      {/* Visitor's Own Submitted Interest Messages */}
      {!isAdmin && myInterestMessages.length > 0 && (
        <section className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F4C2D7]/15 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#F4C2D7]" />
              <h3 className="text-sm font-semibold text-[#FAF4F7]">
                Suas Mensagens de Interesse Enviadas
              </h3>
            </div>
            <span className="text-xs font-mono tabular-nums text-[#C9BAC4]">
              {myInterestMessages.length} enviada
              {myInterestMessages.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="divide-y divide-[#F4C2D7]/10">
            {myInterestMessages.map((item) => (
              <div
                key={item.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-[#FAF4F7] break-words">
                    {item.message}
                  </p>
                  <p className="text-xs text-[#C9BAC4] tabular-nums">
                    Preferência: {item.preferredTime} · {formatMessageDate(item)}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium whitespace-nowrap shrink-0 ${
                    item.status === 'contacted'
                      ? 'text-[#86EFAC]'
                      : item.status === 'reviewed'
                        ? 'text-[#F4C2D7]'
                        : 'text-[#C9BAC4]'
                  }`}
                >
                  {getInterestStatusLabel(item.status, displayModelName)}
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
