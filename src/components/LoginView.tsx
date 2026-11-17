import React, { useEffect, useState } from 'react';
import { ArrowRight, Lock, ShieldCheck, Users, Video } from 'lucide-react';
import { GaleriaModelo } from './GaleriaModelo';

interface LoginViewProps {
  onEnterVideoCall: () => void;
  authError: string | null;
}

interface PublicStudioStatus {
  modelOnline: boolean;
  modelInRoom: boolean;
  roomParticipantCount: number;
  activePeersCount: number;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onEnterVideoCall,
  authError,
}) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [publicStatus, setPublicStatus] = useState<PublicStudioStatus | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const res = await fetch('/api/studio/public-status');
        if (!res.ok) return;
        const json = (await res.json()) as PublicStudioStatus & { ok?: boolean };
        if (!cancelled && json.ok) {
          setPublicStatus({
            modelOnline: Boolean(json.modelOnline),
            modelInRoom: Boolean(json.modelInRoom),
            roomParticipantCount: Number(json.roomParticipantCount || 0),
            activePeersCount: Number(json.activePeersCount || 0),
          });
        }
      } catch {
        // Ignore transient fetch errors on public landing
      }
    };

    void loadStatus();
    const timer = window.setInterval(() => void loadStatus(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const roomCount = publicStatus?.roomParticipantCount ?? 0;

  return (
    <main className="max-w-[1440px] mx-auto px-6 py-12 lg:py-16 space-y-20">
      {/* Hero Split */}
      <section
        id="estudio"
        className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch"
      >
        <div className="lg:col-span-5 flex flex-col justify-between py-2 space-y-8">
          <div className="space-y-6">
            <p className="text-xs font-medium tracking-wide text-[#C9A46B] font-mono tabular-nums">
              Estúdio Privado ·{' '}
              {roomCount > 0
                ? `${roomCount} na videochamada agora`
                : publicStatus?.modelOnline
                  ? 'Lorena Noir online no estúdio'
                  : 'Sala aberta para múltiplos internautas'}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.06] text-[#F3EFE6] [text-wrap:balance]">
              Videochamada ao vivo com Lorena Noir.
            </h1>
            <p className="text-base text-[#9BA1AE] leading-relaxed max-w-md">
              Entre pelo site para participar da sala de vídeo ao vivo com
              Lorena Noir e outros internautas conectados simultaneamente, ou
              solicite atendimento exclusivo em tempo real.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onEnterVideoCall}
                className="inline-flex items-center gap-3 px-6 py-3.5 text-sm font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EFE6]"
              >
                <Video className="w-4 h-4 shrink-0" />
                <span>Entrar na Videochamada</span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            </div>

            {publicStatus && (
              <div className="flex items-center gap-2 text-xs text-[#C8CCD4] font-mono tabular-nums">
                <Users className="w-3.5 h-3.5 text-[#C9A46B] shrink-0" />
                <span>
                  {roomCount === 0
                    ? 'Sala ao vivo pronta · Seja o primeiro a entrar com câmera e áudio'
                    : `${roomCount} participante${roomCount === 1 ? '' : 's'} na sala de vídeo agora · Entrada simultânea liberada`}
                </span>
              </div>
            )}

            {authError && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200"
              >
                {authError}
              </div>
            )}

            <p className="text-xs text-[#727988]">
              Acesso rápido com sua conta Google para escolher seu plano e entrar
              imediatamente na videochamada com vários internautas.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7 relative rounded-xl overflow-hidden bg-[#13151A] border border-white/10 min-h-[360px] lg:min-h-[500px]">
          {!heroImgFailed ? (
            <img
              src="/src/assets/images/model_studio_hero_1794946401293.jpg"
              alt="Modelo Lorena Noir em estúdio privado Maison Aura"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full object-cover lg:absolute lg:inset-0"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#161920] to-[#0B0C0F] p-12">
              <Video className="w-12 h-12 text-[#C9A46B]/60" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0C0F]/90 via-[#0B0C0F]/25 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="font-display text-2xl font-semibold text-[#F3EFE6]">
                Lorena Noir
              </p>
              <p className="text-xs text-[#C8CCD4]">
                Modelo Principal · Sala Aberta Multi-Participantes & Sessões 1-para-1 · Áudio e Vídeo HD
              </p>
            </div>
            <p className="text-xs font-mono tabular-nums text-[#E2C799]">
              {roomCount > 0
                ? `${roomCount} na sala ao vivo`
                : 'Sala Direta WebRTC'}
            </p>
          </div>
        </div>
      </section>

      {/* Model Editorial Photo Showcase */}
      <GaleriaModelo
        modelName="Lorena Noir"
        ctaLabel="Entrar na Videochamada"
        onPrimaryAction={onEnterVideoCall}
      />

      {/* Three Pillars Strip */}
      <section
        id="recursos"
        className="border-t border-white/10 pt-12 grid grid-cols-1 md:grid-cols-3 gap-8"
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[#C9A46B]">
            <Lock className="w-4 h-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
              01. Entrada Rápida pelo Site
            </h2>
          </div>
          <p className="text-sm text-[#9BA1AE] leading-relaxed">
            Clique em Entrar na Videochamada na página pública para autenticar
            em segundos e acessar a sala ao vivo de Lorena Noir.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[#C9A46B]">
            <Video className="w-4 h-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
              02. Múltiplos Internautas Ao Vivo
            </h2>
          </div>
          <p className="text-sm text-[#9BA1AE] leading-relaxed">
            Vários internautas podem entrar simultaneamente na sala de vídeo em
            grade HD com chat em tempo real ou chamar Lorena Noir no privado.
          </p>
        </div>

        <div id="privacidade" className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[#C9A46B]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
              03. Controle e Moderação Real
            </h2>
          </div>
          <p className="text-sm text-[#9BA1AE] leading-relaxed">
            Sessões com planos pré-definidos, chat sincronizado e moderação em
            tempo real conduzida pela própria modelo.
          </p>
        </div>
      </section>
    </main>
  );
};
