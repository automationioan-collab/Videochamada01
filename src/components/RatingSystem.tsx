import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Star, X } from 'lucide-react';
import type { CallHistoryRecord } from '../types/studio';

export interface EndedSessionContext {
  callId: string;
  partnerName: string;
  planName?: string;
  durationSeconds?: number;
}

interface RatingSystemProps {
  callHistory: CallHistoryRecord[];
  endedSession: EndedSessionContext | null;
  modelName: string;
  showHistoryList?: boolean;
  onSubmitRating: (
    recordId: string,
    rating: number,
    comment?: string
  ) => Promise<void>;
  onDismissEndedSession?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Qualidade abaixo do esperado',
  2: 'Qualidade regular',
  3: 'Boa qualidade de sessão',
  4: 'Muito boa · Imagem e áudio claros',
  5: 'Excelente · Experiência impecável',
};

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatDurationClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = (totalSeconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatRecordDate(record: CallHistoryRecord): string {
  const d = record.endedAt?.toDate?.() ?? record.createdAt?.toDate?.();
  if (!d) return 'Recente';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

interface StarSelectorProps {
  value: number;
  hoverValue: number;
  onChange: (score: number) => void;
  onHover: (score: number) => void;
  label?: string;
}

const StarSelector: React.FC<StarSelectorProps> = ({
  value,
  hoverValue,
  onChange,
  onHover,
  label = 'Avaliação da qualidade da chamada',
}) => {
  const activeScore = hoverValue > 0 ? hoverValue : value;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-1.5"
      onMouseLeave={() => onHover(0)}
    >
      {[1, 2, 3, 4, 5].map((score) => {
        const filled = score <= activeScore;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={value === score}
            aria-label={`${score} ${score === 1 ? 'estrela' : 'estrelas'}`}
            onMouseEnter={() => onHover(score)}
            onClick={() => onChange(score)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange(Math.min(5, (value || 0) + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange(Math.max(1, (value || 2) - 1));
              }
            }}
            className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4C2D7] ${
              filled
                ? 'bg-[#281837] border-[#F4C2D7] text-[#F4C2D7]'
                : 'bg-[#0B060F] border-[#F4C2D7]/20 text-[#938291] hover:border-[#F4C2D7]/45 hover:text-[#FAF4F7]'
            }`}
          >
            <Star
              className={`w-5 h-5 transition-transform ${
                filled ? 'fill-[#F4C2D7] text-[#F4C2D7] scale-105' : ''
              }`}
            />
          </button>
        );
      })}
    </div>
  );
};

export const RatingSystem: React.FC<RatingSystemProps> = ({
  callHistory,
  endedSession,
  modelName,
  showHistoryList = false,
  onSubmitRating,
  onDismissEndedSession,
}) => {
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [pendingFlush, setPendingFlush] = useState<{
    callId: string;
    rating: number;
    comment: string;
  } | null>(null);

  const [inlineDraftId, setInlineDraftId] = useState<string | null>(null);
  const [inlineRating, setInlineRating] = useState<number>(5);
  const [inlineHover, setInlineHover] = useState<number>(0);
  const [inlineComment, setInlineComment] = useState<string>('');
  const [savingInlineId, setSavingInlineId] = useState<string | null>(null);

  const matchedEndedRecord = useMemo(() => {
    if (!endedSession) return null;
    return callHistory.find((r) => r.callId === endedSession.callId) ?? null;
  }, [callHistory, endedSession]);

  useEffect(() => {
    if (endedSession) {
      setSelectedRating(5);
      setHoverRating(0);
      setComment('');
      setPendingFlush(null);
    }
  }, [endedSession?.callId]);

  useEffect(() => {
    if (!pendingFlush || !matchedEndedRecord) return;
    if (matchedEndedRecord.callId !== pendingFlush.callId) return;
    if (matchedEndedRecord.rating) {
      setPendingFlush(null);
      setSubmitting(false);
      return;
    }

    let cancelled = false;
    setSubmitting(true);
    void onSubmitRating(
      matchedEndedRecord.id,
      pendingFlush.rating,
      pendingFlush.comment
    ).finally(() => {
      if (!cancelled) {
        setPendingFlush(null);
        setSubmitting(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [matchedEndedRecord, onSubmitRating, pendingFlush]);

  const handleEndedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!endedSession || selectedRating < 1) return;

    if (!matchedEndedRecord) {
      setSubmitting(true);
      setPendingFlush({
        callId: endedSession.callId,
        rating: selectedRating,
        comment: comment.trim().slice(0, 300),
      });
      return;
    }

    if (matchedEndedRecord.rating) return;

    setSubmitting(true);
    try {
      await onSubmitRating(matchedEndedRecord.id, selectedRating, comment);
    } finally {
      setSubmitting(false);
    }
  };

  const handleInlineSubmit = async (e: React.FormEvent, recordId: string) => {
    e.preventDefault();
    if (inlineRating < 1) return;
    setSavingInlineId(recordId);
    try {
      await onSubmitRating(recordId, inlineRating, inlineComment);
      setInlineDraftId(null);
      setInlineComment('');
      setInlineRating(5);
    } finally {
      setSavingInlineId(null);
    }
  };

  const unratedRecords = useMemo(
    () =>
      callHistory.filter(
        (r) => !r.rating && (!endedSession || r.callId !== endedSession.callId)
      ),
    [callHistory, endedSession]
  );

  const ratedRecords = useMemo(
    () => callHistory.filter((r) => typeof r.rating === 'number' && r.rating > 0),
    [callHistory]
  );

  const averageScore = useMemo(() => {
    if (ratedRecords.length === 0) return null;
    const sum = ratedRecords.reduce((acc, r) => acc + (r.rating ?? 0), 0);
    return sum / ratedRecords.length;
  }, [ratedRecords]);

  return (
    <div className="space-y-6">
      {/* Post-Call Rating Card */}
      {endedSession && (
        <section
          aria-labelledby="post-call-rating-title"
          className="luxury-card border border-[#F4C2D7]/35 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#F4C2D7]">
                Avaliação pós-chamada
              </p>
              <h2
                id="post-call-rating-title"
                className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7]"
              >
                Como foi sua videochamada com {endedSession.partnerName || modelName}?
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#C9BAC4]">
                <span>{endedSession.partnerName || modelName}</span>
                {endedSession.planName && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{endedSession.planName}</span>
                  </>
                )}
                {typeof endedSession.durationSeconds === 'number' &&
                  endedSession.durationSeconds > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Duração {formatDurationClock(endedSession.durationSeconds)}
                      </span>
                    </>
                  )}
              </div>
            </div>

            {onDismissEndedSession && (
              <button
                type="button"
                onClick={onDismissEndedSession}
                aria-label="Fechar avaliação"
                className="p-2 rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {matchedEndedRecord?.rating ? (
            <div className="pt-4 border-t border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-[#86EFAC]">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Avaliação salva no seu histórico do estúdio</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= (matchedEndedRecord.rating ?? 0)
                            ? 'fill-[#F4C2D7] text-[#F4C2D7]'
                            : 'text-[#938291]/40'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                    {matchedEndedRecord.rating}/5
                  </span>
                </div>
                {matchedEndedRecord.ratingComment && (
                  <p className="text-xs text-[#C9BAC4] max-w-2xl">
                    "{matchedEndedRecord.ratingComment}"
                  </p>
                )}
              </div>

              {onDismissEndedSession && (
                <button
                  type="button"
                  onClick={onDismissEndedSession}
                  className="px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Concluir
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleEndedSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <StarSelector
                    value={selectedRating}
                    hoverValue={hoverRating}
                    onChange={setSelectedRating}
                    onHover={setHoverRating}
                  />
                  <span className="text-xs font-medium text-[#F4C2D7]">
                    {RATING_LABELS[hoverRating > 0 ? hoverRating : selectedRating]}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="post-call-rating-comment"
                    className="text-xs font-medium text-[#C9BAC4]"
                  >
                    Comentário sobre vídeo, áudio e atendimento (opcional)
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-[#938291]">
                    {comment.length}/300
                  </span>
                </div>
                <textarea
                  id="post-call-rating-comment"
                  rows={2}
                  maxLength={300}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Conte como foi a qualidade de imagem, som e conexão..."
                  className="w-full bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2.5 text-sm text-[#FAF4F7] placeholder-[#938291] focus:outline-none focus:border-[#F4C2D7] resize-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-[#C9BAC4]">
                  {pendingFlush
                    ? 'Sincronizando registro da sessão no Firebase...'
                    : 'Sua nota é vinculada ao registro finalizado da chamada.'}
                </p>

                <div className="flex items-center gap-2.5 shrink-0">
                  {onDismissEndedSession && (
                    <button
                      type="button"
                      onClick={onDismissEndedSession}
                      className="px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Avaliar Depois
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || selectedRating < 1}
                    className="px-5 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {submitting ? 'Salvando Avaliação...' : 'Enviar Avaliação'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Visitor History & Pending Ratings Section */}
      {showHistoryList && (
        <section
          aria-labelledby="visitor-ratings-history-title"
          className="luxury-card border border-[#F4C2D7]/20 rounded-2xl overflow-hidden"
        >
          <div className="p-6 border-b border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2
                id="visitor-ratings-history-title"
                className="font-display text-2xl font-semibold text-[#FAF4F7]"
              >
                Avaliações das suas Videochamadas
              </h2>
              <p className="text-xs text-[#C9BAC4]">
                Avalie a qualidade das sessões concluídas ou consulte as notas registradas.
              </p>
            </div>

            {averageScore !== null && (
              <div className="text-left sm:text-right">
                <p className="text-xs text-[#938291]">Sua média enviada</p>
                <p className="text-sm font-mono tabular-nums font-semibold text-[#F4C2D7]">
                  {averageScore.toFixed(1)} / 5 ({ratedRecords.length}{' '}
                  {ratedRecords.length === 1 ? 'avaliação' : 'avaliações'})
                </p>
              </div>
            )}
          </div>

          {callHistory.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <p className="text-sm font-medium text-[#FAF4F7]">
                Nenhuma videochamada concluída registrada ainda.
              </p>
              <p className="text-xs text-[#C9BAC4]">
                Assim que encerrar uma chamada com {modelName}, o formulário de avaliação ficará disponível aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F4C2D7]/10">
              {unratedRecords.map((record) => {
                const isEditing = inlineDraftId === record.id;
                const isSaving = savingInlineId === record.id;
                return (
                  <div key={record.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#FAF4F7]">
                          {record.planName || `Videochamada com ${modelName}`}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#C9BAC4]">
                          <span className="font-mono tabular-nums">
                            {formatRecordDate(record)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDurationClock(record.durationSeconds)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[#F4C2D7]">
                            {BRL_FORMATTER.format(record.amountCents / 100)}
                          </span>
                        </div>
                      </div>

                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setInlineDraftId(record.id);
                            setInlineRating(5);
                            setInlineHover(0);
                            setInlineComment('');
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 fill-[#190B15]" />
                          <span>Avaliar Chamada</span>
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <form
                        onSubmit={(e) => void handleInlineSubmit(e, record.id)}
                        className="pt-3 border-t border-[#F4C2D7]/15 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <StarSelector
                            value={inlineRating}
                            hoverValue={inlineHover}
                            onChange={setInlineRating}
                            onHover={setInlineHover}
                            label={`Avaliar chamada de ${formatRecordDate(record)}`}
                          />
                          <span className="text-xs text-[#F4C2D7]">
                            {RATING_LABELS[inlineHover > 0 ? inlineHover : inlineRating]}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <input
                            type="text"
                            maxLength={300}
                            value={inlineComment}
                            onChange={(e) => setInlineComment(e.target.value)}
                            placeholder="Comentário opcional sobre qualidade de vídeo/áudio..."
                            className="flex-1 bg-[#0B060F] border border-[#F4C2D7]/20 rounded-xl px-3.5 py-2 text-sm text-[#FAF4F7] placeholder-[#938291] focus:outline-none focus:border-[#F4C2D7]"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setInlineDraftId(null)}
                              className="px-4 py-2 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-[#FAF4F7] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="px-4 py-2 text-xs font-semibold rounded-full luxury-rose-cta disabled:opacity-50 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              {isSaving ? 'Salvando...' : 'Salvar Nota'}
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}

              {ratedRecords.map((record) => (
                <div
                  key={record.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-[#FAF4F7]">
                      {record.planName || `Videochamada com ${modelName}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#C9BAC4]">
                      <span className="font-mono tabular-nums">
                        {formatRecordDate(record)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDurationClock(record.durationSeconds)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-[#F4C2D7]">
                        {BRL_FORMATTER.format(record.amountCents / 100)}
                      </span>
                    </div>
                    {record.ratingComment && (
                      <p className="text-xs text-[#C9BAC4] pt-0.5">
                        "{record.ratingComment}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      className="flex items-center gap-1"
                      aria-label={`Nota ${record.rating} de 5`}
                    >
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-4 h-4 ${
                            star <= (record.rating ?? 0)
                              ? 'fill-[#F4C2D7] text-[#F4C2D7]'
                              : 'text-[#938291]/40'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                      {record.rating}/5
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
