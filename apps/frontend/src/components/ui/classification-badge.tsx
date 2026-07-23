"use client";

import React from "react";
import { Lock, Shield, Eye, ShieldAlert } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";

/**
 * ClassificationBadge — affiche le niveau de classification d'une information
 * selon la politique OMNITECH SECURITY POL_015_POL_013 (Politique de
 * Classification, Marquage et Transfert — ISO/IEC 27001:2022 A.5.12 / A.5.13).
 *
 * L'echelle canonique est a 4 niveaux (POL_015 §5) ; les valeurs techniques
 * heritees du schema sont mappees vers le libelle canonique « Niveau X » :
 *
 *   SECRET       → Niveau 1 — Tres sensible  · Bordeaux PANTONE 202C (#892034)
 *   CONFIDENTIEL → Niveau 2 — Sensible       · Orange   PANTONE 715C (#F9964A)
 *   INTERNE      → Niveau 3 — Restreint (defaut) · Bleu PANTONE 660C (#296DC1)
 *   PUBLIC       → Niveau 4 — Public         · Vert     PANTONE 349C (#006233)
 *
 * La notation heritee « C3 / C4 » est abandonnee (cf. POL_015 §5.1). En
 * l'absence de marquage explicite, toute information est reputee de Niveau 3
 * — Restreint (POL_015 §5).
 */

type Classification = "PUBLIC" | "INTERNE" | "CONFIDENTIEL" | "SECRET";

interface ClassificationConfig {
  /** Libelle canonique « Niveau X — Libelle » a afficher (POL_015 §5). */
  label: string;
  /** Libelle court pour les badges denses (xs). */
  shortLabel: string;
  /** Niveau canonique (1=plus sensible, 4=public). */
  level: 1 | 2 | 3 | 4;
  hex: string;
  /** Variante de texte éclaircie pour le dark mode (contraste AA sur fond
   *  sombre — les teintes PANTONE brutes sont trop foncées sur slate-800/900). */
  hexDark: string;
  icon: React.ElementType;
  bg: string;
  bgDark: string;
  ring: string;
  /** Critere (consequence d'une divulgation) — POL_015 §5. */
  criterion: string;
  /** Exemples OMNITECH — POL_015 §5. */
  examples: string;
}

const CLASSIFICATIONS: Record<Classification, ClassificationConfig> = {
  SECRET: {
    label: "Niveau 1 — Très sensible",
    shortLabel: "N1",
    level: 1,
    hex: "#892034",
    hexDark: "#f4a3ae",
    icon: ShieldAlert,
    bg: "rgba(137, 32, 52, 0.1)",
    bgDark: "rgba(137, 32, 52, 0.28)",
    ring: "rgba(137, 32, 52, 0.35)",
    criterion: "Conséquences graves ou sûreté en jeu",
    examples:
      "Code source et secrets SEAL, clés privées, données clients OIV, données d'authentification",
  },
  CONFIDENTIEL: {
    label: "Niveau 2 — Sensible",
    shortLabel: "N2",
    level: 2,
    hex: "#F9964A",
    hexDark: "#fbb36b",
    icon: Lock,
    bg: "rgba(249, 150, 74, 0.1)",
    bgDark: "rgba(249, 150, 74, 0.24)",
    ring: "rgba(249, 150, 74, 0.35)",
    criterion: "Impact significatif sur l'activité ou des tiers",
    examples:
      "Configurations d'infrastructure, contrats, données personnelles RH, documents de conception, analyses de risque",
  },
  INTERNE: {
    label: "Niveau 3 — Restreint",
    shortLabel: "N3",
    level: 3,
    hex: "#296DC1",
    hexDark: "#7db3ec",
    icon: Shield,
    bg: "rgba(41, 109, 193, 0.08)",
    bgDark: "rgba(41, 109, 193, 0.26)",
    ring: "rgba(41, 109, 193, 0.3)",
    criterion: "Usage interne, sensibilité limitée (niveau par défaut)",
    examples: "Notes internes, comptes rendus, documentation projet, procédures internes",
  },
  PUBLIC: {
    label: "Niveau 4 — Public",
    shortLabel: "N4",
    level: 4,
    hex: "#006233",
    hexDark: "#5fbf8f",
    icon: Eye,
    bg: "rgba(0, 98, 51, 0.08)",
    bgDark: "rgba(0, 98, 51, 0.26)",
    ring: "rgba(0, 98, 51, 0.3)",
    criterion: "Communicable sans risque",
    examples: "Plaquettes commerciales, communiqués, contenus publiés du site web",
  },
};

/**
 * Helper public : renvoie le libelle canonique « Niveau X — Libelle » d'un
 * niveau technique stocke. A utiliser dans tout affichage (autre que ce badge)
 * pour eviter d'afficher la valeur brute du enum (PUBLIC/INTERNE/...).
 */
export function getClassificationLabel(level?: string | null): string {
  // String() defensif : certaines valeurs heritees arrivent en non-string
  // (ex. niveau stocke en entier) — sans coercion, (nombre).toUpperCase()
  // leve « (intermediate value).toUpperCase is not a function ».
  const k = String(level || "INTERNE").toUpperCase() as Classification;
  return (CLASSIFICATIONS[k] || CLASSIFICATIONS.INTERNE).label;
}

/**
 * Prefixe « [Niveau X] » a utiliser dans les sujets de courriel sensibles
 * (POL_015 §7 et §7.1 — modele de marquage des courriels).
 */
export function getEmailSubjectPrefix(level?: string | null): string {
  const k = String(level || "INTERNE").toUpperCase() as Classification;
  const lvl = (CLASSIFICATIONS[k] || CLASSIFICATIONS.INTERNE).level;
  return `[Niveau ${lvl}]`;
}

/**
 * Marquage standard pour pied de page / en-tete de document formel
 * (POL_015 §7 — Marquage de l'information). Exemple :
 *   « Classification : Niveau 3 — Restreint »
 */
export function getDocumentMarking(level?: string | null): string {
  return `Classification : ${getClassificationLabel(level)}`;
}

interface ClassificationBadgeProps {
  level: Classification | string | null | undefined;
  size?: "xs" | "sm" | "md";
  showIcon?: boolean;
  className?: string;
}

export function ClassificationBadge({
  level,
  size = "sm",
  showIcon = true,
  className = "",
}: ClassificationBadgeProps) {
  const safeLevel = String(level || "INTERNE").toUpperCase() as Classification;
  const config = CLASSIFICATIONS[safeLevel] || CLASSIFICATIONS.INTERNE;
  const Icon = config.icon;
  // Dark mode : les teintes PANTONE brutes (bordeaux/vert foncé) tombent sous le
  // seuil WCAG AA sur fond slate sombre — on éclaircit le texte (hexDark) et on
  // opacifie le fond (bgDark). Le store est déjà la source du thème (anti-FOUC).
  const darkMode = useUIStore((s) => s.darkMode);

  const sizeStyles = {
    xs: "text-[9px] px-1.5 py-0.5 gap-0.5",
    sm: "text-[10px] px-2 py-0.5 gap-1",
    md: "text-xs px-2.5 py-1 gap-1.5",
  };

  const iconSize = {
    xs: "h-2.5 w-2.5",
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
  };

  // En 'xs' on prefere le libelle court « N3 » pour rester compact dans les
  // listings denses (citation-chip, document-card) ; en sm/md on affiche le
  // libelle canonique complet « Niveau 3 — Restreint » exige par POL_015 §7.
  const displayLabel = size === "xs" ? config.shortLabel : config.label;

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tracking-wider border ${size === "xs" ? "uppercase" : ""} ${sizeStyles[size]} ${className}`}
      style={{
        color: darkMode ? config.hexDark : config.hex,
        backgroundColor: darkMode ? config.bgDark : config.bg,
        borderColor: config.ring,
      }}
      title={`${config.label} (POL_015 §5 · ISO 27001 A.5.12) — ${config.criterion}. Ex. : ${config.examples}`}
    >
      {showIcon && <Icon className={iconSize[size]} />}
      {displayLabel}
    </span>
  );
}

/**
 * Badge "Statut alarme" — code couleur SEAL System pour les états d'alarme
 */
type AlarmStatus = "NEW" | "NORMAL" | "ACK" | "ENDED";

const ALARM_CONFIG: Record<AlarmStatus, { label: string; hex: string; bg: string }> = {
  NEW: { label: "Nouvelle", hex: "#cc0000", bg: "rgba(204, 0, 0, 0.1)" },
  NORMAL: { label: "Active", hex: "#762323", bg: "rgba(118, 35, 35, 0.1)" },
  ACK: { label: "Acquittée", hex: "#c68200", bg: "rgba(198, 130, 0, 0.1)" },
  ENDED: { label: "Terminée", hex: "#70916a", bg: "rgba(112, 145, 106, 0.1)" },
};

export function AlarmStatusBadge({ status }: { status: AlarmStatus | string }) {
  const safe = (String(status ?? "").toUpperCase() as AlarmStatus) || "NEW";
  const config = ALARM_CONFIG[safe] || ALARM_CONFIG.NEW;
  return (
    <span
      className="inline-flex items-center rounded-full text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
      style={{ color: config.hex, backgroundColor: config.bg }}
    >
      {config.label}
    </span>
  );
}
