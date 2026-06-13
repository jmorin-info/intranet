'use client';

/**
 * RegistreFilters — barre de filtres de la page /admin/registre.
 *
 * Combinaison des criteres alignes avec REG_016 :
 *  - DocumentCategory (multiselect simple via groupe de pills)
 *  - DocumentLevel    (pyramide PRO_040 §7.1)
 *  - DocumentPriority (REG_016 col. H)
 *  - Classification    (POL_015 §5)
 *  - Bloquant         (oui / non / tous)
 *
 * Etat conserve dans le parent (page.tsx) ; ce composant est purement
 * controle pour rester serialisable dans l'URL si besoin plus tard.
 */

import React from 'react';
import {
  DocumentCategory,
  DocumentLevel,
  DocumentPriority,
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_LEVEL_LABELS,
  DOCUMENT_PRIORITY_LABELS,
} from '@omnitech/shared';
import { Card, CardContent, Button, Badge, Select } from '@omnitech/ui';
import { Filter, X } from 'lucide-react';

export type BlockingFilter = 'all' | 'yes' | 'no';

export interface RegistreFiltersState {
  categories: DocumentCategory[];
  level: DocumentLevel | '';
  priority: DocumentPriority | '';
  classification: '' | 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL' | 'SECRET';
  blocking: BlockingFilter;
}

export const EMPTY_REGISTRE_FILTERS: RegistreFiltersState = {
  categories: [],
  level: '',
  priority: '',
  classification: '',
  blocking: 'all',
};

interface RegistreFiltersProps {
  value: RegistreFiltersState;
  onChange: (next: RegistreFiltersState) => void;
}

const CATEGORY_OPTIONS = (
  Object.entries(DOCUMENT_CATEGORY_LABELS) as Array<[DocumentCategory, string]>
).map(([value, label]) => ({ value, label }));

const LEVEL_OPTIONS = (
  Object.entries(DOCUMENT_LEVEL_LABELS) as Array<[DocumentLevel, string]>
).map(([value, label]) => ({ value, label }));

const PRIORITY_OPTIONS = (
  Object.entries(DOCUMENT_PRIORITY_LABELS) as Array<[DocumentPriority, string]>
).map(([value, label]) => ({ value, label }));

const CLASSIFICATION_OPTIONS: Array<{ value: RegistreFiltersState['classification']; label: string }> = [
  { value: '', label: 'Toutes' },
  { value: 'PUBLIC', label: 'Niveau 4 — Public' },
  { value: 'INTERNE', label: 'Niveau 3 — Restreint' },
  { value: 'CONFIDENTIEL', label: 'Niveau 2 — Sensible' },
  { value: 'SECRET', label: 'Niveau 1 — Tres sensible' },
];

export function RegistreFilters({ value, onChange }: RegistreFiltersProps) {
  const toggleCategory = (cat: DocumentCategory) => {
    const has = value.categories.includes(cat);
    onChange({
      ...value,
      categories: has
        ? value.categories.filter((c) => c !== cat)
        : [...value.categories, cat],
    });
  };

  const reset = () => onChange(EMPTY_REGISTRE_FILTERS);

  const hasActive =
    value.categories.length > 0 ||
    value.level !== '' ||
    value.priority !== '' ||
    value.classification !== '' ||
    value.blocking !== 'all';

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
              Filtres
            </h2>
            {hasActive && (
              <Badge variant="primary" className="ml-1">
                actifs
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={!hasActive}
            aria-label="Reinitialiser les filtres"
          >
            <X className="h-3.5 w-3.5" /> Reinitialiser
          </Button>
        </div>

        {/* Categories — multiselect pills */}
        <div>
          <label className="block text-[11px] font-semibold text-seal-navy dark:text-white uppercase tracking-widest mb-2">
            Categorie ({value.categories.length || 'toutes'})
          </label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_OPTIONS.map((opt) => {
              const active = value.categories.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleCategory(opt.value)}
                  aria-pressed={active}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                    active
                      ? 'bg-seal-blue/10 border-seal-blue/40 text-seal-navy dark:bg-blue-900/30 dark:border-blue-700 dark:text-white'
                      : 'border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Select
            label="Niveau pyramide"
            value={value.level}
            onChange={(e) =>
              onChange({
                ...value,
                level: e.target.value as RegistreFiltersState['level'],
              })
            }
            options={[
              { value: '', label: 'Tous' },
              ...LEVEL_OPTIONS,
            ]}
          />

          <Select
            label="Priorite"
            value={value.priority}
            onChange={(e) =>
              onChange({
                ...value,
                priority: e.target.value as RegistreFiltersState['priority'],
              })
            }
            options={[
              { value: '', label: 'Toutes' },
              ...PRIORITY_OPTIONS,
            ]}
          />

          <Select
            label="Classification"
            value={value.classification}
            onChange={(e) =>
              onChange({
                ...value,
                classification: e.target
                  .value as RegistreFiltersState['classification'],
              })
            }
            options={CLASSIFICATION_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />

          <Select
            label="Bloquant"
            value={value.blocking}
            onChange={(e) =>
              onChange({
                ...value,
                blocking: e.target.value as BlockingFilter,
              })
            }
            options={[
              { value: 'all', label: 'Tous' },
              { value: 'yes', label: 'Bloquants uniquement' },
              { value: 'no', label: 'Non bloquants uniquement' },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
