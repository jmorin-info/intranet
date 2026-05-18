"use client";

/**
 * SlashCommands — Feature 6.
 *
 * Détecte un input commençant par `/` et propose une liste de commandes
 * filtrées (par fuzzy match sur la commande). Au Tab/Entrée :
 *   - convertit `/doc <terme>` en requête formatée "Recherche document : <terme>"
 *   - `/wiki <terme>` → "Recherche wiki : <terme>"
 *   - `/ticket <terme>` → "Recherche ticket : <terme>"
 *   - `/run <runbook>` → "Exécuter le runbook : <runbook>"
 *   - `/help` → liste des commandes
 *
 * Le composant est purement présentationnel — c'est le parent qui gère
 * le re-submit après transformation.
 */

import React, { useEffect, useRef } from "react";
import { FileText, BookOpen, Ticket, Play, HelpCircle } from "lucide-react";

export interface SlashCommandDef {
  id: string;
  trigger: string; // e.g. "/doc"
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Transforme l'input brut en requête finale (ou null pour /help). */
  transform: (rawInput: string) => string | null;
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    id: "doc",
    trigger: "/doc",
    label: "/doc <terme>",
    description: "Recherche dans les documents GED",
    Icon: FileText,
    transform: (input) => {
      const arg = input.replace(/^\/doc\s*/i, "").trim();
      return arg ? `Recherche dans les documents : ${arg}` : null;
    },
  },
  {
    id: "wiki",
    trigger: "/wiki",
    label: "/wiki <terme>",
    description: "Recherche dans la base de connaissances",
    Icon: BookOpen,
    transform: (input) => {
      const arg = input.replace(/^\/wiki\s*/i, "").trim();
      return arg ? `Recherche dans le wiki : ${arg}` : null;
    },
  },
  {
    id: "ticket",
    trigger: "/ticket",
    label: "/ticket <terme>",
    description: "Recherche dans les tickets support",
    Icon: Ticket,
    transform: (input) => {
      const arg = input.replace(/^\/ticket\s*/i, "").trim();
      return arg ? `Recherche dans les tickets : ${arg}` : null;
    },
  },
  {
    id: "run",
    trigger: "/run",
    label: "/run <runbook>",
    description: "Exécute un runbook",
    Icon: Play,
    transform: (input) => {
      const arg = input.replace(/^\/run\s*/i, "").trim();
      return arg ? `Exécuter le runbook : ${arg}` : null;
    },
  },
  {
    id: "help",
    trigger: "/help",
    label: "/help",
    description: "Affiche toutes les commandes disponibles",
    Icon: HelpCircle,
    transform: () =>
      "Liste les commandes slash disponibles : /doc, /wiki, /ticket, /run, /help.",
  },
];

interface SlashCommandsProps {
  input: string;
  onPick: (command: SlashCommandDef) => void;
  /** Index de la commande mise en évidence par les flèches. */
  activeIndex?: number;
}

/**
 * Filtre les commandes selon le texte tapé après `/`.
 * Si l'input est juste `/`, on retourne tout.
 */
export function filterSlashCommands(input: string): SlashCommandDef[] {
  if (!input.startsWith("/")) return [];
  const term = input.slice(1).split(/\s/)[0]?.toLowerCase() || "";
  if (term === "") return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) =>
    c.trigger.slice(1).toLowerCase().startsWith(term),
  );
}

export function SlashCommands({
  input,
  onPick,
  activeIndex = 0,
}: SlashCommandsProps) {
  const filtered = filterSlashCommands(input);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const item = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Suggestions de commandes"
      className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-20"
    >
      {filtered.map((cmd, idx) => {
        const Icon = cmd.Icon;
        const active = idx === activeIndex;
        return (
          <button
            key={cmd.id}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => onPick(cmd)}
            onMouseDown={(e) => e.preventDefault()}
            className={`w-full text-left flex items-start gap-3 px-3 py-2.5 transition ${
              active
                ? "bg-[#F68D2E]/10 dark:bg-[#F68D2E]/30"
                : "hover:bg-gray-50 dark:hover:bg-slate-800"
            }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-md shrink-0 ${
                active
                  ? "bg-[#F68D2E] text-white"
                  : "bg-gray-100 dark:bg-slate-800 text-slate-900 dark:text-blue-400"
              }`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-seal-navy dark:text-white">
                {cmd.label}
              </p>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 truncate">
                {cmd.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
