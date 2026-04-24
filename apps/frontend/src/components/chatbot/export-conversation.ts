/**
 * Export conversation — Feature 5.
 *
 * Construit un Markdown formaté à partir des messages du chatbot, ou
 * lance un export PDF côté backend (réutilise `generateSignedPdf`).
 */

import type { ChatMessage } from '@/stores/chatbot-store';
import { generateSignedPdf, type PdfSection } from '@/lib/export-pdf';

interface ExportContext {
  user?: { firstName?: string; lastName?: string; email?: string };
  module?: string;
}

/** Format ISO court "2026-04-24 14:32" pour les timestamps. */
function fmt(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/** Génère le markdown de la conversation. */
export function buildConversationMarkdown(
  messages: ChatMessage[],
  ctx: ExportContext = {},
): string {
  const author =
    ctx.user?.firstName && ctx.user?.lastName
      ? `${ctx.user.firstName} ${ctx.user.lastName}`
      : ctx.user?.email || 'Utilisateur';
  const exportedAt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
  });

  const header = [
    '# Conversation Assistant OMNITECH',
    '',
    `**Utilisateur :** ${author}`,
    `**Exportée le :** ${exportedAt}`,
    ctx.module ? `**Module :** ${ctx.module}` : null,
    `**Nombre de messages :** ${messages.length}`,
    '',
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = messages
    .map((m) => {
      const who = m.role === 'user' ? 'Utilisateur' : 'Assistant';
      const ts = fmt(m.timestamp);
      const sources =
        m.sources && m.sources.length > 0
          ? '\n\n**Sources :**\n' +
            m.sources
              .map(
                (s, i) =>
                  `${i + 1}. ${s.sourceType} — ${s.title || s.sourceId} (score ${Math.round((s.score || 0) * 100)}%)`,
              )
              .join('\n')
          : '';
      return `### ${who} — ${ts}\n\n${m.content}${sources}`;
    })
    .join('\n\n---\n\n');

  return header + body + '\n';
}

/** Déclenche le téléchargement direct d'un fichier `.md`. */
export function downloadMarkdown(filename: string, content: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Lance un export PDF backend (signé) à partir des messages. */
export async function exportConversationPdf(
  messages: ChatMessage[],
  ctx: ExportContext = {},
): Promise<void> {
  const author =
    ctx.user?.firstName && ctx.user?.lastName
      ? `${ctx.user.firstName} ${ctx.user.lastName}`
      : ctx.user?.email || 'Utilisateur';

  const sections: PdfSection[] = messages.map((m) => ({
    heading: `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} — ${fmt(m.timestamp)}`,
    paragraphs: [
      m.content,
      ...(m.sources && m.sources.length > 0
        ? [
            'Sources : ' +
              m.sources
                .map((s, i) => `[${i + 1}] ${s.title || s.sourceId}`)
                .join(', '),
          ]
        : []),
    ],
  }));

  await generateSignedPdf({
    title: 'Conversation Assistant OMNITECH',
    subtitle: `Exportée pour ${author}`,
    sections,
    context: ctx.module ? `Module : ${ctx.module}` : undefined,
  });
}
