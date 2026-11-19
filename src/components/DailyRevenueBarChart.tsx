import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import type { CallHistoryRecord, CallRequest } from '../types/studio';

interface DailyRevenueBarChartProps {
  callHistory: CallHistoryRecord[];
  callQueue?: CallRequest[];
}

interface DailyBarPoint {
  dateKey: string;
  label: string;
  fullDate: string;
  capturedRevenueBrl: number;
  capturedCents: number;
  capturedSessions: number;
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

interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{
    payload?: DailyBarPoint;
  }>;
}

const DailyBarTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  const avgTicketBrl =
    point.capturedSessions > 0
      ? point.capturedRevenueBrl / point.capturedSessions
      : 0;

  return (
    <div className="bg-[#0B060F] border border-[#F4C2D7]/30 rounded-xl p-3.5 text-xs space-y-2 min-w-[220px] shadow-xl">
      <p className="font-medium text-[#FAF4F7] border-b border-[#F4C2D7]/15 pb-1.5">
        {point.fullDate}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Receita capturada</span>
          <span className="font-mono tabular-nums font-semibold text-[#F4C2D7]">
            {BRL_FORMATTER.format(point.capturedRevenueBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Sessões capturadas</span>
          <span className="font-mono tabular-nums text-[#FAF4F7]">
            {point.capturedSessions}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Ticket médio no dia</span>
          <span className="font-mono tabular-nums text-[#86EFAC]">
            {point.capturedSessions > 0
              ? BRL_FORMATTER.format(avgTicketBrl)
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
};

export const DailyRevenueBarChart: React.FC<DailyRevenueBarChartProps> = ({
  callHistory,
  callQueue = [],
}) => {
  const { points, stats } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const windowStart = new Date(todayStart);
    windowStart.setDate(windowStart.getDate() - 29);

    const dayBuckets = new Map<
      string,
      { capturedCents: number; capturedSessions: number }
    >();

    const seenHistoryCallIds = new Set<string>();

    for (const rec of callHistory) {
      if (rec.callId) seenHistoryCallIds.add(rec.callId);
      if (rec.status !== 'completed' || rec.amountCents <= 0) continue;

      const date = rec.endedAt?.toDate
        ? rec.endedAt.toDate()
        : rec.createdAt?.toDate
          ? rec.createdAt.toDate()
          : new Date();

      const itemDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      if (itemDay < windowStart || itemDay > todayStart) continue;

      const key = toDayKey(itemDay);
      const bucket = dayBuckets.get(key) || {
        capturedCents: 0,
        capturedSessions: 0,
      };
      bucket.capturedCents += rec.amountCents;
      bucket.capturedSessions += 1;
      dayBuckets.set(key, bucket);
    }

    // Include captured queue entries not yet mirrored in callHistory
    for (const req of callQueue) {
      if (
        req.paymentStatus !== 'captured' ||
        !req.planPriceCents ||
        req.planPriceCents <= 0 ||
        seenHistoryCallIds.has(req.id)
      ) {
        continue;
      }

      const date = req.updatedAt?.toDate
        ? req.updatedAt.toDate()
        : req.createdAt?.toDate
          ? req.createdAt.toDate()
          : new Date();

      const itemDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      );
      if (itemDay < windowStart || itemDay > todayStart) continue;

      const key = toDayKey(itemDay);
      const bucket = dayBuckets.get(key) || {
        capturedCents: 0,
        capturedSessions: 0,
      };
      bucket.capturedCents += req.planPriceCents;
      bucket.capturedSessions += 1;
      dayBuckets.set(key, bucket);
    }

    const builtPoints: DailyBarPoint[] = [];
    let totalCapturedCents = 0;
    let totalCapturedSessions = 0;
    let activeDaysCount = 0;
    let peakPoint: DailyBarPoint | null = null;

    const cursor = new Date(windowStart);
    while (cursor <= todayStart) {
      const key = toDayKey(cursor);
      const bucket = dayBuckets.get(key) || {
        capturedCents: 0,
        capturedSessions: 0,
      };
      const point: DailyBarPoint = {
        dateKey: key,
        label: formatDayShort(cursor),
        fullDate: formatDayFull(cursor),
        capturedCents: bucket.capturedCents,
        capturedRevenueBrl: Number((bucket.capturedCents / 100).toFixed(2)),
        capturedSessions: bucket.capturedSessions,
      };

      builtPoints.push(point);
      totalCapturedCents += bucket.capturedCents;
      totalCapturedSessions += bucket.capturedSessions;
      if (bucket.capturedCents > 0) {
        activeDaysCount += 1;
        if (!peakPoint || bucket.capturedCents > peakPoint.capturedCents) {
          peakPoint = point;
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      points: builtPoints,
      stats: {
        totalCapturedCents,
        totalCapturedSessions,
        dailyAverageCents: Math.round(totalCapturedCents / 30),
        activeDaysCount,
        peakPoint,
      },
    };
  }, [callHistory, callQueue]);

  return (
    <section
      aria-labelledby="daily-revenue-30d-heading"
      className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
            <BarChart3 className="w-4 h-4 shrink-0" />
            <span>Faturamento Diário · Últimos 30 Dias</span>
          </div>
          <h2
            id="daily-revenue-30d-heading"
            className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
          >
            Receita Capturada por Dia
          </h2>
          <p className="text-xs text-[#C9BAC4]">
            Distribuição diária dos pagamentos efetivamente capturados nos últimos 30 dias corridos.
          </p>
        </div>

        <div className="text-left sm:text-right shrink-0 space-y-0.5">
          <p className="text-[11px] text-[#938291]">Janela fixa</p>
          <p className="text-xs font-mono tabular-nums text-[#FAF4F7]">
            {points[0]?.label} — {points[points.length - 1]?.label} (30 dias)
          </p>
        </div>
      </div>

      {/* 30-Day Summary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#F4C2D7]/15 border-b border-[#F4C2D7]/15">
        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Total Capturado (30d)</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#F4C2D7]">
            {BRL_FORMATTER.format(stats.totalCapturedCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Média Diária (30d)</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
            {BRL_FORMATTER.format(stats.dailyAverageCents / 100)}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Dia de Maior Receita</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#86EFAC]">
            {stats.peakPoint
              ? BRL_FORMATTER.format(stats.peakPoint.capturedCents / 100)
              : 'R$ 0,00'}
          </p>
          {stats.peakPoint && (
            <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
              em {stats.peakPoint.label} ({stats.peakPoint.capturedSessions}{' '}
              {stats.peakPoint.capturedSessions === 1 ? 'chamada' : 'chamadas'})
            </p>
          )}
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Dias com Captura</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
            {stats.activeDaysCount}/30
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
            {stats.totalCapturedSessions}{' '}
            {stats.totalCapturedSessions === 1
              ? 'sessão capturada'
              : 'sessões capturadas'}
          </p>
        </div>
      </div>

      {/* BarChart Viewport */}
      <div className="p-6 space-y-4">
        {stats.totalCapturedCents === 0 && (
          <div className="px-4 py-3 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/20 text-xs text-[#C9BAC4]">
            Ainda não há receita capturada nos últimos 30 dias. Conforme as videochamadas forem finalizadas ou registradas, as barras diárias serão preenchidas automaticamente.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#C9BAC4]">
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-2.5 h-2.5 rounded-xs bg-[#F4C2D7] inline-block"
              />
              <span>Receita Capturada Diária (R$)</span>
            </span>
            {stats.peakPoint && (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="w-2.5 h-2.5 rounded-xs bg-[#86EFAC] inline-block"
                />
                <span>Dia Pico</span>
              </span>
            )}
          </div>
          <span className="font-mono tabular-nums text-[11px] text-[#938291]">
            30 dias · Valores em BRL
          </span>
        </div>

        <div className="h-[290px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="dailyCapturedBarFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#F8D6E3" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#E7A6C2" stopOpacity={0.55} />
                </linearGradient>
                <linearGradient
                  id="dailyPeakBarFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#86EFAC" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#4ADE80" stopOpacity={0.55} />
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
                minTickGap={14}
              />
              <YAxis
                stroke="#C9BAC4"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(val: number) => BRL_COMPACT.format(val)}
              />
              <Tooltip
                cursor={{ fill: 'rgba(244, 194, 215, 0.06)' }}
                content={<DailyBarTooltip />}
              />
              <Bar
                dataKey="capturedRevenueBrl"
                name="Receita Capturada (R$)"
                radius={[6, 6, 0, 0]}
                maxBarSize={22}
              >
                {points.map((entry) => {
                  const isPeak =
                    stats.peakPoint !== null &&
                    entry.dateKey === stats.peakPoint.dateKey;
                  return (
                    <Cell
                      key={entry.dateKey}
                      fill={
                        isPeak
                          ? 'url(#dailyPeakBarFill)'
                          : 'url(#dailyCapturedBarFill)'
                      }
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
};
