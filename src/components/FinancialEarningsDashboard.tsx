import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarDays, Download, TrendingUp } from 'lucide-react';
import type { CallHistoryRecord } from '../types/studio';

interface FinancialEarningsDashboardProps {
  callHistory: CallHistoryRecord[];
  themeAccentColor?: string;
  themeAccentSoftColor?: string;
}

type Granularity = 'daily' | 'monthly';
type DailyRange = '7d' | '30d' | '90d';
type MonthlyRange = '6m' | '12m' | 'all';
type SeriesMode = 'bars' | 'combined';

interface EarningsBucketPoint {
  key: string;
  label: string;
  fullLabel: string;
  revenueCents: number;
  revenueBrl: number;
  cumulativeRevenueBrl: number;
  refundedCents: number;
  refundedBrl: number;
  callsCount: number;
  refundedCount: number;
  durationSeconds: number;
  avgTicketCents: number;
  momDeltaPct: number | null;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const BRL_COMPACT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

function resolveRecordDate(rec: CallHistoryRecord): Date {
  const source = rec.endedAt ?? rec.createdAt;
  if (source && typeof source.toDate === 'function') {
    return source.toDate();
  }
  if (
    source &&
    typeof source === 'object' &&
    'seconds' in source &&
    typeof (source as { seconds?: unknown }).seconds === 'number'
  ) {
    return new Date((source as { seconds: number }).seconds * 1000);
  }
  return new Date();
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatDayShort(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(date);
}

function formatDayFull(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatMonthShort(date: Date): string {
  const raw = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: '2-digit',
  }).format(date);
  return raw.replace(/\./g, '').replace(' de ', '/');
}

function formatMonthFull(date: Date): string {
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatDurationReadable(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: EarningsBucketPoint;
  }>;
  granularity: Granularity;
  showCumulative: boolean;
  themeAccentColor?: string;
  themeAccentSoftColor?: string;
}

const EarningsTooltip: React.FC<CustomTooltipProps> = ({
  active,
  payload,
  granularity,
  showCumulative,
  themeAccentColor = '#F4C2D7',
  themeAccentSoftColor = '#F8D6E3',
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-[#0B060F] border border-[#F4C2D7]/30 rounded-xl p-3.5 text-xs space-y-2 min-w-[230px] shadow-xl">
      <p className="font-medium text-[#FAF4F7] border-b border-[#F4C2D7]/15 pb-1.5">
        {point.fullLabel}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">
            {granularity === 'daily' ? 'Ganhos do dia' : 'Ganhos do mês'}
          </span>
          <span
            className="font-mono tabular-nums font-semibold"
            style={{ color: themeAccentColor }}
          >
            {BRL_FORMATTER.format(point.revenueBrl)}
          </span>
        </div>

        {showCumulative && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[#C9BAC4]">Acumulado no período</span>
            <span
              className="font-mono tabular-nums"
              style={{ color: themeAccentSoftColor }}
            >
              {BRL_FORMATTER.format(point.cumulativeRevenueBrl)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Chamadas concluídas</span>
          <span className="font-mono tabular-nums text-[#FAF4F7]">
            {point.callsCount}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Ticket médio</span>
          <span className="font-mono tabular-nums text-[#86EFAC]">
            {point.callsCount > 0
              ? BRL_FORMATTER.format(point.avgTicketCents / 100)
              : '—'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Tempo atendido</span>
          <span className="font-mono tabular-nums text-[#C9BAC4]">
            {formatDurationReadable(point.durationSeconds)}
          </span>
        </div>

        {granularity === 'monthly' && point.momDeltaPct !== null && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#F4C2D7]/10">
            <span className="text-[#938291]">Variação vs mês anterior</span>
            <span
              className={`font-mono tabular-nums font-medium ${
                point.momDeltaPct >= 0 ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'
              }`}
            >
              {point.momDeltaPct >= 0 ? '+' : ''}
              {point.momDeltaPct.toFixed(1)}%
            </span>
          </div>
        )}

        {point.refundedCount > 0 && (
          <div className="flex items-center justify-between gap-4 text-[#FCA5A5]">
            <span>Reembolsos ({point.refundedCount})</span>
            <span className="font-mono tabular-nums">
              {BRL_FORMATTER.format(point.refundedBrl)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const FinancialEarningsDashboard: React.FC<
  FinancialEarningsDashboardProps
> = ({
  callHistory,
  themeAccentColor = '#F4C2D7',
  themeAccentSoftColor = '#F8D6E3',
}) => {
  const [granularity, setGranularity] = useState<Granularity>('daily');
  const [dailyRange, setDailyRange] = useState<DailyRange>('30d');
  const [monthlyRange, setMonthlyRange] = useState<MonthlyRange>('12m');
  const [seriesMode, setSeriesMode] = useState<SeriesMode>('combined');

  const normalizedHistory = useMemo(() => {
    return callHistory.map((rec) => ({
      rec,
      date: resolveRecordDate(rec),
    }));
  }, [callHistory]);

  // All-time & calendar month anchors computed directly from callHistory
  const globalSnapshot = useMemo(() => {
    const now = new Date();
    const currentMonthKey = toMonthKey(now);
    const todayKey = toDayKey(now);

    let allTimeCents = 0;
    let currentMonthCents = 0;
    let todayCents = 0;

    for (const { rec, date } of normalizedHistory) {
      if (rec.status !== 'completed') continue;
      allTimeCents += rec.amountCents;
      if (toMonthKey(date) === currentMonthKey) {
        currentMonthCents += rec.amountCents;
      }
      if (toDayKey(date) === todayKey) {
        todayCents += rec.amountCents;
      }
    }

    return {
      allTimeCents,
      currentMonthCents,
      todayCents,
      currentMonthLabel: formatMonthFull(now),
    };
  }, [normalizedHistory]);

  const { points, summary } = useMemo(() => {
    const now = new Date();

    if (granularity === 'daily') {
      const daysCount = dailyRange === '7d' ? 7 : dailyRange === '30d' ? 30 : 90;
      const todayStart = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const startDate = new Date(todayStart);
      startDate.setDate(startDate.getDate() - (daysCount - 1));

      const buckets = new Map<
        string,
        {
          revenueCents: number;
          refundedCents: number;
          callsCount: number;
          refundedCount: number;
          durationSeconds: number;
        }
      >();

      for (const { rec, date } of normalizedHistory) {
        const dayDate = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        );
        if (dayDate < startDate || dayDate > todayStart) continue;

        const key = toDayKey(dayDate);
        const cur = buckets.get(key) || {
          revenueCents: 0,
          refundedCents: 0,
          callsCount: 0,
          refundedCount: 0,
          durationSeconds: 0,
        };

        if (rec.status === 'completed') {
          cur.revenueCents += rec.amountCents;
          cur.callsCount += 1;
          cur.durationSeconds += rec.durationSeconds;
        } else {
          cur.refundedCents += rec.amountCents;
          cur.refundedCount += 1;
        }
        buckets.set(key, cur);
      }

      const built: EarningsBucketPoint[] = [];
      let runningCents = 0;
      let totalRevenueCents = 0;
      let totalRefundedCents = 0;
      let totalCalls = 0;
      let totalRefundedCalls = 0;
      let totalDurationSeconds = 0;
      let activePeriods = 0;
      let peakPoint: EarningsBucketPoint | null = null;

      const cursor = new Date(startDate);
      while (cursor <= todayStart) {
        const key = toDayKey(cursor);
        const data = buckets.get(key) || {
          revenueCents: 0,
          refundedCents: 0,
          callsCount: 0,
          refundedCount: 0,
          durationSeconds: 0,
        };
        runningCents += data.revenueCents;

        const point: EarningsBucketPoint = {
          key,
          label: formatDayShort(cursor),
          fullLabel: formatDayFull(cursor),
          revenueCents: data.revenueCents,
          revenueBrl: Number((data.revenueCents / 100).toFixed(2)),
          cumulativeRevenueBrl: Number((runningCents / 100).toFixed(2)),
          refundedCents: data.refundedCents,
          refundedBrl: Number((data.refundedCents / 100).toFixed(2)),
          callsCount: data.callsCount,
          refundedCount: data.refundedCount,
          durationSeconds: data.durationSeconds,
          avgTicketCents:
            data.callsCount > 0
              ? Math.round(data.revenueCents / data.callsCount)
              : 0,
          momDeltaPct: null,
        };

        built.push(point);
        totalRevenueCents += data.revenueCents;
        totalRefundedCents += data.refundedCents;
        totalCalls += data.callsCount;
        totalRefundedCalls += data.refundedCount;
        totalDurationSeconds += data.durationSeconds;

        if (data.revenueCents > 0) {
          activePeriods += 1;
          if (!peakPoint || data.revenueCents > peakPoint.revenueCents) {
            peakPoint = point;
          }
        }

        cursor.setDate(cursor.getDate() + 1);
      }

      return {
        points: built,
        summary: {
          totalRevenueCents,
          totalRefundedCents,
          totalCalls,
          totalRefundedCalls,
          totalDurationSeconds,
          activePeriods,
          bucketCount: built.length,
          averagePerBucketCents:
            built.length > 0 ? Math.round(totalRevenueCents / built.length) : 0,
          averageTicketCents:
            totalCalls > 0 ? Math.round(totalRevenueCents / totalCalls) : 0,
          peakPoint,
        },
      };
    }

    // Monthly granularity
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let startMonth: Date;

    if (monthlyRange === '6m') {
      startMonth = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - 5,
        1
      );
    } else if (monthlyRange === '12m') {
      startMonth = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - 11,
        1
      );
    } else if (normalizedHistory.length > 0) {
      const earliestMs = Math.min(
        ...normalizedHistory.map((item) => item.date.getTime())
      );
      const earliest = new Date(earliestMs);
      startMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      const minSix = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - 5,
        1
      );
      if (startMonth > minSix) {
        startMonth = minSix;
      }
    } else {
      startMonth = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth() - 5,
        1
      );
    }

    const monthBuckets = new Map<
      string,
      {
        revenueCents: number;
        refundedCents: number;
        callsCount: number;
        refundedCount: number;
        durationSeconds: number;
      }
    >();

    for (const { rec, date } of normalizedHistory) {
      const monthDate = new Date(date.getFullYear(), date.getMonth(), 1);
      if (monthDate < startMonth || monthDate > currentMonthStart) continue;

      const key = toMonthKey(monthDate);
      const cur = monthBuckets.get(key) || {
        revenueCents: 0,
        refundedCents: 0,
        callsCount: 0,
        refundedCount: 0,
        durationSeconds: 0,
      };

      if (rec.status === 'completed') {
        cur.revenueCents += rec.amountCents;
        cur.callsCount += 1;
        cur.durationSeconds += rec.durationSeconds;
      } else {
        cur.refundedCents += rec.amountCents;
        cur.refundedCount += 1;
      }
      monthBuckets.set(key, cur);
    }

    const built: EarningsBucketPoint[] = [];
    let runningCents = 0;
    let prevMonthRevenueCents: number | null = null;
    let totalRevenueCents = 0;
    let totalRefundedCents = 0;
    let totalCalls = 0;
    let totalRefundedCalls = 0;
    let totalDurationSeconds = 0;
    let activePeriods = 0;
    let peakPoint: EarningsBucketPoint | null = null;

    const cursor = new Date(startMonth);
    while (cursor <= currentMonthStart) {
      const key = toMonthKey(cursor);
      const data = monthBuckets.get(key) || {
        revenueCents: 0,
        refundedCents: 0,
        callsCount: 0,
        refundedCount: 0,
        durationSeconds: 0,
      };
      runningCents += data.revenueCents;

      const momDeltaPct =
        prevMonthRevenueCents !== null && prevMonthRevenueCents > 0
          ? ((data.revenueCents - prevMonthRevenueCents) /
              prevMonthRevenueCents) *
            100
          : null;
      prevMonthRevenueCents = data.revenueCents;

      const point: EarningsBucketPoint = {
        key,
        label: formatMonthShort(cursor),
        fullLabel: formatMonthFull(cursor),
        revenueCents: data.revenueCents,
        revenueBrl: Number((data.revenueCents / 100).toFixed(2)),
        cumulativeRevenueBrl: Number((runningCents / 100).toFixed(2)),
        refundedCents: data.refundedCents,
        refundedBrl: Number((data.refundedCents / 100).toFixed(2)),
        callsCount: data.callsCount,
        refundedCount: data.refundedCount,
        durationSeconds: data.durationSeconds,
        avgTicketCents:
          data.callsCount > 0
            ? Math.round(data.revenueCents / data.callsCount)
            : 0,
        momDeltaPct,
      };

      built.push(point);
      totalRevenueCents += data.revenueCents;
      totalRefundedCents += data.refundedCents;
      totalCalls += data.callsCount;
      totalRefundedCalls += data.refundedCount;
      totalDurationSeconds += data.durationSeconds;

      if (data.revenueCents > 0) {
        activePeriods += 1;
        if (!peakPoint || data.revenueCents > peakPoint.revenueCents) {
          peakPoint = point;
        }
      }

      cursor.setMonth(cursor.getMonth() + 1);
    }

    return {
      points: built,
      summary: {
        totalRevenueCents,
        totalRefundedCents,
        totalCalls,
        totalRefundedCalls,
        totalDurationSeconds,
        activePeriods,
        bucketCount: built.length,
        averagePerBucketCents:
          built.length > 0 ? Math.round(totalRevenueCents / built.length) : 0,
        averageTicketCents:
          totalCalls > 0 ? Math.round(totalRevenueCents / totalCalls) : 0,
        peakPoint,
      },
    };
  }, [dailyRange, granularity, monthlyRange, normalizedHistory]);

  const monthlyTableRows = useMemo(() => {
    if (granularity !== 'monthly') return [];
    return [...points].reverse();
  }, [granularity, points]);

  const handleExportCsv = () => {
    const header = [
      granularity === 'daily' ? 'Data' : 'Mês',
      'Período',
      'Chamadas Concluídas',
      'Reembolsos',
      'Duração',
      'Ticket Médio (BRL)',
      'Ganhos Líquidos (BRL)',
      'Acumulado (BRL)',
    ];

    const rows = points.map((pt) => [
      pt.key,
      pt.fullLabel,
      String(pt.callsCount),
      String(pt.refundedCount),
      formatDurationReadable(pt.durationSeconds),
      (pt.avgTicketCents / 100).toFixed(2),
      pt.revenueBrl.toFixed(2),
      pt.cumulativeRevenueBrl.toFixed(2),
    ]);

    const csvContent =
      '\uFEFF' +
      [header, ...rows]
        .map((cols) =>
          cols.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      granularity === 'daily'
        ? `ganhos-diarios-${dailyRange}.csv`
        : `ganhos-mensais-${monthlyRange}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const showCumulative = seriesMode === 'combined';

  return (
    <section
      aria-labelledby="financial-dashboard-heading"
      className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
    >
      {/* Top Toolbar & Controls */}
      <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>
              Dashboard Financeiro ·{' '}
              {granularity === 'daily' ? 'Ganhos Diários' : 'Ganhos Mensais'}
            </span>
          </div>
          <h2
            id="financial-dashboard-heading"
            className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
          >
            Histórico de Ganhos por Videochamadas
          </h2>
          <p className="text-xs text-[#C9BAC4]">
            Consolidado diretamente a partir de{' '}
            <span className="font-mono text-[#FAF4F7]">
              {callHistory.length}
            </span>{' '}
            {callHistory.length === 1
              ? 'registro no histórico'
              : 'registros no histórico'}{' '}
            · Hoje:{' '}
            <span className="font-mono tabular-nums text-[#86EFAC]">
              {BRL_FORMATTER.format(globalSnapshot.todayCents / 100)}
            </span>{' '}
            · Total acumulado:{' '}
            <span className="font-mono tabular-nums text-[#F4C2D7]">
              {BRL_FORMATTER.format(globalSnapshot.allTimeCents / 100)}
            </span>
          </p>
        </div>

        {/* Interactive Granularity & Range Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Granularity Switcher: Diário / Mensal */}
          <div
            role="group"
            aria-label="Agrupamento temporal"
            className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl"
          >
            {(
              [
                { id: 'daily', label: 'Diário' },
                { id: 'monthly', label: 'Mensal' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={granularity === opt.id}
                onClick={() => setGranularity(opt.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  granularity === opt.id
                    ? 'luxury-rose-cta font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Window Range Selector */}
          <div
            role="group"
            aria-label="Período exibido"
            className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl"
          >
            {granularity === 'daily'
              ? (
                  [
                    { id: '7d', label: '7 dias' },
                    { id: '30d', label: '30 dias' },
                    { id: '90d', label: '90 dias' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={dailyRange === opt.id}
                    onClick={() => setDailyRange(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      dailyRange === opt.id
                        ? 'bg-[#281837] text-[#FAF4F7]'
                        : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))
              : (
                  [
                    { id: '6m', label: '6 meses' },
                    { id: '12m', label: '12 meses' },
                    { id: 'all', label: 'Tudo' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={monthlyRange === opt.id}
                    onClick={() => setMonthlyRange(opt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      monthlyRange === opt.id
                        ? 'bg-[#281837] text-[#FAF4F7]'
                        : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
          </div>

          {/* Series Overlay Switcher */}
          <button
            type="button"
            aria-pressed={showCumulative}
            onClick={() =>
              setSeriesMode((prev) =>
                prev === 'combined' ? 'bars' : 'combined'
              )
            }
            className={`px-3.5 py-2 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showCumulative
                ? 'bg-[#21142D] border-[#F4C2D7]/35 text-[#F8D6E3]'
                : 'bg-[#0B060F] border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7]'
            }`}
          >
            {showCumulative ? 'Curva Acumulada: On' : 'Curva Acumulada: Off'}
          </button>

          {/* CSV Export */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={points.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
          >
            <Download className="w-3.5 h-3.5 text-[#F4C2D7]" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* 4-Column Tabular KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#F4C2D7]/15 border-b border-[#F4C2D7]/15">
        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Ganhos no Período</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#F4C2D7]">
            {BRL_FORMATTER.format(summary.totalRevenueCents / 100)}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4] truncate">
            {globalSnapshot.currentMonthLabel}:{' '}
            {BRL_FORMATTER.format(globalSnapshot.currentMonthCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">
            {granularity === 'daily' ? 'Média por Dia' : 'Média por Mês'}
          </p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
            {BRL_FORMATTER.format(summary.averagePerBucketCents / 100)}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
            {summary.activePeriods}/{summary.bucketCount}{' '}
            {granularity === 'daily' ? 'dias ativos' : 'meses ativos'}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">
            {granularity === 'daily' ? 'Dia de Pico' : 'Melhor Mês'}
          </p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#86EFAC]">
            {summary.peakPoint
              ? BRL_FORMATTER.format(summary.peakPoint.revenueCents / 100)
              : 'R$ 0,00'}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4] truncate">
            {summary.peakPoint
              ? `${summary.peakPoint.label} · ${summary.peakPoint.callsCount} ${
                  summary.peakPoint.callsCount === 1 ? 'chamada' : 'chamadas'
                }`
              : 'Sem registros pagos no período'}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Sessões e Ticket Médio</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
            {summary.totalCalls}
            <span className="text-sm font-normal text-[#C9BAC4] ml-2">
              {summary.totalCalls === 1 ? 'chamada' : 'chamadas'}
            </span>
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
            Ticket médio: {BRL_FORMATTER.format(summary.averageTicketCents / 100)}
            {summary.totalRefundedCalls > 0
              ? ` · ${summary.totalRefundedCalls} reemb.`
              : ''}
          </p>
        </div>
      </div>

      {/* Main Recharts Viewport */}
      <div className="p-6 space-y-4">
        {summary.totalRevenueCents === 0 && (
          <div className="px-4 py-3 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#C9BAC4]">
            <span>
              {callHistory.length === 0
                ? 'Ainda não há videochamadas finalizadas em callHistory. Assim que uma sessão encerrar ou for registrada abaixo, os gráficos diário e mensal serão atualizados automaticamente.'
                : `Nenhuma receita concluída nos últimos ${
                    granularity === 'daily'
                      ? dailyRange === '7d'
                        ? '7 dias'
                        : dailyRange === '30d'
                          ? '30 dias'
                          : '90 dias'
                      : monthlyRange === '6m'
                        ? '6 meses'
                        : '12 meses'
                  }.`}
            </span>
            {callHistory.length > 0 &&
              (granularity === 'daily' ? dailyRange !== '90d' : monthlyRange !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    if (granularity === 'daily') {
                      setGranularity('monthly');
                      setMonthlyRange('all');
                    } else {
                      setMonthlyRange('all');
                    }
                  }}
                  className="text-xs font-semibold text-[#F4C2D7] hover:text-[#F8D6E3] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Ver todo o histórico →
                </button>
              )}
          </div>
        )}

        {/* Legend Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#C9BAC4]">
          <div className="flex flex-wrap items-center gap-5">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-xs inline-block"
                style={{ backgroundColor: themeAccentColor }}
              />
              <span>
                {granularity === 'daily'
                  ? 'Ganhos Diários (R$)'
                  : 'Ganhos Mensais (R$)'}
              </span>
            </span>

            {summary.peakPoint && (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-xs bg-[#86EFAC] inline-block"
                />
                <span>
                  {granularity === 'daily' ? 'Dia Pico' : 'Melhor Mês'}
                </span>
              </span>
            )}

            {showCumulative && (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-3 h-0.5 inline-block"
                  style={{ backgroundColor: themeAccentSoftColor }}
                />
                <span>Acumulado no Período (R$)</span>
              </span>
            )}
          </div>

          <span className="font-mono tabular-nums text-[11px] text-[#938291] inline-flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-[#938291]" />
            <span>
              {points[0]?.label} — {points[points.length - 1]?.label} (
              {points.length}{' '}
              {granularity === 'daily' ? 'dias' : 'meses'})
            </span>
          </span>
        </div>

        <div className="h-[310px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={points}
              margin={{ top: 12, right: showCumulative ? 12 : 8, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="finEarningsBarFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={themeAccentSoftColor}
                    stopOpacity={0.95}
                  />
                  <stop
                    offset="100%"
                    stopColor={themeAccentColor}
                    stopOpacity={0.55}
                  />
                </linearGradient>
                <linearGradient
                  id="finPeakBarFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#86EFAC" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#4ADE80" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient
                  id="finCumulativeAreaFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor={themeAccentSoftColor}
                    stopOpacity={0.22}
                  />
                  <stop
                    offset="95%"
                    stopColor={themeAccentSoftColor}
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                stroke="rgba(255, 255, 255, 0.08)"
                vertical={false}
              />

              <XAxis
                dataKey="label"
                stroke="#938291"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={granularity === 'daily' ? 14 : 8}
              />

              <YAxis
                yAxisId="period"
                stroke="#C9BAC4"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={74}
                tickFormatter={(val: number) => BRL_COMPACT.format(val)}
              />

              {showCumulative && (
                <YAxis
                  yAxisId="cumulative"
                  orientation="right"
                  stroke="#938291"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={74}
                  tickFormatter={(val: number) => BRL_COMPACT.format(val)}
                />
              )}

              <Tooltip
                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                content={
                  <EarningsTooltip
                    granularity={granularity}
                    showCumulative={showCumulative}
                    themeAccentColor={themeAccentColor}
                    themeAccentSoftColor={themeAccentSoftColor}
                  />
                }
              />

              {showCumulative && (
                <Area
                  yAxisId="cumulative"
                  type="monotone"
                  dataKey="cumulativeRevenueBrl"
                  name="Acumulado (R$)"
                  stroke={themeAccentSoftColor}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fillOpacity={1}
                  fill="url(#finCumulativeAreaFill)"
                  activeDot={{
                    r: 4,
                    fill: themeAccentSoftColor,
                    stroke: '#0B060F',
                  }}
                />
              )}

              <Bar
                yAxisId="period"
                dataKey="revenueBrl"
                name={
                  granularity === 'daily'
                    ? 'Ganhos do Dia (R$)'
                    : 'Ganhos do Mês (R$)'
                }
                radius={[6, 6, 0, 0]}
                maxBarSize={granularity === 'monthly' ? 38 : 22}
              >
                {points.map((entry) => {
                  const isPeak =
                    summary.peakPoint !== null &&
                    entry.key === summary.peakPoint.key;
                  return (
                    <Cell
                      key={entry.key}
                      fill={
                        isPeak
                          ? 'url(#finPeakBarFill)'
                          : 'url(#finEarningsBarFill)'
                      }
                    />
                  );
                })}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Monthly Breakdown Grid (only in Monthly View) */}
      {granularity === 'monthly' && monthlyTableRows.length > 0 && (
        <div className="border-t border-[#F4C2D7]/15">
          <div className="px-6 py-4 border-b border-[#F4C2D7]/10 flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-[#FAF4F7]">
              Fechamento Mensal Detalhado
            </h3>
            <span className="text-xs font-mono tabular-nums text-[#938291]">
              {monthlyTableRows.length} meses listados
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#F4C2D7]/15 text-[#938291]">
                  <th className="py-3 px-6 font-medium">Mês</th>
                  <th className="py-3 px-4 font-medium text-right">Chamadas</th>
                  <th className="py-3 px-4 font-medium text-right">Duração</th>
                  <th className="py-3 px-4 font-medium text-right">Ticket Médio</th>
                  <th className="py-3 px-4 font-medium text-right">Variação</th>
                  <th className="py-3 px-6 font-medium text-right">Ganhos Líquidos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4C2D7]/10">
                {monthlyTableRows.map((row) => {
                  const isPeak =
                    summary.peakPoint !== null &&
                    row.key === summary.peakPoint.key;
                  return (
                    <tr
                      key={row.key}
                      className="hover:bg-[#FAF4F7]/[0.02] transition-colors"
                    >
                      <td className="py-3 px-6 font-medium text-[#FAF4F7] whitespace-nowrap">
                        {row.fullLabel}
                        {isPeak && (
                          <span className="ml-2 font-mono text-[11px] text-[#86EFAC]">
                            · Melhor mês
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#C9BAC4]">
                        {row.callsCount}
                        {row.refundedCount > 0 && (
                          <span className="text-[#FCA5A5] ml-1">
                            (-{row.refundedCount})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#C9BAC4]">
                        {formatDurationReadable(row.durationSeconds)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-[#FAF4F7]">
                        {row.callsCount > 0
                          ? BRL_FORMATTER.format(row.avgTicketCents / 100)
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {row.momDeltaPct === null ? (
                          <span className="text-[#938291]">—</span>
                        ) : (
                          <span
                            className={
                              row.momDeltaPct >= 0
                                ? 'text-[#86EFAC]'
                                : 'text-[#FCA5A5]'
                            }
                          >
                            {row.momDeltaPct >= 0 ? '+' : ''}
                            {row.momDeltaPct.toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-[#F4C2D7]">
                        {BRL_FORMATTER.format(row.revenueBrl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
