import { LlmService } from "./llm.service";

/**
 * Tests LlmService — fix 2026-07 (budgets temps réalistes sur inférence CPU).
 *
 * Couvre les garde-fous qui remplacent l'ancien abort global de 30 s :
 *  - time-to-first-token (OLLAMA_TTFT_TIMEOUT_MS)
 *  - idle-timeout réarmé à chaque chunk (OLLAMA_IDLE_TIMEOUT_MS)
 *  - fallback de modèle AVANT le premier token / propagation après
 *
 * `fetch` global est mocké : aucun appel réseau, aucun Ollama requis.
 */

/** Encode des lignes NDJSON Ollama en chunks binaires. */
function ndjson(...tokens: string[]): Uint8Array[] {
  return tokens.map((t) => new TextEncoder().encode(JSON.stringify({ response: t }) + "\n"));
}

/**
 * Construit une fausse Response streamée. `chunks` peut contenir des Uint8Array
 * ou des fonctions async (pour simuler un délai/une erreur en cours de lecture).
 */
function streamResponse(chunks: Array<Uint8Array | (() => Promise<Uint8Array>)>, ok = true) {
  return {
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    body: {
      async *[Symbol.asyncIterator]() {
        for (const c of chunks) {
          yield typeof c === "function" ? await c() : c;
        }
      },
    },
  } as unknown as Response;
}

/** Attend `ms` en temps simulé tout en laissant tourner la boucle d'événements. */
function neverResolvingUntilAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
      return;
    }
    signal.addEventListener("abort", () => {
      reject(Object.assign(new Error("This operation was aborted"), { name: "AbortError" }));
    });
  });
}

async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const t of gen) out.push(t);
  return out;
}

describe("LlmService", () => {
  let service: LlmService;
  let originalFetch: typeof fetch;
  const envKeys = [
    "OLLAMA_TIMEOUT_MS",
    "OLLAMA_TTFT_TIMEOUT_MS",
    "OLLAMA_IDLE_TIMEOUT_MS",
    "OLLAMA_LLM_MODEL_PRIMARY",
    "OLLAMA_LLM_MODEL_FALLBACK",
    "OLLAMA_LLM_MODEL_EMERGENCY",
    "OLLAMA_MODEL",
    "OLLAMA_URL",
  ];

  beforeEach(() => {
    service = new LlmService();
    originalFetch = global.fetch;
    for (const k of envKeys) delete process.env[k];
    // Silence les logs Nest pendant les tests d'escalade.
    jest.spyOn(service["logger"], "warn").mockImplementation(() => undefined);
    jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);
    jest.spyOn(service["logger"], "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
    for (const k of envKeys) delete process.env[k];
  });

  // ---------------------------------------------------------------- Budgets

  describe("chaîne de modèles et budgets env", () => {
    it("utilise mistral en primary par défaut", () => {
      expect(service.getActiveModel()).toBe("mistral");
    });

    it("respecte OLLAMA_LLM_MODEL_PRIMARY", () => {
      process.env.OLLAMA_LLM_MODEL_PRIMARY = "phi3:mini";
      expect(service.getActiveModel()).toBe("phi3:mini");
    });

    it("applique OLLAMA_TIMEOUT_MS au budget d'un appel non-streamé", async () => {
      process.env.OLLAMA_TIMEOUT_MS = "1000";
      // Le fetch ne résout jamais : seul l'abort du service peut le terminer.
      global.fetch = jest.fn((_url, init) =>
        neverResolvingUntilAbort((init as RequestInit).signal as AbortSignal),
      ) as unknown as typeof fetch;

      // Les 3 modèles échouent (chacun sur son abort) → erreur finale.
      await expect(service.generate("prompt")).rejects.toThrow(/All LLM models in chain failed/);
    }, 20000);
  });

  // ------------------------------------------------------------------ TTFT

  describe("generateStream — time-to-first-token", () => {
    it("avorte le modèle qui ne produit aucun token dans la fenêtre TTFT", async () => {
      process.env.OLLAMA_TTFT_TIMEOUT_MS = "150";
      // Tous les modèles restent muets → aucun ne passe le TTFT.
      global.fetch = jest.fn((_url, init) =>
        neverResolvingUntilAbort((init as RequestInit).signal as AbortSignal),
      ) as unknown as typeof fetch;

      await expect(collect(service.generateStream("q"))).rejects.toThrow(
        /All LLM models in chain failed before first token/,
      );
      // primary + fallback + emergency = 3 tentatives (pas de retry en stream).
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(3);
    }, 20000);

    it("ne coupe pas un flux lent tant que des chunks arrivent (idle réarmé)", async () => {
      process.env.OLLAMA_TTFT_TIMEOUT_MS = "500";
      process.env.OLLAMA_IDLE_TIMEOUT_MS = "300";

      // 4 chunks espacés de 150 ms : chacun réarme l'idle-timeout de 300 ms.
      // Durée totale (600 ms) > idle-timeout : sans réarmement, le flux serait coupé.
      const delayed = (t: string) => () =>
        new Promise<Uint8Array>((r) =>
          setTimeout(
            () => r(new TextEncoder().encode(JSON.stringify({ response: t }) + "\n")),
            150,
          ),
        );
      global.fetch = jest
        .fn()
        .mockResolvedValue(
          streamResponse([delayed("Bon"), delayed("jour"), delayed(" le"), delayed(" monde")]),
        ) as unknown as typeof fetch;

      const tokens = await collect(service.generateStream("q"));
      expect(tokens.join("")).toBe("Bonjour le monde");
    }, 20000);

    it("coupe le flux quand le silence entre deux chunks dépasse l'idle-timeout", async () => {
      process.env.OLLAMA_TTFT_TIMEOUT_MS = "500";
      process.env.OLLAMA_IDLE_TIMEOUT_MS = "120";

      // 1er token immédiat, puis silence : l'idle-timeout doit abort.
      // Comme un token est déjà parti, l'erreur est propagée (pas de fallback).
      global.fetch = jest.fn((_url, init) =>
        Promise.resolve(
          streamResponse([
            ndjson("Debut")[0],
            () => neverResolvingUntilAbort((init as RequestInit).signal as AbortSignal),
          ]),
        ),
      ) as unknown as typeof fetch;

      await expect(collect(service.generateStream("q"))).rejects.toThrow();
      // Un seul appel : pas de fallback après le premier token.
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    }, 20000);
  });

  // -------------------------------------------------------------- Fallback

  describe("generateStream — fallback de modèle", () => {
    it("bascule sur le modèle suivant si le primary échoue AVANT le 1er token", async () => {
      const fallbacks: Array<{ model: string; level: number }> = [];
      global.fetch = jest
        .fn()
        // primary : HTTP 500 → échec avant tout token
        .mockResolvedValueOnce(streamResponse([], false))
        // fallback phi3:mini : répond
        .mockResolvedValueOnce(
          streamResponse(ndjson("Réponse ", "de secours")),
        ) as unknown as typeof fetch;

      const tokens = await collect(
        service.generateStream("q", {
          onModelFallback: (model, level) => fallbacks.push({ model, level }),
        }),
      );

      expect(tokens.join("")).toBe("Réponse de secours");
      expect(fallbacks).toEqual([{ model: "phi3:mini", level: 1 }]);
      const bodies = (global.fetch as jest.Mock).mock.calls.map(
        (c) => JSON.parse((c[1] as RequestInit).body as string).model,
      );
      expect(bodies).toEqual(["mistral", "phi3:mini"]);
    });

    it("escalade jusqu'à qwen2:0.5b si primary et fallback échouent", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(streamResponse([], false))
        .mockResolvedValueOnce(streamResponse([], false))
        .mockResolvedValueOnce(streamResponse(ndjson("ok"))) as unknown as typeof fetch;

      const tokens = await collect(service.generateStream("q"));
      expect(tokens.join("")).toBe("ok");
      const models = (global.fetch as jest.Mock).mock.calls.map(
        (c) => JSON.parse((c[1] as RequestInit).body as string).model,
      );
      expect(models).toEqual(["mistral", "phi3:mini", "qwen2:0.5b"]);
    });

    it("propage l'erreur sans re-tenter quand elle survient APRÈS le 1er token", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(
          streamResponse([ndjson("partiel")[0], () => Promise.reject(new Error("socket hang up"))]),
        ) as unknown as typeof fetch;

      await expect(collect(service.generateStream("q"))).rejects.toThrow("socket hang up");
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });

    it("transmet maxTokens et le prompt à Ollama", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue(streamResponse(ndjson("x"))) as unknown as typeof fetch;

      await collect(service.generateStream("ma question", { maxTokens: 256 }));

      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.prompt).toBe("ma question");
      expect(body.stream).toBe(true);
      expect(body.options.num_predict).toBe(256);
    });
  });

  // -------------------------------------------------------------- generate

  describe("generate — fallback non-streamé", () => {
    it("retente le primary puis escalade, et renvoie le niveau atteint", async () => {
      global.fetch = jest
        .fn()
        // primary : 1 tentative + 2 retries = 3 échecs
        .mockRejectedValueOnce(new Error("boom"))
        .mockRejectedValueOnce(new Error("boom"))
        .mockRejectedValueOnce(new Error("boom"))
        // fallback : succès
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => ({ response: "  résumé  " }),
        }) as unknown as typeof fetch;

      const result = await service.generate("prompt");
      expect(result.text).toBe("résumé");
      expect(result.modelUsed).toBe("phi3:mini");
      expect(result.fallbackLevel).toBe(1);
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(4);
    }, 20000);

    it("lève une erreur explicite quand toute la chaîne échoue", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch;
      await expect(service.generate("p")).rejects.toThrow(/All LLM models in chain failed/);
    }, 20000);

    it("traite timeoutMs comme un budget GLOBAL (retries + fallbacks), pas par tentative", async () => {
      // fetch ne résout jamais : seul l'abort du service le termine. Ancienne
      // sémantique : 3 retries + 2 fallbacks = jusqu'à 5 × timeoutMs. Désormais
      // le budget est agrégé → on s'arrête bien avant d'empiler la chaîne.
      const fetchMock = jest.fn((_url, init) =>
        neverResolvingUntilAbort((init as RequestInit).signal as AbortSignal),
      );
      global.fetch = fetchMock as unknown as typeof fetch;

      const start = Date.now();
      await expect(service.generate("p", { timeoutMs: 400 })).rejects.toThrow(
        /budget exhausted|All LLM models in chain failed/,
      );
      const elapsed = Date.now() - start;

      // Budget 400 ms + au plus une pause de retry : jamais 5 × 400 ms.
      expect(elapsed).toBeLessThan(3000);
      // Au plus 2 appels réseau (et non les 5 de l'ancienne sémantique).
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
    }, 20000);
  });

  // ---------------------------------------------------------------- warmup

  describe("warmup", () => {
    it("charge le modèle primary avec num_predict=1", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ response: "" }),
      }) as unknown as typeof fetch;

      const res = await service.warmup();
      expect(res.model).toBe("mistral");
      const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(body.options.num_predict).toBe(1);
      // Pas de chaîne de fallback au warmup : un seul appel.
      expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    });
  });
});
