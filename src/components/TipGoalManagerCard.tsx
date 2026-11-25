import React, { useEffect, useState } from 'react';
import { CheckCircle2, Gift, RotateCcw, Target, Users } from 'lucide-react';
import type { StudioState, StudioStateUpdatePatch } from '../types/studio';

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

interface TipGoalManagerCardProps {
  studioState: StudioState | null;
  modelName: string;
  onUpdateStudioState: (patch: StudioStateUpdatePatch) => Promise<void>;
}

export const TipGoalManagerCard: React.FC<TipGoalManagerCardProps> = ({
  studioState,
  modelName,
  onUpdateStudioState,
}) => {
  const [enabled, setEnabled] = useState<boolean>(
    Boolean(studioState?.tipGoalEnabled)
  );
  const [title, setTitle] = useState<string>(
    studioState?.tipGoalTitle || 'Meta Especial do Estúdio'
  );
  const [description, setDescription] = useState<string>(
    studioState?.tipGoalDescription || ''
  );
  const [targetReais, setTargetReais] = useState<string>(
    ((studioState?.tipGoalTargetCents || 30000) / 100).toFixed(2)
  );
  const [currentReais, setCurrentReais] = useState<string>(
    ((studioState?.tipGoalCurrentCents || 0) / 100).toFixed(2)
  );
  const [rewardText, setRewardText] = useState<string>(
    studioState?.tipGoalRewardText || ''
  );
  const [saving, setSaving] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setEnabled(Boolean(studioState?.tipGoalEnabled));
    setTitle(studioState?.tipGoalTitle || 'Meta Especial do Estúdio');
    setDescription(studioState?.tipGoalDescription || '');
    setTargetReais(
      ((studioState?.tipGoalTargetCents || 30000) / 100).toFixed(2)
    );
    setCurrentReais(((studioState?.tipGoalCurrentCents || 0) / 100).toFixed(2));
    setRewardText(studioState?.tipGoalRewardText || '');
    setStatusFeedback(null);
  }, [
    modelName,
    studioState?.tipGoalEnabled,
    studioState?.tipGoalTitle,
    studioState?.tipGoalDescription,
    studioState?.tipGoalTargetCents,
    studioState?.tipGoalCurrentCents,
    studioState?.tipGoalRewardText,
  ]);

  const parsedTargetCents = Math.max(
    500,
    Math.round((Number(targetReais.replace(',', '.')) || 0) * 100)
  );
  const parsedCurrentCents = Math.max(
    0,
    Math.round((Number(currentReais.replace(',', '.')) || 0) * 100)
  );
  const pct =
    parsedTargetCents > 0
      ? Math.min(100, Math.round((parsedCurrentCents / parsedTargetCents) * 100))
      : 0;
  const remainingCents = Math.max(0, parsedTargetCents - parsedCurrentCents);
  const contributorsCount = studioState?.tipGoalContributorsCount || 0;

  const handleToggleEnabled = async () => {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    setSaving(true);
    setStatusFeedback(null);
    try {
      await onUpdateStudioState({
        tipGoalEnabled: nextEnabled,
        tipGoalTitle: title.trim() || 'Meta Especial do Estúdio',
        tipGoalDescription: description.trim(),
        tipGoalTargetCents: parsedTargetCents,
        tipGoalCurrentCents: parsedCurrentCents,
        tipGoalRewardText: rewardText.trim(),
      });
      setStatusFeedback({
        type: 'success',
        text: nextEnabled
          ? 'Meta de Gorjeta ativada e exibida em tempo real para os internautas.'
          : 'Meta de Gorjeta ocultada da tela dos internautas.',
      });
    } catch {
      setStatusFeedback({
        type: 'error',
        text: 'Não foi possível atualizar o status da Meta de Gorjeta.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawTarget = Number(targetReais.replace(',', '.'));
    if (!Number.isFinite(rawTarget) || rawTarget < 5) {
      setStatusFeedback({
        type: 'error',
        text: 'Defina um objetivo financeiro mínimo de R$ 5,00.',
      });
      return;
    }
    const rawCurrent = Number(currentReais.replace(',', '.'));
    if (!Number.isFinite(rawCurrent) || rawCurrent < 0) {
      setStatusFeedback({
        type: 'error',
        text: 'O valor arrecadado não pode ser negativo.',
      });
      return;
    }

    setSaving(true);
    setStatusFeedback(null);
    try {
      await onUpdateStudioState({
        tipGoalEnabled: enabled,
        tipGoalTitle: title.trim() || 'Meta Especial do Estúdio',
        tipGoalDescription: description.trim(),
        tipGoalTargetCents: Math.round(rawTarget * 100),
        tipGoalCurrentCents: Math.round(rawCurrent * 100),
        tipGoalRewardText: rewardText.trim(),
      });
      setStatusFeedback({
        type: 'success',
        text: 'Meta de Gorjeta salva e sincronizada em tempo real com todos os internautas.',
      });
    } catch {
      setStatusFeedback({
        type: 'error',
        text: 'Erro ao salvar a Meta de Gorjeta.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetProgress = async () => {
    setSaving(true);
    setStatusFeedback(null);
    try {
      setCurrentReais('0.00');
      await onUpdateStudioState({
        tipGoalCurrentCents: 0,
        tipGoalContributorsCount: 0,
        tipGoalLastTipName: '',
        tipGoalLastTipAmountCents: 0,
      });
      setStatusFeedback({
        type: 'success',
        text: 'Progresso da Meta de Gorjeta zerado em tempo real.',
      });
    } catch {
      setStatusFeedback({
        type: 'error',
        text: 'Não foi possível zerar o progresso agora.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="meta-gorjeta-manager-heading"
      className="luxury-card border border-[#F4C2D7]/20 rounded-2xl p-6 space-y-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#F4C2D7]/15">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-[#F4C2D7]">
            <Target className="w-4 h-4 shrink-0" />
            <span>Meta de Gorjeta · {modelName}</span>
          </div>
          <h3
            id="meta-gorjeta-manager-heading"
            className="font-display text-2xl font-semibold text-[#FAF4F7]"
          >
            Objetivo Financeiro ao Vivo
          </h3>
          <p className="text-xs text-[#C9BAC4]">
            Defina uma meta financeira e acompanhe o progresso exibido em tempo
            real na tela pública, recepção e videochamada dos internautas.
          </p>
        </div>

        <button
          type="button"
          aria-pressed={enabled}
          disabled={saving}
          onClick={() => void handleToggleEnabled()}
          className={`px-4 py-2 text-xs font-semibold rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 ${
            enabled
              ? 'bg-[#16A34A]/15 border-[#16A34A]/50 text-[#86EFAC]'
              : 'bg-[#1A1024] border-[#F4C2D7]/25 text-[#C9BAC4] hover:border-[#F4C2D7]/60'
          }`}
        >
          {enabled ? 'Visível para Internautas' : 'Meta Oculta (Ativar)'}
        </button>
      </div>

      {/* Live Preview Progress Bar */}
      <div className="rounded-xl bg-[#0B060F]/85 border border-[#F4C2D7]/15 p-4 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <p className="text-sm font-semibold text-[#FAF4F7]">
              {title.trim() || 'Meta Especial do Estúdio'}
            </p>
            {description.trim() && (
              <p className="text-xs text-[#C9BAC4] leading-relaxed">
                {description.trim()}
              </p>
            )}
          </div>
          <span className="font-mono text-xs font-semibold tabular-nums text-[#F4C2D7]">
            {BRL_FORMATTER.format(parsedCurrentCents / 100)} /{' '}
            {BRL_FORMATTER.format(parsedTargetCents / 100)} · {pct}%
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-3 w-full rounded-full bg-[#1A1024] border border-[#F4C2D7]/15 overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#E7A6C2] via-[#F4C2D7] to-[#FCE2EC] transition-all duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#C9BAC4]">
          <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
            <Users className="w-3.5 h-3.5 text-[#F4C2D7]" />
            <span>
              {contributorsCount}{' '}
              {contributorsCount === 1 ? 'contribuição' : 'contribuições'}
            </span>
            {studioState?.tipGoalLastTipName &&
            (studioState?.tipGoalLastTipAmountCents || 0) > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Última: {studioState.tipGoalLastTipName} (
                  {BRL_FORMATTER.format(
                    (studioState.tipGoalLastTipAmountCents || 0) / 100
                  )}
                  )
                </span>
              </>
            ) : null}
          </span>

          <span className="font-mono tabular-nums text-[#F4C2D7]">
            {remainingCents === 0
              ? 'Meta 100% alcançada!'
              : `Faltam ${BRL_FORMATTER.format(remainingCents / 100)}`}
          </span>
        </div>
      </div>

      {/* Form Controls */}
      <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-6 space-y-1.5">
            <label
              htmlFor="tip-goal-title"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Título da Meta
            </label>
            <input
              id="tip-goal-title"
              type="text"
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Meta para ensaio exclusivo"
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
            />
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <label
              htmlFor="tip-goal-target"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Valor Alvo (R$)
            </label>
            <input
              id="tip-goal-target"
              type="number"
              min="5"
              step="1"
              value={targetReais}
              onChange={(e) => setTargetReais(e.target.value)}
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
            />
          </div>

          <div className="md:col-span-3 space-y-1.5">
            <label
              htmlFor="tip-goal-current"
              className="block text-xs font-medium text-[#C9BAC4]"
            >
              Arrecadado Atual (R$)
            </label>
            <input
              id="tip-goal-current"
              type="number"
              min="0"
              step="1"
              value={currentReais}
              onChange={(e) => setCurrentReais(e.target.value)}
              className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm font-mono tabular-nums text-[#FAF4F7] focus:outline-none focus:border-[#F4C2D7]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="tip-goal-description"
            className="block text-xs font-medium text-[#C9BAC4]"
          >
            Descrição da Meta para os Visitantes
          </label>
          <textarea
            id="tip-goal-description"
            rows={3}
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva o objetivo desta meta para os internautas (ex.: Ao atingir o valor alvo, realizarei um ensaio temático exclusivo ao vivo...)"
            className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7] resize-y"
          />
          <p className="text-[11px] font-mono tabular-nums text-[#938291] text-right">
            {description.length}/300
          </p>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="tip-goal-reward"
            className="flex items-center gap-1.5 text-xs font-medium text-[#C9BAC4]"
          >
            <Gift className="w-3.5 h-3.5 text-[#F4C2D7]" />
            <span>Recompensa ou agradecimento ao atingir a meta (opcional)</span>
          </label>
          <input
            id="tip-goal-reward"
            type="text"
            maxLength={140}
            value={rewardText}
            onChange={(e) => setRewardText(e.target.value)}
            placeholder="Ex.: Libero foto nova exclusiva no estúdio ao bater 100%"
            className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] placeholder:text-[#938291] focus:outline-none focus:border-[#F4C2D7]"
          />
        </div>

        {statusFeedback && (
          <div
            role={statusFeedback.type === 'error' ? 'alert' : 'status'}
            className={`p-3 rounded-xl text-xs border flex items-center gap-2 ${
              statusFeedback.type === 'error'
                ? 'bg-red-950/40 border-red-500/35 text-red-200'
                : 'bg-[#16A34A]/15 border-[#16A34A]/40 text-[#86EFAC]'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusFeedback.text}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleResetProgress()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] hover:border-[#F4C2D7]/50 transition-colors cursor-pointer disabled:opacity-45"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Zerar Progresso</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <Target className="w-3.5 h-3.5" />
            <span>{saving ? 'Salvando...' : 'Salvar e Atualizar Meta'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
