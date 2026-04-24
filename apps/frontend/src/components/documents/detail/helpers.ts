// Helpers extraits du monolithe page.tsx
import { toast } from "sonner";
import type { DocumentComment } from "./types";

// --- Comments (localStorage-based, ready for backend migration) ---
const COMMENTS_STORAGE_KEY = "omnitech_doc_comments";

export function getDocComments(documentId: string): DocumentComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COMMENTS_STORAGE_KEY);
    const all: DocumentComment[] = raw ? JSON.parse(raw) : [];
    return all
      .filter((c) => c.documentId === documentId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  } catch {
    return [];
  }
}

export function addDocComment(
  comment: Omit<DocumentComment, "id" | "createdAt">,
): DocumentComment {
  const all: DocumentComment[] = (() => {
    try {
      const raw = localStorage.getItem(COMMENTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();
  const entry: DocumentComment = {
    ...comment,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  all.push(entry);
  localStorage.setItem(COMMENTS_STORAGE_KEY, JSON.stringify(all.slice(-500)));
  return entry;
}

// --- Download helper (authenticated blob fetch) ---
export async function authenticatedDownload(
  url: string,
  filename: string,
  inline = false,
): Promise<void> {
  try {
    const token = localStorage.getItem("accessToken");
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(
      /\/api\/?$/,
      "/api/v1",
    );
    const response = await fetch(`${apiBase}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    if (inline) {
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    }
  } catch {
    toast.error("Erreur de téléchargement");
  }
}

// --- Status bar color mapping ---
export const STATUS_BAR_COLOR: Record<string, string> = {
  DRAFT: "bg-blue-500",
  IN_REVIEW: "bg-amber-500",
  REVIEW_APPROVED: "bg-[#296DC1]",
  PENDING_APPROVAL: "bg-purple-500",
  APPROVED: "bg-emerald-500",
  OBSOLETE: "bg-gray-400",
  ARCHIVED: "bg-gray-300",
};

// --- Review deadline color coding ---
export interface ReviewDeadlineInfo {
  text: string;
  color: string;
  bg: string;
  dot: string;
}

export function getReviewDeadlineInfo(
  nextReviewDate: string | null,
): ReviewDeadlineInfo | null {
  if (!nextReviewDate) return null;
  const diffMs = new Date(nextReviewDate).getTime() - Date.now();
  const days = Math.floor(diffMs / 86400000);
  if (days < 0)
    return {
      text: `En retard de ${Math.abs(days)}j`,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-50 dark:bg-red-900/20",
      dot: "bg-red-500",
    };
  if (days <= 14)
    return {
      text: `Dans ${days}j`,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-900/20",
      dot: "bg-amber-500",
    };
  return {
    text: `Dans ${days}j`,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    dot: "bg-emerald-500",
  };
}

// --- Classification pill color class ---
export function classificationClasses(classification: string | null): string {
  if (classification === "PUBLIC")
    return "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400";
  if (classification === "CONFIDENTIEL")
    return "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400";
  if (classification === "SECRET")
    return "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400";
  return "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
}
