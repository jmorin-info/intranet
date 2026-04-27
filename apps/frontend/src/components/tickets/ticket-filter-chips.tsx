"use client";

/**
 * TicketFilterChips — chips de filtres rapides pour la liste tickets.
 *
 * 5 chips : Mes tickets / Mes mentions / SLA dépassé / Aujourd'hui /
 * Cette semaine. Multi-select. La logique de filtrage est externalisée
 * (fonction pure `applyTicketChipFilters`) pour la testabilité.
 *
 * Le parent passe `value` (Set<chipId>) + `onChange` ; un bouton « Tout
 * réinitialiser » apparaît dès qu'au moins une chip est active.
 */

import React from "react";
import {
  User,
  AtSign,
  AlertTriangle,
  Calendar,
  CalendarDays,
  X,
} from "lucide-react";

export type TicketFilterChipId =
  | "mine"
  | "mentions"
  | "sla-exceeded"
  | "today"
  | "week";

export interface TicketLite {
  id: string;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeId?: string | null;
  createdAt: string;
  /** IDs of users mentioned in any ticket comment (caller pre-computed). */
  mentionedUserIds?: string[];
}

interface TicketFilterChipsProps {
  active: Set<TicketFilterChipId>;
  onChange: (next: Set<TicketFilterChipId>) => void;
  className?: string;
}

const CHIPS: Array<{
  id: TicketFilterChipId;
  label: string;
  icon: React.ElementType;
}> = [
  { id: "mine", label: "Mes tickets", icon: User },
  { id: "mentions", label: "Mes mentions", icon: AtSign },
  { id: "sla-exceeded", label: "SLA dépassé", icon: AlertTriangle },
  { id: "today", label: "Aujourd'hui", icon: Calendar },
  { id: "week", label: "Cette semaine", icon: CalendarDays },
];

export function TicketFilterChips({
  active,
  onChange,
  className = "",
}: TicketFilterChipsProps) {
  const toggle = (id: TicketFilterChipId) => {
    const next = new Set(active);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };
  const reset = () => onChange(new Set());

  return (
    <div
      role="toolbar"
      aria-label="Filtres rapides"
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {CHIPS.map((c) => {
        const Icon = c.icon;
        const isActive = active.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => toggle(c.id)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              isActive
                ? "seal-bg-blue text-white border border-transparent shadow-sm"
                : "bg-white dark:bg-slate-900 text-seal-navy dark:text-slate-200 border border-gray-200 dark:border-slate-700 hover:border-primary/40 hover:bg-primary/5"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {c.label}
          </button>
        );
      })}

      {active.size > 0 && (
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-seal-bordeaux dark:hover:text-red-300"
          aria-label="Réinitialiser les filtres rapides"
        >
          <X className="h-3 w-3" />
          Tout réinitialiser
        </button>
      )}
    </div>
  );
}

/** Délai SLA : pour CRITIQUE/HIGH > 4h ouverts. */
const SLA_HOURS = 4;

export interface ApplyChipFiltersOptions {
  active: Set<TicketFilterChipId>;
  currentUserId?: string | null;
  /** Date « now » utilisée pour les filtres temporels (default new Date()). */
  now?: Date;
}

/**
 * Filtre pur (testable) — applique l'ensemble des chips actives à une
 * liste de tickets. Toutes les chips sont combinées en AND : un ticket
 * doit satisfaire CHAQUE chip active pour rester dans le résultat.
 */
export function applyTicketChipFilters<T extends TicketLite>(
  tickets: T[],
  options: ApplyChipFiltersOptions,
): T[] {
  const { active, currentUserId, now = new Date() } = options;
  if (active.size === 0) return tickets;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // ISO week start (Monday)
  const weekStart = new Date(todayStart);
  const dayOfWeek = (weekStart.getDay() + 6) % 7; // 0 = Monday
  weekStart.setDate(weekStart.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  return tickets.filter((t) => {
    if (active.has("mine")) {
      if (!currentUserId || t.assigneeId !== currentUserId) return false;
    }
    if (active.has("mentions")) {
      if (
        !currentUserId ||
        !(t.mentionedUserIds ?? []).includes(currentUserId)
      ) {
        return false;
      }
    }
    if (active.has("sla-exceeded")) {
      const isHighPriority = t.priority === "CRITICAL" || t.priority === "HIGH";
      const isOpen = t.status === "OPEN" || t.status === "IN_PROGRESS";
      if (!isHighPriority || !isOpen) return false;
      const created = new Date(t.createdAt).getTime();
      if (Number.isNaN(created)) return false;
      const hours = (now.getTime() - created) / (60 * 60 * 1000);
      if (hours <= SLA_HOURS) return false;
    }
    if (active.has("today")) {
      const d = new Date(t.createdAt);
      if (d < todayStart || d >= todayEnd) return false;
    }
    if (active.has("week")) {
      const d = new Date(t.createdAt);
      if (d < weekStart || d >= weekEnd) return false;
    }
    return true;
  });
}
