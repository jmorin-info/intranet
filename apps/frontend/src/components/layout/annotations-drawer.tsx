'use client';

/**
 * AnnotationsDrawer
 * =================
 *
 * Drawer latéral (droite) pour annoter la page courante. v1 stocke en
 * localStorage (une clé par chemin), utilisable offline. L'API interne
 * (load/save/remove) est conçue pour être migrée vers un endpoint backend
 * plus tard sans changer l'UI.
 *
 * - Bouton flottant en bas à droite (hors mobile bottom nav)
 * - Compteur d'annotations de la page courante
 * - Saisie rapide ⌘Enter pour envoyer
 * - Liste chronologique inversée
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

interface Annotation {
  id: string;
  path: string;
  author: string;
  authorInitials: string;
  body: string;
  createdAt: string;
}

const STORAGE_KEY = 'omnitech:annotations:v1';

function loadAll(): Annotation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(list: Annotation[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

function initialsOf(firstName?: string, lastName?: string): string {
  const f = (firstName ?? '').charAt(0).toUpperCase();
  const l = (lastName ?? '').charAt(0).toUpperCase();
  return `${f}${l}` || '?';
}

function formatAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "À l'instant";
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const day = Math.floor(h / 24);
  if (day < 7) return `Il y a ${day} j`;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
}

export function AnnotationsDrawer() {
  const pathname = usePathname();
  const user = useAuthStore(s => s.user);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Annotation[]>([]);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setAll(loadAll());
  }, []);

  const pageAnnotations = useMemo(
    () => all.filter((a) => a.path === pathname).sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1)),
    [all, pathname],
  );

  const submit = useCallback(() => {
    const body = draft.trim();
    if (!body || !user) return;
    const entry: Annotation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      path: pathname,
      author: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Utilisateur',
      authorInitials: initialsOf(user.firstName, user.lastName),
      body,
      createdAt: new Date().toISOString(),
    };
    const next = [...all, entry];
    setAll(next);
    saveAll(next);
    setDraft('');
  }, [draft, user, pathname, all]);

  const remove = useCallback(
    (id: string) => {
      const next = all.filter((a) => a.id !== id);
      setAll(next);
      saveAll(next);
    },
    [all],
  );

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  if (!user) return null;

  const count = pageAnnotations.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Annotations de la page"
        aria-expanded={open}
        className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-40 h-12 w-12 rounded-full bg-primary text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 flex items-center justify-center"
        title="Annotations"
      >
        <MessageCircle className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-seal-navy text-white text-[10px] font-bold flex items-center justify-center shadow">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          role="dialog"
          aria-modal="true"
          aria-label="Panneau d'annotations"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <aside className="relative h-full w-full sm:w-96 bg-white dark:bg-slate-900 shadow-2xl border-l border-gray-200 dark:border-slate-700 flex flex-col animate-slide-in-right">
            <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500">
                  Annotations
                </p>
                <h2 className="text-sm font-medium text-seal-navy dark:text-white truncate max-w-[240px]">
                  {pathname}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="h-8 w-8 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <X className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {pageAnnotations.length === 0 && (
                <p className="text-xs text-seal-gray-500 dark:text-slate-500 italic text-center py-6">
                  Aucune annotation sur cette page. Partagez un commentaire rapide ci-dessous.
                </p>
              )}
              {pageAnnotations.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/50 p-3 stagger-item"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-6 w-6 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {a.authorInitials}
                      </div>
                      <span className="text-xs font-semibold text-seal-navy dark:text-white truncate">
                        {a.author}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      aria-label="Supprimer cette annotation"
                      className="flex-shrink-0 h-6 w-6 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-seal-gray-500 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs text-seal-navy dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {a.body}
                  </p>
                  <p className="text-[10px] text-seal-gray-500/70 dark:text-slate-500 mt-1.5">
                    {formatAt(a.createdAt)}
                  </p>
                </div>
              ))}
            </div>

            <footer className="border-t border-gray-200 dark:border-slate-700 p-3">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ajoutez une annotation…"
                rows={3}
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-seal-navy dark:text-white placeholder:text-seal-gray-500/60 dark:placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 resize-none"
                aria-label="Nouvelle annotation"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-seal-gray-500/70 dark:text-slate-500">
                  ⌘ + ↵ pour envoyer
                </span>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!draft.trim()}
                  className="inline-flex items-center gap-1 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition btn-lift"
                >
                  <Send className="h-3 w-3" />
                  Envoyer
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}

export default AnnotationsDrawer;
