'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

// Arc configs: [size, duration, reverse, dashRatio, strokeWidth, opacityRange]
const ARCS = [
  { size: 280, duration: 6,   reverse: false, dash: 0.28, stroke: 2,   opacity: [0.15, 0.55, 0.15] },
  { size: 320, duration: 9,   reverse: true,  dash: 0.18, stroke: 1.5, opacity: [0.1,  0.4,  0.1]  },
  { size: 360, duration: 7,   reverse: false, dash: 0.40, stroke: 1,   opacity: [0.08, 0.3,  0.08] },
  { size: 400, duration: 12,  reverse: true,  dash: 0.12, stroke: 0.8, opacity: [0.05, 0.2,  0.05] },
  { size: 440, duration: 16,  reverse: false, dash: 0.08, stroke: 0.6, opacity: [0.04, 0.15, 0.04] },
];

export function AppLoader({ visible }: { visible: boolean }) {
  return (
    <motion.div
      aria-hidden={!visible}
      role="status"
      initial={{ opacity: 1 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--page-bg)]"
    >
      <div className="relative flex items-center justify-center" style={{ width: 480, height: 480 }}>

        {/* Animated arcs */}
        {ARCS.map((arc, i) => (
          <motion.svg
            key={i}
            className="absolute"
            width={arc.size}
            height={arc.size}
            viewBox={`0 0 ${arc.size} ${arc.size}`}
            style={{ left: '50%', top: '50%', marginLeft: -arc.size / 2, marginTop: -arc.size / 2 }}
            animate={{ rotate: arc.reverse ? -360 : 360 }}
            transition={{ duration: arc.duration, ease: 'linear', repeat: Infinity }}
          >
            <defs>
              <linearGradient id={`g${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="var(--brand-primary)" stopOpacity="0" />
                <stop offset="40%"  stopColor="var(--brand-primary)" stopOpacity="1" />
                <stop offset="70%"  stopColor="var(--brand-accent)"  stopOpacity="0.8" />
                <stop offset="100%" stopColor="var(--brand-accent)"  stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.circle
              cx={arc.size / 2}
              cy={arc.size / 2}
              r={arc.size / 2 - 4}
              fill="none"
              stroke={`url(#g${i})`}
              strokeWidth={arc.stroke}
              strokeLinecap="round"
              strokeDasharray={`${arc.size * arc.dash} ${arc.size * Math.PI}`}
              animate={{ opacity: arc.opacity }}
              transition={{ duration: 3 + i * 0.6, ease: 'easeInOut', repeat: Infinity, delay: i * 0.5 }}
            />
          </motion.svg>
        ))}

        {/* Close semicircle rings tight around the logo */}
        {[
          { size: 268, duration: 3.5, reverse: false, stroke: 2.5, gap: 0.52 },
          { size: 292, duration: 5.2, reverse: true,  stroke: 1.5, gap: 0.46 },
          { size: 314, duration: 7.5, reverse: false, stroke: 1,   gap: 0.36 },
        ].map((ring, i) => (
          <motion.svg
            key={`ring-${i}`}
            className="absolute z-20"
            width={ring.size}
            height={ring.size}
            viewBox={`0 0 ${ring.size} ${ring.size}`}
            style={{ left: '50%', top: '50%', marginLeft: -ring.size / 2, marginTop: -ring.size / 2 }}
            animate={{ rotate: ring.reverse ? -360 : 360 }}
            transition={{ duration: ring.duration, ease: 'linear', repeat: Infinity }}
          >
            <defs>
              <linearGradient id={`rg${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stopColor="var(--brand-primary)" stopOpacity="0" />
                <stop offset="35%"  stopColor="var(--brand-primary)" stopOpacity="1" />
                <stop offset="65%"  stopColor="var(--brand-accent)"  stopOpacity="0.9" />
                <stop offset="100%" stopColor="var(--brand-accent)"  stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle
              cx={ring.size / 2}
              cy={ring.size / 2}
              r={ring.size / 2 - 3}
              fill="none"
              stroke={`url(#rg${i})`}
              strokeWidth={ring.stroke}
              strokeLinecap="round"
              strokeDasharray={`${ring.size * Math.PI * ring.gap} ${ring.size * Math.PI}`}
            />
          </motion.svg>
        ))}

        {/* Logo: extra large, slow breathing */}
        <motion.div
          className="relative z-10 flex items-center justify-center"
          style={{ width: 240, height: 240 }}
          animate={{ scale: [1, 1.025, 1] }}
          transition={{ duration: 4, ease: [0.45, 0, 0.55, 1], repeat: Infinity }}
        >
          <Image
            src="/brand/querlio-logo.png"
            alt="Qurelio"
            width={600}
            height={600}
            priority
            className="h-full w-full object-contain"
          />
        </motion.div>
      </div>
    </motion.div>
  );
}