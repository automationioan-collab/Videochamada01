import type { StudioState } from '../types/studio';

export interface OperatingSchedule {
  autoScheduleEnabled: boolean;
  scheduleStartTime: string;
  scheduleEndTime: string;
  scheduleDays: string;
  scheduleTimezone: string;
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

export const DEFAULT_SCHEDULE: OperatingSchedule = {
  autoScheduleEnabled: false,
  scheduleStartTime: '14:00',
  scheduleEndTime: '23:00',
  scheduleDays: '1,2,3,4,5,6',
  scheduleTimezone: 'America/Sao_Paulo',
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

export function getScheduleFromState(state: StudioState | null): OperatingSchedule {
  return {
    autoScheduleEnabled: Boolean(state?.autoScheduleEnabled),
    scheduleStartTime: sanitizeTimeHHMM(
      state?.scheduleStartTime,
      DEFAULT_SCHEDULE.scheduleStartTime
    ),
    scheduleEndTime: sanitizeTimeHHMM(
      state?.scheduleEndTime,
      DEFAULT_SCHEDULE.scheduleEndTime
    ),
    scheduleDays: sanitizeDaysString(
      state?.scheduleDays,
      DEFAULT_SCHEDULE.scheduleDays
    ),
    scheduleTimezone:
      state?.scheduleTimezone?.trim().slice(0, 60) ||
      DEFAULT_SCHEDULE.scheduleTimezone,
  };
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

export function isWithinOperatingHours(
  state: StudioState | null,
  now: Date = new Date()
): boolean {
  const schedule = getScheduleFromState(state);
  const days = parseScheduleDays(schedule.scheduleDays);
  if (days.length === 0) return false;

  const startMin = parseMinutes(schedule.scheduleStartTime);
  const endMin = parseMinutes(schedule.scheduleEndTime);
  const { weekday, minutes } = getTimeInTimezone(now, schedule.scheduleTimezone);
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
  reason: 'dnd_timed' | 'dnd_daily' | 'outside_hours' | null;
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
  const outsideHours =
    schedule.autoScheduleEnabled && !isWithinOperatingHours(state, now);

  if (!timedActive && !dailyDndActive && !outsideHours) {
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
    const maxMinutes = 7 * 1440;
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
  return days
    .map((d) => WEEKDAYS_PT.find((w) => w.id === d)?.short ?? '')
    .filter(Boolean)
    .join(', ');
}
