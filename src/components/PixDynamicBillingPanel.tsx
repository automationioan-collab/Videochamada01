import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Percent,
  QrCode,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';
import type { PixChargeRecord, StudioConfig } from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function getTodayBrtInputDate(offsetDays = 0): string {
  const brtMs = Date.now() - 3 * 60 * 60 * 1000 + offsetDays * 86400000;
  const d = new Date(brtMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatBrDate(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'À vista';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function parsePercentInput(raw: string, fallback: number): number {
  const num = Number(raw.replace(',', '.').trim());
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(10, Number(num.toFixed(2))));
}

function parseBrlCents(raw: string): number {
  const clean = raw.replace(/\s+/g, '').replace(',', '.');
  const num = Number(clean);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

interface PreviewFeeBreakdown {
  originalAmountCents: number;
  fineCents: number;
  interestCents: number;
  totalAmountCents: number;
  daysOverdue: number;
}

function computeClientPreviewBreakdown(
  originalAmountCents: number,
  dueDate: string,
  finePercent: number,
  interestMonthlyPercent: number
): PreviewFeeBreakdown {
  const safeOriginal = Math.max(0, Math.round(originalAmountCents));
  let daysOverdue = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    const dueMs = Date.parse(`${dueDate}T23:59:59.999-03:00`);
    const nowMs = Date.now();
    if (Number.isFinite(dueMs) && nowMs > dueMs) {
      daysOverdue = Math.max(1, Math.ceil((nowMs - dueMs) / 86400000));
    }
  }
  const fineCents =
    daysOverdue > 0 ? Math.round(safeOriginal * (finePercent / 100)) : 0;
  const interestCents =
    daysOverdue > 0
      ? Math.round(
          safeOriginal * (interestMonthlyPercent / 100) * (daysOverdue / 30)
        )
      : 0;
  return {
    originalAmountCents: safeOriginal,
    fineCents,
    interestCents,
    totalAmountCents: safeOriginal + fineCents + interestCents,
    daysOverdue,
  };
}

interface PixDynamicBillingPanelProps {
  modelName: string;
  studioConfig: StudioConfig | null;
  onSaveStudioConfig: (
    patch: Partial<Omit<StudioConfig, 'modelUid' | 'updatedAt'>>
  ) => Promise<{ ok: boolean; error?: string } | void>;
  onCreateModelPixCharge?: (input: {
    amountCents: number;
    description: string;
    recipientName?: string;
    dueDate?: string;
    finePercent?: number;
    interestMonthlyPercent?: number;
    expiresAfterDueDays?: number;
  }) => Promise<{ ok: boolean; charge?: PixChargeRecord; error?: string }>;
}

export const PixDynamicBillingPanel: React.FC<PixDynamicBillingPanelProps> = ({
  modelName,
  studioConfig,
  onSaveStudioConfig,
  onCreateModelPixCharge,
}) => {
  // Studio default fine & interest policy
  const [defaultFineStr, setDefaultFineStr] = useState<string>(() =>
    String(studioConfig?.pixFinePercent ?? 2)
  );
  const [defaultInterestStr, setDefaultInterestStr] = useState<string>(() =>
    String(studioConfig?.pixInterestMonthlyPercent ?? 1)
  );
  const [defaultDueDaysStr, setDefaultDueDaysStr] = useState<string>(() =>
    String(studioConfig?.pixDefaultDueDays ?? 0)
  );
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyMsg, setPolicyMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Dynamic QR Code & Copia e Cola generator form
  const [recipientName, setRecipientName] = useState('');
  const [description, setDescription] = useState(
    () => `Atendimento Privativo · ${modelName}`
  );
  const [amountStr, setAmountStr] = useState('150,00');
  const [dueDate, setDueDate] = useState(() =>
    getTodayBrtInputDate(studioConfig?.pixDefaultDueDays ?? 0)
  );
  const [fineStr, setFineStr] = useState(() =>
    String(studioConfig?.pixFinePercent ?? 2)
  );
  const [interestStr, setInterestStr] = useState(() =>
    String(studioConfig?.pixInterestMonthlyPercent ?? 1)
  );
  const [graceDaysStr, setGraceDaysStr] = useState('7');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [generatedCharge, setGeneratedCharge] = useState<PixChargeRecord | null>(
    null
  );
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    setDefaultFineStr(String(studioConfig?.pixFinePercent ?? 2));
    setDefaultInterestStr(String(studioConfig?.pixInterestMonthlyPercent ?? 1));
    setDefaultDueDaysStr(String(studioConfig?.pixDefaultDueDays ?? 0));
    setFineStr(String(studioConfig?.pixFinePercent ?? 2));
    setInterestStr(String(studioConfig?.pixInterestMonthlyPercent ?? 1));
  }, [
    studioConfig?.pixFinePercent,
    studioConfig?.pixInterestMonthlyPercent,
    studioConfig?.pixDefaultDueDays,
  ]);

  const parsedAmountCents = useMemo(() => parseBrlCents(amountStr), [amountStr]);
  const parsedFinePercent = useMemo(
    () => parsePercentInput(fineStr, 2),
    [fineStr]
  );
  const parsedInterestPercent = useMemo(
    () => parsePercentInput(interestStr, 1),
    [interestStr]
  );

  const liveBreakdown = useMemo(
    () =>
      computeClientPreviewBreakdown(
        parsedAmountCents,
        dueDate,
        parsedFinePercent,
        parsedInterestPercent
      ),
    [parsedAmountCents, dueDate, parsedFinePercent, parsedInterestPercent]
  );

  const handleSaveDefaults = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPolicy) return;
    setSavingPolicy(true);
    setPolicyMsg(null);
    try {
      const nextFine = parsePercentInput(defaultFineStr, 2);
      const nextInterest = parsePercentInput(defaultInterestStr, 1);
      const rawDays = Number(defaultDueDaysStr.trim());
      const nextDays = Number.isFinite(rawDays)
        ? Math.max(0, Math.min(90, Math.round(rawDays)))
        : 0;
      const res = await onSaveStudioConfig({
        pixFinePercent: nextFine,
        pixInterestMonthlyPercent: nextInterest,
        pixDefaultDueDays: nextDays,
      });
      if (res && !res.ok) {
        setPolicyMsg({
          type: 'error',
          text: res.error || 'Não foi possível salvar as regras de cobrança.',
        });
      } else {
        setFineStr(String(nextFine));
        setInterestStr(String(nextInterest));
        setDueDate(getTodayBrtInputDate(nextDays));
        setPolicyMsg({
          type: 'success',
          text: `Regras salvas: multa de ${nextFine}% após vencimento, juros de ${nextInterest}% ao mês e vencimento padrão em ${
            nextDays === 0 ? 'hoje (à vista)' : `${nextDays} dias`
          }.`,
        });
      }
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleGenerateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateModelPixCharge || generating) return;
    setGenError(null);
    setCopiedCode(false);

    if (parsedAmountCents < 500 || parsedAmountCents > 10000000) {
      setGenError('Informe um valor principal entre R$ 5,00 e R$ 100.000,00.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setGenError('Selecione uma data de vencimento válida.');
      return;
    }

    const graceDays = Math.max(
      1,
      Math.min(28, Math.round(Number(graceDaysStr) || 7))
    );

    setGenerating(true);
    try {
      const res = await onCreateModelPixCharge({
        amountCents: parsedAmountCents,
        description:
          description.trim() || `Cobrança PIX · ${modelName}`,
        recipientName: recipientName.trim() || 'Cliente Avulso',
        dueDate,
        finePercent: parsedFinePercent,
        interestMonthlyPercent: parsedInterestPercent,
        expiresAfterDueDays: graceDays,
      });
      if (!res.ok || !res.charge) {
        setGenError(res.error || 'Erro ao gerar cobrança PIX dinâmica.');
        return;
      }
      setGeneratedCharge(res.charge);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyPixCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 3000);
    } catch {
      setGenError('Não foi possível copiar automaticamente. Selecione o texto.');
    }
  };

  const whatsappShareUrl = useMemo(() => {
    if (!generatedCharge) return '';
    const dueLabel = formatBrDate(generatedCharge.dueDate);
    const totalStr = BRL_FORMATTER.format(generatedCharge.amountCents / 100);
    const lines = [
      `Olá${generatedCharge.userName && generatedCharge.userName !== 'Cliente Avulso' ? ` ${generatedCharge.userName}` : ''}, segue sua cobrança PIX de ${modelName}:`,
      `Descrição: ${generatedCharge.description}`,
      `Valor atualizado: ${totalStr} (Vencimento: ${dueLabel})`,
      `Após vencimento: multa de ${generatedCharge.finePercent ?? 2}% e juros de ${generatedCharge.interestMonthlyPercent ?? 1}% ao mês.`,
      '',
      'PIX Copia e Cola:',
      generatedCharge.brCode,
    ];
    return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [generatedCharge, modelName]);

  return (
    <section className="luxury-card border border-[#F4C2D7]/15 rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0EA5E9]/15 border border-[#38BDF8]/30 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4 text-[#38BDF8]" />
          </div>
          <div>
            <h3 className="font-display text-xl font-semibold text-[#FAF4F7]">
              QR Code Dinâmico & Pix Copia e Cola
            </h3>
            <p className="text-xs text-[#C9BAC4]">
              Configure valor, data de vencimento, multa após atraso e juros mensais pro-rata com atualização automática do BR Code.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono tabular-nums text-[#38BDF8]">
          Multa padrão {studioConfig?.pixFinePercent ?? 2}% · Juros{' '}
          {studioConfig?.pixInterestMonthlyPercent ?? 1}% a.m.
        </span>
      </div>

      <div className="p-6 space-y-6">
        {/* Default Rules Form */}
        <form
          onSubmit={(e) => void handleSaveDefaults(e)}
          className="p-4 rounded-xl bg-[#0B060F]/90 border border-[#F4C2D7]/15 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FAF4F7]">
              <Percent className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Parâmetros Padrão de Encargos do Estúdio</span>
            </div>
            <span className="text-[11px] text-[#938291]">
              Aplicados automaticamente a novas cobranças e pacotes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="pix-default-fine"
                className="block text-[11px] text-[#C9BAC4] mb-1"
              >
                Multa após vencimento (%)
              </label>
              <input
                id="pix-default-fine"
                type="text"
                inputMode="decimal"
                value={defaultFineStr}
                onChange={(e) => setDefaultFineStr(e.target.value)}
                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label
                htmlFor="pix-default-interest"
                className="block text-[11px] text-[#C9BAC4] mb-1"
              >
                Juros ao mês (% pro-rata/dia)
              </label>
              <input
                id="pix-default-interest"
                type="text"
                inputMode="decimal"
                value={defaultInterestStr}
                onChange={(e) => setDefaultInterestStr(e.target.value)}
                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
              />
            </div>

            <div>
              <label
                htmlFor="pix-default-due-days"
                className="block text-[11px] text-[#C9BAC4] mb-1"
              >
                Vencimento padrão (dias)
              </label>
              <input
                id="pix-default-due-days"
                type="number"
                min={0}
                max={90}
                value={defaultDueDaysStr}
                onChange={(e) => setDefaultDueDaysStr(e.target.value)}
                className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {policyMsg ? (
              <p
                role="status"
                className={`text-xs ${
                  policyMsg.type === 'success' ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'
                }`}
              >
                {policyMsg.text}
              </p>
            ) : (
              <span className="text-[11px] text-[#938291]">
                Com vencimento em 0 dias, cobranças vencem ao fim do dia da emissão (23:59 BRT).
              </span>
            )}

            <button
              type="submit"
              disabled={savingPolicy}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full bg-[#1A1024] border border-[#38BDF8]/40 text-[#E0F2FE] hover:border-[#38BDF8] disabled:opacity-50 whitespace-nowrap cursor-pointer shrink-0"
            >
              <Save className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>
                {savingPolicy ? 'Salvando regras...' : 'Salvar Regras PIX'}
              </span>
            </button>
          </div>
        </form>

        {/* Dynamic Charge Builder + Live Result */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={(e) => void handleGenerateCharge(e)}
            className="lg:col-span-7 space-y-4 p-5 rounded-xl bg-[#0B060F]/70 border border-[#F4C2D7]/15"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#FAF4F7]">
              <CalendarClock className="w-4 h-4 text-[#38BDF8]" />
              <span>Emitir Nova Cobrança PIX Dinâmica</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label
                  htmlFor="dyn-pix-recipient"
                  className="block text-[11px] text-[#C9BAC4] mb-1"
                >
                  Nome do Cliente / Pagador
                </label>
                <input
                  id="dyn-pix-recipient"
                  type="text"
                  maxLength={80}
                  placeholder="Ex.: Carlos Henrique"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div>
                <label
                  htmlFor="dyn-pix-desc"
                  className="block text-[11px] text-[#C9BAC4] mb-1"
                >
                  Descrição da Cobrança
                </label>
                <input
                  id="dyn-pix-desc"
                  type="text"
                  maxLength={120}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="dyn-pix-amount"
                  className="block text-[11px] text-[#C9BAC4] mb-1"
                >
                  Valor Principal (R$)
                </label>
                <input
                  id="dyn-pix-amount"
                  type="text"
                  inputMode="decimal"
                  required
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div>
                <label
                  htmlFor="dyn-pix-due"
                  className="block text-[11px] text-[#C9BAC4] mb-1"
                >
                  Vencimento
                </label>
                <input
                  id="dyn-pix-due"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2.5 text-sm font-mono text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div>
                <label
                  htmlFor="dyn-pix-fine"
                  className="block text-[11px] text-[#C9BAC4] mb-1"
                >
                  Multa (%)
                </label>
                <input
                  id="dyn-pix-fine"
                  type="text"
                  inputMode="decimal"
                  value={fineStr}
                  onChange={(e) => setFineStr(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>

              <div>
                <label
                  htmlFor="dyn-pix-interest"
                  className="block text-[11px] text-[#C9BAC4] mb-1"
                >
                  Juros (% a.m.)
                </label>
                <input
                  id="dyn-pix-interest"
                  type="text"
                  inputMode="decimal"
                  value={interestStr}
                  onChange={(e) => setInterestStr(e.target.value)}
                  className="w-full bg-[#150D1D] border border-[#F4C2D7]/20 rounded-xl px-3 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-[#C9BAC4]">
                <label htmlFor="dyn-pix-grace" className="whitespace-nowrap">
                  Aceitar pagamento até:
                </label>
                <select
                  id="dyn-pix-grace"
                  value={graceDaysStr}
                  onChange={(e) => setGraceDaysStr(e.target.value)}
                  className="bg-[#150D1D] border border-[#F4C2D7]/20 rounded-lg px-2.5 py-1.5 text-xs text-[#FAF4F7] focus:outline-none focus:border-[#38BDF8]"
                >
                  <option value="1">1 dia após vencimento</option>
                  <option value="3">3 dias após vencimento</option>
                  <option value="7">7 dias após vencimento</option>
                  <option value="15">15 dias após vencimento</option>
                  <option value="28">28 dias após vencimento</option>
                </select>
              </div>
            </div>

            {/* Live Financial Breakdown Preview */}
            <div className="p-3.5 rounded-xl bg-[#150D1D] border border-[#38BDF8]/25 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-[#C9BAC4]">
                <span>Valor principal ({formatBrDate(dueDate)}):</span>
                <span className="font-mono tabular-nums text-[#FAF4F7]">
                  {BRL_FORMATTER.format(liveBreakdown.originalAmountCents / 100)}
                </span>
              </div>
              {liveBreakdown.daysOverdue > 0 ? (
                <>
                  <div className="flex items-center justify-between text-[#FCD34D]">
                    <span>
                      Multa por atraso ({parsedFinePercent}% ·{' '}
                      {liveBreakdown.daysOverdue} dia
                      {liveBreakdown.daysOverdue === 1 ? '' : 's'}):
                    </span>
                    <span className="font-mono tabular-nums">
                      + {BRL_FORMATTER.format(liveBreakdown.fineCents / 100)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#FCD34D]">
                    <span>
                      Juros de mora ({parsedInterestPercent}% a.m. pro-rata):
                    </span>
                    <span className="font-mono tabular-nums">
                      + {BRL_FORMATTER.format(liveBreakdown.interestCents / 100)}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-[#938291]">
                  Em dia: caso não seja pago até {formatBrDate(dueDate)}, multa de{' '}
                  {parsedFinePercent}% e juros de {parsedInterestPercent}% a.m.
                  incidirão automaticamente.
                </p>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-[#F4C2D7]/15 font-semibold">
                <span className="text-[#FAF4F7]">Total no QR Code Dinâmico:</span>
                <span className="font-mono tabular-nums text-sm text-[#38BDF8]">
                  {BRL_FORMATTER.format(liveBreakdown.totalAmountCents / 100)}
                </span>
              </div>
            </div>

            {genError && (
              <p
                role="alert"
                className="p-3 rounded-xl bg-red-950/40 border border-red-500/35 text-xs text-red-200"
              >
                {genError}
              </p>
            )}

            <button
              type="submit"
              disabled={generating || !onCreateModelPixCharge}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 cursor-pointer"
            >
              {generating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <QrCode className="w-4 h-4" />
              )}
              <span>
                {generating
                  ? 'Gerando QR Code e Copia e Cola...'
                  : `Gerar QR Code Dinâmico · ${BRL_FORMATTER.format(
                      liveBreakdown.totalAmountCents / 100
                    )}`}
              </span>
            </button>
          </form>

          {/* Generated QR Code & Copia e Cola Display */}
          <div className="lg:col-span-5 p-5 rounded-xl bg-[#0B060F]/90 border border-[#38BDF8]/30 flex flex-col items-center justify-center min-h-[340px]">
            {generatedCharge ? (
              <div className="w-full space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] text-[#38BDF8] font-medium">
                      TXID: {generatedCharge.txid}
                    </p>
                    <h4 className="text-sm font-semibold text-[#FAF4F7] truncate">
                      {generatedCharge.description}
                    </h4>
                    <p className="text-[11px] text-[#C9BAC4]">
                      {generatedCharge.userName} · Vencimento:{' '}
                      {formatBrDate(generatedCharge.dueDate)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono tabular-nums text-lg font-bold text-[#38BDF8]">
                      {BRL_FORMATTER.format(generatedCharge.amountCents / 100)}
                    </p>
                    {generatedCharge.daysOverdue ? (
                      <p className="text-[11px] font-mono tabular-nums text-[#FCD34D]">
                        +{generatedCharge.daysOverdue}d atraso
                      </p>
                    ) : (
                      <p className="text-[11px] text-[#86EFAC] inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Ativo</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="p-3 rounded-2xl bg-white">
                    <img
                      src={generatedCharge.qrCodeDataUrl}
                      alt={`QR Code PIX Dinâmico no valor de ${BRL_FORMATTER.format(
                        generatedCharge.amountCents / 100
                      )}`}
                      className="w-44 h-44 object-contain"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="generated-brcode-copy"
                    className="block text-[11px] font-medium text-[#C9BAC4]"
                  >
                    PIX Copia e Cola (EMV Dinâmico):
                  </label>
                  <input
                    id="generated-brcode-copy"
                    type="text"
                    readOnly
                    value={generatedCharge.brCode}
                    onFocus={(e) => e.currentTarget.select()}
                    className="w-full bg-[#150D1D] border border-[#818CF8]/25 rounded-xl px-3 py-2 text-[11px] font-mono text-[#E2E8F0] focus:outline-none focus:border-[#38BDF8]"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleCopyPixCode(generatedCharge.brCode)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl bg-[#131C42] border border-[#38BDF8]/40 text-[#F8FAFC] hover:border-[#38BDF8] transition-colors cursor-pointer"
                    >
                      {copiedCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-[#86EFAC]" />
                          <span className="text-[#86EFAC]">Código Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-[#38BDF8]" />
                          <span>Copiar Copia e Cola</span>
                        </>
                      )}
                    </button>

                    <a
                      href={whatsappShareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl bg-[#16A34A]/20 border border-[#16A34A]/45 text-[#DCFCE7] hover:bg-[#16A34A]/30 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 text-[#86EFAC]" />
                      <span>Enviar no WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-2.5 max-w-xs">
                <div className="w-12 h-12 rounded-2xl bg-[#150D1D] border border-[#38BDF8]/25 flex items-center justify-center mx-auto">
                  <QrCode className="w-6 h-6 text-[#38BDF8]" />
                </div>
                <p className="text-sm font-medium text-[#FAF4F7]">
                  Pronto para gerar seu QR Code Dinâmico
                </p>
                <p className="text-xs text-[#938291] leading-relaxed">
                  Defina valor, vencimento, multa e juros ao lado para gerar na hora o QR Code oficial e o código Pix Copia e Cola para enviar ao pagador.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
