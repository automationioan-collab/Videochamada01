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
import { CalendarDays, Download, Filter, QrCode, RotateCcw } from 'lucide-react';
import type { CallPlan, PixChargeRecord, PixChargeStatus } from '../types/studio';

interface PixSalesAnalyticsPanelProps {
  pixCharges: PixChargeRecord[];
  callPlans: CallPlan[];
  activeModelId: string;
  modelName: string;
  themeAccentColor?: string;
  themeAccentSoftColor?: string;
}

type DatePreset = 'today' | '7d' | '30d' | '90d' | 'all' | 'custom';
type ChartGranularity = 'daily' | 'monthly';
type StatusScope = 'paid' | 'pending' | 'all';

interface PixChartPoint {
  key: string;
  label: string;
  fullLabel: string;
  paidCents: number;
  paidBrl: number;
  pendingCents: number;
  pendingBrl: number;
  cumulativePaidBrl: number;
  paidCount: number;
  totalGenerated: number;
  avgTicketCents: number;
}

interface PlanBreakdownRow {
  key: string;
  label: string;
  categoryLabel: string;
  modelLabel: string;
  paidCount: number;
  totalGenerated: number;
  pendingCount: number;
  paidCents: number;
  pendingCents: number;
  avgTicketCents: number;
  sharePct: number;
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

function toDayInputValue(date: Date): string {
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

function parseDayInputStart(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function parseDayInputEnd(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
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

function computePresetDates(preset: Exclude<DatePreset, 'custom'>): {
  from: string;
  to: string;
} {
  if (preset === 'all') {
    return { from: '', to: '' };
  }
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  if (preset === '7d') start.setDate(start.getDate() - 6);
  if (preset === '30d') start.setDate(start.getDate() - 29);
  if (preset === '90d') start.setDate(start.getDate() - 89);
  return {
    from: toDayInputValue(start),
    to: toDayInputValue(end),
  };
}

function resolveChargeTimestamp(charge: PixChargeRecord): number {
  if (charge.status === 'paid' && typeof charge.paidAt === 'number') {
    return charge.paidAt;
  }
  return charge.createdAt;
}

function resolveChargeCategoryLabel(charge: PixChargeRecord): string {
  if (charge.kind === 'private_album') return 'Álbum Privado';
  if (charge.kind === 'tip') return 'Gorjeta na Meta';
  if (charge.kind === 'custom_charge') return 'Cobrança Dinâmica';
  return 'Plano de Chamada';
}

function resolveChargePlanLabel(charge: PixChargeRecord): string {
  if (charge.kind === 'private_album') return 'Álbum Privado';
  if (charge.kind === 'tip') return 'Gorjeta na Meta';
  if (charge.kind === 'custom_charge') {
    return charge.description?.trim() || 'Cobrança PIX Dinâmica';
  }
  return charge.planName?.trim() || 'Plano de Videochamada';
}

const STATUS_LABEL: Record<PixChargeStatus, string> = {
  paid: 'Pago',
  pending: 'Aguardando',
  expired: 'Expirado',
  cancelled: 'Cancelado',
};

interface PixTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: PixChartPoint }>;
  themeAccentColor?: string;
}

const PixSalesTooltip: React.FC<PixTooltipProps> = ({
  active,
  payload,
  themeAccentColor = '#38BDF8',
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-[#0B060F] border border-[#38BDF8]/35 rounded-xl p-3.5 text-xs space-y-2 min-w-[230px] shadow-xl">
      <p className="font-medium text-[#FAF4F7] border-b border-[#F4C2D7]/15 pb-1.5">
        {point.fullLabel}
      </p>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Volume PIX pago</span>
          <span
            className="font-mono tabular-nums font-semibold"
            style={{ color: themeAccentColor }}
          >
            {BRL_FORMATTER.format(point.paidBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Acumulado no filtro</span>
          <span className="font-mono tabular-nums text-[#E0F2FE]">
            {BRL_FORMATTER.format(point.cumulativePaidBrl)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Pagos / Gerados</span>
          <span className="font-mono tabular-nums text-[#FAF4F7]">
            {point.paidCount} / {point.totalGenerated}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#C9BAC4]">Ticket médio pago</span>
          <span className="font-mono tabular-nums text-[#86EFAC]">
            {point.paidCount > 0
              ? BRL_FORMATTER.format(point.avgTicketCents / 100)
              : '—'}
          </span>
        </div>
        {point.pendingCents > 0 && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#F4C2D7]/10">
            <span className="text-[#FCD34D]">Aguardando PIX</span>
            <span className="font-mono tabular-nums text-[#FCD34D]">
              {BRL_FORMATTER.format(point.pendingBrl)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export const PixSalesAnalyticsPanel: React.FC<PixSalesAnalyticsPanelProps> = ({
  pixCharges,
  callPlans,
  activeModelId,
  modelName,
  themeAccentColor = '#38BDF8',
  themeAccentSoftColor = '#E0F2FE',
}) => {
  const initialRange = useMemo(() => computePresetDates('30d'), []);
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [dateFrom, setDateFrom] = useState<string>(initialRange.from);
  const [dateTo, setDateTo] = useState<string>(initialRange.to);
  const [selectedModelId, setSelectedModelId] = useState<string>('all');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<string>('all');
  const [statusScope, setStatusScope] = useState<StatusScope>('paid');
  const [granularity, setGranularity] = useState<ChartGranularity>('daily');

  const handleSelectPreset = (preset: Exclude<DatePreset, 'custom'>) => {
    setDatePreset(preset);
    const next = computePresetDates(preset);
    setDateFrom(next.from);
    setDateTo(next.to);
    if (preset === 'all') {
      setGranularity('monthly');
    } else {
      setGranularity('daily');
    }
  };

  const handleResetFilters = () => {
    const def = computePresetDates('30d');
    setDatePreset('30d');
    setDateFrom(def.from);
    setDateTo(def.to);
    setSelectedModelId('all');
    setSelectedPlanFilter('all');
    setStatusScope('paid');
    setGranularity('daily');
  };

  // Distinct models present in this isolated admin scope
  const modelOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set(activeModelId, modelName);
    for (const charge of pixCharges) {
      if (charge.modelId && !map.has(charge.modelId)) {
        map.set(charge.modelId, charge.merchantName || charge.modelId);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [activeModelId, modelName, pixCharges]);

  // Distinct call plans + historical plans + non-plan PIX products
  const planOptions = useMemo(() => {
    const seenPlanIds = new Set<string>();
    const plansList: Array<{ value: string; label: string }> = [];

    for (const plan of callPlans) {
      seenPlanIds.add(plan.id);
      plansList.push({
        value: `plan:${plan.id}`,
        label: `${plan.name} (${plan.durationMinutes} min · ${BRL_FORMATTER.format(
          plan.priceCents / 100
        )})`,
      });
    }

    const extraPlanNames = new Set<string>();
    for (const charge of pixCharges) {
      if (charge.kind !== 'call_plan') continue;
      if (charge.planId && !seenPlanIds.has(charge.planId)) {
        seenPlanIds.add(charge.planId);
        plansList.push({
          value: `plan:${charge.planId}`,
          label: charge.planName || charge.planId,
        });
      } else if (!charge.planId && charge.planName) {
        extraPlanNames.add(charge.planName);
      }
    }

    for (const name of extraPlanNames) {
      plansList.push({
        value: `planname:${name}`,
        label: name,
      });
    }

    return plansList;
  }, [callPlans, pixCharges]);

  const planLookupById = useMemo(() => {
    const map = new Map<string, CallPlan>();
    for (const p of callPlans) map.set(p.id, p);
    return map;
  }, [callPlans]);

  // Scope charges by Date, Model, and Call Plan (pre-status filter so conversion & pending KPIs stay accurate)
  const scopedCharges = useMemo(() => {
    const minTs = dateFrom ? parseDayInputStart(dateFrom) : null;
    const maxTs = dateTo ? parseDayInputEnd(dateTo) : null;

    return pixCharges.filter((charge) => {
      if (selectedModelId !== 'all' && charge.modelId !== selectedModelId) {
        return false;
      }

      if (selectedPlanFilter === 'all_call_plans') {
        if (charge.kind !== 'call_plan') return false;
      } else if (selectedPlanFilter === 'kind:private_album') {
        if (charge.kind !== 'private_album') return false;
      } else if (selectedPlanFilter === 'kind:tip') {
        if (charge.kind !== 'tip') return false;
      } else if (selectedPlanFilter.startsWith('plan:')) {
        const targetPlanId = selectedPlanFilter.slice(5);
        const targetPlan = planLookupById.get(targetPlanId);
        const matchesId = charge.planId === targetPlanId;
        const matchesName =
          Boolean(targetPlan) &&
          charge.kind === 'call_plan' &&
          charge.planName === targetPlan?.name;
        if (!matchesId && !matchesName) return false;
      } else if (selectedPlanFilter.startsWith('planname:')) {
        const targetName = selectedPlanFilter.slice(9);
        if (charge.kind !== 'call_plan' || charge.planName !== targetName) {
          return false;
        }
      }

      const ts = resolveChargeTimestamp(charge);
      if (minTs !== null && ts < minTs) return false;
      if (maxTs !== null && ts > maxTs) return false;
      return true;
    });
  }, [
    dateFrom,
    dateTo,
    pixCharges,
    planLookupById,
    selectedModelId,
    selectedPlanFilter,
  ]);

  const visibleCharges = useMemo(() => {
    if (statusScope === 'paid') {
      return scopedCharges.filter((c) => c.status === 'paid');
    }
    if (statusScope === 'pending') {
      return scopedCharges.filter((c) => c.status === 'pending');
    }
    return scopedCharges;
  }, [scopedCharges, statusScope]);

  // Core Financial KPIs
  const kpis = useMemo(() => {
    let paidCents = 0;
    let paidCount = 0;
    let pendingCents = 0;
    let pendingCount = 0;
    let expiredOrCancelledCount = 0;
    let callPlansPaidCents = 0;
    let albumPaidCents = 0;
    let tipsPaidCents = 0;

    for (const c of scopedCharges) {
      if (c.status === 'paid') {
        paidCents += c.amountCents;
        paidCount += 1;
        if (c.kind === 'call_plan') callPlansPaidCents += c.amountCents;
        else if (c.kind === 'private_album') albumPaidCents += c.amountCents;
        else if (c.kind === 'tip') tipsPaidCents += c.amountCents;
      } else if (c.status === 'pending') {
        pendingCents += c.amountCents;
        pendingCount += 1;
      } else {
        expiredOrCancelledCount += 1;
      }
    }

    const totalGenerated = scopedCharges.length;
    const conversionPct =
      totalGenerated > 0 ? (paidCount / totalGenerated) * 100 : 0;
    const avgTicketCents =
      paidCount > 0 ? Math.round(paidCents / paidCount) : 0;

    return {
      paidCents,
      paidCount,
      pendingCents,
      pendingCount,
      expiredOrCancelledCount,
      totalGenerated,
      conversionPct,
      avgTicketCents,
      callPlansPaidCents,
      albumPaidCents,
      tipsPaidCents,
    };
  }, [scopedCharges]);

  // Time-series chart data
  const { chartPoints, peakBucket } = useMemo(() => {
    const now = new Date();
    const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (granularity === 'daily') {
      let startDay: Date;
      let endDay: Date;

      if (dateFrom && dateTo) {
        const s = parseDayInputStart(dateFrom);
        const e = parseDayInputStart(dateTo);
        startDay = s !== null ? new Date(s) : new Date(todayDay);
        endDay = e !== null ? new Date(e) : new Date(todayDay);
        if (endDay < startDay) endDay = new Date(startDay);
        // Cap daily render span to 120 days to keep chart legible
        const maxSpanStart = new Date(endDay);
        maxSpanStart.setDate(maxSpanStart.getDate() - 119);
        if (startDay < maxSpanStart) startDay = maxSpanStart;
      } else if (scopedCharges.length > 0) {
        const timestamps = scopedCharges.map(resolveChargeTimestamp);
        const minDate = new Date(Math.min(...timestamps));
        const maxDate = new Date(Math.max(...timestamps, todayDay.getTime()));
        startDay = new Date(
          minDate.getFullYear(),
          minDate.getMonth(),
          minDate.getDate()
        );
        endDay = new Date(
          maxDate.getFullYear(),
          maxDate.getMonth(),
          maxDate.getDate()
        );
        const maxSpanStart = new Date(endDay);
        maxSpanStart.setDate(maxSpanStart.getDate() - 89);
        if (startDay < maxSpanStart) startDay = maxSpanStart;
      } else {
        endDay = todayDay;
        startDay = new Date(todayDay);
        startDay.setDate(startDay.getDate() - 29);
      }

      const buckets = new Map<
        string,
        { paidCents: number; pendingCents: number; paidCount: number; totalGenerated: number }
      >();

      for (const c of scopedCharges) {
        const dt = new Date(resolveChargeTimestamp(c));
        const dayKey = toDayInputValue(dt);
        const cur = buckets.get(dayKey) || {
          paidCents: 0,
          pendingCents: 0,
          paidCount: 0,
          totalGenerated: 0,
        };
        cur.totalGenerated += 1;
        if (c.status === 'paid') {
          cur.paidCents += c.amountCents;
          cur.paidCount += 1;
        } else if (c.status === 'pending') {
          cur.pendingCents += c.amountCents;
        }
        buckets.set(dayKey, cur);
      }

      const built: PixChartPoint[] = [];
      let cumulativeCents = 0;
      let peak: PixChartPoint | null = null;
      const cursor = new Date(startDay);

      while (cursor <= endDay) {
        const key = toDayInputValue(cursor);
        const data = buckets.get(key) || {
          paidCents: 0,
          pendingCents: 0,
          paidCount: 0,
          totalGenerated: 0,
        };
        cumulativeCents += data.paidCents;
        const pt: PixChartPoint = {
          key,
          label: formatDayShort(cursor),
          fullLabel: formatDayFull(cursor),
          paidCents: data.paidCents,
          paidBrl: Number((data.paidCents / 100).toFixed(2)),
          pendingCents: data.pendingCents,
          pendingBrl: Number((data.pendingCents / 100).toFixed(2)),
          cumulativePaidBrl: Number((cumulativeCents / 100).toFixed(2)),
          paidCount: data.paidCount,
          totalGenerated: data.totalGenerated,
          avgTicketCents:
            data.paidCount > 0 ? Math.round(data.paidCents / data.paidCount) : 0,
        };
        built.push(pt);
        if (pt.paidCents > 0 && (!peak || pt.paidCents > peak.paidCents)) {
          peak = pt;
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      return { chartPoints: built, peakBucket: peak };
    }

    // Monthly granularity
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let startMonth = new Date(
      currentMonthStart.getFullYear(),
      currentMonthStart.getMonth() - 5,
      1
    );
    let endMonth = currentMonthStart;

    if (dateFrom && dateTo) {
      const s = parseDayInputStart(dateFrom);
      const e = parseDayInputStart(dateTo);
      if (s !== null) {
        const sd = new Date(s);
        startMonth = new Date(sd.getFullYear(), sd.getMonth(), 1);
      }
      if (e !== null) {
        const ed = new Date(e);
        endMonth = new Date(ed.getFullYear(), ed.getMonth(), 1);
      }
      if (endMonth < startMonth) endMonth = new Date(startMonth);
    } else if (scopedCharges.length > 0) {
      const timestamps = scopedCharges.map(resolveChargeTimestamp);
      const earliest = new Date(Math.min(...timestamps));
      const earliestMonth = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
      if (earliestMonth < startMonth) {
        startMonth = earliestMonth;
      }
    }

    const monthBuckets = new Map<
      string,
      { paidCents: number; pendingCents: number; paidCount: number; totalGenerated: number }
    >();

    for (const c of scopedCharges) {
      const dt = new Date(resolveChargeTimestamp(c));
      const mKey = toMonthKey(dt);
      const cur = monthBuckets.get(mKey) || {
        paidCents: 0,
        pendingCents: 0,
        paidCount: 0,
        totalGenerated: 0,
      };
      cur.totalGenerated += 1;
      if (c.status === 'paid') {
        cur.paidCents += c.amountCents;
        cur.paidCount += 1;
      } else if (c.status === 'pending') {
        cur.pendingCents += c.amountCents;
      }
      monthBuckets.set(mKey, cur);
    }

    const built: PixChartPoint[] = [];
    let cumulativeCents = 0;
    let peak: PixChartPoint | null = null;
    const cursor = new Date(startMonth);

    while (cursor <= endMonth) {
      const key = toMonthKey(cursor);
      const data = monthBuckets.get(key) || {
        paidCents: 0,
        pendingCents: 0,
        paidCount: 0,
        totalGenerated: 0,
      };
      cumulativeCents += data.paidCents;
      const pt: PixChartPoint = {
        key,
        label: formatMonthShort(cursor),
        fullLabel: formatMonthFull(cursor),
        paidCents: data.paidCents,
        paidBrl: Number((data.paidCents / 100).toFixed(2)),
        pendingCents: data.pendingCents,
        pendingBrl: Number((data.pendingCents / 100).toFixed(2)),
        cumulativePaidBrl: Number((cumulativeCents / 100).toFixed(2)),
        paidCount: data.paidCount,
        totalGenerated: data.totalGenerated,
        avgTicketCents:
          data.paidCount > 0 ? Math.round(data.paidCents / data.paidCount) : 0,
      };
      built.push(pt);
      if (pt.paidCents > 0 && (!peak || pt.paidCents > peak.paidCents)) {
        peak = pt;
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }

    return { chartPoints: built, peakBucket: peak };
  }, [dateFrom, dateTo, granularity, scopedCharges]);

  // Plan & Item Breakdown
  const planBreakdown = useMemo<PlanBreakdownRow[]>(() => {
    const groups = new Map<
      string,
      {
        label: string;
        categoryLabel: string;
        modelLabel: string;
        paidCount: number;
        totalGenerated: number;
        pendingCount: number;
        paidCents: number;
        pendingCents: number;
      }
    >();

    for (const c of scopedCharges) {
      const label = resolveChargePlanLabel(c);
      const categoryLabel = resolveChargeCategoryLabel(c);
      const groupKey = `${c.modelId}::${c.kind}::${c.planId || label}`;
      const modelLabel =
        modelOptions.find((m) => m.id === c.modelId)?.label ||
        c.merchantName ||
        c.modelId;

      const cur = groups.get(groupKey) || {
        label,
        categoryLabel,
        modelLabel,
        paidCount: 0,
        totalGenerated: 0,
        pendingCount: 0,
        paidCents: 0,
        pendingCents: 0,
      };

      cur.totalGenerated += 1;
      if (c.status === 'paid') {
        cur.paidCount += 1;
        cur.paidCents += c.amountCents;
      } else if (c.status === 'pending') {
        cur.pendingCount += 1;
        cur.pendingCents += c.amountCents;
      }
      groups.set(groupKey, cur);
    }

    const totalPaidForShare = Array.from(groups.values()).reduce(
      (acc, g) => acc + g.paidCents,
      0
    );

    return Array.from(groups.entries())
      .map(([key, g]) => ({
        key,
        ...g,
        avgTicketCents:
          g.paidCount > 0 ? Math.round(g.paidCents / g.paidCount) : 0,
        sharePct:
          totalPaidForShare > 0 ? (g.paidCents / totalPaidForShare) * 100 : 0,
      }))
      .sort((a, b) => {
        if (b.paidCents !== a.paidCents) return b.paidCents - a.paidCents;
        return b.totalGenerated - a.totalGenerated;
      });
  }, [modelOptions, scopedCharges]);

  const hasCustomActiveFilter =
    datePreset !== '30d' ||
    selectedModelId !== 'all' ||
    selectedPlanFilter !== 'all' ||
    statusScope !== 'paid';

  const handleExportCsv = () => {
    const header = [
      'Data/Hora',
      'TXID',
      'Modelo',
      'Cliente',
      'Categoria',
      'Plano/Item',
      'Status',
      'Valor (BRL)',
      'Meio Mercado Pago',
    ];

    const rows = visibleCharges.map((c) => {
      const dt = new Date(resolveChargeTimestamp(c));
      const modelLabel =
        modelOptions.find((m) => m.id === c.modelId)?.label || c.modelId;
      return [
        dt.toLocaleString('pt-BR'),
        c.txid,
        modelLabel,
        c.userName,
        resolveChargeCategoryLabel(c),
        resolveChargePlanLabel(c),
        STATUS_LABEL[c.status],
        (c.amountCents / 100).toFixed(2),
        c.paymentMethodUsed || (c.provider === 'mercadopago' ? 'Mercado Pago PIX' : 'PIX Direto'),
      ];
    });

    const csvContent =
      '\uFEFF' +
      [header, ...rows]
        .map((cols) =>
          cols.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')
        )
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendas-pix-${dateFrom || 'inicio'}-${dateTo || 'hoje'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-labelledby="pix-sales-analytics-heading"
      className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
    >
      {/* Header & Export Toolbar */}
      <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-[#38BDF8]">
            Estatísticas de Vendas via PIX · Gestão Financeira Privativa ({modelName})
          </p>
          <h3
            id="pix-sales-analytics-heading"
            className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
          >
            Volume de Vendas PIX por Plano e Período
          </h3>
          <p className="text-xs text-[#C9BAC4]">
            Analise receita confirmada, conversão de QR Codes, ticket médio e participação de cada plano de chamada no intervalo filtrado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div
            role="group"
            aria-label="Agrupamento do gráfico PIX"
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

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={visibleCharges.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl bg-[#1A1024] border border-[#F4C2D7]/20 text-[#FAF4F7] hover:bg-[#281837] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
          >
            <Download className="w-3.5 h-3.5 text-[#38BDF8]" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar: Date Presets + Exact Date Range + Model + Call Plan + Status */}
      <div className="px-6 py-4 bg-[#0B060F]/65 border-b border-[#F4C2D7]/15 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C9BAC4] mr-1">
              <Filter className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Período:</span>
            </span>
            {(
              [
                { id: 'today', label: 'Hoje' },
                { id: '7d', label: '7 dias' },
                { id: '30d', label: '30 dias' },
                { id: '90d', label: '90 dias' },
                { id: 'all', label: 'Tudo' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={datePreset === preset.id}
                onClick={() => handleSelectPreset(preset.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  datePreset === preset.id
                    ? 'bg-[#0B1433] border-[#38BDF8]/60 text-[#E0F2FE]'
                    : 'bg-[#120A1A] border-[#F4C2D7]/15 text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label="Status das vendas PIX"
            className="flex items-center gap-1 p-1 bg-[#120A1A] border border-[#F4C2D7]/15 rounded-xl"
          >
            {(
              [
                { id: 'paid', label: 'Pagos' },
                { id: 'pending', label: 'Aguardando' },
                { id: 'all', label: 'Todos' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={statusScope === opt.id}
                onClick={() => setStatusScope(opt.id)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusScope === opt.id
                    ? 'bg-[#281837] text-[#FAF4F7]'
                    : 'text-[#C9BAC4] hover:text-[#FAF4F7]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div className="space-y-1">
            <label
              htmlFor="pix-stats-date-from"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Data inicial
            </label>
            <input
              id="pix-stats-date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDatePreset('custom');
                setDateFrom(e.target.value);
              }}
              className="w-full bg-[#120A1A] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="pix-stats-date-to"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Data final
            </label>
            <input
              id="pix-stats-date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDatePreset('custom');
                setDateTo(e.target.value);
              }}
              className="w-full bg-[#120A1A] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="pix-stats-model"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Modelo
            </label>
            <select
              id="pix-stats-model"
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="w-full bg-[#120A1A] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
            >
              <option value="all">
                Todas da conta ({modelName})
              </option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="pix-stats-plan"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Plano de chamada / Item
            </label>
            <div className="flex items-center gap-2">
              <select
                id="pix-stats-plan"
                value={selectedPlanFilter}
                onChange={(e) => setSelectedPlanFilter(e.target.value)}
                className="flex-1 min-w-0 bg-[#120A1A] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
              >
                <option value="all">Todos os planos e itens</option>
                <option value="all_call_plans">
                  Somente Planos de Chamada (Todos)
                </option>
                {planOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
                <option value="kind:private_album">Álbum Privado</option>
                <option value="kind:tip">Gorjetas na Meta</option>
              </select>

              {hasCustomActiveFilter && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  title="Restaurar filtros padrão"
                  aria-label="Restaurar filtros padrão"
                  className="p-2 rounded-xl bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4-Column Tabular KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#F4C2D7]/15 border-b border-[#F4C2D7]/15">
        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Volume PIX Confirmado</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#38BDF8]">
            {BRL_FORMATTER.format(kpis.paidCents / 100)}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4] truncate">
            {kpis.paidCount} {kpis.paidCount === 1 ? 'venda paga' : 'vendas pagas'}
            {kpis.callPlansPaidCents > 0
              ? ` · Chamadas: ${BRL_FORMATTER.format(kpis.callPlansPaidCents / 100)}`
              : ''}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Ticket Médio PIX</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
            {BRL_FORMATTER.format(kpis.avgTicketCents / 100)}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4] truncate">
            {peakBucket
              ? `Pico: ${peakBucket.label} (${BRL_FORMATTER.format(
                  peakBucket.paidCents / 100
                )})`
              : 'Sem vendas pagas no recorte'}
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Taxa de Conversão PIX</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#86EFAC]">
            {kpis.conversionPct.toFixed(1)}%
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
            {kpis.paidCount} pagos de {kpis.totalGenerated} gerados
          </p>
        </div>

        <div className="p-5 space-y-1">
          <p className="text-xs text-[#938291]">Aguardando Compensação</p>
          <p className="text-2xl font-semibold font-mono tabular-nums text-[#FCD34D]">
            {BRL_FORMATTER.format(kpis.pendingCents / 100)}
          </p>
          <p className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
            {kpis.pendingCount} pendente{kpis.pendingCount === 1 ? '' : 's'} ·{' '}
            {kpis.expiredOrCancelledCount} exp./canc.
          </p>
        </div>
      </div>

      {/* Chart + Plan Breakdown */}
      {scopedCharges.length === 0 ? (
        <div className="p-8 text-center space-y-3">
          <QrCode className="w-8 h-8 text-[#38BDF8]/70 mx-auto" />
          <div className="space-y-1 max-w-md mx-auto">
            <p className="text-sm font-semibold text-[#FAF4F7]">
              Nenhuma venda PIX encontrada para os filtros selecionados
            </p>
            <p className="text-xs text-[#C9BAC4]">
              Ajuste o intervalo de datas ou o plano de chamada acima. Assim que os internautas gerarem e confirmarem pagamentos via PIX, o volume financeiro aparecerá aqui em tempo real.
            </p>
          </div>
          {hasCustomActiveFilter && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#1A1024] border border-[#38BDF8]/35 text-[#E0F2FE] hover:border-[#38BDF8] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-[#F4C2D7]/15">
          {/* Volume Over Time Chart */}
          <div className="p-6 space-y-4">
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
                      ? 'Vendas PIX Pagas por Dia (R$)'
                      : 'Vendas PIX Pagas por Mês (R$)'}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="w-3 h-0.5 inline-block"
                    style={{ backgroundColor: themeAccentSoftColor }}
                  />
                  <span>Acumulado no Filtro (R$)</span>
                </span>
              </div>

              <span className="font-mono tabular-nums text-[11px] text-[#938291] inline-flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5 text-[#938291]" />
                <span>
                  {chartPoints[0]?.label} — {chartPoints[chartPoints.length - 1]?.label} (
                  {chartPoints.length}{' '}
                  {granularity === 'daily' ? 'dias' : 'meses'})
                </span>
              </span>
            </div>

            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartPoints}
                  margin={{ top: 10, right: 12, left: 4, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="pixBarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={themeAccentColor} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={themeAccentColor} stopOpacity={0.45} />
                    </linearGradient>
                    <linearGradient id="pixPeakBarFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#86EFAC" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="pixCumAreaFill" x1="0" y1="0" x2="0" y2="1">
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
                    width={72}
                    tickFormatter={(val: number) => BRL_COMPACT.format(val)}
                  />
                  <YAxis
                    yAxisId="cumulative"
                    orientation="right"
                    stroke="#938291"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={72}
                    tickFormatter={(val: number) => BRL_COMPACT.format(val)}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                    content={
                      <PixSalesTooltip themeAccentColor={themeAccentColor} />
                    }
                  />
                  <Area
                    yAxisId="cumulative"
                    type="monotone"
                    dataKey="cumulativePaidBrl"
                    name="Acumulado (R$)"
                    stroke={themeAccentSoftColor}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#pixCumAreaFill)"
                    activeDot={{
                      r: 4,
                      fill: themeAccentSoftColor,
                      stroke: '#0B060F',
                    }}
                  />
                  <Bar
                    yAxisId="period"
                    dataKey="paidBrl"
                    name="Volume PIX Pago (R$)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={granularity === 'monthly' ? 38 : 22}
                  >
                    {chartPoints.map((entry) => {
                      const isPeak =
                        peakBucket !== null && entry.key === peakBucket.key;
                      return (
                        <Cell
                          key={entry.key}
                          fill={
                            isPeak ? 'url(#pixPeakBarFill)' : 'url(#pixBarFill)'
                          }
                        />
                      );
                    })}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdown Table by Call Plan & Category */}
          <div className="overflow-x-auto">
            <div className="px-6 py-4 border-b border-[#F4C2D7]/10 flex items-center justify-between gap-4">
              <h4 className="text-sm font-semibold text-[#FAF4F7]">
                Desempenho por Plano de Chamada e Produto PIX
              </h4>
              <span className="text-xs font-mono tabular-nums text-[#938291]">
                {planBreakdown.length}{' '}
                {planBreakdown.length === 1 ? 'item listado' : 'itens listados'}
              </span>
            </div>

            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#F4C2D7]/15 text-[#938291]">
                  <th className="py-3 px-6 font-medium">Plano / Produto</th>
                  <th className="py-3 px-4 font-medium">Modelo</th>
                  <th className="py-3 px-4 font-medium text-right">
                    Pagos / Gerados
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Ticket Médio
                  </th>
                  <th className="py-3 px-4 font-medium text-right">
                    Participação
                  </th>
                  <th className="py-3 px-6 font-medium text-right">
                    Volume PIX Pago
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4C2D7]/10">
                {planBreakdown.map((row) => (
                  <tr
                    key={row.key}
                    className="hover:bg-[#FAF4F7]/[0.02] transition-colors"
                  >
                    <td className="py-3 px-6">
                      <p className="font-medium text-[#FAF4F7]">{row.label}</p>
                      <p className="text-[11px] text-[#938291]">
                        {row.categoryLabel}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-[#C9BAC4] whitespace-nowrap">
                      {row.modelLabel}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#C9BAC4]">
                      <span className="text-[#86EFAC] font-medium">
                        {row.paidCount}
                      </span>{' '}
                      / {row.totalGenerated}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#FAF4F7]">
                      {row.paidCount > 0
                        ? BRL_FORMATTER.format(row.avgTicketCents / 100)
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#C9BAC4]">
                      <div className="inline-flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[#150D1D] overflow-hidden hidden sm:block">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, Math.round(row.sharePct))}%`,
                              backgroundColor: themeAccentColor,
                            }}
                          />
                        </div>
                        <span>{row.sharePct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-right font-mono tabular-nums font-semibold text-[#38BDF8]">
                      {BRL_FORMATTER.format(row.paidCents / 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
