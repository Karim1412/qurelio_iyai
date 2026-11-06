'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  Mail,
  CheckCircle,
  ArrowRight,
  Sparkles,
  Shield,
  Users,
  TrendingUp,
} from '@/components/icons';
import { motion, useInView, useReducedMotion, type Variants } from 'framer-motion';
import toast from 'react-hot-toast';
import { contactApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ContactForm {
  name: string;
  email: string;
  company: string;
  message: string;
}
interface Stat {
  icon: React.ReactNode;
  value: string;
  label: string;
}
interface Benefit {
  icon: React.ReactNode;
  title: string;
  description: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const CONTACT_EMAIL_PRIMARY = 'hello@qurelio.com';
const CONTACT_PHONE = '+216 XX XXX XXX';
const CONTACT_EMAIL_SUPPORT = 'support@qurelio.com';

const STATS: Stat[] = [
  { icon: <TrendingUp className="h-5 w-5" />, value: '70%', label: 'Less compliance prep' },
  { icon: <Shield className="h-5 w-5" />, value: '100%', label: 'Human-approved AI' },
  { icon: <Users className="h-5 w-5" />, value: '24/7', label: 'Regulatory monitoring' },
];

const BENEFITS: Benefit[] = [
  {
    icon: <CheckCircle className="h-6 w-6" />,
    title: 'Structured Workflows',
    description: 'Streamlined processes for documents, evaluations, and CAPAs that keep your team aligned.',
  },
  {
    icon: <Shield className="h-6 w-6" />,
    title: 'Role-Based Access',
    description: 'Granular permissions for admins, directors, and shop-floor teams, so everyone sees what matters.',
  },
  {
    icon: <Sparkles className="h-6 w-6" />,
    title: 'AI-Powered Insights',
    description: 'Intelligent analysis over your quality data to identify trends before they become issues.',
  },
];

const INITIAL_FORM_STATE: ContactForm = { name: '', email: '', company: '', message: '' };

// ─── Animations ───────────────────────────────────────────────────────────────
const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
};
const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useContactForm() {
  const [form, setForm] = useState<ContactForm>(INITIAL_FORM_STATE);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function parseName(full: string) {
    const trimmed = full.trim();
    if (!trimmed) return { firstName: 'Visitor', lastName: '' };
    const [first, ...rest] = trimmed.split(/\s+/);
    return { firstName: first, lastName: rest.join(' ') };
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { firstName, lastName } = parseName(form.name);
      await contactApi.send({
        firstName,
        lastName,
        email: form.email,
        subject: form.company ? `Inquiry from ${form.company}` : '',
        message: form.message,
      });
      setSent(true);
      toast.success('Message sent successfully', {
        icon: '✨',
        style: { borderRadius: '12px', background: '#1a1a1a', color: '#fff' },
      });
    } catch (err: unknown) {
      const raw = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      const msg = Array.isArray(raw) ? raw.join(' ') : String(raw || 'Could not send. Please try again.');
      toast.error(msg, { style: { borderRadius: '12px', background: '#1a1a1a', color: '#fff' } });
    } finally {
      setLoading(false);
    }
  }, [form]);

  const updateField = useCallback(
    (field: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    },
    [],
  );

  const resetForm = useCallback(() => {
    setForm(INITIAL_FORM_STATE);
    setSent(false);
  }, []);

  return { form, sent, loading, handleSubmit, updateField, resetForm };
}

// ─── Small components ─────────────────────────────────────────────────────────
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/5 px-3 py-1 text-xs font-medium text-[var(--brand-primary)]">
      {children}
    </span>
  );
}

function StatCard({ stat, index }: { stat: Stat; index: number }) {
  return (
    <motion.div
      variants={fadeInUp}
      custom={index}
      className="text-center p-4 rounded-2xl bg-gradient-to-b from-[var(--surface)] to-transparent border border-[var(--border)]"
    >
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] mb-3">
        {stat.icon}
      </div>
      <div className="text-2xl font-bold text-[var(--text-primary)]">{stat.value}</div>
      <div className="text-sm text-[var(--muted)] mt-1">{stat.label}</div>
    </motion.div>
  );
}

function BenefitCard({ benefit, index }: { benefit: Benefit; index: number }) {
  return (
    <motion.div
      variants={fadeInUp}
      custom={index}
      className="group relative p-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--brand-primary)]/30 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--brand-primary)]/5"
    >
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-primary)]/5 text-[var(--brand-primary)] mb-4 group-hover:scale-110 transition-transform duration-300">
        {benefit.icon}
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{benefit.title}</h3>
      <p className="text-sm text-[var(--muted)] leading-relaxed">{benefit.description}</p>
    </motion.div>
  );
}

// ─── Input helpers ────────────────────────────────────────────────────────────
// Soft, shadowless input. Focus reveals a tinted background + accent border + a
// hairline ring: no blur, no drop-shadow.
const inputBaseClass =
  'peer relative z-10 block w-full rounded-xl border border-neutral-200/90 bg-white/70 px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-[background,border-color,transform] duration-300 ease-out focus:border-[var(--brand-primary)]/60 focus:bg-white hover:border-neutral-300';

function FieldRing() {
  // A flat 1px accent ring that fades in on focus. No shadow.
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-[var(--brand-primary)]/0 opacity-0 transition-[opacity,box-shadow] duration-300 peer-focus:opacity-100 peer-focus:ring-[var(--brand-primary)]/35"
    />
  );
}

// Tiny animated underline that grows from the centre on focus, purely flat color.
function FieldUnderline() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-accent)] opacity-0 transition-all duration-400 ease-out peer-focus:w-[60%] peer-focus:opacity-90"
    />
  );
}

function Field({
  id, label, placeholder, value, onChange, type = 'text', required,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="group">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium uppercase tracking-[0.1em] text-neutral-500 transition-colors duration-300 group-focus-within:text-[var(--brand-primary)]"
      >
        {label}
      </label>
      <div className="relative isolate">
        <input
          id={id}
          type={type}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          className={inputBaseClass}
        />
        <FieldRing />
        <FieldUnderline />
      </div>
    </div>
  );
}

// ─── Custom illustration (envelope + paper plane + soft bubbles) ──────────────
// Hand-built SVG: no shadows, only soft fills, gradients, and gentle motion.
// Two animation passes: a staged entry choreography on scroll-in, then refined
// idle loops with custom bezier easing. Reduced-motion users get the static art.
const SOFT_IN_OUT = [0.45, 0, 0.55, 1] as const; // breathing
const SOFT_OUT    = [0.22, 1, 0.36, 1] as const; // entrances

function ContactIllustration() {
  const ref = useRef<HTMLDivElement>(null);
  const isVisible = useInView(ref, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();

  // Entry variants: every piece fades + softly settles. The parent staggers
  // children in a deliberate order: ambient → trail → envelope → plane → bubbles.
  const containerVariants: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
  };
  const fadeUp: Variants = {
    hidden: { opacity: 0, y: 14, scale: 0.96 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: { duration: 1.0, ease: SOFT_OUT },
    },
  };
  const fadeIn: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 1.1, ease: SOFT_OUT } },
  };
  const popIn: Variants = {
    hidden: { opacity: 0, scale: 0.7 },
    show: {
      opacity: 1, scale: 1,
      transition: { duration: 0.7, ease: SOFT_OUT },
    },
  };

  // Idle loops: disabled under reduced motion
  const envelopeIdle = reduceMotion
    ? {}
    : {
        animate: { y: [0, -5, 0], rotate: [0, 0.6, 0, -0.4, 0], scale: [1, 1.012, 1] },
        transition: { duration: 6.5, repeat: Infinity, ease: SOFT_IN_OUT },
      };
  // Soft counter-clockwise orbit around the envelope, then a gentle dive
  // into the letter mouth (scale + fade to 0). Endpoints meet invisibly
  // so the loop is seamless.
  const planeIdle = reduceMotion
    ? {}
    : {
        animate: {
          x:       [0,    0,    20,   60,   60,    0,    -80,  -180, -200, -160, -110, -72,  -72,  -72],
          y:       [0,    0,   -20,   20,   100,   170,  200,  150,  60,   -10,  -20,  -10,  10,   10 ],
          rotate:  [0,    0,    20,   60,   90,    130,  180,  220,  260,  300,  340,  380,  380,  380],
          scale:   [1,    1,    1,    1,    1,     1,    1,    1,    1,    1,    0.95, 0.55, 0,    0  ],
          opacity: [0,    1,    1,    1,    1,     1,    1,    1,    1,    1,    1,    0.5,  0,    0  ],
        },
        transition: {
          duration: 12,
          repeat: Infinity,
          ease: SOFT_IN_OUT,
          delay: 1.4,
          times:   [0, 0.04, 0.14, 0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.82, 0.88, 0.93, 0.97, 1.00],
        },
      };
  const bubbleIdle = (dur: number, range: number, delay: number) =>
    reduceMotion
      ? {}
      : {
          animate: { y: [0, -range, 0], scale: [1, 1.04, 1] },
          transition: { duration: dur, repeat: Infinity, ease: SOFT_IN_OUT, delay },
        };
  const blobDrift = (dur: number, x: number, delay = 0) =>
    reduceMotion
      ? {}
      : {
          animate: { x: [0, x, 0], opacity: [0.42, 0.55, 0.42] },
          transition: { duration: dur, repeat: Infinity, ease: SOFT_IN_OUT, delay },
        };
  const twinkle = (dur: number, delay = 0) =>
    reduceMotion
      ? {}
      : {
          animate: { opacity: [0.35, 1, 0.35], scale: [0.85, 1.15, 0.85] },
          transition: { duration: dur, repeat: Infinity, ease: SOFT_IN_OUT, delay },
        };

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isVisible ? 'show' : 'hidden'}
      variants={containerVariants}
      className="mt-10 w-full"
    >
      <svg
        viewBox="0 0 420 320"
        className="mx-auto block w-full max-w-md"
        role="img"
        aria-label="Send us a message"
      >
        <defs>
          <linearGradient id="ci-env-flap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6BA8D4" />
            <stop offset="100%" stopColor="#4D92C4" />
          </linearGradient>
          <linearGradient id="ci-env-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F4F8FD" />
          </linearGradient>
          <linearGradient id="ci-letter" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FAF8F2" />
          </linearGradient>
          <linearGradient id="ci-plane" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFD75A" />
            <stop offset="100%" stopColor="#FFA000" />
          </linearGradient>
          <linearGradient id="ci-plane-shade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E89A00" />
            <stop offset="100%" stopColor="#C77700" />
          </linearGradient>
        </defs>

        {/* Soft ambient blobs: drift very slowly */}
        <motion.circle variants={fadeIn} cx="60"  cy="60"  r="48" fill="#CEE6F7" {...blobDrift(18, 8)} />
        <motion.circle variants={fadeIn} cx="370" cy="260" r="56" fill="#FFE8A8" {...blobDrift(22, -10, 1.5)} />
        <motion.circle variants={fadeIn} cx="345" cy="60"  r="22" fill="#B6D8EF" {...blobDrift(16, 6, 0.8)}  />

        {/* Decorative dots scattered: soft twinkle, each on its own beat */}
        <motion.circle variants={popIn} cx="48"  cy="160" r="3"   fill="#7DAFD6" {...twinkle(4.2, 0)}    style={{ transformOrigin: '48px 160px' }} />
        <motion.circle variants={popIn} cx="372" cy="120" r="2.5" fill="#FFC107" {...twinkle(3.6, 0.6)}  style={{ transformOrigin: '372px 120px' }} />
        <motion.circle variants={popIn} cx="36"  cy="100" r="2"   fill="#B89FE5" {...twinkle(4.8, 1.2)}  style={{ transformOrigin: '36px 100px' }} />
        <motion.circle variants={popIn} cx="390" cy="80"  r="2"   fill="#82C9B0" {...twinkle(4.0, 1.8)}  style={{ transformOrigin: '390px 80px' }} />
        <motion.circle variants={popIn} cx="22"  cy="220" r="2"   fill="#7DAFD6" {...twinkle(5.0, 0.3)}  style={{ transformOrigin: '22px 220px' }} />
        <motion.circle variants={popIn} cx="402" cy="200" r="2"   fill="#FFC107" {...twinkle(4.4, 2.4)}  style={{ transformOrigin: '402px 200px' }} />

        {/* Tiny sparkles */}
        <motion.g variants={fadeIn} opacity="0.75">
          <path d="M 60 28 l 4 0 M 62 26 l 0 4"     stroke="#FFC107" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M 380 28 l 4 0 M 382 26 l 0 4"   stroke="#4D92C4" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M 20 290 l 4 0 M 22 288 l 0 4"   stroke="#B89FE5" strokeWidth="1.1" strokeLinecap="round" />
        </motion.g>

        {/* Dashed flight trail: draws itself on entry, then flows continuously */}
        <motion.path
          variants={{
            hidden: { opacity: 0, pathLength: 0 },
            show:   { opacity: 0.55, pathLength: 1, transition: { duration: 1.4, ease: SOFT_OUT } },
          }}
          d="M 96 230 Q 160 200, 200 170 T 290 110"
          stroke="#7DAFD6"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 6"
          fill="none"
        >
          {!reduceMotion && (
            <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="6s" repeatCount="indefinite" />
          )}
        </motion.path>

        {/* Envelope group: floats gently with micro-rotation + breathing scale */}
        <motion.g
          variants={fadeUp}
          {...envelopeIdle}
          style={{ transformOrigin: '228px 200px' }}
        >
          {/* 1) Envelope back panel (deepest layer) */}
          <rect x="120" y="148" width="216" height="132" rx="14" fill="url(#ci-env-body)" stroke="#CFDAE6" strokeWidth="1.3" />

          {/* 2) Letter: sits between back panel and front pocket so the V-notch
                actually reveals it. Top portion sticks up out of the envelope. */}
          <rect x="148" y="86"  width="160" height="146" rx="10" fill="url(#ci-letter)" stroke="#E7E5E0" strokeWidth="1.2" />
          {/* Letter content lines */}
          <rect x="164" y="104" width="56"  height="5"   rx="2.5" fill="#1C1917" opacity="0.55" />
          <rect x="164" y="120" width="128" height="3"   rx="1.5" fill="#A8A29E" opacity="0.55" />
          <rect x="164" y="130" width="112" height="3"   rx="1.5" fill="#A8A29E" opacity="0.4"  />
          <rect x="164" y="140" width="120" height="3"   rx="1.5" fill="#A8A29E" opacity="0.4"  />
          <rect x="172" y="156" width="96"  height="3"   rx="1.5" fill="#A8A29E" opacity="0.4"  />
          {/* Highlighted line in brand accent: visible inside the V notch */}
          <rect x="180" y="174" width="80"  height="3"   rx="1.5" fill="#7DAFD6" opacity="0.7"  />
          <rect x="192" y="192" width="56"  height="3"   rx="1.5" fill="#A8A29E" opacity="0.35" />

          {/* 3) Front pocket (V fold): covers the lower half of the letter,
                except for the V-notch which keeps the letter visible there. */}
          <path d="M 120 148 L 228 232 L 336 148 L 336 280 L 120 280 Z"
                fill="url(#ci-env-body)" stroke="#CFDAE6" strokeWidth="1.3" />

          {/* Inner V accent: outlines the open mouth */}
          <path d="M 120 148 L 228 232 L 336 148" stroke="#9CB7CE" strokeWidth="1.2" fill="none" opacity="0.6" />

          {/* Subtle inner shading inside the V mouth so the opening reads as depth */}
          <path d="M 120 148 L 228 232 L 336 148 Z" fill="url(#ci-env-flap)" opacity="0.18" />

          {/* "Envelope" label tag at the bottom of the front pocket */}
          <rect x="200" y="252" width="56" height="14" rx="7" fill="#FFFFFF" stroke="#CFDAE6" strokeWidth="1" opacity="0.9" />
          <circle cx="212" cy="259" r="2" fill="#4D92C4" />
          <rect x="218" y="256.5" width="32" height="2" rx="1" fill="#9CB7CE" />
          <rect x="218" y="261"   width="24" height="2" rx="1" fill="#CFDAE6" />
        </motion.g>

        {/* Receive pulse: fires when the plane enters the letter at t≈0.93
            of the 12s orbit cycle. begin = planeDelay + 12s * 0.93 ≈ 12.56s. */}
        <circle
          cx="228" cy="100" r="3"
          fill="none"
          stroke="#4D92C4"
          strokeWidth="1.6"
          opacity="0"
        >
          <animate
            attributeName="r"
            values="3;14;18"
            keyTimes="0;0.6;1"
            dur="1.2s"
            begin="12.56s;hiw-receive.end+10.8s"
            id="hiw-receive"
            fill="freeze"
          />
          <animate
            attributeName="opacity"
            values="0;0.7;0"
            keyTimes="0;0.5;1"
            dur="1.2s"
            begin="12.56s;hiw-receive.end+10.8s"
            fill="freeze"
          />
        </circle>

        {/* Paper plane: orbits around the envelope, then dives into the
            letter and loops. Initial state is hidden; the orbit keyframes
            handle the reveal at t=0.04. */}
        <motion.g
          initial={{ opacity: 0 }}
          {...planeIdle}
          style={{ transformOrigin: '300px 80px' }}
        >
          <path d="M 260 60 L 348 36 L 318 124 L 296 96 Z" fill="url(#ci-plane)" />
          <path d="M 296 96 L 318 124 L 348 36 Z" fill="url(#ci-plane-shade)" opacity="0.7" />
          <path d="M 260 60 L 318 124" stroke="#FFD75A" strokeWidth="1" fill="none" opacity="0.9" />
          {/* Plane trail (3 small fading lines behind it) */}
          <g opacity="0.7">
            <line x1="248" y1="64" x2="232" y2="68" stroke="#FFD75A" strokeWidth="1.4" strokeLinecap="round" />
            <line x1="240" y1="74" x2="218" y2="80" stroke="#FFD75A" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
            <line x1="232" y1="86" x2="206" y2="94" stroke="#FFD75A" strokeWidth="1"   strokeLinecap="round" opacity="0.45" />
          </g>
        </motion.g>

        {/* Floating message bubble: bottom left */}
        <motion.g
          variants={popIn}
          {...bubbleIdle(4.6, 8, 0)}
          style={{ transformOrigin: '88px 233px' }}
        >
          <rect x="56" y="216" width="64" height="34" rx="17" fill="#FFFFFF" stroke="#B6D8EF" strokeWidth="1.3" />
          <path d="M 70 250 L 78 258 L 84 250" fill="#FFFFFF" stroke="#B6D8EF" strokeWidth="1.3" strokeLinejoin="round" />
          <circle cx="76" cy="233" r="2" fill="#4D92C4" />
          <circle cx="88" cy="233" r="2" fill="#4D92C4" />
          <circle cx="100" cy="233" r="2" fill="#4D92C4" />
        </motion.g>

        {/* Heart / response bubble: top right */}
        <motion.g
          variants={popIn}
          {...bubbleIdle(5.2, 6, 0.7)}
          style={{ transformOrigin: '378px 170px' }}
        >
          <circle cx="378" cy="170" r="14" fill="#FFFFFF" stroke="#FFE08A" strokeWidth="1.4" />
          <path
            d="M 378 176 C 374 172, 370 169, 372 165 C 373 162, 376 162, 378 165 C 380 162, 383 162, 384 165 C 386 169, 382 172, 378 176 Z"
            fill="#FFC107"
            opacity="0.9"
          />
        </motion.g>

        {/* Check bubble: middle right */}
        <motion.g
          variants={popIn}
          {...bubbleIdle(4.8, 5, 1.1)}
          style={{ transformOrigin: '356px 240px' }}
        >
          <circle cx="356" cy="240" r="12" fill="#FFFFFF" stroke="#B6E2CF" strokeWidth="1.4" />
          <path d="M 351 240 L 354 244 L 361 236" stroke="#5BC0A1" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </motion.g>
      </svg>
    </motion.div>
  );
}

// ─── AboutSection ─────────────────────────────────────────────────────────────
export function AboutSection() {
  return (
    <section id="about" className="relative border-t border-[var(--border)] bg-blue-200">
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--brand-primary)]/[0.02] to-transparent pointer-events-none" />
      <div className="relative mx-auto max-w-6xl px-6 py-24 lg:py-32">

        {/* Hero text + stats */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
          className="mx-auto max-w-3xl text-center"
        >
          <motion.div variants={fadeInUp}>
            <Badge>Why Qurelio</Badge>
          </motion.div>

          <motion.h2
            variants={fadeInUp}
            className="mt-6 text-4xl font-bold tracking-tight text-[var(--text-primary)] sm:text-5xl lg:text-6xl"
          >
            Quality management,{' '}
            <span className="bg-gradient-to-r from-[var(--brand-primary)] to-blue-400 bg-clip-text text-transparent">
              simplified
            </span>
          </motion.h2>

          <motion.p
            variants={fadeInUp}
            className="mt-6 max-w-2xl mx-auto text-base leading-relaxed text-[var(--muted)] sm:text-lg"
          >
            Qurelio helps organizations prove their products meet the public laws and regulations
            of every market they sell to. From document control to audits and non-conformities,
            teams get a single workspace that stays audit-ready.
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="mt-12 grid grid-cols-3 gap-4 max-w-lg mx-auto"
          >
            {STATS.map((stat, i) => (
              <StatCard key={i} stat={stat} index={i} />
            ))}
          </motion.div>
        </motion.div>

        {/* Benefit cards */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-100px' }}
          variants={stagger}
          className="mt-20 grid gap-6 md:grid-cols-3"
        >
          {BENEFITS.map((benefit, i) => (
            <BenefitCard key={i} benefit={benefit} index={i} />
          ))}
        </motion.div>

      </div>
    </section>
  );
}

// ─── ContactSection ───────────────────────────────────────────────────────────
export function ContactSection() {
  const { form, sent, loading, handleSubmit, updateField, resetForm } = useContactForm();

  return (
    <section
      id="contact"
      className="relative overflow-hidden rounded-t-[32px] border border-b-0 border-[var(--border)]/60 sm:rounded-t-[40px]"
      style={{
        background: [
          'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(206, 230, 247, 0.28), transparent 70%)',
          'radial-gradient(ellipse 50% 30% at 0% 100%, rgba(255, 232, 168, 0.18), transparent 70%)',
          'linear-gradient(180deg, #F4F8FD 0%, #FAFCFE 100%)',
        ].join(', '),
      }}
    >
      <div className="relative mx-auto max-w-7xl px-6 py-24 lg:py-32">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">

          {/* Left column */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={stagger}
            className="flex flex-col"
          >
            <motion.div variants={fadeInUp} className="flex justify-center">
              <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 ring-1 ring-[var(--brand-primary)]/15">
                <span aria-hidden className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--brand-primary)]/10 to-transparent" />
                <Mail className="relative h-5 w-5 text-[var(--brand-primary)]" strokeWidth={2.2} />
              </div>
            </motion.div>

            <motion.h2
              variants={fadeInUp}
              className="mt-6 text-center text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl"
            >
              Contact us
            </motion.h2>

            <motion.p
              variants={fadeInUp}
              className="mt-4 mx-auto max-w-md text-center text-base leading-relaxed text-neutral-500 sm:text-lg"
            >
              Tell us about your products, your markets and your compliance challenges.
              We&apos;ll show you what Qurelio can do with them.
            </motion.p>

            <motion.div
              variants={fadeInUp}
              className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-neutral-500"
            >
              <a href={`mailto:${CONTACT_EMAIL_PRIMARY}`} className="transition-colors hover:text-neutral-800">
                {CONTACT_EMAIL_PRIMARY}
              </a>
              <span aria-hidden="true" className="text-neutral-300">•</span>
              <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="transition-colors hover:text-neutral-800">
                {CONTACT_PHONE}
              </a>
              <span aria-hidden="true" className="text-neutral-300">•</span>
              <a href={`mailto:${CONTACT_EMAIL_SUPPORT}`} className="transition-colors hover:text-neutral-800">
                {CONTACT_EMAIL_SUPPORT}
              </a>
            </motion.div>

            <ContactIllustration />
          </motion.div>

          {/* Right column: form */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-100px' }}
            variants={fadeInUp}
          >
            <div
              className="relative overflow-hidden rounded-3xl border border-neutral-200/70 bg-white/70 p-8 lg:p-10"
              style={{
                backgroundImage: `
                  linear-gradient(to right, rgb(229 231 235 / 0.40) 1px, transparent 1px),
                  linear-gradient(to bottom, rgb(229 231 235 / 0.40) 1px, transparent 1px)
                `,
                backgroundSize: '32px 32px',
              }}
            >
              {/* Soft tonal overlay: replaces the old shadow with a calm tint. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3xl"
                style={{
                  background: [
                    'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(206, 230, 247, 0.35), transparent 65%)',
                    'radial-gradient(ellipse 60% 50% at 100% 100%, rgba(255, 232, 168, 0.18), transparent 65%)',
                    'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.20))',
                  ].join(', '),
                }}
              />
              {/* Hairline inner gradient ring: flat, no blur */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/60"
              />

              {sent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="relative flex flex-col items-center justify-center py-16 text-center"
                >
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500">
                    <CheckCircle className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="mb-2 text-2xl font-bold text-neutral-900">Message sent!</h3>
                  <p className="mb-6 max-w-sm text-neutral-500">
                    Thanks for reaching out. We&apos;ll get back to you within one business day.
                  </p>
                  <button
                    onClick={resetForm}
                    className="inline-flex items-center gap-2 text-sm font-medium text-neutral-900 underline-offset-4 hover:underline"
                  >
                    Send another message
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="relative space-y-5">
                  <Field
                    id="cf-name"
                    label="Full name"
                    placeholder="Jane Doe"
                    value={form.name}
                    onChange={updateField('name')}
                    required
                  />
                  <Field
                    id="cf-email"
                    label="Email Address"
                    placeholder="you@company.com"
                    type="email"
                    value={form.email}
                    onChange={updateField('email')}
                    required
                  />
                  <Field
                    id="cf-company"
                    label="Company"
                    placeholder="Your company"
                    value={form.company}
                    onChange={updateField('company')}
                  />

                  <div className="group">
                    <label
                      htmlFor="cf-message"
                      className="mb-1.5 block text-[12.5px] font-medium uppercase tracking-[0.1em] text-neutral-500 transition-colors duration-300 group-focus-within:text-[var(--brand-primary)]"
                    >
                      Message
                    </label>
                    <div className="relative isolate">
                      <textarea
                        id="cf-message"
                        required
                        rows={5}
                        placeholder="Tell us about your needs..."
                        value={form.message}
                        onChange={updateField('message')}
                        className={`${inputBaseClass} resize-none leading-relaxed`}
                      />
                      <FieldRing />
                      <FieldUnderline />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <p className="text-xs text-neutral-500">
                      We typically reply within <span className="font-medium text-neutral-700">one business day.</span>
                    </p>
                    <button
                      type="submit"
                      disabled={loading}
                      className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[#3F7BAB] px-6 py-3 text-sm font-semibold text-white outline-none transition-[transform,background] duration-300 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {/* Soft sheen: flat color sweep, no shadow */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
                      />
                      {loading ? (
                        <span className="relative inline-flex items-center gap-2">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" />
                          </svg>
                          Sending…
                        </span>
                      ) : (
                        <>
                          <span className="relative">Send message</span>
                          <ArrowRight className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}