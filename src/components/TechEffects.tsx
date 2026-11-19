import React, { useCallback, useRef } from 'react';

export const TechAmbientField: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="tech-ambient-layer fixed inset-0 pointer-events-none overflow-hidden z-0"
    >
      {/* Subtle architectural perspective micro-grid */}
      <div className="absolute inset-0 tech-grid-surface opacity-45 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_20%,#000_25%,transparent_100%)]" />

      {/* Floating ambient Velvet Plum & Rose-Blush optical light fields */}
      <div className="tech-ambient-drift absolute -top-40 right-[-8%] w-[640px] h-[640px] rounded-full bg-[radial-gradient(circle,rgba(218,132,188,0.16)_0%,rgba(130,62,124,0.06)_48%,transparent_72%)] blur-2xl" />
      <div className="tech-ambient-drift absolute top-[42%] -left-48 w-[560px] h-[560px] rounded-full bg-[radial-gradient(circle,rgba(164,84,150,0.14)_0%,rgba(92,38,94,0.05)_50%,transparent_74%)] blur-2xl" />

      {/* Sweeping futuristic luminous salon light-wave arcs */}
      <svg
        viewBox="0 0 1440 420"
        fill="none"
        preserveAspectRatio="none"
        className="absolute top-0 inset-x-0 w-full h-[360px] opacity-55"
      >
        <defs>
          <linearGradient id="techArcGlowPrimary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(244,194,215,0)" />
            <stop offset="32%" stopColor="rgba(244,194,215,0.22)" />
            <stop offset="55%" stopColor="rgba(248,214,227,0.45)" />
            <stop offset="82%" stopColor="rgba(186,104,162,0.22)" />
            <stop offset="100%" stopColor="rgba(244,194,215,0)" />
          </linearGradient>
          <linearGradient id="techArcGlowSecondary" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(186,104,162,0)" />
            <stop offset="45%" stopColor="rgba(244,194,215,0.18)" />
            <stop offset="75%" stopColor="rgba(248,214,227,0.26)" />
            <stop offset="100%" stopColor="rgba(186,104,162,0)" />
          </linearGradient>
        </defs>
        <path
          d="M-60 250 C 260 120, 620 340, 1020 155 C 1220 62, 1360 110, 1500 185"
          stroke="url(#techArcGlowPrimary)"
          strokeWidth="1.25"
        />
        <path
          d="M-40 295 C 310 180, 710 385, 1100 195 C 1280 108, 1390 150, 1500 220"
          stroke="url(#techArcGlowSecondary)"
          strokeWidth="0.9"
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
      {/* Outer Soft Luminous Halo */}
      <div className="absolute w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] lg:w-[440px] lg:h-[440px] rounded-full border border-[#F4C2D7]/20 shadow-[0_0_85px_rgba(244,194,215,0.22),inset_0_0_45px_rgba(192,98,162,0.14)]" />

      {/* Rotating Segmented Optical Ring */}
      <svg
        viewBox="0 0 420 420"
        fill="none"
        className="tech-orbit-slow absolute w-[360px] h-[360px] sm:w-[420px] sm:h-[420px] lg:w-[465px] lg:h-[465px]"
      >
        <defs>
          <linearGradient id="haloArcGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(248,214,227,0.85)" />
            <stop offset="50%" stopColor="rgba(244,194,215,0.15)" />
            <stop offset="100%" stopColor="rgba(192,98,162,0.72)" />
          </linearGradient>
        </defs>
        <circle
          cx="210"
          cy="210"
          r="196"
          stroke="url(#haloArcGrad1)"
          strokeWidth="1.4"
          strokeDasharray="140 55 48 55"
          strokeLinecap="round"
        />
        <circle
          cx="210"
          cy="210"
          r="176"
          stroke="rgba(244,194,215,0.2)"
          strokeWidth="0.8"
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
          stroke="rgba(248,214,227,0.34)"
          strokeWidth="1"
          strokeDasharray="92 120 26 120"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
