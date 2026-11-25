import React from 'react';
import { Calendar, Clock, Coffee, ShieldAlert } from 'lucide-react';
import {
  WEEKDAYS_PT,
  formatHolidayDateBR,
  formatHolidayWeekdayBR,
  formatOperatingDaysLabel,
  getActiveDailyPause,
  getDailyPausePeriodsFromState,
  getHolidayDatesFromState,
  getHolidayForDate,
  getNextAvailableTarget,
  getOperatingPeriodSummaryLines,
  getWeeklyBlockedDaysFromState,
  isDndActiveNow,
  isHolidayDateNow,
  isWeekdayBlockedNow,
  isWithinOperatingHours,
} from '../lib/schedule';
import type { StudioState } from '../types/studio';

interface PublicModelScheduleCardProps {
  modelName: string;
  studioState: StudioState | null;
  modelOnline?: boolean;
}

export const PublicModelScheduleCard: React.FC<PublicModelScheduleCardProps> = ({
  modelName,
  studioState,
  modelOnline = false,
}) => {
  const now = new Date();
  const periods = getOperatingPeriodSummaryLines(studioState);
  const dailyPauses = getDailyPausePeriodsFromState(studioState).filter(
    (p) => p.enabled
  );
  const weeklyBlocked = getWeeklyBlockedDaysFromState(studioState);
  const holidays = getHolidayDatesFromState(studioState);
  const activeHoliday = getHolidayForDate(studioState, now);
  const activePause = getActiveDailyPause(studioState, now);
  const dndActive = isDndActiveNow(studioState, now);
  const holidayNow = isHolidayDateNow(studioState, now);
  const weekdayBlocked = isWeekdayBlockedNow(studioState, now);
  const autoScheduleEnabled = Boolean(studioState?.autoScheduleEnabled);
  const withinOperatingHours =
    !autoScheduleEnabled || isWithinOperatingHours(studioState, now);
  const nextAvailable = getNextAvailableTarget(studioState, now);

  let statusHeadline = 'Disponível conforme agenda do estúdio';
  let statusTone: 'sky' | 'amber' | 'rose' = 'sky';

  if (holidayNow) {
    statusTone = 'rose';
    statusHeadline = activeHoliday?.label
      ? `Feriado / Folga hoje (${activeHoliday.label})`
      : 'Em folga programada hoje';
  } else if (weekdayBlocked) {
    statusTone = 'rose';
    statusHeadline = 'Dia semanal reservado para descanso';
  } else if (activePause) {
    statusTone = 'amber';
    statusHeadline = `Em pausa programada (${activePause.startTime} às ${activePause.endTime})`;
  } else if (dndActive || studioState?.callMode === 'paused') {
    statusTone = 'amber';
    statusHeadline = 'Modo Não Perturbe / Pausa temporária ativa';
  } else if (autoScheduleEnabled && !withinOperatingHours) {
    statusTone = 'amber';
    statusHeadline = 'Fora do horário automático de atendimento';
  } else if (modelOnline) {
    statusTone = 'sky';
    statusHeadline = 'Online ao vivo no estúdio agora';
  } else if (studioState?.isLive) {
    statusTone = 'sky';
    statusHeadline = 'Sala aberta para solicitações';
  }

  const upcomingHolidays = holidays.slice(0, 6);

  return (
    <section
      aria-labelledby="agenda-modelo-publica-heading"
      className="luxury-glass-rim border border-[#818CF8]/25 rounded-2xl p-6 sm:p-8 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#818CF8]/15">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#38BDF8]">
            Horários &amp; Disponibilidade · {modelName}
          </p>
          <h2
            id="agenda-modelo-publica-heading"
            className="font-display text-2xl sm:text-3xl font-bold text-[#F8FAFC]"
          >
            Agenda de Atendimento
          </h2>
        </div>

        <div className="text-left sm:text-right space-y-0.5">
          <p
            className={`text-xs font-semibold ${
              statusTone === 'sky'
                ? 'text-[#38BDF8]'
                : statusTone === 'amber'
                  ? 'text-[#FDE68A]'
                  : 'text-[#FCA5A5]'
            }`}
          >
            {statusHeadline}
          </p>
          {nextAvailable.formattedReturnTime && (
            <p className="text-[11px] font-mono tabular-nums text-[#B6C2E2]">
              Próximo retorno previsto: {nextAvailable.formattedReturnTime}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Operating Shifts */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#F8FAFC]">
            <span className="w-7 h-7 rounded-lg neo-icon-badge inline-flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-[#38BDF8]" />
            </span>
            <span>Turnos de Atendimento</span>
          </div>

          {periods.length > 0 ? (
            <ul className="space-y-2.5 text-xs">
              {periods.map((period) => (
                <li
                  key={period.id}
                  className="pb-2.5 border-b border-[#818CF8]/10 last:border-b-0 last:pb-0 space-y-0.5"
                >
                  <p className="font-medium text-[#F8FAFC]">{period.label}</p>
                  <p className="text-[#B6C2E2] font-mono tabular-nums">
                    {period.startTime} às {period.endTime} · {period.daysLabel}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#94A3B8]">
              Atendimento sob demanda conforme disponibilidade ao vivo.
            </p>
          )}
        </div>

        {/* Daily Pauses & Weekly Rest */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#F8FAFC]">
            <span className="w-7 h-7 rounded-lg neo-icon-badge inline-flex items-center justify-center shrink-0">
              <Coffee className="w-3.5 h-3.5 text-[#A5B4FC]" />
            </span>
            <span>Pausas &amp; Folgas Semanais</span>
          </div>

          {dailyPauses.length > 0 ? (
            <ul className="space-y-2 text-xs">
              {dailyPauses.map((pause) => (
                <li
                  key={pause.id}
                  className="pb-2 border-b border-[#818CF8]/10 last:border-b-0 last:pb-0 space-y-0.5"
                >
                  <p className="font-medium text-[#F8FAFC]">
                    {pause.label || 'Pausa diária'}
                  </p>
                  <p className="text-[#B6C2E2] font-mono tabular-nums">
                    {pause.startTime} às {pause.endTime} ·{' '}
                    {formatOperatingDaysLabel(pause.days)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#94A3B8]">
              Nenhuma pausa fixa diária cadastrada.
            </p>
          )}

          {weeklyBlocked.length > 0 && (
            <div className="pt-2 border-t border-[#818CF8]/10 space-y-1">
              <p className="text-[11px] font-medium text-[#38BDF8]">
                Folgas semanais recorrentes
              </p>
              <p className="text-xs text-[#B6C2E2]">
                {weeklyBlocked
                  .map((day) => WEEKDAYS_PT.find((w) => w.id === day)?.label || '')
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          )}
        </div>

        {/* Registered Holidays / Special Dates */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#F8FAFC]">
            <span className="w-7 h-7 rounded-lg neo-icon-badge inline-flex items-center justify-center shrink-0">
              <Calendar className="w-3.5 h-3.5 text-[#C4B5FD]" />
            </span>
            <span>Feriados &amp; Datas Reservadas</span>
          </div>

          {upcomingHolidays.length > 0 ? (
            <ul className="space-y-2 text-xs">
              {upcomingHolidays.map((holiday) => (
                <li
                  key={holiday.date}
                  className="pb-2 border-b border-[#818CF8]/10 last:border-b-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <span className="text-[#F8FAFC] font-mono tabular-nums">
                    {formatHolidayDateBR(holiday.date)}
                  </span>
                  <span className="text-[#B6C2E2] truncate">
                    {holiday.label || formatHolidayWeekdayBR(holiday.date)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#94A3B8]">
              Sem bloqueios ou feriados específicos nos próximos dias.
            </p>
          )}

          {studioState?.pauseWarningEnabled && (
            <p className="text-[11px] text-[#B6C2E2] flex items-center gap-1.5 pt-1">
              <ShieldAlert className="w-3.5 h-3.5 text-[#38BDF8] shrink-0" />
              <span>
                Aviso automático exibido {studioState.pauseWarningMinutes || 5} min
                antes das pausas.
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
