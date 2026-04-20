'use client';

/**
 * <Spotlight />
 * =============
 *
 * Met en surbrillance (`<mark>`) les occurrences d'une requête dans un texte.
 *
 * - Case-insensitive
 * - Insensible aux accents (NFD + suppression des marques diacritiques)
 * - Respecte la casse et les accents ORIGINAUX du texte affiché
 *
 * @example
 *   <Spotlight text="Éléphant énorme" query="elephant" />
 *   // → "<mark>Éléphant</mark> énorme"
 */

import React from 'react';

export interface SpotlightProps {
  /** Texte complet à afficher. */
  text: string;
  /** Sous-chaîne à mettre en surbrillance (vide = pas de highlight). */
  query: string;
  /** Classes supplémentaires sur le conteneur. */
  className?: string;
  /** Classes appliquées au `<mark>` (override du style par défaut). */
  markClassName?: string;
}

/**
 * Normalise une chaîne : minuscules + suppression des accents.
 * Utilisé uniquement pour la COMPARAISON — le rendu conserve l'original.
 */
function normalize(str: string): string {
  return str.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Calcule toutes les plages [start, end) correspondant à `query`
 * dans `text` en utilisant la comparaison normalisée.
 *
 * Astuce importante : certains caractères accentués produisent plusieurs
 * code-points après NFD (ex. "é" → "e" + "\u0301"). On maintient donc un
 * mapping indice-normalisé → indice-original pour pouvoir découper le
 * texte ORIGINAL correctement.
 */
function findMatches(
  text: string,
  query: string,
): Array<[number, number]> {
  if (!query) return [];

  // Construire la version normalisée + mapping vers indices originaux.
  let normText = '';
  const map: number[] = []; // map[i] = index dans `text` du i-ème char normalisé
  for (let i = 0; i < text.length; i++) {
    const chunk = normalize(text[i] ?? '');
    for (let j = 0; j < chunk.length; j++) {
      normText += chunk[j];
      map.push(i);
    }
  }

  const normQuery = normalize(query);
  if (!normQuery) return [];

  const ranges: Array<[number, number]> = [];
  let from = 0;
  while (from <= normText.length - normQuery.length) {
    const idx = normText.indexOf(normQuery, from);
    if (idx === -1) break;
    const start = map[idx] ?? 0;
    // Fin exclusive = index original du caractère suivant la dernière position matchée.
    const lastNormIdx = idx + normQuery.length - 1;
    const endOriginal = (map[lastNormIdx] ?? start) + 1;
    ranges.push([start, endOriginal]);
    from = idx + normQuery.length;
  }
  return ranges;
}

export function Spotlight({
  text,
  query,
  className,
  markClassName,
}: SpotlightProps): React.ReactElement {
  const ranges = findMatches(text, query.trim());

  if (ranges.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const defaultMark =
    'bg-amber-200/80 text-amber-950 dark:bg-amber-400/30 dark:text-amber-100 rounded-sm px-0.5';

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([start, end], i) => {
    if (cursor < start) {
      parts.push(
        <React.Fragment key={`t-${i}`}>
          {text.slice(cursor, start)}
        </React.Fragment>,
      );
    }
    parts.push(
      <mark key={`m-${i}`} className={markClassName ?? defaultMark}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });
  if (cursor < text.length) {
    parts.push(<React.Fragment key="t-end">{text.slice(cursor)}</React.Fragment>);
  }

  return <span className={className}>{parts}</span>;
}

export default Spotlight;
