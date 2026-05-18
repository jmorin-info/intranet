export interface KioskScreenLabels {
  title: string;
  empty: string;
}

export interface KioskLabels {
  news: KioskScreenLabels;
  veille: KioskScreenLabels;
  indicators: KioskScreenLabels;
  footer: string;
}

export const FALLBACK_KIOSK_LABELS: KioskLabels = {
  news: { title: "Actualités", empty: "Aucune actualité pour le moment." },
  veille: {
    title: "Veille cyber · CERT-FR",
    empty: "Aucune alerte récente.",
  },
  indicators: {
    title: "Indicateurs SMSI",
    empty: "Indicateurs indisponibles.",
  },
  footer: "OMNITECH Security · Portail Intranet · ISO 27001",
};

function isScreenLabels(raw: unknown): raw is KioskScreenLabels {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return typeof o.title === "string" && typeof o.empty === "string";
}

export function normalizeKioskLabels(raw: unknown): KioskLabels | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.footer !== "string") return null;
  if (!isScreenLabels(o.news)) return null;
  if (!isScreenLabels(o.veille)) return null;
  if (!isScreenLabels(o.indicators)) return null;
  return {
    news: o.news,
    veille: o.veille,
    indicators: o.indicators,
    footer: o.footer,
  };
}
