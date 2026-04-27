"use client";

/**
 * WikiTagInput — multi-select pour les tags wiki dans l'éditeur.
 *
 * Charge la liste des tags via GET /wiki/tags, permet d'ajouter/retirer un
 * tag d'une page, et propose la création à la volée d'un tag inexistant
 * (admins seulement — le composant délègue la création à l'API ; les
 * non-admins reçoivent un message d'erreur en toast).
 *
 * État géré localement, persisté via PATCH /wiki/pages/:id/tags lors du
 * save de la page parente. Le composant n'effectue pas le PATCH lui-même —
 * c'est WikiContent qui orchestre la sauvegarde globale.
 */

import React, { useEffect, useState } from "react";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface WikiTagOption {
  id: string;
  slug: string;
  name: string;
  colorHex: string | null;
}

interface WikiTagInputProps {
  value: WikiTagOption[];
  onChange: (next: WikiTagOption[]) => void;
  /** Indique si l'utilisateur courant peut créer de nouveaux tags. */
  canCreate?: boolean;
  /** Désactive l'ajout/retrait (mode lecture seule). */
  disabled?: boolean;
  className?: string;
}

export function WikiTagInput({
  value,
  onChange,
  canCreate = false,
  disabled = false,
  className = "",
}: WikiTagInputProps) {
  const [allTags, setAllTags] = useState<WikiTagOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<WikiTagOption[]>("/wiki/tags")
      .then((res) => {
        if (!cancelled) {
          setAllTags(Array.isArray(res.data) ? res.data : []);
        }
      })
      .catch(() => {
        // Hide failure: tags are optional, no toast spam.
        if (!cancelled) setAllTags([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedIds = new Set(value.map((t) => t.id));
  const suggestions = allTags
    .filter((t) => !selectedIds.has(t.id))
    .filter((t) =>
      query.trim()
        ? t.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          t.slug.includes(query.trim().toLowerCase())
        : true,
    )
    .slice(0, 8);

  const addTag = (tag: WikiTagOption) => {
    if (selectedIds.has(tag.id)) return;
    onChange([...value, tag]);
    setQuery("");
    setShowSuggestions(false);
  };

  const removeTag = (tagId: string) => {
    onChange(value.filter((t) => t.id !== tagId));
  };

  const createTag = async () => {
    const name = query.trim();
    if (!name) return;
    if (!canCreate) {
      toast.error("Seuls les administrateurs peuvent créer un nouveau tag.");
      return;
    }
    try {
      const res = await api.post<WikiTagOption>("/wiki/tags", { name });
      const created = res.data;
      setAllTags((prev) => [...prev, created]);
      addTag(created);
      toast.success(`Tag "${created.name}" créé`);
    } catch (err: any) {
      const code = err?.response?.status;
      if (code === 409) {
        toast.error("Un tag avec ce nom existe déjà.");
      } else {
        toast.error("Création du tag impossible.");
      }
    }
  };

  return (
    <div className={`relative ${className}`} data-testid="wiki-tag-input">
      <div className="flex flex-wrap items-center gap-1.5 min-h-[40px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/40">
        {value.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
            style={
              tag.colorHex
                ? {
                    backgroundColor: `${tag.colorHex}1a`,
                    color: tag.colorHex,
                    border: `1px solid ${tag.colorHex}40`,
                  }
                : undefined
            }
          >
            <TagIcon className="h-3 w-3" />
            {tag.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => removeTag(tag.id)}
                className="hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5"
                aria-label={`Retirer le tag ${tag.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}

        {!disabled && (
          <input
            type="text"
            value={query}
            placeholder={value.length === 0 ? "Ajouter un tag…" : ""}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (suggestions[0]) {
                  addTag(suggestions[0]);
                } else if (query.trim() && canCreate) {
                  void createTag();
                }
              } else if (e.key === "Backspace" && !query && value.length > 0) {
                removeTag(value[value.length - 1].id);
              }
            }}
            className="flex-1 min-w-[120px] outline-none bg-transparent text-sm text-seal-navy dark:text-slate-100 placeholder:text-seal-gray-500 dark:placeholder:text-slate-500"
            aria-label="Rechercher ou créer un tag"
          />
        )}
      </div>

      {showSuggestions &&
        !disabled &&
        (suggestions.length > 0 || query.trim()) && (
          <div className="absolute z-30 mt-1 left-0 right-0 max-h-60 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addTag(tag)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center gap-2"
              >
                <TagIcon
                  className="h-3 w-3"
                  style={tag.colorHex ? { color: tag.colorHex } : undefined}
                />
                <span className="text-seal-navy dark:text-slate-100">
                  {tag.name}
                </span>
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                  {tag.slug}
                </span>
              </button>
            ))}

            {query.trim() &&
              !suggestions.some(
                (s) => s.name.toLowerCase() === query.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void createTag()}
                  disabled={!canCreate}
                  className={`w-full text-left px-3 py-2 text-sm border-t border-gray-100 dark:border-slate-800 flex items-center gap-2 ${
                    canCreate
                      ? "hover:bg-primary/5 text-primary"
                      : "text-seal-gray-500 dark:text-slate-500 cursor-not-allowed"
                  }`}
                >
                  <Plus className="h-3 w-3" />
                  {canCreate
                    ? `Créer le tag "${query.trim()}"`
                    : `Création réservée aux administrateurs`}
                </button>
              )}

            {!loading && suggestions.length === 0 && !query.trim() && (
              <p className="px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-500">
                Tapez pour rechercher un tag.
              </p>
            )}
          </div>
        )}
    </div>
  );
}
