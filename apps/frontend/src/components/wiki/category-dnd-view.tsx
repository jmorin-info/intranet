'use client';

/**
 * Vue catégorie avec drag-and-drop pour réassigner un article à une autre
 * catégorie. Utilise @dnd-kit/core (hooks légers, pas de HOC).
 *
 * Fonctionnement :
 * - Chaque section catégorie = zone de dépôt (droppable)
 * - Chaque article = élément draggable
 * - Au drop : callback onMove(articleId, targetCategory) → PATCH côté parent
 *
 * Pas de réordonnancement à l'intérieur d'une catégorie (pour ça il faudrait
 * un champ `order` en DB + endpoint dédié). Juste déplacement entre catégories.
 */

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Clock, GripVertical } from 'lucide-react';

export interface DndPage {
  id: string;
  title: string;
  slug: string;
  category?: string | null;
  author: { firstName: string; lastName: string };
  updatedAt: string;
}

interface CategoryDndViewProps {
  groupedByCategory: Array<[string, DndPage[]]>;
  expandedAccordions: Record<string, boolean>;
  toggleAccordion: (cat: string) => void;
  onViewPage: (slug: string) => void;
  onMoveArticle: (articleId: string, targetCategory: string) => Promise<void>;
  canEdit: (page: DndPage) => boolean;
  formatRelativeTime: (d: string) => string;
  getCategoryColor: (cat: string | null | undefined) => string;
  getCategoryIcon: (cat: string | null | undefined) => React.ElementType;
  highlightText: (text: string, search: string) => React.ReactNode;
  search: string;
}

function DraggableArticle({
  page,
  onClick,
  disabled,
  formatRelativeTime,
  highlightText,
  search,
}: {
  page: DndPage;
  onClick: () => void;
  disabled: boolean;
  formatRelativeTime: (d: string) => string;
  highlightText: (text: string, search: string) => React.ReactNode;
  search: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `article-${page.id}`,
    data: { page },
    disabled,
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 30 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-5 py-3 transition-colors text-left group ${
        isDragging
          ? 'opacity-40 bg-[#F9964A]/10'
          : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
      }`}
    >
      {/* Handle — toujours affiché pour les users qui peuvent éditer */}
      {!disabled && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-gray-500 dark:text-slate-400 opacity-50 group-hover:opacity-100 transition-opacity"
          aria-label="Déplacer l'article dans une autre catégorie"
          title="Glisser pour déplacer dans une autre catégorie"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left"
      >
        <p className="text-sm font-medium text-seal-navy dark:text-white group-hover:text-primary transition-colors truncate">
          {highlightText(page.title, search)}
        </p>
        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1">
            <span className="h-4 w-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[8px] font-bold">
              {page.author.firstName[0]}{page.author.lastName[0]}
            </span>
            {page.author.firstName} {page.author.lastName}
          </span>
          <span className="flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(page.updatedAt)}
          </span>
        </p>
      </button>
      <ChevronRight className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function DroppableCategory({
  cat,
  catPages,
  isExpanded,
  toggleAccordion,
  onViewPage,
  canEdit,
  formatRelativeTime,
  getCategoryColor,
  getCategoryIcon,
  highlightText,
  search,
  isDraggingAny,
}: {
  cat: string;
  catPages: DndPage[];
  isExpanded: boolean;
  toggleAccordion: (cat: string) => void;
  onViewPage: (slug: string) => void;
  canEdit: (page: DndPage) => boolean;
  formatRelativeTime: (d: string) => string;
  getCategoryColor: (cat: string | null | undefined) => string;
  getCategoryIcon: (cat: string | null | undefined) => React.ElementType;
  highlightText: (text: string, search: string) => React.ReactNode;
  search: string;
  isDraggingAny: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `cat-${cat}`,
    data: { category: cat },
  });

  const catColor = getCategoryColor(cat === 'Sans catégorie' ? null : cat);
  const CatIcon = getCategoryIcon(cat === 'Sans catégorie' ? null : cat);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border overflow-hidden transition-all ${
        isOver
          ? 'border-[#F9964A] border-2 bg-[#F9964A]/5 shadow-md'
          : isDraggingAny
          ? 'border-dashed border-gray-300 dark:border-slate-600'
          : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      <button
        type="button"
        onClick={() => toggleAccordion(cat)}
        className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${catColor}15`, color: catColor }}
        >
          <CatIcon className="h-4 w-4" />
        </div>
        <span className="flex-1 text-left text-sm font-semibold text-seal-navy dark:text-white">
          {cat}
        </span>
        {isOver && (
          <span className="text-[10px] font-semibold text-[#F9964A] mr-2 animate-pulse">
            Déposer ici
          </span>
        )}
        <span className="text-[11px] text-seal-gray-500 dark:text-slate-500 font-medium mr-2">
          {catPages.length} article{catPages.length !== 1 ? 's' : ''}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-seal-gray-500 dark:text-slate-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-slate-700 divide-y divide-gray-50 dark:divide-slate-800 min-h-[40px]">
          {catPages.length === 0 && isDraggingAny && (
            <p className="px-5 py-4 text-xs italic text-seal-gray-500">
              Déposez un article ici pour l&apos;ajouter à la catégorie &quot;{cat}&quot;
            </p>
          )}
          {catPages.map((page) => (
            <DraggableArticle
              key={page.id}
              page={page}
              onClick={() => onViewPage(page.slug)}
              disabled={!canEdit(page)}
              formatRelativeTime={formatRelativeTime}
              highlightText={highlightText}
              search={search}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryDndView(props: CategoryDndViewProps) {
  const [activePage, setActivePage] = useState<DndPage | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }, // Évite les conflits avec le click
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (e: DragStartEvent) => {
    const page = e.active.data.current?.page as DndPage | undefined;
    if (page) setActivePage(page);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActivePage(null);
    const { active, over } = e;
    if (!over) return;

    const page = active.data.current?.page as DndPage | undefined;
    const targetCategory = over.data.current?.category as string | undefined;
    if (!page || !targetCategory) return;

    const currentCategory = page.category ?? 'Sans catégorie';
    if (currentCategory === targetCategory) return; // pas de changement

    // Si destination "Sans catégorie" : on envoie category=null côté backend
    const finalCategory = targetCategory === 'Sans catégorie' ? '' : targetCategory;
    try {
      await props.onMoveArticle(page.id, finalCategory);
      toast.success(`"${page.title}" déplacé vers ${targetCategory}`);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur lors du déplacement');
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-3">
        {props.groupedByCategory.map(([cat, catPages]) => (
          <DroppableCategory
            key={cat}
            cat={cat}
            catPages={catPages}
            isExpanded={props.expandedAccordions[cat] ?? true}
            toggleAccordion={props.toggleAccordion}
            onViewPage={props.onViewPage}
            canEdit={props.canEdit}
            formatRelativeTime={props.formatRelativeTime}
            getCategoryColor={props.getCategoryColor}
            getCategoryIcon={props.getCategoryIcon}
            highlightText={props.highlightText}
            search={props.search}
            isDraggingAny={!!activePage}
          />
        ))}
      </div>
      <DragOverlay>
        {activePage && (
          <div className="rounded-lg border border-[#F9964A] bg-white dark:bg-slate-900 px-4 py-2 shadow-xl">
            <p className="text-sm font-medium text-seal-navy dark:text-white truncate max-w-sm">
              {activePage.title}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
