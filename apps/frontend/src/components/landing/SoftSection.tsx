'use client';

import React, { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionStyle,
} from 'framer-motion';

type SoftSectionProps = {
  children: React.ReactNode;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Vertical travel on enter (px). Smaller = softer. */
  rise?: number;
  /** Subtle parallax drift in px across the full scroll range. */
  parallax?: number;
  /** Enter animation duration in seconds. (Unused with shutter: kept for compat.) */
  duration?: number;
  /** Optional delay applied to the enter animation. (Unused with shutter: kept for compat.) */
  delay?: number;
  /** Render as a different element (default 'section'). */
  as?: 'section' | 'div';
  /** Disable scale breathing (default true). */
  scale?: boolean;
};

/**
 * SoftSection: scroll-driven "shutter / curtain" reveal.
 *
 * Same family of motion as the footer:
 *  - The section rises from below as it enters the viewport.
 *  - Spring-smoothed progress → soft, inertial, ralenti.
 *  - Gentle parallax drift after entry.
 *  - prefers-reduced-motion fully respected.
 */
export function SoftSection({
  children,
  id,
  className,
  style,
  rise = 120,
  parallax = 24,
  as = 'section',
  scale = true,
}: SoftSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  /* ─── Entrance progress: 0 when top hits ~95% of viewport, 1 when top reaches 30% ─── */
  const { scrollYProgress: enterProgress } = useScroll({
    target: ref,
    offset: ['start 95%', 'start 30%'],
  });
  const enter = useSpring(enterProgress, {
    stiffness: 55,
    damping: 22,
    mass: 0.9,
  });

  /* ─── Long-range progress for the gentle parallax drift ─── */
  const { scrollYProgress: rangeProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const range = useSpring(rangeProgress, {
    stiffness: 60,
    damping: 22,
    mass: 0.6,
  });

  // Shutter reveal
  const yReveal = useTransform(enter, [0, 1], [rise, 0]);
  const scaleReveal = useTransform(enter, [0, 1], [0.965, 1]);
  const opacityReveal = useTransform(enter, [0, 0.45, 1], [0, 0.6, 1]);

  // Parallax drift (kicks in after entrance): composed with reveal via inner wrapper
  const yDrift = useTransform(range, [0, 1], [parallax, -parallax]);
  const scaleDrift = useTransform(range, [0, 0.5, 1], [0.995, 1, 0.995]);

  const MotionTag = as === 'div' ? motion.div : motion.section;

  const outerStyle: MotionStyle = prefersReducedMotion
    ? {}
    : {
        y: yReveal,
        scale: scaleReveal,
        opacity: opacityReveal,
        transformOrigin: '50% 100%',
        willChange: 'transform, opacity',
      };

  const innerStyle: MotionStyle = prefersReducedMotion
    ? {}
    : {
        y: yDrift,
        ...(scale ? { scale: scaleDrift } : {}),
        willChange: 'transform',
      };

  return (
    <MotionTag
      ref={ref}
      id={id}
      className={className}
      style={{ ...style, ...outerStyle }}
    >
      <motion.div style={innerStyle}>{children}</motion.div>
    </MotionTag>
  );
}

/**
 * Slim scroll progress bar pinned to the top of the page.
 * Spring-smoothed so it glides instead of tracking 1:1.
 */
export function SoftScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    mass: 0.4,
  });
  const prefersReducedMotion = useReducedMotion();
  if (prefersReducedMotion) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[2px] origin-left"
      style={{
        scaleX,
        background:
          'linear-gradient(90deg, var(--brand-primary) 0%, var(--brand-accent) 100%)',
        opacity: 0.7,
        filter: 'blur(0.3px)',
      }}
    />
  );
}
