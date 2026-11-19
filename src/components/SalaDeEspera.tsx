import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  Clock,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import { DEFAULT_STUDIO_CONFIG } from '../lib/studioDefaults';
import { TechSpotlightCard } from './TechEffects';
import type {
  CallRequest,
  QueueWaitSummary,
  StudioState,
} from '../types/studio';

interface SalaDeEsperaProps {
  request: CallRequest;
  modelName: string;
  modelAvatarUrl?: string;
  loungeImageUrl?: string;
  modelOnline: boolean;
  studioState: StudioState | null;
  queueSummary: QueueWaitSummary;
  wsConnected: boolean;
  localStream: MediaStream | null;
  micEnabled: boolean;
  camEnabled: boolean;
  mediaError?: string | null;
  onAcquireMedia: () => Promise<MediaStream | null>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEnterAcceptedCall: (req: CallRequest) => void;
  onCancelRequest: (requestId: string) => Promise<void>;
}

const BRL_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatReadableDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe < 60) {
    return `${safe}s`;
  }
  const mins = Math.ceil(safe / 60);
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}min` : `${hours}h`;
}

export const SalaDeEspera: React.FC<SalaDeEsperaProps> = ({
  request,
  modelName,
  modelAvatarUrl,
  loungeImageUrl,
  modelOnline,
  studioState,
  queueSummary,
  wsConnected,
  localStream,
  micEnabled,
  camEnabled,
  mediaError,
  onAcquireMedia,
  onToggleMic,
  onToggleCam,
  onEnterAcceptedCall,
  onCancelRequest,
}) => {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [loungeFailed, setLoungeFailed] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [baselineTotalSeconds, setBaselineTotalSeconds] = useState<number>(45);

  const isAccepted = request.status === 'accepted';
  const hasServerQueue = queueSummary.updatedAtMs > 0;
  const effectivePosition =
    queueSummary.myPosition > 0 ? queueSummary.myPosition : 1;
  const effectiveAheadCount =
    queueSummary.myPosition > 0 ? queueSummary.aheadCount : 0;
  const totalInQueue = Math.max(queueSummary.totalWaiting, effectivePosition);

  const hasActiveStudioCall =
    Boolean(studioState?.activeCallId) ||
    queueSummary.activeCallRemainingSeconds > 0;

  // Baseline seconds from latest server queue sync or fallback initial approval window
  const rawEstimateSeconds = useMemo(() => {
    if (isAccepted) return 0;
    if (hasServerQueue && queueSummary.myPosition > 0) {
      return Math.max(0, queueSummary.totalEstimatedWaitSeconds);
    }
    const baseWait = hasActiveStudioCall ? 240 : 45;
    const createdMs = request.createdAt?.toMillis?.() ?? Date.now();
    const elapsedSinceCreate = Math.max(
      0,
      Math.round((Date.now() - createdMs) / 1000)
    );
    return Math.max(0, baseWait - elapsedSinceCreate);
  }, [
    hasActiveStudioCall,
    hasServerQueue,
    isAccepted,
    queueSummary.myPosition,
    queueSummary.totalEstimatedWaitSeconds,
    request.createdAt,
  ]);

  const anchorMs = hasServerQueue
    ? queueSummary.updatedAtMs
    : request.createdAt?.toMillis?.() ?? nowMs;

  useEffect(() => {
    setBaselineTotalSeconds((prev) => Math.max(prev, rawEstimateSeconds, 45));
  }, [rawEstimateSeconds, request.id]);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = localStream;
    }
  }, [localStream, camEnabled]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [modelAvatarUrl]);

  useEffect(() => {
    setLoungeFailed(false);
  }, [loungeImageUrl]);

  const elapsedSinceSync = Math.max(0, Math.floor((nowMs - anchorMs) / 1000));
  const remainingWaitSeconds = isAccepted
    ? 0
    : Math.max(0, rawEstimateSeconds - elapsedSinceSync);

  const estimatedStartTimeLabel = useMemo(() => {
    if (isAccepted) return 'Agora';
    if (remainingWaitSeconds <= 10) return 'Em instantes';
    const target = new Date(nowMs + remainingWaitSeconds * 1000);
    return `~${new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(target)}`;
  }, [isAccepted, nowMs, remainingWaitSeconds]);

  const progressRatio = useMemo(() => {
    if (isAccepted) return 1;
    const denom = Math.max(45, baselineTotalSeconds);
    const done = Math.max(0, denom - remainingWaitSeconds);
    return Math.min(0.98, Math.max(0.06, done / denom));
  }, [baselineTotalSeconds, isAccepted, remainingWaitSeconds]);

  const ringRadius = 56;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressRatio);

  const visibleAheadSlots = Math.min(3, effectiveAheadCount);
  const hiddenAheadCount = Math.max(0, effectiveAheadCount - visibleAheadSlots);

  const avatarSrc = modelAvatarUrl || DEFAULT_STUDIO_CONFIG.modelAvatarUrl;
  const loungeSrc = loungeImageUrl || DEFAULT_STUDIO_CONFIG.loungeImageUrl;

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
      await onCancelRequest(request.id);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      aria-label="Sala de Espera da Videochamada"
      className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
    >
      {/* Left Column: Visual Countdown, Queue Pipeline & Controls */}
      <TechSpotlightCard className="lg:col-span-7 luxury-card border border-[#F4C2D7]/25 rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
        <div className="space-y-6">
          {/* Top Model Context Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#F4C2D7]/15">
            <div className="flex items-center gap-3.5 min-w-0">
              {!avatarFailed && avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={modelName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-12 h-12 rounded-full object-cover border border-[#F4C2D7]/35 shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-[#21142D] flex items-center justify-center font-display text-xl text-[#F4C2D7] shrink-0">
                  {modelName.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#F4C2D7]">
                  {isAccepted
                    ? 'Sua vez chegou · Chamada Liberada'
                    : 'Sala de Espera · Fila em Tempo Real'}
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold text-[#FAF4F7] truncate">
                  {isAccepted ? (
                    <>
                      Conectando com{' '}
                      <span className="italic text-[#F4C2D7]">{modelName}</span>
                    </>
                  ) : (
                    <>
                      Aguardando{' '}
                      <span className="italic text-[#F4C2D7]">{modelName}</span>
                    </>
                  )}
                </h2>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0 space-y-0.5">
              <p className="text-xs font-mono tabular-nums text-[#FAF4F7]">
                {modelOnline ? 'Modelo online no estúdio' : 'Recepção ativa'}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-[#938291]">
                {totalInQueue} na fila · Posição {effectivePosition}º
              </p>
            </div>
          </div>

          {/* Focal Countdown Ring + Live Queue Metrics */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#0B060F] border border-[#F4C2D7]/20 flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
              <svg
                viewBox="0 0 132 132"
                className="w-full h-full -rotate-90"
                aria-hidden="true"
              >
                <circle
                  cx="66"
                  cy="66"
                  r={ringRadius}
                  fill="none"
                  stroke="#281837"
                  strokeWidth="6"
                />
                <circle
                  cx="66"
                  cy="66"
                  r={ringRadius}
                  fill="none"
                  stroke={isAccepted ? '#86EFAC' : '#F4C2D7'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCircumference}
                  strokeDashoffset={ringOffset}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                <span className="text-[10px] font-medium text-[#938291]">
                  {isAccepted ? 'Status' : 'Espera est.'}
                </span>
                <span className="text-2xl font-semibold font-mono tabular-nums text-[#FAF4F7]">
                  {isAccepted
                    ? '00:00'
                    : formatCountdown(remainingWaitSeconds)}
                </span>
                <span className="text-[10px] font-mono tabular-nums text-[#F4C2D7]">
                  {isAccepted
                    ? 'Liberado'
                    : remainingWaitSeconds === 0
                      ? 'Sua vez'
                      : estimatedStartTimeLabel}
                </span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#FAF4F7]">
                  {isAccepted
                    ? `${modelName} aceitou sua videochamada`
                    : effectiveAheadCount > 0
                      ? `${effectiveAheadCount} ${
                          effectiveAheadCount === 1
                            ? 'internauta na sua frente'
                            : 'internautas na sua frente'
                        }`
                      : hasActiveStudioCall
                        ? 'Atendimento em andamento na cabine'
                        : remainingWaitSeconds > 0
                          ? 'Você é o próximo da fila'
                          : 'Aguardando confirmação final da modelo'}
                </p>
                <p className="text-xs text-[#C9BAC4] leading-relaxed">
                  {isAccepted
                    ? 'Sua sala exclusiva está pronta. Clique no botão abaixo para abrir o vídeo imediatamente.'
                    : hasActiveStudioCall || effectiveAheadCount > 0
                      ? 'A contagem regressiva é atualizada automaticamente conforme a chamada atual e os atendimentos anteriores avançam.'
                      : 'Sua solicitação foi notificada ao painel da modelo. Mantenha esta janela aberta para entrar assim que ela aceitar.'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#F4C2D7]/15">
                <div>
                  <p className="text-[11px] text-[#938291]">Sua posição</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-[#F4C2D7]">
                    {isAccepted ? 'Agora' : `${effectivePosition}º lugar`}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#938291]">Na fila agora</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-[#FAF4F7]">
                    {totalInQueue}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-[#938291]">Início prev.</p>
                  <p className="text-base font-semibold font-mono tabular-nums text-[#FAF4F7]">
                    {estimatedStartTimeLabel}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Visual Queue Pipeline (Zero PII) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#C9BAC4] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>Progresso visual da fila atual</span>
              </span>
              <span className="text-[11px] font-mono tabular-nums text-[#938291]">
                {hasActiveStudioCall && queueSummary.activeCallRemainingSeconds > 0
                  ? `Cabine: ~${formatReadableDuration(queueSummary.activeCallRemainingSeconds)}`
                  : hasActiveStudioCall
                    ? 'Cabine ocupada'
                    : 'Cabine disponível'}
                {effectiveAheadCount > 0 &&
                  queueSummary.aheadQueueSeconds > 0 &&
                  ` · Fila à frente: ~${formatReadableDuration(queueSummary.aheadQueueSeconds)}`}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/15 flex items-center gap-2 overflow-x-auto">
              {/* Step 1: Active Studio Booth */}
              <div
                className={`px-3 py-2 rounded-lg border text-xs shrink-0 flex items-center gap-2 ${
                  hasActiveStudioCall
                    ? 'bg-[#21142D] border-[#F4C2D7]/35 text-[#FAF4F7]'
                    : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#C9BAC4]'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span className="whitespace-nowrap">
                  {hasActiveStudioCall ? 'Chamada em curso' : 'Cabine pronta'}
                </span>
              </div>

              <span aria-hidden="true" className="text-[#938291] text-xs shrink-0">
                →
              </span>

              {/* Ahead Anonymous Queue Slots */}
              {Array.from({ length: visibleAheadSlots }).map((_, idx) => (
                <React.Fragment key={`ahead_${idx}`}>
                  <div className="px-3 py-2 rounded-lg bg-[#1A1024] border border-[#F4C2D7]/15 text-xs text-[#C9BAC4] font-mono tabular-nums shrink-0 whitespace-nowrap">
                    {idx + 1}º na fila
                  </div>
                  <span aria-hidden="true" className="text-[#938291] text-xs shrink-0">
                    →
                  </span>
                </React.Fragment>
              ))}

              {hiddenAheadCount > 0 && (
                <>
                  <div className="px-3 py-2 rounded-lg bg-[#1A1024] border border-[#F4C2D7]/15 text-xs text-[#C9BAC4] font-mono tabular-nums shrink-0 whitespace-nowrap">
                    +{hiddenAheadCount} à frente
                  </div>
                  <span aria-hidden="true" className="text-[#938291] text-xs shrink-0">
                    →
                  </span>
                </>
              )}

              {/* Visitor's Highlighted Slot */}
              <div className="px-3.5 py-2 rounded-lg bg-[#281837] border border-[#F4C2D7] text-xs font-semibold text-[#FAF4F7] shrink-0 flex items-center gap-2 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-[#F4C2D7]" />
                <span>
                  Você · {isAccepted ? 'Pronto' : `${effectivePosition}º`}
                </span>
              </div>

              <span aria-hidden="true" className="text-[#938291] text-xs shrink-0">
                →
              </span>

              {/* Destination Node */}
              <div
                className={`px-3 py-2 rounded-lg border text-xs shrink-0 whitespace-nowrap ${
                  isAccepted
                    ? 'bg-[#16A34A]/20 border-[#16A34A]/50 text-[#86EFAC] font-medium'
                    : 'bg-[#150D1D] border-[#F4C2D7]/15 text-[#938291]'
                }`}
              >
                Início do Vídeo
              </div>
            </div>
          </div>

          {/* Plan Summary Strip */}
          <div className="p-4 rounded-xl bg-[#0B060F] border border-[#F4C2D7]/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs text-[#938291]">Sessão reservada</p>
              <p className="text-sm font-medium text-[#FAF4F7] truncate">
                {request.topic}
              </p>
            </div>
            {request.planName && typeof request.planPriceCents === 'number' && (
              <div className="text-left sm:text-right shrink-0">
                <p className="text-xs font-mono tabular-nums text-[#F4C2D7]">
                  {request.planName} ·{' '}
                  {BRL_FORMATTER.format(request.planPriceCents / 100)}
                </p>
                <p className="text-[11px] text-[#C9BAC4]">
                  Pré-autorizado · Cobrado ao conectar
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {isAccepted ? (
            <button
              type="button"
              onClick={() => onEnterAcceptedCall(request)}
              className="inline-flex items-center gap-2.5 px-6 py-3 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FAF4F7]"
            >
              <Video className="w-4 h-4" />
              <span>Entrar na Videochamada Agora</span>
            </button>
          ) : (
            <p className="text-xs text-[#C9BAC4]">
              Aviso sonoro e alerta visual serão exibidos assim que {modelName}{' '}
              liberar sua entrada.
            </p>
          )}

          {request.status === 'waiting' && (
            <button
              type="button"
              disabled={cancelling}
              onClick={() => void handleCancel()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-full bg-[#1A1024] border border-[#F4C2D7]/20 text-[#C9BAC4] hover:text-red-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>
                {cancelling ? 'Cancelando...' : 'Cancelar e Sair da Fila'}
              </span>
            </button>
          )}
        </div>
      </TechSpotlightCard>

      {/* Right Column: Pre-Call Camera & Audio Booth */}
      <aside className="lg:col-span-5 luxury-card border border-[#F4C2D7]/25 rounded-2xl overflow-hidden flex flex-col justify-between shadow-[0_18px_45px_-20px_rgba(192,98,162,0.28)]">
        <div
          data-protected-media="true"
          onContextMenu={(e) => e.preventDefault()}
          className="relative tech-reticle aspect-video lg:aspect-auto lg:flex-1 min-h-[240px] bg-[#0B060F] overflow-hidden select-none"
        >
          {localStream && camEnabled ? (
            <video
              ref={previewVideoRef}
              autoPlay
              muted
              playsInline
              controls={false}
              controlsList="nodownload nofullscreen noremoteplayback"
              disablePictureInPicture
              disableRemotePlayback
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : !loungeFailed && loungeSrc ? (
            <img
              src={loungeSrc}
              alt={`Sala de espera de ${modelName}`}
              referrerPolicy="no-referrer"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              onError={() => setLoungeFailed(true)}
              className="w-full h-full object-cover opacity-70"
            />
          ) : (
            <div className="w-full h-full bg-[#1A1024] flex items-center justify-center">
              <Video className="w-10 h-10 text-[#F4C2D7]/40" />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-[#0B060F] via-[#0B060F]/30 to-[#0B060F]/25 pointer-events-none" />
          <div
            aria-hidden="true"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            className="absolute inset-0 z-10 select-none"
          />

          <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between gap-2 pointer-events-none">
            <span className="text-xs font-medium text-[#F4C2D7]">
              {localStream && camEnabled
                ? 'Sua câmera (prévia espelhada)'
                : 'Preparação antes da chamada'}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-[#C9BAC4]">
              {localStream ? 'Dispositivo pronto' : 'Prévia desligada'}
            </span>
          </div>

          <div className="absolute bottom-4 left-4 right-4 z-20 space-y-3">
            {!localStream ? (
              <button
                type="button"
                onClick={() => void onAcquireMedia()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-full luxury-rose-cta transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FAF4F7]"
              >
                <Camera className="w-4 h-4" />
                <span>Testar Câmera e Microfone</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleMic}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    micEnabled
                      ? 'bg-[#21142D]/90 border-[#F4C2D7]/35 text-[#FAF4F7]'
                      : 'bg-red-950/70 border-red-500/40 text-red-200'
                  }`}
                >
                  {micEnabled ? (
                    <Mic className="w-3.5 h-3.5 text-[#F4C2D7]" />
                  ) : (
                    <MicOff className="w-3.5 h-3.5" />
                  )}
                  <span>{micEnabled ? 'Microfone ativo' : 'Mudo'}</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleCam}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-full border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    camEnabled
                      ? 'bg-[#21142D]/90 border-[#F4C2D7]/35 text-[#FAF4F7]'
                      : 'bg-[#150D1D]/90 border-[#F4C2D7]/20 text-[#938291]'
                  }`}
                >
                  {camEnabled ? (
                    <Video className="w-3.5 h-3.5 text-[#F4C2D7]" />
                  ) : (
                    <VideoOff className="w-3.5 h-3.5" />
                  )}
                  <span>{camEnabled ? 'Câmera ativa' : 'Câmera pausada'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 sm:p-6 bg-[#150D1D] border-t border-[#F4C2D7]/15 space-y-3">
          <p className="text-xs font-semibold text-[#FAF4F7]">
            Checklist da Sala de Espera
          </p>
          <ul className="space-y-2 text-xs text-[#C9BAC4]">
            <li className="flex items-center gap-2">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  wsConnected ? 'text-[#86EFAC]' : 'text-[#938291]'
                }`}
              />
              <span>
                {wsConnected
                  ? 'Sinalização em tempo real conectada'
                  : 'Reconectando sinalização do estúdio...'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2
                className={`w-3.5 h-3.5 shrink-0 ${
                  localStream ? 'text-[#86EFAC]' : 'text-[#F4C2D7]'
                }`}
              />
              <span>
                {localStream
                  ? 'Câmera e microfone verificados para entrada rápida'
                  : 'Teste sua câmera acima enquanto aguarda sua vez'}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#86EFAC]" />
              <span>
                Plano {request.planName || 'selecionado'} pré-autorizado
              </span>
            </li>
          </ul>
          {mediaError && (
            <p className="text-xs text-amber-200 pt-1">{mediaError}</p>
          )}
        </div>
      </aside>
    </div>
  );
};
