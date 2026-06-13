'use client';

/**
 * Reg016Fields — Section pliable "Metadonnees REG_016 (optionnel)".
 *
 * Factorise les 5 champs ajoutes Phase 1 pour aligner la GED sur le
 * Registre Documentaire SMSI (REG_016) et la pyramide PRO_040 §7.1 :
 *   - parentReference        (REG_016 colonne B)
 *   - documentLevel          (PRO_040 §7.1)
 *   - priority               (REG_016 colonne H)
 *   - blocking               (Bloquant pour la conformite)
 *   - reviewPeriodicity      (cadence de revue lisible)
 *
 * Tous les champs sont OPTIONNELS — l'utilisateur peut tout laisser vide.
 * Les composants `new/page.tsx` et `[id]/edit/page.tsx` se contentent
 * d'integrer ce bloc dans leur formulaire, avec leur propre etat
 * controle (values + onChange handler).
 *
 * Pas de dependance React Hook Form ici : on garde l'API ultra-simple
 * pour pouvoir l'utiliser indistinctement avec RHF (via Controller/setValue)
 * ou un useState local (page edit).
 */

import React from 'react';
import {
  DocumentCategory,
  DocumentLevel,
  DocumentPriority,
  DOCUMENT_LEVEL_LABELS,
  DOCUMENT_PRIORITY_LABELS,
  DOCUMENT_CATEGORY_LEVEL,
} from '@omnitech/shared';
import { Sparkles } from 'lucide-react';

export interface Reg016Values {
  parentReference?: string;
  documentLevel?: DocumentLevel | '';
  priority?: DocumentPriority | '';
  blocking?: boolean;
  reviewPeriodicity?: string;
}

interface Reg016FieldsProps {
  values: Reg016Values;
  onChange: (_patch: Partial<Reg016Values>) => void;
  /** Categorie courante du document — utilisee par "Detecter depuis la categorie". */
  category?: DocumentCategory | string;
  /** Section ouverte par defaut (false par defaut). */
  defaultOpen?: boolean;
}

const LEVEL_OPTIONS: Array<{ value: DocumentLevel; label: string }> = (
  Object.entries(DOCUMENT_LEVEL_LABELS) as Array<[DocumentLevel, string]>
).map(([value, label]) => ({ value, label }));

const PRIORITY_OPTIONS: Array<{ value: DocumentPriority; label: string }> = (
  Object.entries(DOCUMENT_PRIORITY_LABELS) as Array<[DocumentPriority, string]>
).map(([value, label]) => ({ value, label }));

export function Reg016Fields({
  values,
  onChange,
  category,
  defaultOpen = false,
}: Reg016FieldsProps) {
  const detectLevelFromCategory = () => {
    if (!category) return;
    const lvl = DOCUMENT_CATEGORY_LEVEL[category as DocumentCategory];
    if (lvl) onChange({ documentLevel: lvl });
  };

  const canDetect =
    !!category && !!DOCUMENT_CATEGORY_LEVEL[category as DocumentCategory];

  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40"
    >
      <summary className="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-seal-navy dark:text-white">
        <span className="flex items-center gap-2">
          Métadonnées REG_016
          <span className="text-[11px] font-normal text-seal-gray-500 dark:text-slate-500">
            (optionnel — Registre Documentaire SMSI)
          </span>
        </span>
        <span
          aria-hidden
          className="text-seal-gray-500 dark:text-slate-400 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>

      <div className="space-y-4 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-slate-800">
        {/* parentReference */}
        <div>
          <label
            htmlFor="reg016-parent-reference"
            className="block text-[13px] font-medium text-seal-navy dark:text-white mb-1"
          >
            Référence parente
          </label>
          <input
            id="reg016-parent-reference"
            type="text"
            value={values.parentReference ?? ''}
            onChange={(e) => onChange({ parentReference: e.target.value })}
            placeholder="Ex. POL_013 pour POL_015_POL_013"
            className="w-full rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
          <p className="mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
            Document de niveau supérieur dont celui-ci découle (REG_016 col. B).
          </p>
        </div>

        {/* documentLevel + bouton detection */}
        <div>
          <label
            htmlFor="reg016-document-level"
            className="block text-[13px] font-medium text-seal-navy dark:text-white mb-1"
          >
            Niveau documentaire
          </label>
          <div className="flex items-end gap-2">
            <select
              id="reg016-document-level"
              value={values.documentLevel ?? ''}
              onChange={(e) =>
                onChange({
                  documentLevel: (e.target.value || '') as DocumentLevel | '',
                })
              }
              className="flex-1 rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            >
              <option value="">— Non défini —</option>
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={detectLevelFromCategory}
              disabled={!canDetect}
              title={
                canDetect
                  ? 'Appliquer le niveau déduit de la catégorie (PRO_040 §7.1)'
                  : 'Sélectionnez d’abord une catégorie'
              }
              className="inline-flex items-center gap-1 rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-xs font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Détecter
            </button>
          </div>
          <p className="mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
            Pyramide PRO_040 §7.1 — Gouvernance, Opérationnel, Preuve ou Communication.
          </p>
        </div>

        {/* priority */}
        <div>
          <label
            htmlFor="reg016-priority"
            className="block text-[13px] font-medium text-seal-navy dark:text-white mb-1"
          >
            Priorité
          </label>
          <select
            id="reg016-priority"
            value={values.priority ?? ''}
            onChange={(e) =>
              onChange({
                priority: (e.target.value || '') as DocumentPriority | '',
              })
            }
            className="w-full rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          >
            <option value="">— Non définie —</option>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
            Conditionne le SLA de revue et l&apos;ordonnancement (REG_016 col. H).
          </p>
        </div>

        {/* blocking */}
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={values.blocking ?? false}
            onChange={(e) => onChange({ blocking: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-slate-600 dark:bg-slate-900 text-primary focus:ring-primary"
          />
          <div className="flex-1">
            <span className="text-[13px] font-medium text-seal-navy dark:text-white">
              Bloquant pour la conformité
            </span>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
              Cochez si l&apos;absence ou la péremption de ce document constitue
              une non-conformité majeure ISO 27001.
            </p>
          </div>
        </label>

        {/* reviewPeriodicity */}
        <div>
          <label
            htmlFor="reg016-review-periodicity"
            className="block text-[13px] font-medium text-seal-navy dark:text-white mb-1"
          >
            Périodicité de revue
          </label>
          <input
            id="reg016-review-periodicity"
            type="text"
            value={values.reviewPeriodicity ?? ''}
            onChange={(e) => onChange({ reviewPeriodicity: e.target.value })}
            placeholder="Ex. 24 mois, À chaque changement majeur"
            className="w-full rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
          <p className="mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
            Format libre — complémentaire à la date de prochaine revue.
          </p>
        </div>
      </div>
    </details>
  );
}

/**
 * Helper : priorite par defaut suggeree pour une categorie donnee
 * (cf. consigne mission AGENT D). L'utilisateur peut toujours modifier.
 */
export function defaultPriorityForCategory(
  category: DocumentCategory | string | undefined,
): DocumentPriority {
  switch (category) {
    case DocumentCategory.POLICY:
    case DocumentCategory.PROCEDURE:
    case DocumentCategory.PLAN:
      return DocumentPriority.HIGH;
    case DocumentCategory.CHARTER:
    case DocumentCategory.FORM:
    case DocumentCategory.REGISTRY:
      return DocumentPriority.MEDIUM;
    default:
      return DocumentPriority.MEDIUM;
  }
}
