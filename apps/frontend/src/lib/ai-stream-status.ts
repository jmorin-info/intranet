/**
 * Étapes de progression du pipeline RAG streamé (événements SSE `status`
 * émis par le backend — fix 2026-07). Sur cette machine (inférence CPU),
 * le prompt-eval seul prend 15-40 s : afficher l'étape en cours rend
 * l'attente lisible au lieu d'un spinner muet.
 */

export type AiStreamStage = "retrieving" | "generating" | "model_fallback";

export const AI_STREAM_STAGE_LABELS: Record<AiStreamStage, string> = {
  retrieving: "Recherche documentaire…",
  generating: "Rédaction de la réponse…",
  model_fallback: "Bascule sur un modèle de secours…",
};

export function aiStreamStageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  return AI_STREAM_STAGE_LABELS[stage as AiStreamStage] ?? null;
}
