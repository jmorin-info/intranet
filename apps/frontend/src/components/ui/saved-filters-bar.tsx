'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { X, Save, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface SavedFilter {
  id: string;
  name: string;
  module: string;
  filters: Record<string, any>;
  isDefault: boolean;
}

interface SavedFiltersBarProps {
  module: string;
  currentFilters: Record<string, any>;
  onApplyFilter: (filters: Record<string, any>) => void;
}

export function SavedFiltersBar({ module, currentFilters, onApplyFilter }: SavedFiltersBarProps) {
  const { t } = useTranslation();
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFilters = useCallback(async () => {
    try {
      const { data } = await api.get('/saved-filters', { params: { module } });
      setSavedFilters(data);
    } catch {
      // silent
    }
  }, [module]);

  useEffect(() => {
    fetchFilters();
  }, [fetchFilters]);

  const handleSave = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api.post('/saved-filters', {
        module,
        name: newName.trim(),
        filters: currentFilters,
        isDefault: false,
      });
      toast.success(t('component.savedFilter.saved'));
      setNewName('');
      setShowPrompt(false);
      fetchFilters();
    } catch {
      toast.error(t('component.savedFilter.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/saved-filters/${id}`);
      if (activeId === id) setActiveId(null);
      setSavedFilters((prev) => prev.filter((f) => f.id !== id));
      toast.success(t('component.savedFilter.deleted'));
    } catch {
      toast.error(t('component.savedFilter.deleteError'));
    }
  };

  const handleApply = (filter: SavedFilter) => {
    if (activeId === filter.id) {
      setActiveId(null);
      // Optionally reset - the parent decides
      return;
    }
    setActiveId(filter.id);
    onApplyFilter(filter.filters);
  };

  if (savedFilters.length === 0 && !showPrompt) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPrompt(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition"
        >
          <Save className="h-3 w-3" />
          Sauvegarder la vue
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mr-0.5">Mes vues</span>

      {savedFilters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => handleApply(filter)}
          className={cn(
            'group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
            activeId === filter.id
              ? 'bg-primary text-white'
              : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600',
          )}
        >
          {filter.isDefault && <Star className="h-3 w-3" />}
          {filter.name}
          <span
            role="button"
            onClick={(e) => handleDelete(filter.id, e)}
            className={cn(
              'inline-flex items-center justify-center rounded-full h-4 w-4 ml-0.5 transition',
              activeId === filter.id
                ? 'hover:bg-white/20'
                : 'opacity-0 group-hover:opacity-100 hover:bg-gray-300 dark:hover:bg-slate-500',
            )}
          >
            <X className="h-2.5 w-2.5" />
          </span>
        </button>
      ))}

      {showPrompt ? (
        <div className="inline-flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setShowPrompt(false); setNewName(''); } }}
            placeholder="Nom de la vue..."
            autoFocus
            className="h-7 w-36 rounded-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white px-3 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={handleSave}
            disabled={saving || !newName.trim()}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold bg-primary text-white hover:bg-primary/90 transition disabled:opacity-50"
          >
            <Save className="h-3 w-3" />
            OK
          </button>
          <button
            onClick={() => { setShowPrompt(false); setNewName(''); }}
            className="inline-flex items-center justify-center rounded-full h-6 w-6 text-seal-gray-500 hover:bg-gray-200 dark:hover:bg-slate-600 transition"
            aria-label="Annuler"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPrompt(true)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-seal-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition"
        >
          <Save className="h-3 w-3" />
          Sauvegarder la vue
        </button>
      )}
    </div>
  );
}
