/**
 * Étapes de progression du pipeline RAG streamé (événements SSE `status`
 * émis par le backend — fix 2026-07). Sur cette machine (inférence CPU),
 * le prompt-eval seul prend 15-40 s : afficher l'étape en cours rend
 * l'attente lisible au lieu d'un spinner muet.
 */

export type AiStreamStage = "retrieving" | "generating" | "model_fallback" | "queued";

export const AI_STREAM_STAGE_LABELS: Record<AiStreamStage, string> = {
  retrieving: "Recherche documentaire…",
  generating: "Rédaction de la réponse…",
  model_fallback: "Bascule sur un modèle de secours…",
  queued: "En file d'attente…",
};

export function aiStreamStageLabel(stage: string | null | undefined): string | null {
  if (!stage) return null;
  // "queued:N" → position d'attente (N requêtes IA devant celle-ci).
  if (stage.startsWith("queued:")) {
    const pos = parseInt(stage.slice(7), 10);
    return Number.isFinite(pos) && pos > 0
      ? `En file d'attente (position ${pos})…`
      : AI_STREAM_STAGE_LABELS.queued;
  }
  return AI_STREAM_STAGE_LABELS[stage as AiStreamStage] ?? null;
}

/**
 * Consomme un flux SSE `data: {type: token|meta|status|error|done}` du backend
 * RAG (résumé, question, recherche). Mutualise le parsing utilisé par le
 * chatbot pour que résumé/recherche survivent eux aussi au timeout de la
 * passerelle réseau (les tokens qui arrivent réarment le read-timeout).
 *
 * `credentials: include` → le JWT httpOnly est attaché par le navigateur
 * (ANSSI A.5.34, pas de token en localStorage).
 *
 * Renvoie true si au moins un token a été reçu.
 */
export interface AiSseHandlers {
  onToken: (token: string) => void;
  onStatus?: (stage: string | null) => void;
  onMeta?: (meta: Record<string, unknown>) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
}

export async function consumeAiSse(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  handlers: AiSseHandlers,
): Promise<boolean> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/api\/?$/, "/api/v1");
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: handlers.signal,
  });

  if (!res.ok || !res.body) {
    const err = new Error(`SSE HTTP ${res.status}`) as Error & { httpStatus?: number };
    err.httpStatus = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let gotToken = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(line.slice(6));
        } catch {
          continue; // JSON partiel
        }
        switch (payload.type) {
          case "token":
            gotToken = true;
            handlers.onStatus?.(null);
            handlers.onToken(String(payload.token ?? ""));
            break;
          case "status": {
            // Le stage "queued" porte une position → on l'encode `queued:N`
            // pour que aiStreamStageLabel affiche le rang sans changer la
            // signature (string) du callback onStatus.
            const stage = (payload.stage as string) ?? null;
            const withPos =
              stage === "queued" && typeof payload.position === "number"
                ? `queued:${payload.position}`
                : stage;
            handlers.onStatus?.(withPos);
            break;
          }
          // "ping" = heartbeat anti-timeout passerelle → ignoré
          case "ping":
            break;
          case "meta":
            handlers.onMeta?.(payload);
            break;
          case "error":
            handlers.onError?.(String(payload.message ?? ""));
            break;
          // "done" → fin de flux, rien à faire
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return gotToken;
}
