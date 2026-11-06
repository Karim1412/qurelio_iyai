'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useInView,
} from 'framer-motion';


const FEATURES = [
  {
    id: 1,
    title: 'Évaluations & Métriques',
    desc: 'Suivez les scores de conformité et les initiatives damélioration avec précision. Visualisez vos performances en temps réel.',
    icon: 'metrics',
    color: 'from-blue-500 to-cyan-400',
    bgColor: '#EFF6FF',
    iconColor: '#3B82F6',
  },
  {
    id: 2,
    title: 'Contrôle Documentaire',
    desc: 'Centralisez politiques et procédures avec un système de versioning clair. Gérez vos documents en toute simplicité.',
    icon: 'document',
    color: 'from-violet-500 to-purple-400',
    bgColor: '#F5F3FF',
    iconColor: '#8B5CF6',
  },
  {
    id: 3,
    title: 'Audits & Conformité',
    desc: 'Planifiez les audits, capturez les résultats et fermez les actions plus rapidement. Automatisez vos processus.',
    icon: 'audit',
    color: 'from-amber-500 to-orange-400',
    bgColor: '#FFFBEB',
    iconColor: '#F59E0B',
  },
  {
    id: 4,
    title: 'Espaces de Travail',
    desc: 'Accès basé sur les rôles pour tous les membres de léquipe en toute simplicité. Collaborez efficacement.',
    icon: 'team',
    color: 'from-emerald-500 to-teal-400',
    bgColor: '#ECFDF5',
    iconColor: '#10B981',
  },
  {
    id: 5,
    title: 'Rapports Intelligents',
    desc: 'Générez des rapports détaillés et des analyses approfondies. Prenez des décisions éclairées.',
    icon: 'report',
    color: 'from-rose-500 to-pink-400',
    bgColor: '#FFF1F2',
    iconColor: '#F43F5E',
  },
  {
    id: 6,
    title: 'Intégrations Fluides',
    desc: 'Connectez vos outils préférés et synchronisez vos données. Un écosystème connecté.',
    icon: 'integration',
    color: 'from-indigo-500 to-blue-400',
    bgColor: '#EEF2FF',
    iconColor: '#6366F1',
  },
];

const Illustrations: Record<string, React.FC<{ color: string }>> = {
  metrics: ({ color }) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="14" fill="white" stroke={color} strokeWidth="1" opacity="0.3" />
      <rect x="16" y="52" width="12" height="24" rx="3" fill={color} opacity="0.85" />
      <rect x="34" y="38" width="12" height="38" rx="3" fill={color} opacity="0.85" />
      <rect x="52" y="26" width="12" height="50" rx="3" fill={color} opacity="0.85" />
      <rect x="70" y="34" width="12" height="42" rx="3" fill={color} opacity="0.85" />
      <path d="M 16 44 L 34 30 L 52 18 L 70 26" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="16" cy="44" r="2.5" fill={color} />
      <circle cx="34" cy="30" r="2.5" fill={color} />
      <circle cx="52" cy="18" r="2.5" fill={color} />
      <circle cx="70" cy="26" r="2.5" fill={color} />
      <circle cx="82" cy="82" r="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
      <path d="M 77 82 L 80 85 L 87 77" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  document: ({ color }) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="14" fill="white" stroke={color} strokeWidth="1" opacity="0.3" />
      <rect x="20" y="16" width="40" height="56" rx="5" fill={color} opacity="0.12" stroke={color} strokeWidth="1.2" />
      <path d="M 60 16 L 60 40 L 46 40" fill="none" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="26" y1="28" x2="52" y2="28" stroke={color} strokeWidth="2" opacity="0.6" strokeLinecap="round" />
      <line x1="26" y1="38" x2="52" y2="38" stroke={color} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="26" y1="47" x2="46" y2="47" stroke={color} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <line x1="26" y1="56" x2="52" y2="56" stroke={color} strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <rect x="26" y="64" width="22" height="4" rx="2" fill={color} opacity="0.4" />
      <circle cx="72" cy="72" r="14" fill="none" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <path d="M 65 72 Q 72 60 79 72" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
    </svg>
  ),
  audit: ({ color }) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="14" fill="white" stroke={color} strokeWidth="1" opacity="0.3" />
      <rect x="18" y="18" width="38" height="50" rx="4" fill={color} opacity="0.1" stroke={color} strokeWidth="1" />
      <circle cx="30" cy="32" r="5" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <path d="M 28 32 L 30 34 L 34 29" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <circle cx="30" cy="48" r="5" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <path d="M 28 48 L 30 50 L 34 45" stroke={color} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <circle cx="30" cy="64" r="5" fill="none" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <circle cx="72" cy="40" r="14" fill="none" stroke={color} strokeWidth="1.5" opacity="0.3" />
      <circle cx="72" cy="40" r="14" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="55 30" strokeLinecap="round" opacity="0.7" transform="rotate(-90 72 40)" />
      <path d="M 64 40 L 69 46 L 81 31" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      <circle cx="72" cy="72" r="10" fill="none" stroke={color} strokeWidth="1" opacity="0.3" />
      <text x="72" y="75" textAnchor="middle" fontSize="8" fontWeight="600" fill={color} opacity="0.6">A</text>
    </svg>
  ),
  team: ({ color }) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="14" fill="white" stroke={color} strokeWidth="1" opacity="0.3" />
      <circle cx="50" cy="50" r="18" fill="none" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <circle cx="50" cy="50" r="9" fill={color} opacity="0.12" />
      <circle cx="30" cy="36" r="9" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <circle cx="30" cy="36" r="3.5" fill={color} opacity="0.4" />
      <circle cx="70" cy="36" r="9" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <circle cx="70" cy="36" r="3.5" fill={color} opacity="0.4" />
      <circle cx="50" cy="78" r="9" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5" />
      <circle cx="50" cy="78" r="3.5" fill={color} opacity="0.4" />
      <line x1="37" y1="42" x2="44" y2="46" stroke={color} strokeWidth="1.2" opacity="0.3" strokeLinecap="round" />
      <line x1="56" y1="46" x2="63" y2="42" stroke={color} strokeWidth="1.2" opacity="0.3" strokeLinecap="round" />
      <line x1="50" y1="69" x2="50" y2="60" stroke={color} strokeWidth="1.2" opacity="0.3" strokeLinecap="round" />
    </svg>
  ),
  report: ({ color }) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="14" fill="white" stroke={color} strokeWidth="1" opacity="0.3" />
      <rect x="16" y="16" width="30" height="68" rx="3" fill={color} opacity="0.1" stroke={color} strokeWidth="1" />
      <rect x="54" y="16" width="30" height="68" rx="3" fill={color} opacity="0.1" stroke={color} strokeWidth="1" />
      <circle cx="31" cy="36" r="9" fill="none" stroke={color} strokeWidth="2" opacity="0.7" />
      <path d="M 31 30 L 31 36 L 36 36" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="69" cy="36" r="9" fill="none" stroke={color} strokeWidth="2" opacity="0.7" />
      <path d="M 65 36 L 73 36" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="22" y="55" width="18" height="4" rx="2" fill={color} opacity="0.4" />
      <rect x="22" y="64" width="14" height="4" rx="2" fill={color} opacity="0.3" />
      <rect x="60" y="55" width="18" height="4" rx="2" fill={color} opacity="0.4" />
      <rect x="60" y="64" width="18" height="4" rx="2" fill={color} opacity="0.4" />
      <rect x="60" y="73" width="12" height="4" rx="2" fill={color} opacity="0.3" />
    </svg>
  ),
  integration: ({ color }) => (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <rect x="8" y="8" width="84" height="84" rx="14" fill="white" stroke={color} strokeWidth="1" opacity="0.3" />
      <circle cx="28" cy="50" r="18" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
      <circle cx="28" cy="50" r="9" fill={color} opacity="0.12" />
      <text x="28" y="53" textAnchor="middle" fontSize="7" fontWeight="600" fill={color} opacity="0.6">API</text>
      <circle cx="72" cy="50" r="18" fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
      <circle cx="72" cy="50" r="9" fill={color} opacity="0.12" />
      <text x="72" y="53" textAnchor="middle" fontSize="7" fontWeight="600" fill={color} opacity="0.6">DB</text>
      <path d="M 38 56 Q 50 44 62 56" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <path d="M 38 44 Q 50 56 62 44" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <circle cx="50" cy="26" r="10" fill="none" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <circle cx="50" cy="26" r="4" fill={color} opacity="0.2" />
      <circle cx="50" cy="74" r="10" fill="none" stroke={color} strokeWidth="1.2" opacity="0.3" />
      <circle cx="50" cy="74" r="4" fill={color} opacity="0.2" />
    </svg>
  ),
};

function FeatureCard({ feature, index }: { feature: typeof FEATURES[0]; index: number }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  
  const IconComponent = Illustrations[feature.icon];
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -100, rotate: -5 }}
      animate={isInView ? { 
        opacity: 1, 
        y: 0, 
        rotate: 0 
      } : { 
        opacity: 0, 
        y: -100, 
        rotate: -5 
      }}
      transition={{ 
        duration: 0.7, 
        delay: index * 0.12, 
        ease: [0.25, 0.46, 0.45, 0.94],
        bounce: 0.3
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group"
    >
      <div className={`
        relative overflow-hidden rounded-2xl p-6 transition-all duration-500
        bg-white border border-slate-100
        ${isHovered ? 'scale-[1.02]' : 'shadow-lg'}
      `}>
        {isHovered && (
          <motion.div 
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundColor: feature.iconColor }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="w-40 h-40 opacity-10"
                initial={{ scale: 0.8, rotate: -10 }}
                animate={{ scale: 1.1, rotate: 5 }}
                transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
              >
                <IconComponent color={feature.iconColor} />
              </motion.div>
            </div>
          </motion.div>
        )}
        
        <div className={`absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r ${feature.color}`} />
        
        <div className="relative z-10 flex flex-col items-center">
          <motion.div
            className="mb-4"
            initial={{ scale: 0.9 }}
            animate={{ scale: isHovered ? 1.15 : 1 }}
            transition={{ duration: 0.3 }}
          >
            <div 
              className="w-20 h-20 rounded-xl flex items-center justify-center transition-all duration-300"
              style={{ backgroundColor: feature.bgColor }}
            >
              <IconComponent color={feature.iconColor} />
            </div>
          </motion.div>

          <div className="text-center">
            <h3 className="text-base font-semibold text-slate-800 mb-2">
              {feature.title}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {feature.desc}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function FeaturesSection() {
  const containerRef = useRef(null);
  const headerRef = useRef(null);
  const { scrollY } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const headerInView = useInView(headerRef, { once: true, margin: "-100px" });
  const headerY = useTransform(scrollY, [0, 300], [0, -30]);

  return (
    <section
      ref={containerRef}
      className="relative bg-gradient-to-b from-slate-50 via-white to-slate-100 py-20 md:py-32 overflow-hidden"
    >

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-blue-50 rounded-full opacity-50 blur-3xl"
          animate={{ scale: [1, 1.1, 1], x: [0, 30, 0] }}
          transition={{ duration: 12, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-10 right-1/4 w-[350px] h-[350px] bg-purple-50 rounded-full opacity-40 blur-3xl"
          animate={{ scale: [1, 1.15, 1], x: [0, -20, 0] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <motion.div
        ref={headerRef}
        style={{ y: headerY }}
        className="relative z-10 text-center mb-16 px-6"
      >
        <motion.span
          className="inline-block text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0 }}
        >
          Fonctionnalités
        </motion.span>

        <motion.h2
          className="text-4xl md:text-5xl font-bold text-slate-800 mt-4 mb-5"
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Ce Qui Nous Rend Unique
        </motion.h2>

        <motion.p
          className="text-base text-slate-500 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={headerInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Des fonctionnalités puissantes conçues pour simplifier vos processus de conformité et qualité
        </motion.p>
      </motion.div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={feature.id} feature={feature} index={index} />
          ))}
        </div>
      </div>

      <motion.div
        className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.5, delay: 0.5 }}
      />
    </section>
  );
}