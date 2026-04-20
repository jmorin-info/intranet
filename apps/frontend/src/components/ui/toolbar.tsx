'use client';

/**
 * <Toolbar />
 * ============
 *
 * Barre d'outils réutilisable (Apple HIG-like) :
 *   - groupes d'actions séparés visuellement
 *   - recherche intégrée optionnelle (`searchable` + `onSearch`)
 *   - filtres chips cliquables
 *   - actions primaires / secondaires
 *   - responsive : overflow "Plus…" sur mobile (repli via menu simple)
 *   - dark mode + a11y (role="toolbar", aria-labels)
 *
 * Structure plate : on passe les groupes via `groups` plutôt que children
 * pour faciliter la logique d'overflow.
 */

import React, { useState, useRef, useEffect, useId } from 'react';
import type { ComponentType, SVGProps, ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ToolbarAction {
  id: string;
  label: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  onClick?: () => void;
  /** Variante visuelle du bouton. */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Désactive l'action. */
  disabled?: boolean;
  /** Raccourci clavier affiché à titre indicatif (ex: "⌘K"). */
  shortcut?: string;
}

export interface ToolbarFilterChip {
  id: string;
  label: string;
  active?: boolean;
  onToggle?: () => void;
}

export interface ToolbarGroup {
  id: string;
  actions: ToolbarAction[];
  /** Si true, ce groupe est prioritaire et n'est jamais mis dans l'overflow. */
  sticky?: boolean;
}

export interface ToolbarProps {
  /** Groupes d'actions (séparés visuellement par un trait vertical). */
  groups?: ToolbarGroup[];
  /** Active la barre de recherche intégrée. */
  searchable?: boolean;
  /** Callback sur chaque changement du champ recherche. */
  onSearch?: (value: string) => void;
  /** Placeholder de la recherche. */
  searchPlaceholder?: string;
  /** Valeur contrôlée de la recherche. */
  searchValue?: string;
  /** Filtres chips optionnels (au-dessus ou à gauche selon responsive). */
  filters?: ToolbarFilterChip[];
  /** Contenu additionnel aligné à droite (ex: vue liste/grille). */
  rightSlot?: ReactNode;
  /** Label a11y de la toolbar. */
  ariaLabel?: string;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Bouton action interne                                              */
/* ------------------------------------------------------------------ */

function variantClasses(v: ToolbarAction['variant'] = 'secondary'): string {
  switch (v) {
    case 'primary':
      return 'bg-[#004469] text-white hover:bg-[#00324f] dark:bg-[#F68D2E] dark:text-neutral-900 dark:hover:bg-[#F9964A]';
    case 'ghost':
      return 'bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800';
    case 'secondary':
    default:
      return 'bg-white text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-700';
  }
}

function ActionBtn({ action }: { action: ToolbarAction }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      aria-label={action.label}
      title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
      className={
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ' +
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F68D2E] focus-visible:ring-offset-1 ' +
        'disabled:opacity-50 disabled:cursor-not-allowed ' +
        variantClasses(action.variant)
      }
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      <span className="whitespace-nowrap">{action.label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Overflow menu (mobile)                                             */
/* ------------------------------------------------------------------ */

function OverflowMenu({ items }: { items: ToolbarAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Plus d'actions"
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-white text-neutral-800 ring-1 ring-neutral-300 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-700 dark:hover:bg-neutral-700"
      >
        <span aria-hidden="true">•••</span>
        <span className="sr-only">Plus</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-[10rem] rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {items.map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  a.onClick?.();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                <span className="flex-1">{a.label}</span>
                {a.shortcut && (
                  <span className="text-xs text-neutral-500">{a.shortcut}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Composant principal                                                */
/* ------------------------------------------------------------------ */

export function Toolbar({
  groups = [],
  searchable = false,
  onSearch,
  searchPlaceholder = 'Rechercher…',
  searchValue,
  filters,
  rightSlot,
  ariaLabel = 'Barre d’outils',
  className = '',
}: ToolbarProps): React.ReactElement {
  // Sur mobile : repli de tous les groupes non-sticky dans un overflow menu.
  const stickyGroups = groups.filter((g) => g.sticky);
  const collapsibleGroups = groups.filter((g) => !g.sticky);
  const collapsibleActions = collapsibleGroups.flatMap((g) => g.actions);

  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={
        'flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white/80 px-3 py-2 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/60 ' +
        className
      }
    >
      {searchable && (
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearch?.(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-[#004469] focus:outline-none focus:ring-2 focus:ring-[#F68D2E]/40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500"
          />
        </div>
      )}

      {filters && filters.length > 0 && (
        <div
          role="group"
          aria-label="Filtres"
          className="flex flex-wrap items-center gap-1.5"
        >
          {filters.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onToggle}
              aria-pressed={chip.active ? 'true' : 'false'}
              className={
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F68D2E] ' +
                (chip.active
                  ? 'bg-[#004469] text-white dark:bg-[#F68D2E] dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700')
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Groupes sticky (toujours visibles). */}
      {stickyGroups.map((group, i) => (
        <React.Fragment key={group.id}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-700"
            />
          )}
          <div className="flex items-center gap-1.5">
            {group.actions.map((a) => (
              <ActionBtn key={a.id} action={a} />
            ))}
          </div>
        </React.Fragment>
      ))}

      {/* Groupes repliables : visibles sur md+, repliés en overflow sur mobile. */}
      {collapsibleGroups.length > 0 && (
        <>
          <div className="hidden md:flex items-center gap-2">
            {stickyGroups.length > 0 && (
              <span
                aria-hidden="true"
                className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-700"
              />
            )}
            {collapsibleGroups.map((group, i) => (
              <React.Fragment key={group.id}>
                {i > 0 && (
                  <span
                    aria-hidden="true"
                    className="mx-1 h-6 w-px bg-neutral-200 dark:bg-neutral-700"
                  />
                )}
                <div className="flex items-center gap-1.5">
                  {group.actions.map((a) => (
                    <ActionBtn key={a.id} action={a} />
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
          <div className="md:hidden ml-auto">
            <OverflowMenu items={collapsibleActions} />
          </div>
        </>
      )}

      {rightSlot && <div className="ml-auto flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}

export default Toolbar;
