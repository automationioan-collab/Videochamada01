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
            className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A46B] ${
              filled
                ? 'bg-[#C9A46B]/15 border-[#C9A46B]/60 text-[#C9A46B]'
                : 'bg-[#0E1014] border-white/10 text-[#6F7685] hover:border-white/25 hover:text-[#C8CCD4]'
            }`}
          >
            <Star
              className={`w-5 h-5 transition-transform ${
                filled ? 'fill-[#C9A46B] text-[#C9A46B] scale-105' : ''
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

  // Per-row inline rating state for unrated calls in the visitor history list
  const [inlineDraftId, setInlineDraftId] = useState<string | null>(null);
  const [inlineRating, setInlineRating] = useState<number>(5);
  const [inlineHover, setInlineHover] = useState<number>(0);
  const [inlineComment, setInlineComment] = useState<string>('');
  const [savingInlineId, setSavingInlineId] = useState<string | null>(null);

  const matchedEndedRecord = useMemo(() => {
    if (!endedSession) return null;
    return callHistory.find((r) => r.callId === endedSession.callId) ?? null;
  }, [callHistory, endedSession]);

  // Reset form when a brand-new endedSession starts
  useEffect(() => {
    if (endedSession) {
      setSelectedRating(5);
      setHoverRating(0);
      setComment('');
      setPendingFlush(null);
    }
  }, [endedSession?.callId]);

  // Auto-flush rating once the Firestore callHistory record lands after call completion
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
      // History record is still syncing from model/server; queue flush
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
          className="bg-[#13151A] border border-[#C9A46B]/35 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-[#C9A46B]">
                Avaliação pós-chamada
              </p>
              <h2
                id="post-call-rating-title"
                className="font-display text-2xl font-semibold text-[#F3EFE6]"
              >
                Como foi sua videochamada com {endedSession.partnerName || modelName}?
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#9BA1AE]">
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
                className="p-2 rounded-lg bg-[#0E1014] border border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6] transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {matchedEndedRecord?.rating ? (
            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                            ? 'fill-[#C9A46B] text-[#C9A46B]'
                            : 'text-[#4B5262]'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-mono tabular-nums text-[#E2C799]">
                    {matchedEndedRecord.rating}/5
                  </span>
                </div>
                {matchedEndedRecord.ratingComment && (
                  <p className="text-xs text-[#C8CCD4] max-w-2xl">
                    "{matchedEndedRecord.ratingComment}"
                  </p>
                )}
              </div>

              {onDismissEndedSession && (
                <button
                  type="button"
                  onClick={onDismissEndedSession}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                  <span className="text-xs font-medium text-[#E2C799]">
                    {RATING_LABELS[hoverRating > 0 ? hoverRating : selectedRating]}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="post-call-rating-comment"
                    className="text-xs font-medium text-[#9BA1AE]"
                  >
                    Comentário sobre vídeo, áudio e atendimento (opcional)
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-[#727988]">
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
                  className="w-full bg-[#0E1014] border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-[#F3EFE6] placeholder-[#6F7685] focus:outline-none focus:border-[#C9A46B] resize-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[11px] text-[#9BA1AE]">
                  {pendingFlush
                    ? 'Sincronizando registro da sessão no Firebase...'
                    : 'Sua nota é vinculada ao registro finalizado da chamada.'}
                </p>

                <div className="flex items-center gap-2.5 shrink-0">
                  {onDismissEndedSession && (
                    <button
                      type="button"
                      onClick={onDismissEndedSession}
                      className="px-4 py-2 text-xs font-medium rounded-lg bg-[#161920] border border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Avaliar Depois
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submitting || selectedRating < 1}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
          className="bg-[#13151A] border border-white/10 rounded-xl overflow-hidden"
        >
          <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2
                id="visitor-ratings-history-title"
                className="font-display text-xl font-semibold text-[#F3EFE6]"
              >
                Avaliações das suas Videochamadas
              </h2>
              <p className="text-xs text-[#9BA1AE]">
                Avalie a qualidade das sessões concluídas ou consulte as notas registradas.
              </p>
            </div>

            {averageScore !== null && (
              <div className="text-left sm:text-right">
                <p className="text-xs text-[#9BA1AE]">Sua média enviada</p>
                <p className="text-sm font-mono tabular-nums font-semibold text-[#E2C799]">
                  {averageScore.toFixed(1)} / 5 ({ratedRecords.length}{' '}
                  {ratedRecords.length === 1 ? 'avaliação' : 'avaliações'})
                </p>
              </div>
            )}
          </div>

          {callHistory.length === 0 ? (
            <div className="p-8 text-center space-y-1.5">
              <p className="text-sm font-medium text-[#F3EFE6]">
                Nenhuma videochamada concluída registrada ainda.
              </p>
              <p className="text-xs text-[#9BA1AE]">
                Assim que encerrar uma chamada com {modelName}, o formulário de avaliação ficará disponível aqui automaticamente.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {unratedRecords.map((record) => {
                const isEditing = inlineDraftId === record.id;
                const isSaving = savingInlineId === record.id;
                return (
                  <div key={record.id} className="p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-[#F3EFE6]">
                          {record.planName || `Videochamada com ${modelName}`}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#9BA1AE]">
                          <span className="font-mono tabular-nums">
                            {formatRecordDate(record)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDurationClock(record.durationSeconds)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums text-[#E2C799]">
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
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5 fill-[#0B0C0F]" />
                          <span>Avaliar Chamada</span>
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <form
                        onSubmit={(e) => void handleInlineSubmit(e, record.id)}
                        className="pt-3 border-t border-white/10 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <StarSelector
                            value={inlineRating}
                            hoverValue={inlineHover}
                            onChange={setInlineRating}
                            onHover={setInlineHover}
                            label={`Avaliar chamada de ${formatRecordDate(record)}`}
                          />
                          <span className="text-xs text-[#E2C799]">
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
                            className="flex-1 bg-[#0E1014] border border-white/10 rounded-lg px-3.5 py-2 text-sm text-[#F3EFE6] placeholder-[#6F7685] focus:outline-none focus:border-[#C9A46B]"
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => setInlineDraftId(null)}
                              className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[#161920] border border-white/10 text-[#9BA1AE] hover:text-[#F3EFE6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="submit"
                              disabled={isSaving}
                              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
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
                    <p className="text-sm font-medium text-[#F3EFE6]">
                      {record.planName || `Videochamada com ${modelName}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#9BA1AE]">
                      <span className="font-mono tabular-nums">
                        {formatRecordDate(record)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatDurationClock(record.durationSeconds)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums text-[#E2C799]">
                        {BRL_FORMATTER.format(record.amountCents / 100)}
                      </span>
                    </div>
                    {record.ratingComment && (
                      <p className="text-xs text-[#C8CCD4] pt-0.5">
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
                              ? 'fill-[#C9A46B] text-[#C9A46B]'
                              : 'text-[#3C4250]'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs font-mono tabular-nums text-[#E2C799]">
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
