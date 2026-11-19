import React, { useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CallHistoryRecord } from '../types/studio';

interface RevenueDashboardProps {
  callHistory: CallHistoryRecord[];
}

type TimeRange = '7d' | '30d' | 'all';
type ChartViewMode = 'cumulative' | 'daily';

interface RevenueChartPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  callsCount: number;
  refundedCount: number;
  dailyRevenueBrl: number;
  cumulativeRevenueBrl: number;
  durationSeconds: number;
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

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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

function formatDurationShort(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: RevenueChartPoint;
  }>;
}

const RevenueTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-[#0B060F] border border-[#F4C2D7]/25 rounded-xl p-3.5 text-xs space-y-2 min-w-[210px]">
      <p className="font-medium text-[#FAF4F7] border-b border-[#F4C2D7]/15 pb-1.5">
        {point.fullDate}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Receita acumulada</span>
          <span className="font-mono tabular-nums font-semibold text-[#F4C2D7]">
            {BRL_FORMATTER.format(point.cumulativeRevenueBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Receita do dia</span>
          <span className="font-mono tabular-nums text-[#86EFAC]">
            {BRL_FORMATTER.format(point.dailyRevenueBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Chamadas finalizadas</span>
          <span className="font-mono tabular-nums text-[#FAF4F7]">
            {point.callsCount}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Duração no dia</span>
          <span className="font-mono tabular-nums text-[#C9BAC4]">
            {formatDurationShort(point.durationSeconds)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const RevenueDashboard: React.FC<RevenueDashboardProps> = ({
  callHistory,
}) => {
  const [range, setRange] = useState<TimeRange>('7d');
  const [viewMode, setViewMode] = useState<ChartViewMode>('cumulative');

  const { chartData, summary } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const recordsWithDate = callHistory.map((rec) => {
      const date = rec.endedAt?.toDate ? rec.endedAt.toDate() : new Date();
      return { rec, date, dayKey: toDayKey(date) };
    });

    let startDate: Date;
    if (range === '7d') {
      startDate = new Date(todayStart);
      startDate.setDate(startDate.getDate() - 6);
    } else if (range === '30d') {
      startDate = new Date(todayStart);
      startDate.setDate(startDate.getDate() - 29);
    } else {
      if (recordsWithDate.length > 0) {
        const earliestMs = Math.min(
          ...recordsWithDate.map((item) => item.date.getTime())
        );
        const earliest = new Date(earliestMs);
        startDate = new Date(
          earliest.getFullYear(),
          earliest.getMonth(),
          earliest.getDate()
        );
        const minSeven = new Date(todayStart);
        minSeven.setDate(minSeven.getDate() - 6);
        if (startDate > minSeven) {
          startDate = minSeven;
        }
      } else {
        startDate = new Date(todayStart);
        startDate.setDate(startDate.getDate() - 6);
      }
    }

    const bucketMap = new Map<
      string,
      {
        callsCount: number;
        refundedCount: number;
        revenueCents: number;
        durationSeconds: number;
      }
    >();

    let periodCompletedCalls = 0;
    let periodRefundedCalls = 0;
    let periodRevenueCents = 0;
    let periodDurationSeconds = 0;

    for (const item of recordsWithDate) {
      const itemDay = new Date(
        item.date.getFullYear(),
        item.date.getMonth(),
        item.date.getDate()
      );
      if (itemDay < startDate || itemDay > todayStart) continue;

      const existing = bucketMap.get(item.dayKey) || {
        callsCount: 0,
        refundedCount: 0,
        revenueCents: 0,
        durationSeconds: 0,
      };

      if (item.rec.status === 'completed') {
        existing.callsCount += 1;
        existing.revenueCents += item.rec.amountCents;
        existing.durationSeconds += item.rec.durationSeconds;

        periodCompletedCalls += 1;
        periodRevenueCents += item.rec.amountCents;
        periodDurationSeconds += item.rec.durationSeconds;
      } else {
        existing.refundedCount += 1;
        periodRefundedCalls += 1;
      }

      bucketMap.set(item.dayKey, existing);
    }

    const points: RevenueChartPoint[] = [];
    let runningCents = 0;
    const cursor = new Date(startDate);
    while (cursor <= todayStart) {
      const key = toDayKey(cursor);
      const dayStats = bucketMap.get(key) || {
        callsCount: 0,
        refundedCount: 0,
        revenueCents: 0,
        durationSeconds: 0,
      };
      runningCents += dayStats.revenueCents;
      points.push({
        dateKey: key,
        label: formatDayShort(cursor),
        fullDate: formatDayFull(cursor),
        callsCount: dayStats.callsCount,
        refundedCount: dayStats.refundedCount,
        dailyRevenueBrl: Number((dayStats.revenueCents / 100).toFixed(2)),
        cumulativeRevenueBrl: Number((runningCents / 100).toFixed(2)),
        durationSeconds: dayStats.durationSeconds,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const averageTicketCents =
      periodCompletedCalls > 0
        ? Math.round(periodRevenueCents / periodCompletedCalls)
        : 0;
    const averageDurationSeconds =
      periodCompletedCalls > 0
        ? Math.round(periodDurationSeconds / periodCompletedCalls)
        : 0;

    return {
      chartData: points,
      summary: {
        periodCompletedCalls,
        periodRefundedCalls,
        periodRevenueCents,
        averageTicketCents,
        averageDurationSeconds,
      },
    };
  }, [callHistory, range]);

  const hasAnyHistory = callHistory.length > 0;

  return (
    <section
      aria-labelledby="revenue-dashboard-heading"
      className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2
            id="revenue-dashboard-heading"
            className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
          >
            Dashboard de Receita
          </h2>
          <p className="text-xs text-[#C9BAC4]">
            Evolução da receita acumulada e volume de videochamadas finalizadas ao longo do tempo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full">
            {(
              [
                { id: 'cumulative', label: 'Receita Acumulada' },
                { id: 'daily', label: 'Receita Diária' },
              ] as const
            ).map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setViewMode(mode.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === mode.id
                    ? 'bg-[#281837] text-[#FAF4F7]'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-full">
            {(
              [
                { id: '7d', label: '7 dias' },
                { id: '30d', label: '30 dias' },
                { id: 'all', label: 'Tudo' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  range === opt.id
                    ? 'luxury-rose-cta font-semibold'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#F4C2D7]/15 border-b border-[#F4C2D7]/15">
        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Receita no Período</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#F4C2D7]">
            {BRL_FORMATTER.format(summary.periodRevenueCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Ticket Médio</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
            {BRL_FORMATTER.format(summary.averageTicketCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Chamadas Finalizadas</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#86EFAC]">
            {summary.periodCompletedCalls}
            {summary.periodRefundedCalls > 0 && (
              <span className="text-xs font-normal text-[#C9BAC4] ml-2">
                ({summary.periodRefundedCalls} reembolsada
                {summary.periodRefundedCalls === 1 ? '' : 's'})
              </span>
            )}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Duração Média</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#C9BAC4]">
            {formatDurationShort(summary.averageDurationSeconds)}
          </p>
        </div>
      </div>

      {/* Chart Viewport */}
      <div className="p-6">
        {!hasAnyHistory ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-[#F4C2D7]/20 rounded-xl p-6">
            <p className="text-sm font-medium text-[#FAF4F7]">
              Sem transações finalizadas para exibir no gráfico.
            </p>
            <p className="text-xs text-[#C9BAC4] max-w-md">
              Assim que uma videochamada for encerrada ou registrada no histórico, o gráfico de receita acumulada e volume de chamadas será atualizado automaticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#C9BAC4]">
              <div className="flex items-center gap-5">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-3 h-0.5 bg-[#F4C2D7] inline-block"
                  />
                  <span>
                    {viewMode === 'cumulative'
                      ? 'Receita Acumulada (R$)'
                      : 'Receita Diária (R$)'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-xs bg-[#86EFAC]/60 inline-block"
                  />
                  <span>Chamadas Finalizadas</span>
                </span>
              </div>
              <span className="font-mono tabular-nums text-[11px] text-[#938291]">
                {chartData.length} dias exibidos
              </span>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="auraRevenueFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#F4C2D7"
                        stopOpacity={0.34}
                      />
                      <stop
                        offset="95%"
                        stopColor="#F4C2D7"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="rgba(244, 194, 215, 0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#938291"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    yAxisId="revenue"
                    stroke="#C9BAC4"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tickFormatter={(val: number) => BRL_COMPACT.format(val)}
                  />
                  <YAxis
                    yAxisId="calls"
                    orientation="right"
                    stroke="#938291"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={36}
                  />
                  <Tooltip content={<RevenueTooltip />} />
                  <Bar
                    yAxisId="calls"
                    dataKey="callsCount"
                    name="Chamadas"
                    fill="rgba(134, 239, 172, 0.45)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                  />
                  <Area
                    yAxisId="revenue"
                    type="monotone"
                    dataKey={
                      viewMode === 'cumulative'
                        ? 'cumulativeRevenueBrl'
                        : 'dailyRevenueBrl'
                    }
                    name="Receita (R$)"
                    stroke="#F4C2D7"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#auraRevenueFill)"
                    activeDot={{ r: 4, fill: '#F8D6E3', stroke: '#0B060F' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
