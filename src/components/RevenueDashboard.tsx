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
    <div className="bg-[#0B0C0F] border border-white/15 rounded-lg p-3.5 text-xs space-y-2 min-w-[210px]">
      <p className="font-medium text-[#F3EFE6] border-b border-white/10 pb-1.5">
        {point.fullDate}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#9BA1AE]">Receita acumulada</span>
          <span className="font-mono tabular-nums font-semibold text-[#E2C799]">
            {BRL_FORMATTER.format(point.cumulativeRevenueBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#9BA1AE]">Receita do dia</span>
          <span className="font-mono tabular-nums text-[#86EFAC]">
            {BRL_FORMATTER.format(point.dailyRevenueBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#9BA1AE]">Chamadas finalizadas</span>
          <span className="font-mono tabular-nums text-[#F3EFE6]">
            {point.callsCount}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#9BA1AE]">Duração no dia</span>
          <span className="font-mono tabular-nums text-[#C8CCD4]">
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
        // Ensure at least 7 days span for readable progression
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
      className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden"
    >
      {/* Header & Controls */}
      <div className="p-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2
            id="revenue-dashboard-heading"
            className="font-display text-2xl font-semibold text-[#F3EFE6]"
          >
            Dashboard de Receita
          </h2>
          <p className="text-xs text-[#9BA1AE]">
            Evolução da receita acumulada e volume de videochamadas finalizadas ao longo do tempo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === mode.id
                    ? 'bg-[#1F232C] text-[#F3EFE6]'
                    : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0C0F] border border-white/10 rounded-lg">
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
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  range === opt.id
                    ? 'bg-[#C9A46B] text-[#0B0C0F]'
                    : 'text-[#9BA1AE] hover:text-[#F3EFE6]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/10 border-b border-white/10">
        <div className="p-5 space-y-1">
          <p className="text-xs text-[#9BA1AE]">Receita no Período</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#E2C799]">
            {BRL_FORMATTER.format(summary.periodRevenueCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#9BA1AE]">Ticket Médio</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#F3EFE6]">
            {BRL_FORMATTER.format(summary.averageTicketCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#9BA1AE]">Chamadas Finalizadas</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#86EFAC]">
            {summary.periodCompletedCalls}
            {summary.periodRefundedCalls > 0 && (
              <span className="text-xs font-normal text-[#9BA1AE] ml-2">
                ({summary.periodRefundedCalls} reembolsada
                {summary.periodRefundedCalls === 1 ? '' : 's'})
              </span>
            )}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#9BA1AE]">Duração Média</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#C8CCD4]">
            {formatDurationShort(summary.averageDurationSeconds)}
          </p>
        </div>
      </div>

      {/* Chart Viewport */}
      <div className="p-6">
        {!hasAnyHistory ? (
          <div className="h-[280px] flex flex-col items-center justify-center text-center space-y-2 border border-dashed border-white/10 rounded-lg p-6">
            <p className="text-sm font-medium text-[#F3EFE6]">
              Sem transações finalizadas para exibir no gráfico.
            </p>
            <p className="text-xs text-[#9BA1AE] max-w-md">
              Assim que uma videochamada for encerrada ou registrada no histórico, o gráfico de receita acumulada e volume de chamadas será atualizado automaticamente.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#9BA1AE]">
              <div className="flex items-center gap-5">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-3 h-0.5 bg-[#C9A46B] inline-block"
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
              <span className="font-mono tabular-nums text-[11px] text-[#727988]">
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
                        stopColor="#C9A46B"
                        stopOpacity={0.32}
                      />
                      <stop
                        offset="95%"
                        stopColor="#C9A46B"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.06)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#727988"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis
                    yAxisId="revenue"
                    stroke="#9BA1AE"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tickFormatter={(val: number) => BRL_COMPACT.format(val)}
                  />
                  <YAxis
                    yAxisId="calls"
                    orientation="right"
                    stroke="#727988"
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
                    stroke="#C9A46B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#auraRevenueFill)"
                    activeDot={{ r: 4, fill: '#E2C799', stroke: '#0B0C0F' }}
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
