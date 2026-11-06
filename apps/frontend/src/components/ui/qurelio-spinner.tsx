'use client';

import React from 'react';

interface QurelioSpinnerProps {
  size?: number;
  className?: string;
}

/**
 * Soft, interactive process spinner that wraps the Qurelio mini logo
 * with a slowly rotating gradient ring and a breathing glow halo.
 */
export function QurelioSpinner({ size = 64, className }: QurelioSpinnerProps) {
  return (
    <div
      className={['relative inline-flex items-center justify-center', className]
        .filter(Boolean)
        .join(' ')}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Processing"
    >
      {/* Soft brand glow (single layer, blue only: no yellow) */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-[var(--brand-primary)]/18 blur-2xl"
        style={{ animation: 'qurelio-spinner-pulse 2.6s ease-in-out infinite' }}
      />

      {/* Outer rotating gradient arc (clockwise, slow) */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        style={{ animation: 'qurelio-spin-cw 2.4s linear infinite' }}
      >
        <defs>
          <linearGradient id="qurelio-arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0" />
            <stop offset="55%" stopColor="var(--brand-primary)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--brand-accent)" stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="url(#qurelio-arc-grad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="170 120"
        />
      </svg>

      {/* Inner counter-rotating dotted ring (subtle, opposite direction) */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-[10%] h-[80%] w-[80%]"
        style={{ animation: 'qurelio-spin-ccw 4.5s linear infinite' }}
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--brand-primary)"
          strokeOpacity="0.35"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeDasharray="2 6"
        />
      </svg>

      {/* Static thin track underneath the arc for a softer look */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="var(--brand-primary)"
          strokeOpacity="0.08"
          strokeWidth="2.5"
        />
      </svg>

      {/* Center logo with gentle breathing pulse */}
      <span
        className="relative z-10 inline-flex items-center justify-center"
        style={{
          width: size * 0.82,
          height: size * 0.82,
          animation: 'qurelio-breathe 2.8s ease-in-out infinite',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/querlio-mini.png"
          alt=""
          aria-hidden
          draggable={false}
          className="block h-full w-full select-none object-contain drop-shadow-[0_2px_8px_rgba(27,27,245,0.20)]"
        />
      </span>

      <style jsx>{`
        @keyframes qurelio-spin-cw {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes qurelio-spin-ccw {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes qurelio-spinner-pulse {
          0%, 100% { opacity: 0.55; transform: scale(0.96); }
          50%      { opacity: 1;    transform: scale(1.06); }
        }
        @keyframes qurelio-breathe {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
