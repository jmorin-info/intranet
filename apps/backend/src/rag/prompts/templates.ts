/**
 * Prompt templates par modèle LLM (P1.8.1.3).
 * Chaque famille de modèle a son format d'instruction natif :
 * - Mistral : [INST] ... [/INST]
 * - phi3 : <|system|>...<|end|><|user|>...<|end|><|assistant|>
 * - qwen2 : prompt simple (legacy)
 */

export interface RagPromptContext {
  query: string;
  chunks: Array<{ sourceType: string; title?: string; snippet: string }>;
}

export type PromptKind = 'rag' | 'summary' | 'ticketSuggest';

interface TemplateSet {
  rag: (ctx: RagPromptContext) => string;
  summary: (text: string) => string;
  ticketSuggest: (ticketText: string) => string;
}

const buildContext = (chunks: RagPromptContext['chunks']): string =>
  chunks
    .slice(0, 5)
    .map((c, i) => `[Source ${i + 1} — ${c.sourceType}] ${c.title ?? ''}\n${c.snippet}`)
    .join('\n\n');

export const PROMPT_TEMPLATES: Record<'mistral' | 'phi3' | 'qwen', TemplateSet> = {
  mistral: {
    rag: (ctx) => `[INST] Tu es l'assistant documentaire OMNITECH Security. Réponds en français de manière concise (max 4 phrases) en te basant uniquement sur le contexte fourni. Si le contexte ne permet pas de répondre, dis-le clairement.

Contexte :
${buildContext(ctx.chunks)}

Question : ${ctx.query} [/INST]`,
    summary: (text) => `[INST] Résume le document suivant en 3-5 phrases en français.

${text.slice(0, 4000)} [/INST]`,
    ticketSuggest: (ticketText) => `[INST] Tu es un agent de support OMNITECH. Propose une réponse professionnelle en français au ticket suivant.

${ticketText} [/INST]`,
  },
  phi3: {
    rag: (ctx) => `<|system|>
Tu es l'assistant documentaire OMNITECH Security. Réponds en français à partir du contexte uniquement.<|end|>
<|user|>
Contexte :
${buildContext(ctx.chunks)}

Question : ${ctx.query}<|end|>
<|assistant|>
`,
    summary: (text) => `<|system|>
Résume en français.<|end|>
<|user|>
${text.slice(0, 4000)}<|end|>
<|assistant|>
`,
    ticketSuggest: (ticketText) => `<|system|>
Agent de support OMNITECH.<|end|>
<|user|>
${ticketText}<|end|>
<|assistant|>
`,
  },
  qwen: {
    rag: (ctx) => `Tu es un assistant intranet pour OMNITECH SECURITY. Réponds en français de manière concise.

Contexte :
${buildContext(ctx.chunks)}

Question : ${ctx.query}

Réponds en te basant uniquement sur le contexte fourni.`,
    summary: (text) => `Résume en français :\n\n${text.slice(0, 4000)}`,
    ticketSuggest: (ticketText) => `Propose une réponse au ticket :\n\n${ticketText}`,
  },
};

/** Sélectionne le set de templates en fonction du nom du modèle Ollama. */
export function getPromptTemplates(model: string): TemplateSet {
  const m = model.toLowerCase();
  if (m.includes('mistral')) return PROMPT_TEMPLATES.mistral;
  if (m.includes('phi3') || m.includes('phi-3')) return PROMPT_TEMPLATES.phi3;
  return PROMPT_TEMPLATES.qwen;
}
