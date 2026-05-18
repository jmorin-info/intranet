"use client";

/**
 * <Page /> — primitive de page OMNITECH
 * ======================================
 *
 * Primitive unique qui normalise la mise en page de TOUTES les pages
 * de l'intranet. Inspiration : Apple HIG (hiérarchie claire, espacement
 * régulier, focus sur le contenu).
 *
 * Utilisation :
 *
 *   <Page
 *     title="Tickets"
 *     subtitle="Helpdesk"
 *     icon={TicketIcon}
 *     actions={<Button>Nouveau</Button>}
 *     breadcrumbs={[{ label: 'Accueil', href: '/' }, { label: 'Tickets' }]}
 *   >
 *     <Page.Section title="Ouverts">…</Page.Section>
 *     <Page.Section title="Clos" collapsible defaultCollapsed>…</Page.Section>
 *   </Page>
 *
 * ⚠️  Ne modifie pas `layout/page-header.tsx` existant : cette primitive
 *     est ADDITIVE et peut être adoptée progressivement.
 */

import React, { useState, useId } from "react";
import type { ComponentType, ReactNode, SVGProps } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Breadcrumb {
  label: string;
  href?: string;
}

export interface PageProps {
  /** Titre principal de la page (h1). */
  title: string;
  /** Sous-titre / contexte (affiché sous le titre). */
  subtitle?: string;
  /** Icône décorative affichée à gauche du titre. */
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Actions principales (boutons) alignées à droite du header. */
  actions?: ReactNode;
  /** Fil d'ariane au-dessus du titre. */
  breadcrumbs?: Breadcrumb[];
  /** Classes supplémentaires sur le conteneur racine. */
  className?: string;
  /** Contenu (typiquement des `<Page.Section>`). */
  children?: ReactNode;
}

export interface PageSectionProps {
  /** Titre de section (h2). Optionnel si la section n'a pas d'en-tête. */
  title?: string;
  /** Description sous le titre. */
  description?: string;
  /** Rendre la section repliable (click sur l'en-tête). */
  collapsible?: boolean;
  /** Si `collapsible`, état initial replié. */
  defaultCollapsed?: boolean;
  /** Toolbar / actions alignées à droite de l'en-tête de section. */
  toolbar?: ReactNode;
  /** Classes supplémentaires. */
  className?: string;
  children?: ReactNode;
}

export interface PageToolbarProps {
  /** Classes supplémentaires. */
  className?: string;
  children?: ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Breadcrumbs                                                        */
/* ------------------------------------------------------------------ */

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Fil d'ariane" className="text-xs">
      <ol className="flex flex-wrap items-center gap-1 text-neutral-500 dark:text-neutral-400">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.href && !isLast ? (
                <a
                  href={item.href}
                  className="hover:text-[#F68D2E] hover:underline dark:hover:text-[#F68D2E]"
                >
                  {item.label}
                </a>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={
                    isLast
                      ? "font-medium text-neutral-700 dark:text-neutral-200"
                      : ""
                  }
                >
                  {item.label}
                </span>
              )}
              {!isLast && (
                <span aria-hidden="true" className="text-neutral-400">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/*  Page.Section                                                       */
/* ------------------------------------------------------------------ */

function PageSection({
  title,
  description,
  collapsible = false,
  defaultCollapsed = false,
  toolbar,
  className = "",
  children,
}: PageSectionProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentId = useId();
  const hasHeader = !!(title || toolbar || description);

  return (
    <section
      className={
        "rounded-xl border border-neutral-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-900/60 " +
        className
      }
    >
      {hasHeader && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {title &&
              (collapsible ? (
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  aria-controls={contentId}
                  onClick={() => setCollapsed((v) => !v)}
                  className="group flex items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F68D2E] rounded"
                >
                  <span
                    aria-hidden="true"
                    className={
                      "inline-block text-neutral-400 transition-transform " +
                      (collapsed ? "" : "rotate-90")
                    }
                  >
                    ▶
                  </span>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 group-hover:text-[#F68D2E] dark:text-neutral-200 dark:group-hover:text-[#F68D2E]">
                    {title}
                  </h2>
                </button>
              ) : (
                <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-200">
                  {title}
                </h2>
              ))}
            {description && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {description}
              </p>
            )}
          </div>
          {toolbar && (
            <div className="flex shrink-0 items-center gap-2">{toolbar}</div>
          )}
        </header>
      )}

      {(!collapsible || !collapsed) && (
        <div
          id={contentId}
          className="text-sm text-neutral-800 dark:text-neutral-200"
        >
          {children}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Page.Toolbar — simple slot aligné                                  */
/* ------------------------------------------------------------------ */

function PageToolbar({
  className = "",
  children,
}: PageToolbarProps): React.ReactElement {
  return (
    <div className={"flex flex-wrap items-center gap-2 " + className}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  <Page />                                                           */
/* ------------------------------------------------------------------ */

function PageRoot({
  title,
  subtitle,
  icon: Icon,
  actions,
  breadcrumbs,
  className = "",
  children,
}: PageProps): React.ReactElement {
  return (
    <div className={"space-y-6 " + className}>
      <header className="space-y-2">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} />
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <div
                aria-hidden="true"
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F68D2E]/10 text-slate-900 dark:bg-[#F68D2E]/15 dark:text-slate-100"
              >
                <Icon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
                {title}
              </h1>
              {subtitle && (
                <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      </header>

      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Export composé                                                     */
/* ------------------------------------------------------------------ */

type PageComponent = typeof PageRoot & {
  Section: typeof PageSection;
  Toolbar: typeof PageToolbar;
};

export const Page = PageRoot as PageComponent;
Page.Section = PageSection;
Page.Toolbar = PageToolbar;

export default Page;
