import type {
  ScheduleHolidayDate,
  SchedulePeriod,
  StudioState,
} from '../types/studio';

export interface OperatingSchedule {
  autoScheduleEnabled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleDays: string;
  scheduleTimezone: string;
  schedulePeriods: SchedulePeriod[];
  holidayDates: ScheduleHolidayDate[];
}

export interface DndSchedule {
  dndActive: boolean;
  dndUntilMs: number;
  dndScheduleEnabled: boolean;
  dndStartTime: string;
  dndEndTime: string;
}

export const WEEKDAYS_PT: ReadonlyArray<{ id: number; short: string; label: string }> = [
  { id: 0, short: 'Dom', label: 'Domingo' },
  { id: 1, short: 'Seg', label: 'Segunda' },
  { id: 2, short: 'Ter', label: 'Terça' },
  { id: 3, short: 'Qua', label: 'Quarta' },
  { id: 4, short: 'Qui', label: 'Quinta' },
  { id: 5, short: 'Sex', label: 'Sexta' },
  { id: 6, short: 'Sáb', label: 'Sábado' },
];

export const DEFAULT_SCHEDULE_PERIODS: SchedulePeriod[] = [
  {
    id: 'periodo_principal',
    label: 'Turno Principal',
    startTime: '14:00',
    endTime: '23:00',
    days: '1,2,3,4,5,6',
    enabled: true,
  },
];

export const DEFAULT_SCHEDULE: OperatingSchedule = {
  autoScheduleEnabled: false,
  scheduleStartTime: '14:00',
  scheduleEndTime: '23:00',
  scheduleDays: '1,2,3,4,5,6',
  scheduleTimezone: 'America/Sao_Paulo',
  schedulePeriods: DEFAULT_SCHEDULE_PERIODS,
  holidayDates: [],
};

export const DEFAULT_DND: DndSchedule = {
  dndActive: false,
  dndUntilMs: 0,
  dndScheduleEnabled: false,
  dndStartTime: '00:00',
  dndEndTime: '09:00',
};

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DAYS_PATTERN = /^([0-6](,[0-6])*)?$/;
const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const PERIOD_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
export const MAX_SCHEDULE_PERIODS = 14;
export const MAX_HOLIDAY_DATES = 60;

export function sanitizeTimeHHMM(value: string | undefined, fallback: string): string {
  if (value && TIME_PATTERN.test(value)) return value;
  return fallback;
}

export function sanitizeDaysString(value: string | undefined, fallback: string): string {
  if (value !== undefined && DAYS_PATTERN.test(value)) {
    const unique = Array.from(
      new Set(
        value
          .split(',')
          .filter(Boolean)
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      )
    ).sort((a, b) => a - b);
    return unique.join(',');
  }
  return fallback;
}

export function parseScheduleDays(scheduleDays: string | undefined): number[] {
  const safe = sanitizeDaysString(scheduleDays, DEFAULT_SCHEDULE.scheduleDays);
  if (!safe) return [];
  return safe.split(',').map((s) => Number(s));
}

export function sanitizeSchedulePeriod(
  raw: Partial<SchedulePeriod> | undefined,
  index: number
): SchedulePeriod {
  const rawId = typeof raw?.id === 'string' ? raw.id.trim() : '';
  const safeId = PERIOD_ID_PATTERN.test(rawId) ? rawId : `periodo_${index + 1}`;
  const cleanLabel =
    typeof raw?.label === 'string' ? raw.label.trim().slice(0, 40) : '';
  const period: SchedulePeriod = {
    id: safeId,
    startTime: sanitizeTimeHHMM(raw?.startTime, DEFAULT_SCHEDULE.scheduleStartTime),
    endTime: sanitizeTimeHHMM(raw?.endTime, DEFAULT_SCHEDULE.scheduleEndTime),
    days: sanitizeDaysString(raw?.days, ''),
    enabled: raw?.enabled !== false,
  };
  if (cleanLabel) {
    period.label = cleanLabel;
  }
  return period;
}

export function sanitizeSchedulePeriods(
  periods: ReadonlyArray<Partial<SchedulePeriod>> | undefined
): SchedulePeriod[] {
  if (!Array.isArray(periods)) return [];
  const seenIds = new Set<string>();
  const sanitized: SchedulePeriod[] = [];
  for (let i = 0; i < periods.length && sanitized.length < MAX_SCHEDULE_PERIODS; i += 1) {
    const item = sanitizeSchedulePeriod(periods[i], i);
    let uniqueId = item.id;
    let suffix = 2;
    while (seenIds.has(uniqueId)) {
      uniqueId = `${item.id.slice(0, 56)}_${suffix}`;
      suffix += 1;
    }
    seenIds.add(uniqueId);
    sanitized.push({ ...item, id: uniqueId });
  }
  return sanitized;
}

export function getSchedulePeriodsFromState(
  state: StudioState | null
): SchedulePeriod[] {
  if (Array.isArray(state?.schedulePeriods)) {
    return sanitizeSchedulePeriods(state.schedulePeriods);
  }
  const hasLegacy =
    state?.scheduleStartTime !== undefined ||
    state?.scheduleEndTime !== undefined ||
    state?.scheduleDays !== undefined;
  if (!hasLegacy) {
    return DEFAULT_SCHEDULE_PERIODS.map((p) => ({ ...p }));
  }
  return [
    {
      id: 'periodo_principal',
      label: 'Turno Principal',
      startTime: sanitizeTimeHHMM(
        state?.scheduleStartTime,
        DEFAULT_SCHEDULE.scheduleStartTime
      ),
      endTime: sanitizeTimeHHMM(
        state?.scheduleEndTime,
        DEFAULT_SCHEDULE.scheduleEndTime
      ),
      days: sanitizeDaysString(state?.scheduleDays, DEFAULT_SCHEDULE.scheduleDays),
      enabled: true,
    },
  ];
}

export function sanitizeHolidayDate(
  raw: Partial<ScheduleHolidayDate> | undefined
): ScheduleHolidayDate | null {
  const dateStr = typeof raw?.date === 'string' ? raw.date.trim() : '';
  if (!DATE_PATTERN.test(dateStr)) return null;
  const cleanLabel =
    typeof raw?.label === 'string' ? raw.label.trim().slice(0, 40) : '';
  const item: ScheduleHolidayDate = { date: dateStr };
  if (cleanLabel) {
    item.label = cleanLabel;
  }
  return item;
}

export function sanitizeHolidayDates(
  holidays: ReadonlyArray<Partial<ScheduleHolidayDate>> | undefined
): ScheduleHolidayDate[] {
  if (!Array.isArray(holidays)) return [];
  const byDate = new Map<string, ScheduleHolidayDate>();
  for (let i = 0; i < holidays.length && byDate.size < MAX_HOLIDAY_DATES; i += 1) {
    const clean = sanitizeHolidayDate(holidays[i]);
    if (clean) {
      byDate.set(clean.date, clean);
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

export function getHolidayDatesFromState(
  state: StudioState | null
): ScheduleHolidayDate[] {
  return sanitizeHolidayDates(state?.holidayDates);
}

export function getScheduleFromState(state: StudioState | null): OperatingSchedule {
  const periods = getSchedulePeriodsFromState(state);
  const primary = periods.find((p) => p.enabled) ?? periods[0];
  return {
    autoScheduleEnabled: Boolean(state?.autoScheduleEnabled),
    scheduleStartTime: primary
      ? primary.startTime
      : sanitizeTimeHHMM(
          state?.scheduleStartTime,
          DEFAULT_SCHEDULE.scheduleStartTime
        ),
    scheduleEndTime: primary
      ? primary.endTime
      : sanitizeTimeHHMM(
          state?.scheduleEndTime,
          DEFAULT_SCHEDULE.scheduleEndTime
        ),
    scheduleDays: primary
      ? primary.days
      : sanitizeDaysString(state?.scheduleDays, DEFAULT_SCHEDULE.scheduleDays),
    scheduleTimezone:
      state?.scheduleTimezone?.trim().slice(0, 60) ||
      DEFAULT_SCHEDULE.scheduleTimezone,
    schedulePeriods: periods,
    holidayDates: getHolidayDatesFromState(state),
  };
}

export function serializeSchedulePeriodsDigest(state: StudioState | null): string {
  const schedule = getScheduleFromState(state);
  const periodsPart = schedule.schedulePeriods
    .map(
      (p) => `${p.id}:${p.enabled ? 1 : 0}:${p.days}:${p.startTime}-${p.endTime}`
    )
    .join('|');
  const holidaysPart = schedule.holidayDates
    .map((h) => `${h.date}:${h.label ?? ''}`)
    .join('|');
  return `${schedule.autoScheduleEnabled}_${schedule.scheduleTimezone}_${periodsPart}__${holidaysPart}`;
}

export function getDndFromState(state: StudioState | null): DndSchedule {
  return {
    dndActive: Boolean(state?.dndActive),
    dndUntilMs:
      typeof state?.dndUntilMs === 'number' && Number.isFinite(state.dndUntilMs)
        ? Math.max(0, Math.round(state.dndUntilMs))
        : 0,
    dndScheduleEnabled: Boolean(state?.dndScheduleEnabled),
    dndStartTime: sanitizeTimeHHMM(
      state?.dndStartTime,
      DEFAULT_DND.dndStartTime
    ),
    dndEndTime: sanitizeTimeHHMM(state?.dndEndTime, DEFAULT_DND.dndEndTime),
  };
}

function parseMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  return Number(hStr) * 60 + Number(mStr);
}

function getTimeInTimezone(
  now: Date,
  timeZone: string
): { weekday: number; minutes: number } {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const wdStr = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
    const hrStr = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minStr = parts.find((p) => p.type === 'minute')?.value ?? '00';
    const hr = Number(hrStr) % 24;
    const min = Number(minStr) % 60;
    return {
      weekday: weekdayMap[wdStr] ?? now.getDay(),
      minutes: hr * 60 + min,
    };
  } catch {
    return {
      weekday: now.getDay(),
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
}

export function isWithinDailyWindow(
  now: Date,
  startHHMM: string,
  endHHMM: string,
  timeZone: string
): boolean {
  const startMin = parseMinutes(startHHMM);
  const endMin = parseMinutes(endHHMM);
  if (startMin === endMin) return false;
  const { minutes } = getTimeInTimezone(now, timeZone);
  if (startMin < endMin) {
    return minutes >= startMin && minutes < endMin;
  }
  // Overnight window (e.g. 23:00 -> 08:00)
  return minutes >= startMin || minutes < endMin;
}

export function isWithinSchedulePeriod(
  period: Pick<SchedulePeriod, 'startTime' | 'endTime' | 'days' | 'enabled'>,
  weekday: number,
  minutes: number
): boolean {
  if (!period.enabled) return false;
  const days = parseScheduleDays(period.days);
  if (days.length === 0) return false;

  const startMin = parseMinutes(sanitizeTimeHHMM(period.startTime, '14:00'));
  const endMin = parseMinutes(sanitizeTimeHHMM(period.endTime, '23:00'));
  const yesterday = (weekday + 6) % 7;

  if (startMin === endMin) {
    return days.includes(weekday);
  }

  if (startMin < endMin) {
    return days.includes(weekday) && minutes >= startMin && minutes < endMin;
  }

  return (
    (days.includes(weekday) && minutes >= startMin) ||
    (days.includes(yesterday) && minutes < endMin)
  );
}

export function getDateKeyInTimezone(
  now: Date,
  timeZone: string = DEFAULT_SCHEDULE.scheduleTimezone
): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    const yyyy = now.getFullYear().toString().padStart(4, '0');
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}

export function formatHolidayDateBR(dateYYYYMMDD: string): string {
  if (!DATE_PATTERN.test(dateYYYYMMDD)) return dateYYYYMMDD;
  const [y, m, d] = dateYYYYMMDD.split('-');
  return `${d}/${m}/${y}`;
}

export function formatHolidayWeekdayBR(dateYYYYMMDD: string): string {
  if (!DATE_PATTERN.test(dateYYYYMMDD)) return '';
  const [y, m, d] = dateYYYYMMDD.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(dt);
}

export function getHolidayForDate(
  state: StudioState | null,
  now: Date = new Date()
): ScheduleHolidayDate | null {
  const schedule = getScheduleFromState(state);
  if (schedule.holidayDates.length === 0) return null;
  const key = getDateKeyInTimezone(now, schedule.scheduleTimezone);
  return schedule.holidayDates.find((h) => h.date === key) ?? null;
}

export function isHolidayDateNow(
  state: StudioState | null,
  now: Date = new Date()
): boolean {
  return getHolidayForDate(state, now) !== null;
}

export function isWithinOperatingHours(
  state: StudioState | null,
  now: Date = new Date()
): boolean {
  if (isHolidayDateNow(state, now)) return false;
  const schedule = getScheduleFromState(state);
  const enabledPeriods = schedule.schedulePeriods.filter((p) => p.enabled);
  if (enabledPeriods.length === 0) return false;

  const { weekday, minutes } = getTimeInTimezone(now, schedule.scheduleTimezone);
  return enabledPeriods.some((period) =>
    isWithinSchedulePeriod(period, weekday, minutes)
  );
}

export function isDndActiveNow(
  state: StudioState | null,
  now: Date = new Date()
): boolean {
  const dnd = getDndFromState(state);
  const schedule = getScheduleFromState(state);
  const nowMs = now.getTime();
  if (dnd.dndUntilMs > nowMs) return true;
  if (
    dnd.dndScheduleEnabled &&
    isWithinDailyWindow(
      now,
      dnd.dndStartTime,
      dnd.dndEndTime,
      schedule.scheduleTimezone
    )
  ) {
    return true;
  }
  return dnd.dndActive && dnd.dndUntilMs === 0 && !dnd.dndScheduleEnabled;
}

export interface NextAvailableTarget {
  nextAvailableMs: number | null;
  formattedReturnTime: string;
  reason: 'dnd_timed' | 'dnd_daily' | 'holiday' | 'outside_hours' | null;
}

export function getNextAvailableTarget(
  state: StudioState | null,
  now: Date = new Date()
): NextAvailableTarget {
  const dnd = getDndFromState(state);
  const schedule = getScheduleFromState(state);
  const nowMs = now.getTime();
  const timedActive = dnd.dndUntilMs > nowMs;
  const dailyDndActive =
    dnd.dndScheduleEnabled &&
    isWithinDailyWindow(
      now,
      dnd.dndStartTime,
      dnd.dndEndTime,
      schedule.scheduleTimezone
    );
  const holidayActive = isHolidayDateNow(state, now);
  const outsideHours =
    schedule.autoScheduleEnabled && !isWithinOperatingHours(state, now);

  if (!timedActive && !dailyDndActive && !holidayActive && !outsideHours) {
    return {
      nextAvailableMs: null,
      formattedReturnTime: '',
      reason: null,
    };
  }

  const reason: NextAvailableTarget['reason'] = timedActive
    ? 'dnd_timed'
    : dailyDndActive
      ? 'dnd_daily'
      : holidayActive
        ? 'holiday'
        : 'outside_hours';

  const isAllowedAt = (ms: number) => {
    const dt = new Date(ms);
    if (dnd.dndUntilMs > ms) return false;
    if (
      dnd.dndScheduleEnabled &&
      isWithinDailyWindow(
        dt,
        dnd.dndStartTime,
        dnd.dndEndTime,
        schedule.scheduleTimezone
      )
    ) {
      return false;
    }
    if (isHolidayDateNow(state, dt)) return false;
    if (schedule.autoScheduleEnabled && !isWithinOperatingHours(state, dt)) {
      return false;
    }
    return true;
  };

  let targetMs: number | null = null;
  const candidateStartMs = timedActive ? dnd.dndUntilMs : nowMs;

  if (candidateStartMs > nowMs && isAllowedAt(candidateStartMs)) {
    targetMs = candidateStartMs;
  } else {
    const firstMinuteMs = Math.ceil(candidateStartMs / 60000) * 60000;
    const maxMinutes = 14 * 1440;
    for (let m = 0; m <= maxMinutes; m += 1) {
      const probeMs = firstMinuteMs + m * 60000;
      if (isAllowedAt(probeMs)) {
        targetMs = probeMs;
        break;
      }
    }
  }

  if (!targetMs) {
    return {
      nextAvailableMs: null,
      formattedReturnTime: 'Sem horário definido',
      reason,
    };
  }

  const formattedReturnTime = formatReturnTimestamp(
    targetMs,
    nowMs,
    schedule.scheduleTimezone
  );

  return {
    nextAvailableMs: targetMs,
    formattedReturnTime,
    reason,
  };
}

function formatReturnTimestamp(
  targetMs: number,
  nowMs: number,
  timeZone: string
): string {
  try {
    const targetDate = new Date(targetMs);
    const nowDate = new Date(nowMs);
    const dayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const timeOnly = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
    }).format(targetDate);

    if (dayKey.format(targetDate) === dayKey.format(nowDate)) {
      return `Hoje às ${timeOnly}`;
    }

    const diffDays = (targetMs - nowMs) / 86400000;
    if (diffDays > 5) {
      const dateLabel = new Intl.DateTimeFormat('pt-BR', {
        timeZone,
        day: '2-digit',
        month: '2-digit',
      }).format(targetDate);
      return `${dateLabel} às ${timeOnly}`;
    }

    const weekdayLabel = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      weekday: 'short',
    }).format(targetDate);
    return `${weekdayLabel} às ${timeOnly}`;
  } catch {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(targetMs));
  }
}

export function formatCountdownClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hrs = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const clock = `${hrs.toString().padStart(2, '0')}:${mins
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

export function formatOperatingDaysLabel(scheduleDays: string | undefined): string {
  const days = parseScheduleDays(scheduleDays);
  if (days.length === 0) return 'Nenhum dia selecionado';
  if (days.length === 7) return 'Todos os dias';
  if (days.join(',') === '1,2,3,4,5') return 'Segunda a Sexta';
  if (days.join(',') === '1,2,3,4,5,6') return 'Segunda a Sábado';
  if (days.join(',') === '0,6') return 'Finais de semana';
  return days
    .map((d) => WEEKDAYS_PT.find((w) => w.id === d)?.short ?? '')
    .filter(Boolean)
    .join(', ');
}

export interface OperatingPeriodSummaryLine {
  id: string;
  label: string;
  daysLabel: string;
  startTime: string;
  endTime: string;
  isOvernight: boolean;
}

export function getOperatingPeriodSummaryLines(
  state: StudioState | null
): OperatingPeriodSummaryLine[] {
  const schedule = getScheduleFromState(state);
  return schedule.schedulePeriods
    .filter((p) => p.enabled && parseScheduleDays(p.days).length > 0)
    .map((p, index) => ({
      id: p.id,
      label: p.label || `Período ${index + 1}`,
      daysLabel: formatOperatingDaysLabel(p.days),
      startTime: p.startTime,
      endTime: p.endTime,
      isOvernight: parseMinutes(p.startTime) > parseMinutes(p.endTime),
    }));
}
