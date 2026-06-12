"use client";

import React, { useState, useRef, useCallback, useEffect, useId } from "react";
import {
  FileText,
  User,
  Calendar,
  Mail,
  Building2,
  Shield,
  Clock,
} from "lucide-react";
import { getAvatarUrl } from "@/lib/avatar";

/* ════════════════════════════════════════════
   Generic Hover Card wrapper
   ════════════════════════════════════════════ */

interface HoverCardProps {
  children: React.ReactNode;
  content: React.ReactNode;
  delay?: number;
  className?: string;
}

export function HoverCard({
  children,
  content,
  delay = 300,
  className,
}: HoverCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  }>({ top: 0, left: 0, placement: "bottom" });
  const triggerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const cardHeight = 200; // approximate
    const cardWidth = 320;

    let top: number;
    let placement: "top" | "bottom";

    // Flip to top if near bottom edge
    if (rect.bottom + cardHeight + 12 > viewportH) {
      top = rect.top - cardHeight - 8;
      placement = "top";
    } else {
      top = rect.bottom + 8;
      placement = "bottom";
    }

    // Clamp horizontal position
    let left = rect.left + rect.width / 2 - cardWidth / 2;
    if (left < 8) left = 8;
    if (left + cardWidth > viewportW - 8) left = viewportW - cardWidth - 8;

    setPosition({ top, left, placement });
  }, []);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      updatePosition();
      setIsOpen(true);
    }, delay);
  }, [delay, updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // a11y : `role=group` ne supporte ni aria-haspopup ni aria-expanded
  // (jsx-a11y/role-supports-aria-props). On utilise le pattern correct
  // pour une fiche-au-survol descriptive : aria-describedby sur le trigger
  // pointant vers `role=tooltip` sur le contenu, quand il est ouvert.
  const tooltipId = useId();

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        className={`inline-block ${className || ""}`}
        aria-describedby={isOpen ? tooltipId : undefined}
      >
        {children}
      </div>

      {isOpen && (
        <div
          ref={cardRef}
          id={tooltipId}
          role="tooltip"
          onMouseEnter={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
          }}
          onMouseLeave={handleMouseLeave}
          className="fixed z-[150] pointer-events-auto"
          style={{
            top: position.top,
            left: position.left,
            width: 320,
            animation:
              position.placement === "bottom"
                ? "hoverCardEnterDown 0.2s ease-out"
                : "hoverCardEnterUp 0.2s ease-out",
          }}
        >
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {content}
          </div>
        </div>
      )}

      {isOpen && (
        <style jsx>{`
          @keyframes hoverCardEnterDown {
            from {
              opacity: 0;
              transform: translateY(-4px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes hoverCardEnterUp {
            from {
              opacity: 0;
              transform: translateY(4px) scale(0.98);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}</style>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   Document Hover Preview
   ════════════════════════════════════════════ */

interface DocumentPreviewData {
  title: string;
  reference?: string;
  status: string;
  category?: string;
  owner?: { firstName: string; lastName: string };
  updatedAt?: string;
  classification?: string;
}

const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  DRAFT: {
    bg: "bg-gray-100 dark:bg-slate-700",
    text: "text-gray-600 dark:text-slate-300",
    label: "Brouillon",
  },
  IN_REVIEW: {
    bg: "bg-blue-50 dark:bg-blue-900/30",
    text: "text-blue-700 dark:text-blue-300",
    label: "En revue",
  },
  PENDING_APPROVAL: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    label: "Approbation",
  },
  APPROVED: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    label: "Approuve",
  },
  OBSOLETE: {
    bg: "bg-red-50 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
    label: "Obsolete",
  },
  ARCHIVED: {
    bg: "bg-gray-50 dark:bg-slate-800",
    text: "text-gray-500 dark:text-slate-400",
    label: "Archive",
  },
};

export function DocumentHoverContent({ doc }: { doc: DocumentPreviewData }) {
  const status = (STATUS_COLORS[doc.status] || STATUS_COLORS.DRAFT)!;

  return (
    <div className="p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-lg bg-[#F68D2E]/10 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
          <FileText className="h-5 w-5 text-slate-900 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {doc.title}
          </h4>
          {doc.reference && (
            <p className="text-[11px] font-mono text-gray-400 dark:text-slate-500">
              {doc.reference}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.bg} ${status.text}`}
        >
          <Shield className="h-3 w-3" />
          {status.label}
        </span>
        {doc.category && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F68D2E]/10 text-slate-900">
            {doc.category}
          </span>
        )}
        {doc.classification && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
            {doc.classification}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-gray-500 dark:text-slate-400 border-t border-gray-100 dark:border-slate-700/50 pt-2.5">
        {doc.owner && (
          <span className="flex items-center gap-1.5">
            <User className="h-3 w-3" />
            {doc.owner.firstName} {doc.owner.lastName}
          </span>
        )}
        {doc.updatedAt && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {new Date(doc.updatedAt).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   User Hover Preview
   ════════════════════════════════════════════ */

interface UserPreviewData {
  firstName: string;
  lastName: string;
  role?: string;
  department?: string;
  email?: string;
  avatarUrl?: string;
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrateur",
  REVIEWER: "Réviseur",
  COLLABORATEUR: "Collaborateur",
  PRESTATAIRE: "Prestataire",
};

export function UserHoverContent({ user }: { user: UserPreviewData }) {
  const initials =
    `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        {user.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={getAvatarUrl(user.avatarUrl)}
            alt={`${user.firstName} ${user.lastName}`}
            className="h-12 w-12 rounded-full object-cover border-2 border-[#F68D2E]/20"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#F68D2E] to-[#006699] flex items-center justify-center">
            <span className="text-sm font-semibold text-white">{initials}</span>
          </div>
        )}
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            {user.firstName} {user.lastName}
          </h4>
          {user.role && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F68D2E]/10 text-slate-900 dark:bg-blue-900/30 dark:text-blue-300 mt-0.5">
              <Shield className="h-2.5 w-2.5" />
              {ROLE_LABELS[user.role] || user.role}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-1.5 text-[11px] text-gray-500 dark:text-slate-400">
        {user.department && (
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
            <span>{user.department}</span>
          </div>
        )}
        {user.email && (
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
            <span className="text-slate-900 font-medium">{user.email}</span>
          </div>
        )}
      </div>
    </div>
  );
}
