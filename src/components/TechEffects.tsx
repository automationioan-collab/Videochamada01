import React, { useCallback, useRef } from 'react';
import { Video } from 'lucide-react';

export const TechAmbientField: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="tech-ambient-layer fixed inset-0 pointer-events-none overflow-hidden z-0"
    >
      {/* Architectural perspective micro-grid */}
      <div className="absolute inset-0 tech-grid-surface opacity-55 [mask-image:radial-gradient(ellipse_78%_68%_at_50%_18%,#000_25%,transparent_100%)]" />

      {/* Cosmic Sapphire, Luminous Violet & Twilight Pearl optical light fields */}
      <div className="tech-ambient-drift absolute -top-44 right-[-6%] w-[680px] h-[680px] rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.22)_0%,rgba(56,189,248,0.08)_46%,transparent_72%)] blur-2xl" />
      <div className="tech-ambient-drift absolute top-[34%] -left-44 w-[580px] h-[580px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.18)_0%,rgba(79,70,229,0.06)_50%,transparent_74%)] blur-2xl" />
      <div className="tech-ambient-drift absolute bottom-[-140px] left-[28%] w-[620px] h-[420px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.12)_0%,rgba(244,194,215,0.05)_48%,transparent_75%)] blur-3xl" />

      {/* Sweeping twilight luminous horizon arcs */}
      <svg
        viewBox="0 0 1440 420"
        fill="none"
        preserveAspectRatio="none"
        className="absolute top-0 inset-x-0 w-full h-[380px] opacity-65"
      >
        <defs>
          <linearGradient id="techArcGlowPrimary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(56,189,248,0)" />
            <stop offset="28%" stopColor="rgba(56,189,248,0.28)" />
            <stop offset="54%" stopColor="rgba(167,139,250,0.48)" />
            <stop offset="82%" stopColor="rgba(244,194,215,0.24)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0)" />
          </linearGradient>
          <linearGradient id="techArcGlowSecondary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(139,92,246,0)" />
            <stop offset="45%" stopColor="rgba(99,102,241,0.22)" />
            <stop offset="75%" stopColor="rgba(56,189,248,0.28)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0)" />
          </linearGradient>
        </defs>
        <path
          d="M-60 250 C 260 120, 620 340, 1020 155 C 1220 62, 1360 110, 1500 185"
          stroke="url(#techArcGlowPrimary)"
          strokeWidth="1.3"
        />
        <path
          d="M-40 295 C 310 180, 710 385, 1100 195 C 1280 108, 1390 150, 1500 220"
          stroke="url(#techArcGlowSecondary)"
          strokeWidth="0.95"
        />
      </svg>
    </div>
  );
};

interface TechSpotlightCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  enableHoverLift?: boolean;
}

export const TechSpotlightCard: React.FC<TechSpotlightCardProps> = ({
  children,
  className = '',
  enableHoverLift = false,
  onPointerMove,
  ...rest
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = cardRef.current;
      if (el && e.pointerType !== 'touch') {
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        el.style.setProperty('--spot-x', `${x.toFixed(1)}%`);
        el.style.setProperty('--spot-y', `${y.toFixed(1)}%`);
      }
      onPointerMove?.(e);
    },
    [onPointerMove]
  );

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      className={`tech-glass-interactive ${
        enableHoverLift ? 'hover:-translate-y-0.5' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

interface TechOrbitHaloProps {
  className?: string;
}

export const TechOrbitHalo: React.FC<TechOrbitHaloProps> = ({
  className = '',
}) => {
  return (
    <div
      aria-hidden="true"
      className={`tech-ambient-layer pointer-events-none select-none flex items-center justify-center ${className}`}
    >
      {/* Outer Soft Luminous Cyan-Violet Halo Ring */}
      <div className="absolute w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] lg:w-[440px] lg:h-[440px] rounded-full border border-[#818CF8]/30 shadow-[0_0_95px_rgba(56,189,248,0.22),inset_0_0_45px_rgba(139,92,246,0.18)]" />

      {/* Rotating Segmented Optical Ring */}
      <svg
        viewBox="0 0 420 420"
        fill="none"
        className="tech-orbit-slow absolute w-[360px] h-[360px] sm:w-[420px] sm:h-[420px] lg:w-[465px] lg:h-[465px]"
      >
        <defs>
          <linearGradient id="haloArcGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(56,189,248,0.88)" />
            <stop offset="50%" stopColor="rgba(167,139,250,0.2)" />
            <stop offset="100%" stopColor="rgba(196,181,253,0.78)" />
          </linearGradient>
        </defs>
        <circle
          cx="210"
          cy="210"
          r="196"
          stroke="url(#haloArcGrad1)"
          strokeWidth="1.5"
          strokeDasharray="140 55 48 55"
          strokeLinecap="round"
        />
        <circle
          cx="210"
          cy="210"
          r="176"
          stroke="rgba(147,197,253,0.24)"
          strokeWidth="0.9"
          strokeDasharray="4 14"
        />
      </svg>

      {/* Counter-rotating Inner Technical Arc */}
      <svg
        viewBox="0 0 360 360"
        fill="none"
        className="tech-orbit-reverse absolute w-[300px] h-[300px] sm:w-[350px] sm:h-[350px] lg:w-[390px] lg:h-[390px]"
      >
        <circle
          cx="180"
          cy="180"
          r="164"
          stroke="rgba(56,189,248,0.38)"
          strokeWidth="1"
          strokeDasharray="92 120 26 120"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};

interface TechVideoCallButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'hero' | 'compact';
  icon?: React.ReactNode;
}

export const TechVideoCallButton: React.FC<TechVideoCallButtonProps> = ({
  label,
  size = 'hero',
  icon,
  className = '',
  disabled,
  onPointerMove,
  ...rest
}) => {
  const coreRef = useRef<HTMLSpanElement | null>(null);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const el = coreRef.current;
      if (el && e.pointerType !== 'touch') {
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        el.style.setProperty('--btn-x', `${x.toFixed(1)}%`);
        el.style.setProperty('--btn-y', `${y.toFixed(1)}%`);
      }
      onPointerMove?.(e);
    },
    [onPointerMove]
  );

  const isHero = size === 'hero';

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerMove={handlePointerMove}
      className={`group tech-video-cta disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#060816] ${className}`}
      {...rest}
    >
      {/* Orbiting Luminous Sapphire-Violet Perimeter Beam */}
      {!disabled && <span aria-hidden="true" className="tech-video-cta-orbit" />}

      {/* Inner Midnight Glass Core */}
      <span
        ref={coreRef}
        className={`tech-video-cta-core ${
          isHero
            ? 'gap-3 px-6 py-3.5 text-sm font-semibold min-h-[48px]'
            : 'gap-2 px-4 py-2 text-xs font-semibold min-h-[40px]'
        }`}
      >
        {/* Specular Light Beam Sweep */}
        {!disabled && <span aria-hidden="true" className="tech-video-cta-sweep" />}

        {/* Optical Lens / Camera Icon */}
        <span
          aria-hidden="true"
          className={`relative z-10 inline-flex items-center justify-center rounded-full border border-[#38BDF8]/40 bg-[#6366F1]/25 text-[#E0E7FF] transition-transform duration-200 group-hover:scale-105 shrink-0 ${
            isHero ? 'w-7 h-7' : 'w-5 h-5'
          }`}
        >
          {icon ?? <Video className={isHero ? 'w-3.5 h-3.5' : 'w-3 h-3'} />}
        </span>

        {/* Crisp Single-Line Label */}
        <span className="relative z-10 tracking-[0.01em] whitespace-nowrap">
          {label}
        </span>

        {/* Animated Live Acoustic Voice Wave Bars */}
        {!disabled && (
          <span
            aria-hidden="true"
            className="relative z-10 inline-flex items-end gap-[2.5px] h-3.5 ml-0.5 shrink-0"
          >
            <span
              className="tech-wave-bar w-[2px] h-2 rounded-full bg-[#A5B4FC]/85"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="tech-wave-bar w-[2px] h-3.5 rounded-full bg-[#38BDF8]"
              style={{ animationDelay: '180ms' }}
            />
            <span
              className="tech-wave-bar w-[2px] h-2.5 rounded-full bg-[#C4B5FD]/90"
              style={{ animationDelay: '340ms' }}
            />
          </span>
        )}
      </span>
    </button>
  );
};
