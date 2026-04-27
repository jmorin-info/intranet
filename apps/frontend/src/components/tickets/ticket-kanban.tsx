"use client";

/**
 * TicketKanban — vue Kanban drag&drop des tickets via @dnd-kit/core.
 *
 * 4 colonnes : OPEN / IN_PROGRESS / WAITING / RESOLVED. La colonne CLOSED
 * n'est pas affichée par défaut (toggle parent à prévoir si besoin).
 *
 * Drag&drop : on drag&drop une carte ticket dans une nouvelle colonne →
 * `onStatusChange(ticketId, newStatus)` est appelé. Le parent s'occupe de
 * persister via PATCH /tickets/:id.
 *
 * A11y : les cartes sont des boutons (focusables), drag activé sur clic
 * long ou Espace + flèches clavier (sensors par défaut de @dnd-kit).
 *
 * Performance : `React.memo` sur la carte ticket pour éviter les re-renders
 * massifs quand un seul ticket bouge dans une grosse liste.
 */

import React, { memo } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Pause,
  Circle,
} from "lucide-react";

export type TicketStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "RESOLVED"
  | "CLOSED";

export interface KanbanTicket {
  id: string;
  reference: string;
  title: string;
  status: TicketStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  assigneeName?: string | null;
  createdAt: string;
}

export interface KanbanColumnConfig {
  status: TicketStatus;
  label: string;
  icon: React.ElementType;
  accentClass: string;
}

const DEFAULT_COLUMNS: KanbanColumnConfig[] = [
  {
    status: "OPEN",
    label: "Ouvert",
    icon: Circle,
    accentClass: "border-blue-300 dark:border-blue-700",
  },
  {
    status: "IN_PROGRESS",
    label: "En cours",
    icon: Clock,
    accentClass: "border-amber-300 dark:border-amber-700",
  },
  {
    status: "WAITING",
    label: "En attente",
    icon: Pause,
    accentClass: "border-purple-300 dark:border-purple-700",
  },
  {
    status: "RESOLVED",
    label: "Résolu",
    icon: CheckCircle2,
    accentClass: "border-emerald-300 dark:border-emerald-700",
  },
];

interface TicketKanbanProps {
  tickets: KanbanTicket[];
  /** Callback déclenché à la fin d'un drag&drop entre colonnes. */
  onStatusChange: (ticketId: string, nextStatus: TicketStatus) => void;
  /** Clic sur une carte (pour ouvrir le détail). */
  onOpenTicket?: (ticketId: string) => void;
  /** Override des colonnes (par défaut OPEN/IN_PROGRESS/WAITING/RESOLVED). */
  columns?: KanbanColumnConfig[];
  /** Skeleton pendant le fetch. */
  loading?: boolean;
}

export function TicketKanban({
  tickets,
  onStatusChange,
  onOpenTicket,
  columns = DEFAULT_COLUMNS,
  loading = false,
}: TicketKanbanProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const ticketId = event.active.id as string;
    const targetStatus = event.over?.id as TicketStatus | undefined;
    if (!targetStatus) return;
    const ticket = tickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === targetStatus) return;
    onStatusChange(ticketId, targetStatus);
  };

  // Group by status for column rendering
  const grouped = new Map<TicketStatus, KanbanTicket[]>();
  for (const col of columns) grouped.set(col.status, []);
  for (const t of tickets) {
    if (grouped.has(t.status)) grouped.get(t.status)!.push(t);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {columns.map((c) => (
          <div
            key={c.status}
            className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <div className="h-5 w-1/2 rounded shimmer" />
            <div className="h-20 rounded shimmer" />
            <div className="h-20 rounded shimmer" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        role="list"
        aria-label="Vue Kanban des tickets"
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        {columns.map((col) => (
          <KanbanColumn
            key={col.status}
            column={col}
            tickets={grouped.get(col.status) ?? []}
            onOpenTicket={onOpenTicket}
          />
        ))}
      </div>
    </DndContext>
  );
}

interface KanbanColumnProps {
  column: KanbanColumnConfig;
  tickets: KanbanTicket[];
  onOpenTicket?: (id: string) => void;
}

function KanbanColumn({ column, tickets, onOpenTicket }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  const Icon = column.icon;
  return (
    <section
      ref={setNodeRef}
      role="listitem"
      aria-label={`Colonne ${column.label}`}
      className={`rounded-xl border-2 ${column.accentClass} ${
        isOver ? "bg-primary/5 border-primary/60" : "bg-white dark:bg-slate-900"
      } transition-colors p-3 min-h-[280px] flex flex-col`}
    >
      <header className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
            {column.label}
          </h3>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400">
          {tickets.length}
        </span>
      </header>

      <div className="space-y-2 flex-1 overflow-y-auto">
        {tickets.length === 0 ? (
          <p className="text-xs italic text-seal-gray-500 dark:text-slate-500 text-center py-6">
            Aucun ticket
          </p>
        ) : (
          tickets.map((t) => (
            <KanbanCard key={t.id} ticket={t} onOpen={onOpenTicket} />
          ))
        )}
      </div>
    </section>
  );
}

const KanbanCard = memo(function KanbanCard({
  ticket,
  onOpen,
}: {
  ticket: KanbanTicket;
  onOpen?: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({ id: ticket.id });

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const priorityClass: Record<KanbanTicket["priority"], string> = {
    CRITICAL:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
    HIGH: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    MEDIUM:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    LOW: "bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300 border-gray-200 dark:border-slate-700",
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(ticket.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !isDragging) onOpen?.(ticket.id);
      }}
      aria-label={`Ticket ${ticket.reference} : ${ticket.title}`}
      className={`rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-60 ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex items-start gap-2 mb-1.5">
        <span className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-500 mt-0.5">
          {ticket.reference}
        </span>
        <span
          className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${priorityClass[ticket.priority]}`}
        >
          {ticket.priority === "CRITICAL" && (
            <AlertTriangle className="h-2.5 w-2.5 mr-1" />
          )}
          {ticket.priority}
        </span>
      </div>
      <h4 className="text-sm font-semibold text-seal-navy dark:text-white line-clamp-2 mb-1">
        {ticket.title}
      </h4>
      <div className="flex items-center justify-between text-[11px] text-seal-gray-500 dark:text-slate-500">
        <span className="truncate">{ticket.assigneeName ?? "Non assigné"}</span>
        <span aria-hidden="true">·</span>
        <span title={new Date(ticket.createdAt).toLocaleString()}>
          {new Date(ticket.createdAt).toLocaleDateString("fr-FR")}
        </span>
      </div>
    </article>
  );
});

KanbanCard.displayName = "KanbanCard";
