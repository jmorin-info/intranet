import type { LucideIcon } from "lucide-react";
import {
  Merge,
  Scissors,
  ScanText,
  FileDown,
  Droplets,
  ArrowRightLeft,
} from "lucide-react";

export type StirlingIconKey =
  | "Merge"
  | "Scissors"
  | "ScanText"
  | "FileDown"
  | "Droplets"
  | "ArrowRightLeft";

export const STIRLING_ICON_REGISTRY: Record<StirlingIconKey, LucideIcon> = {
  Merge,
  Scissors,
  ScanText,
  FileDown,
  Droplets,
  ArrowRightLeft,
};

export interface StirlingShortcut {
  label: string;
  /** Chemin Stirling — doit commencer par /. Ex: /merge-pdfs, /split-pdf-by-pages. */
  path: string;
  iconKey: StirlingIconKey;
}

export const FALLBACK_STIRLING_TOOLS: StirlingShortcut[] = [
  { label: "Fusionner", path: "/merge-pdfs", iconKey: "Merge" },
  { label: "Diviser", path: "/split-pdf-by-pages", iconKey: "Scissors" },
  { label: "OCR", path: "/ocr-pdf", iconKey: "ScanText" },
  { label: "Compresser", path: "/compress-pdf", iconKey: "FileDown" },
  { label: "Filigraner", path: "/add-watermark", iconKey: "Droplets" },
  { label: "Convertir", path: "/pdf-to-word", iconKey: "ArrowRightLeft" },
];

export function normalizeStirlingShortcut(
  raw: unknown,
): StirlingShortcut | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label : null;
  const path = typeof o.path === "string" ? o.path : null;
  const iconKey = typeof o.iconKey === "string" ? o.iconKey : null;
  if (!label || !path || !iconKey) return null;
  if (!path.startsWith("/")) return null;
  if (!(iconKey in STIRLING_ICON_REGISTRY)) return null;
  return { label, path, iconKey: iconKey as StirlingIconKey };
}
