/**
 * OMNITECH Design Tokens — Single Source of Truth
 *
 * All UI decisions (spacing, typography, colors, density) are defined here.
 * Components and pages import from this file instead of using ad-hoc values.
 *
 * Aligned with:
 *  - SEAL System PANTONE charter (715C, 660C, 349C, 202C)
 *  - Tailwind config (apps/frontend/tailwind.config.ts)
 *  - Linear/Notion density standards
 */

// ── Spacing ────────────────────────────────────────────────────────

export const spacing = {
  0.5: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
} as const;

// ── Border Radius ──────────────────────────────────────────────────

export const radius = {
  sm: '6px',    // SEAL default (rounded-seal)
  md: '8px',    // Buttons (rounded-btn)
  lg: '12px',   // Cards (rounded-card)
  xl: '16px',   // Modals, sheets
  full: '9999px', // Pills, badges
} as const;

// ── Typography (Tailwind class compositions) ───────────────────────

export const typography = {
  pageTitle: 'text-xl md:text-2xl font-semibold text-navy dark:text-white',
  sectionTitle: 'text-sm font-semibold text-navy dark:text-white',
  body: 'text-sm text-seal-gray-500 dark:text-slate-300',
  caption: 'text-xs text-seal-gray-500 dark:text-slate-400',
  micro: 'text-[10px] text-seal-gray-500/60 dark:text-slate-500',
  mono: 'font-mono text-xs text-navy dark:text-white',
  label: 'text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500/60 dark:text-slate-500',
} as const;

// ── Component Density ──────────────────────────────────────────────

export const density = {
  compact: 'h-8 text-xs',      // Table rows, sidebar items
  default: 'h-10 text-sm',     // Inputs, standard buttons
  large: 'h-12 text-base',     // Hero actions, page headers
} as const;

// ── Semantic Status Colors ─────────────────────────────────────────
// Unified color mapping for ALL entity statuses across the entire app.

export const statusColors = {
  // --- Generic semantics ---
  draft:     { bg: 'bg-slate-100 dark:bg-slate-800',        text: 'text-slate-600 dark:text-slate-400',     border: 'border-slate-200 dark:border-slate-700' },
  pending:   { bg: 'bg-amber-100 dark:bg-amber-900/30',     text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-200 dark:border-amber-800' },
  active:    { bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-300',       border: 'border-blue-200 dark:border-blue-800' },
  success:   { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  danger:    { bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-300',         border: 'border-red-200 dark:border-red-800' },
  neutral:   { bg: 'bg-gray-100 dark:bg-slate-800',         text: 'text-gray-600 dark:text-slate-400',      border: 'border-gray-200 dark:border-slate-700' },
  info:      { bg: 'bg-violet-100 dark:bg-violet-900/30',   text: 'text-violet-700 dark:text-violet-300',   border: 'border-violet-200 dark:border-violet-800' },

  // --- SEAL PANTONE accents ---
  sealOrange:   { bg: 'bg-[#F9964A]/10', text: 'text-[#c46714]', border: 'border-[#F9964A]/30' },
  sealBlue:     { bg: 'bg-[#296DC1]/10', text: 'text-[#1e5494]', border: 'border-[#296DC1]/30' },
  sealGreen:    { bg: 'bg-[#006233]/10', text: 'text-[#006233]', border: 'border-[#006233]/30' },
  sealBordeaux: { bg: 'bg-[#892034]/10', text: 'text-[#892034]', border: 'border-[#892034]/30' },
} as const;

// ── Status → Semantic Color Mapping ────────────────────────────────
// Every status across all entities maps to one semantic color.

export const statusSemantic: Record<string, keyof typeof statusColors> = {
  // Ticket statuses
  OPEN: 'active',
  IN_PROGRESS: 'pending',
  WAITING: 'draft',
  RESOLVED: 'success',
  // Document statuses
  DRAFT: 'draft',
  IN_REVIEW: 'active',
  REVIEW_APPROVED: 'info',
  PENDING_APPROVAL: 'pending',
  APPROVED: 'success',
  OBSOLETE: 'danger',
  ARCHIVED: 'neutral',
  // Incident statuses
  DETECTED: 'danger',
  UNDER_INVESTIGATION: 'pending',
  CONTAINED: 'active',
  ERADICATED: 'info',
  RECOVERED: 'success',
  // Shared
  CLOSED: 'neutral',
} as const;

// ── Priority Colors ────────────────────────────────────────────────

export const priorityColors = {
  CRITICAL: { bg: 'bg-red-100 dark:bg-red-900/30',    text: 'text-red-700 dark:text-red-400' },
  HIGH:     { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  MEDIUM:   { bg: 'bg-blue-100 dark:bg-blue-900/30',  text: 'text-blue-700 dark:text-blue-400' },
  LOW:      { bg: 'bg-gray-100 dark:bg-slate-800',    text: 'text-gray-600 dark:text-slate-400' },
} as const;

// ── Layout Constants ───────────────────────────────────────────────

export const layout = {
  maxContentWidth: '1200px',
  sidebarRailWidth: '56px',
  sidebarPanelWidth: '240px',
  headerHeight: '56px',
  cardPadding: 'p-4',       // 16px
  sectionGap: 'gap-6',      // 24px
  pageGap: 'space-y-6',     // 24px between page sections
} as const;

// ── Animation Durations ────────────────────────────────────────────

export const animation = {
  fast: '150ms',
  default: '200ms',
  slow: '300ms',
} as const;
