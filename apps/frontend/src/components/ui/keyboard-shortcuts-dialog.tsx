'use client';

import React from 'react';
import { Dialog } from '@omnitech/ui';
import {
  FileText, Ticket, ShieldAlert, Newspaper, BookOpen, FileType, HelpCircle, Search,
} from 'lucide-react';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['Ctrl', 'K'], label: 'Recherche rapide (Quick Nav)', icon: Search },
  { keys: ['Ctrl', 'Shift', 'D'], label: 'Documents (GED)', icon: FileText },
  { keys: ['Ctrl', 'Shift', 'T'], label: 'Tickets', icon: Ticket },
  { keys: ['Ctrl', 'Shift', 'I'], label: 'Incidents', icon: ShieldAlert },
  { keys: ['Ctrl', 'Shift', 'N'], label: 'Actualites', icon: Newspaper },
  { keys: ['Ctrl', 'Shift', 'W'], label: 'Wiki', icon: BookOpen },
  { keys: ['Ctrl', 'Shift', 'P'], label: 'Outils PDF', icon: FileType },
  { keys: ['?'], label: 'Afficher les raccourcis', icon: HelpCircle },
];

export function KeyboardShortcutsDialog({ open, onClose }: KeyboardShortcutsDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Raccourcis clavier">
      <div className="space-y-1">
        {SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <div
              key={shortcut.keys.join('+')}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/60 transition-colors"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-slate-800 flex-shrink-0">
                <Icon className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
              </div>
              <span className="flex-1 text-sm font-medium text-seal-navy dark:text-white">
                {shortcut.label}
              </span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, i) => (
                  <React.Fragment key={key}>
                    {i > 0 && <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">+</span>}
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
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
        <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 text-center">
          Appuyez sur <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-slate-800 rounded text-[10px] font-mono font-semibold">Esc</kbd> pour fermer
        </p>
      </div>
    </Dialog>
  );
}
