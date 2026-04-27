"use client";

/**
 * TicketQuickActions — menu ⋮ sur la ligne d'un ticket pour les actions
 * rapides sans ouvrir le détail.
 *
 * 4 actions :
 *   - Assigner à moi
 *   - Marquer résolu
 *   - Archiver (status = CLOSED)
 *   - Copier le lien (URL absolue de la page détail)
 *
 * Le composant délègue les API calls au parent via callbacks (le parent
 * connaît déjà l'API des tickets — pas de duplication).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  MoreVertical,
  UserPlus,
  CheckCircle2,
  Archive,
  Link2,
} from "lucide-react";
import { toast } from "sonner";

interface TicketQuickActionsProps {
  ticketId: string;
  ticketReference: string;
  /** URL absolue ou relative à copier au clic « Copier le lien ». */
  ticketUrl: string;
  onAssignToMe?: (id: string) => Promise<void> | void;
  onMarkResolved?: (id: string) => Promise<void> | void;
  onArchive?: (id: string) => Promise<void> | void;
  /** Désactive les actions (déjà fermé/résolu, etc.). */
  disabled?: boolean;
}

export function TicketQuickActions({
  ticketId,
  ticketReference,
  ticketUrl,
  onAssignToMe,
  onMarkResolved,
  onArchive,
  disabled = false,
}: TicketQuickActionsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const close = () => setOpen(false);

  const action = async (
    fn: ((id: string) => Promise<void> | void) | undefined,
    successMsg: string,
  ) => {
    if (!fn) return;
    try {
      await fn(ticketId);
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(err?.message ?? "Action impossible.");
    } finally {
      close();
    }
  };

  const copyLink = async () => {
    try {
      const url =
        typeof window !== "undefined" && !ticketUrl.startsWith("http")
          ? `${window.location.origin}${ticketUrl}`
          : ticketUrl;
      await navigator.clipboard.writeText(url);
      toast.success(`Lien du ticket ${ticketReference} copié`);
    } catch {
      toast.error("Copie impossible");
    } finally {
      close();
    }
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 inline-flex items-center justify-center h-7 w-7 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 dark:text-slate-400"
        aria-label={`Actions rapides pour ${ticketReference}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-8 z-30 min-w-[200px] rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
        >
          <ActionItem
            icon={UserPlus}
            label="M'assigner ce ticket"
            disabled={disabled || !onAssignToMe}
            onClick={() => action(onAssignToMe, "Ticket assigné à vous")}
          />
          <ActionItem
            icon={CheckCircle2}
            label="Marquer comme résolu"
            disabled={disabled || !onMarkResolved}
            onClick={() => action(onMarkResolved, "Ticket marqué résolu")}
          />
          <ActionItem
            icon={Archive}
            label="Archiver (fermer)"
            disabled={disabled || !onArchive}
            onClick={() => action(onArchive, "Ticket archivé")}
          />
          <div className="border-t border-gray-100 dark:border-slate-800" />
          <ActionItem icon={Link2} label="Copier le lien" onClick={copyLink} />
        </div>
      )}
    </div>
  );
}

function ActionItem({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-seal-navy dark:text-slate-200"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
