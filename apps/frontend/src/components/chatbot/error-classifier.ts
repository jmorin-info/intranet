/**
 * Classification des erreurs remontées par le pipeline RAG (Feature 6).
 *
 * Catégorise l'erreur pour que `error-state.tsx` affiche les bons CTAs :
 *   - confidence_low  → suggestions [Réessayer, Reformuler, Contacter IT]
 *   - ollama_timeout  → suggestions [Réessayer, Créer un ticket]
 *   - rbac_filtered   → [Contacter RSSI, Demander accès]
 *   - rate_limit      → [Réessayer dans 1 min]
 *   - aborted         → [Réessayer]
 *   - network         → [Vérifier connexion, Réessayer]
 *   - unknown         → [Réessayer, Créer un ticket]
 */

import type { ChatbotError, ChatbotErrorKind } from "./types";

interface ErrorShape {
  name?: string;
  code?: string;
  message?: string;
  response?: { status?: number; data?: { message?: string } };
}

export function classifyError(err: unknown): ChatbotError {
  const e = (err ?? {}) as ErrorShape;
  const message = e?.response?.data?.message ?? e?.message ?? "";
  const status = e?.response?.status;
  const name = e?.name;

  // Abort (user pressed Stop / Esc)
  if (name === "AbortError" || /aborted|user abort/i.test(message)) {
    return {
      kind: "aborted",
      message: "Génération interrompue.",
      technical: message,
    };
  }

  // Rate limit (429)
  if (status === 429) {
    return {
      kind: "rate_limit",
      message: "Trop de requêtes — merci de patienter quelques instants avant de réessayer.",
      technical: message,
    };
  }

  // RBAC filtered (403)
  if (status === 403 || /rbac|forbidden|interdit/i.test(message)) {
    return {
      kind: "rbac_filtered",
      message: "Aucune source accessible avec vos habilitations pour cette requête.",
      technical: message,
    };
  }

  // IA surchargée / indisponible (503/504 renvoyés par le backend depuis le
  // fix 2026-07 — plus de 200 { summary: "Erreur…" }) ou timeout client axios.
  if (status === 503 || status === 504 || e?.code === "ECONNABORTED") {
    return {
      kind: "ollama_timeout",
      message: "L'IA est momentanément surchargée — réessayez dans quelques minutes.",
      technical: message,
    };
  }

  // Ollama timeout / LLM down
  if (/ollama|llm.*(timeout|unavailable|down)|timeout.*ollama/i.test(message)) {
    return {
      kind: "ollama_timeout",
      message:
        "Le moteur IA est temporairement indisponible. Une réponse extractive peut être disponible en réessayant.",
      technical: message,
    };
  }

  // Network / no response
  if (!status && /network|fetch|econn/i.test(message)) {
    return {
      kind: "network",
      message: "Erreur réseau — vérifiez votre connexion internet.",
      technical: message,
    };
  }

  // Unknown
  return {
    kind: "unknown",
    message:
      message ||
      "La recherche intelligente est temporairement indisponible. Réessayez dans quelques instants.",
    technical: message,
  };
}

/**
 * Message "confiance trop faible" : pas une erreur HTTP mais un signal que
 * la réponse n'est pas fiable — à afficher comme warning + CTAs spécifiques.
 */
export function buildLowConfidenceError(confidencePercent: number): ChatbotError {
  return {
    kind: "confidence_low",
    message: `Réponse peu fiable (confiance ${confidencePercent}%). Essayez de reformuler ou de préciser votre question.`,
    technical: `retrievalConfidence=${confidencePercent}%`,
  };
}

export const LOW_CONFIDENCE_THRESHOLD = 40 as const;

export function ctaTargetsForError(kind: ChatbotErrorKind): Array<{
  label: string;
  action: "retry" | "rephrase" | "ticket" | "contact_it" | "contact_rssi" | "dismiss";
}> {
  switch (kind) {
    case "confidence_low":
      return [
        { label: "Réessayer", action: "retry" },
        { label: "Reformuler", action: "rephrase" },
        { label: "Contacter IT", action: "contact_it" },
      ];
    case "ollama_timeout":
      return [
        { label: "Réessayer", action: "retry" },
        { label: "Créer un ticket", action: "ticket" },
      ];
    case "rbac_filtered":
      return [
        { label: "Contacter le RSSI", action: "contact_rssi" },
        { label: "Fermer", action: "dismiss" },
      ];
    case "rate_limit":
      return [{ label: "Réessayer dans 1 min", action: "retry" }];
    case "aborted":
      return [{ label: "Réessayer", action: "retry" }];
    case "network":
      return [{ label: "Réessayer", action: "retry" }];
    case "unknown":
    default:
      return [
        { label: "Réessayer", action: "retry" },
        { label: "Créer un ticket", action: "ticket" },
      ];
  }
}
