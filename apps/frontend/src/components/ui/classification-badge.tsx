'use client';

import React from 'react';
import { Lock, Shield, Eye, ShieldAlert } from 'lucide-react';

/**
 * ClassificationBadge — code couleur officiel OMNITECH SECURITY
 * basé sur la charte PANTONE de SEAL System :
 *   - PUBLIC       → Vert PANTONE 349C    (#006233)
 *   - INTERNE      → Bleu PANTONE 660C    (#296DC1)
 *   - CONFIDENTIEL → Orange PANTONE 715C  (#F9964A)
 *   - SECRET       → Bordeaux PANTONE 202C(#892034)
 *
 * Conforme ISO 27001 A.5.12 — Classification de l'information.
 */

type Classification = 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL' | 'SECRET';

interface ClassificationConfig {
  label: string;
  hex: string;
  icon: React.ElementType;
  bg: string;
  bgDark: string;
  ring: string;
  description: string;
}

const CLASSIFICATIONS: Record<Classification, ClassificationConfig> = {
  PUBLIC: {
    label: 'Public',
    hex: '#006233',
    icon: Eye,
    bg: 'rgba(0, 98, 51, 0.08)',
    bgDark: 'rgba(0, 98, 51, 0.18)',
    ring: 'rgba(0, 98, 51, 0.3)',
    description: 'Diffusable librement, y compris en externe. Communiqués, brochures, CGV.',
  },
  INTERNE: {
    label: 'Interne',
    hex: '#296DC1',
    icon: Shield,
    bg: 'rgba(41, 109, 193, 0.08)',
    bgDark: 'rgba(41, 109, 193, 0.18)',
    ring: 'rgba(41, 109, 193, 0.3)',
    description: 'Réservé aux collaborateurs OMNITECH. Procédures, notes de service, organigrammes.',
  },
  CONFIDENTIEL: {
    label: 'Confidentiel',
    hex: '#F9964A',
    icon: Lock,
    bg: 'rgba(249, 150, 74, 0.1)',
    bgDark: 'rgba(249, 150, 74, 0.2)',
    ring: 'rgba(249, 150, 74, 0.35)',
    description: 'Accès restreint (besoin d\'en connaître). Audits, contrats, rapports d\'incidents.',
  },
  SECRET: {
    label: 'Secret',
    hex: '#892034',
    icon: ShieldAlert,
    bg: 'rgba(137, 32, 52, 0.1)',
    bgDark: 'rgba(137, 32, 52, 0.2)',
    ring: 'rgba(137, 32, 52, 0.35)',
    description: 'Cercle restreint, validation RSSI requise. Clés crypto, mots de passe maîtres, PCA.',
  },
};

interface ClassificationBadgeProps {
  level: Classification | string | null | undefined;
  size?: 'xs' | 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export function ClassificationBadge({
  level,
  size = 'sm',
  showIcon = true,
  className = '',
}: ClassificationBadgeProps) {
  const safeLevel = (level || 'INTERNE').toUpperCase() as Classification;
  const config = CLASSIFICATIONS[safeLevel] || CLASSIFICATIONS.INTERNE;
  const Icon = config.icon;

  const sizeStyles = {
    xs: 'text-[9px] px-1.5 py-0.5 gap-0.5',
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  const iconSize = {
    xs: 'h-2.5 w-2.5',
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wider border ${sizeStyles[size]} ${className}`}
      style={{
        color: config.hex,
        backgroundColor: config.bg,
        borderColor: config.ring,
      }}
      title={`Classification ISO 27001 A.5.12 : ${config.label}`}
    >
      {showIcon && <Icon className={iconSize[size]} />}
      {config.label}
    </span>
  );
}

/**
 * Badge "Statut alarme" — code couleur SEAL System pour les états d'alarme
 */
type AlarmStatus = 'NEW' | 'NORMAL' | 'ACK' | 'ENDED';

const ALARM_CONFIG: Record<AlarmStatus, { label: string; hex: string; bg: string }> = {
  NEW:    { label: 'Nouvelle',  hex: '#cc0000', bg: 'rgba(204, 0, 0, 0.1)' },
  NORMAL: { label: 'Active',    hex: '#762323', bg: 'rgba(118, 35, 35, 0.1)' },
  ACK:    { label: 'Acquittée', hex: '#c68200', bg: 'rgba(198, 130, 0, 0.1)' },
  ENDED:  { label: 'Terminée',  hex: '#70916a', bg: 'rgba(112, 145, 106, 0.1)' },
};

export function AlarmStatusBadge({ status }: { status: AlarmStatus | string }) {
  const safe = (status?.toUpperCase() as AlarmStatus) || 'NEW';
  const config = ALARM_CONFIG[safe] || ALARM_CONFIG.NEW;
  return (
    <span
      className="inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
      style={{ color: config.hex, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}
