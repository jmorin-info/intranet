'use client';

import React from 'react';
import { Dialog } from '@omnitech/ui';
import {
  FileText, Ticket, ShieldAlert, Newspaper, BookOpen, FileType, HelpCircle, Search,
  Command, MessageSquare, LayoutDashboard, Cog, Image,
} from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal d'aide centralisant tous les raccourcis clavier de l'intranet.
 * Ouverte via `?` (voir useKeyboardShortcuts) ou depuis le footer / menu aide.
 *
 * 3 sections (navigation séquentielle, actions directes, aide).
 */

interface ShortcutGroup {
  title: string;
  entries: Array<{
    keys: string[];
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation rapide (séquentielle)',
    entries: [
      { keys: ['G', 'D'], label: 'Tableau de bord', icon: LayoutDashboard },
      { keys: ['G', 'T'], label: 'Tickets', icon: Ticket },
      { keys: ['G', 'W'], label: 'Wiki', icon: BookOpen },
      { keys: ['G', 'M'], label: 'Médiathèque', icon: Image },
      { keys: ['G', 'N'], label: 'Actualités', icon: Newspaper },
      { keys: ['G', 'I'], label: 'Incidents', icon: ShieldAlert },
      { keys: ['G', 'A'], label: 'Administration (ADMIN)', icon: Cog },
    ],
  },
  {
    title: 'Actions directes (Ctrl+*)',
    entries: [
      { keys: ['Ctrl', 'K'], label: 'Recherche rapide / palette', icon: Search },
      { keys: ['Ctrl', 'Shift', 'K'], label: 'Assistant IA', icon: MessageSquare },
      { keys: ['Ctrl', 'Shift', 'D'], label: 'Documents (GED)', icon: FileText },
      { keys: ['Ctrl', 'Shift', 'T'], label: 'Tickets', icon: Ticket },
      { keys: ['Ctrl', 'Shift', 'I'], label: 'Incidents', icon: ShieldAlert },
      { keys: ['Ctrl', 'Shift', 'N'], label: 'Actualités', icon: Newspaper },
      { keys: ['Ctrl', 'Shift', 'W'], label: 'Wiki', icon: BookOpen },
      { keys: ['Ctrl', 'Shift', 'P'], label: 'Outils PDF', icon: FileType },
      { keys: ['Ctrl', 'Alt', '1-5'], label: 'Naviguer entre les hubs', icon: Command },
    ],
  },
  {
    title: 'Aide & accessibilité',
    entries: [
      { keys: ['?'], label: 'Afficher les raccourcis', icon: HelpCircle },
      { keys: ['Alt', 'S'], label: 'Sauter au contenu principal', icon: Command },
    ],
  },
];

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Raccourcis clavier">
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.title} aria-labelledby={`group-${group.title}`}>
            <h3
              id={`group-${group.title}`}
              className="text-[10px] font-semibold uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2 px-1"
            >
              {group.title}
            </h3>
            <div className="space-y-0.5">
              {group.entries.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <div
                    key={shortcut.keys.join('+')}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800 flex-shrink-0">
                      <Icon className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
                    </div>
                    <span className="flex-1 text-sm text-seal-navy dark:text-white">
                      {shortcut.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <React.Fragment key={key}>
                          {i > 0 && (
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                              {group.title.includes('séquentielle') ? 'puis' : '+'}
                            </span>
                          )}
                          <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-[11px] font-mono font-semibold text-seal-navy dark:text-slate-300">
                            {key}
                          </kbd>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
        <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 text-center">
          Appuyez sur{' '}
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-slate-800 rounded text-[10px] font-mono font-semibold">
            Esc
          </kbd>{' '}
          pour fermer · Les raccourcis sont désactivés dans les champs de saisie
        </p>
      </div>
    </Dialog>
  );
}
