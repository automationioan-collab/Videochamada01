import React, { useState } from 'react';
import { ArrowRight, Lock, ShieldCheck, Video } from 'lucide-react';

interface LoginViewProps {
  onLogin: () => void;
  authError: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin, authError }) => {
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  return (
    <main className="max-w-[1440px] mx-auto px-6 py-12 lg:py-16 space-y-20">
      {/* Hero Split */}
      <section
        id="estudio"
        className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch"
      >
        <div className="lg:col-span-5 flex flex-col justify-between py-2 space-y-8">
          <div className="space-y-6">
            <p className="text-xs font-medium tracking-wide text-[#C9A46B]">
              Estúdio Privado · Sala Ao Vivo
            </p>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.06] text-[#F3EFE6] [text-wrap:balance]">
              Videochamada ao vivo com Lorena Noir.
            </h1>
            <p className="text-base text-[#9BA1AE] leading-relaxed max-w-md">
              Entre pelo site para conversar frente a frente com Lorena Noir em
              transmissão privada de vídeo e áudio, com fila organizada e acesso
              em tempo real.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onLogin}
                className="inline-flex items-center gap-3 px-6 py-3.5 text-sm font-semibold rounded-lg bg-[#C9A46B] text-[#0B0C0F] hover:bg-[#D7B57E] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3EFE6]"
              >
                <span>Entrar para Videochamada</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/30 text-xs text-red-200"
              >
                {authError}
              </div>
            )}

            <p className="text-xs text-[#727988]">
              Acesso imediato com sua conta Google para solicitar ou iniciar sua
              chamada de vídeo com Lorena Noir.
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
                Modelo Principal · Sessões Privadas 1-para-1 · Áudio e Vídeo HD
              </p>
            </div>
            <p className="text-xs font-mono tabular-nums text-[#E2C799]">
              Sala Direta WebRTC
            </p>
          </div>
        </div>
      </section>

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
            Faça login em segundos com sua conta verificada para acessar a
            recepção ao vivo de Lorena Noir.
          </p>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[#C9A46B]">
            <Video className="w-4 h-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
              02. Videochamada ao Vivo
            </h2>
          </div>
          <p className="text-sm text-[#9BA1AE] leading-relaxed">
            Chame diretamente quando a sala estiver aberta ou entre na fila
            para conectar sua câmera e microfone em HD.
          </p>
        </div>

        <div id="privacidade" className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[#C9A46B]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <h2 className="font-display text-xl font-semibold text-[#F3EFE6]">
              03. Sala Privada e Moderada
            </h2>
          </div>
          <p className="text-sm text-[#9BA1AE] leading-relaxed">
            Sessões exclusivas com chat sincronizado e controle em tempo real
            conduzido pela própria modelo.
          </p>
        </div>
      </section>
    </main>
  );
};
