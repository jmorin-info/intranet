'use client';

/**
 * Dashboard Watch Faces
 * =====================
 *
 * Permet à l'utilisateur de choisir une "face" (preset d'affichage) pour son
 * dashboard, à la manière d'une Apple Watch. Chaque face active un sous-ensemble
 * de widgets et modifie la densité.
 *
 * - Standard : tout activé (défaut)
 * - Focus : essentiel seulement (Morning Briefing, Actions, Mes tâches)
 * - Executive : indicateurs + conformité, sans bruit
 * - Operational : stats IT + santé système + tickets
 *
 * Persiste dans localStorage('dashboard_face').
 */

import React from 'react';
import { Gauge, Focus as FocusIcon, BarChart3, Wrench } from 'lucide-react';

export type DashboardFaceId = 'standard' | 'focus' | 'executive' | 'operational';

export interface DashboardFaceDef {
  id: DashboardFaceId;
  label: string;
  description: string;
  Icon: React.ElementType;
  prefs: {
    showStats: boolean;
    showNews: boolean;
    showClock: boolean;
    showWeather: boolean;
    showQuickLinks: boolean;
    showQuote: boolean;
    showRss: boolean;
    showActivity: boolean;
    showHealthIT: boolean;
  };
}

export const DASHBOARD_FACES: readonly DashboardFaceDef[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'Tout l\'espace — news, stats, accès rapide, activité.',
    Icon: Gauge,
    prefs: {
      showStats: true, showNews: true, showClock: true, showWeather: true,
      showQuickLinks: true, showQuote: true, showRss: true, showActivity: true,
      showHealthIT: true,
    },
  },
  {
    id: 'focus',
    label: 'Focus',
    description: 'Essentiel — briefing, actions, mes tâches.',
    Icon: FocusIcon,
    prefs: {
      showStats: false, showNews: false, showClock: true, showWeather: false,
      showQuickLinks: true, showQuote: false, showRss: false, showActivity: false,
      showHealthIT: false,
    },
  },
  {
    id: 'executive',
    label: 'Executive',
    description: 'Indicateurs & conformité, lecture rapide.',
    Icon: BarChart3,
    prefs: {
      showStats: true, showNews: true, showClock: true, showWeather: false,
      showQuickLinks: false, showQuote: true, showRss: false, showActivity: false,
      showHealthIT: true,
    },
  },
  {
    id: 'operational',
    label: 'Operational',
    description: 'Santé IT, tickets, activité temps réel.',
    Icon: Wrench,
    prefs: {
      showStats: true, showNews: false, showClock: true, showWeather: false,
      showQuickLinks: true, showQuote: false, showRss: true, showActivity: true,
      showHealthIT: true,
    },
  },
] as const;

const FACE_KEY = 'dashboard_face';

export function loadDashboardFace(): DashboardFaceId {
  if (typeof window === 'undefined') return 'standard';
  const raw = localStorage.getItem(FACE_KEY);
  if (raw && DASHBOARD_FACES.some((f) => f.id === raw)) return raw as DashboardFaceId;
  return 'standard';
}

export function saveDashboardFace(id: DashboardFaceId) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FACE_KEY, id);
}

interface DashboardFaceSelectorProps {
  value: DashboardFaceId;
  onChange: (face: DashboardFaceDef) => void;
}

export function DashboardFaceSelector({ value, onChange }: DashboardFaceSelectorProps) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
        Face du tableau de bord
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {DASHBOARD_FACES.map((face) => {
          const active = face.id === value;
          const Icon = face.Icon;
          return (
            <button
              key={face.id}
              type="button"
              onClick={() => onChange(face)}
              aria-pressed={active}
              className={`group relative rounded-lg border text-left p-3 transition btn-lift ${
                active
                  ? 'border-primary bg-primary/5 dark:bg-primary/10 shadow-sm'
                  : 'border-gray-200 dark:border-slate-700 hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`h-7 w-7 rounded-lg flex items-center justify-center ${
                    active
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span
                  className={`text-xs font-semibold ${
                    active ? 'text-primary' : 'text-navy dark:text-white'
                  }`}
                >
                  {face.label}
                </span>
              </div>
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 leading-tight">
                {face.description}
              </p>
              {active && (
                <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary animate-soft-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DashboardFaceSelector;
