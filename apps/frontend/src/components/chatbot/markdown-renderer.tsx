"use client";

/**
 * MarkdownRenderer — rendu markdown léger avec syntax highlighting (Feature 7).
 *
 * Stratégie : on segmente la chaîne en blocs de code (```lang ... ```) et
 * blocs texte. Les premiers passent par <CodeBlock/> (highlight.js lazy),
 * les seconds par un mini-parseur inline (gras/italique/code/links/lists).
 *
 * Volontairement minimaliste — la modale RAG utilise déjà markdownToHtml
 * historique. Pour le chatbot FAB, on a besoin de blocs de code interactifs
 * (copier individuellement) que dangerouslySetInnerHTML ne permet pas.
 */

import React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CodeBlock } from "./code-block";

interface MarkdownRendererProps {
  content: string;
  /** Si fourni, intercepte les clics sur les liens markdown. */
  onLinkClick?: () => void;
  /** Mode condensé pour l'embedded chatbot FAB. */
  dense?: boolean;
}

interface Segment {
  type: "code" | "text";
  content: string;
  language?: string;
}

function segmentize(md: string): Segment[] {
  const segments: Segment[] = [];
  const codeBlockRe = /```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRe.exec(md)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", content: md.slice(last, m.index) });
    }
    segments.push({
      type: "code",
      content: m[2] ?? "",
      language: m[1] || undefined,
    });
    last = m.index + m[0].length;
  }
  if (last < md.length) {
    segments.push({ type: "text", content: md.slice(last) });
  }
  return segments;
}

/**
 * Rend une ligne markdown (inline) en JSX : gras, italique, inline-code, links.
 * Pas de tableaux ni d'images — on reste sur l'essentiel pour un chatbot.
 */
function renderInline(line: string, key: number): React.ReactNode {
  // Action link `→ [Label](href)`
  const actionMatch = line.match(/^→ \[(.+?)\]\((.+?)\)$/);
  if (actionMatch) {
    return (
      <Link
        key={key}
        href={actionMatch[2]!}
        className="flex items-center gap-1.5 mt-1.5 text-xs font-medium text-slate-900 dark:text-blue-400 hover:underline"
      >
        <ChevronDown className="h-3 w-3 rotate-[-90deg]" />
        {actionMatch[1]}
      </Link>
    );
  }

  // Heading
  const heading3 = line.match(/^### (.+)$/);
  if (heading3) {
    return (
      <p key={key} className="mt-2 mb-1 font-semibold text-sm">
        {parseInline(heading3[1] ?? "")}
      </p>
    );
  }
  const heading2 = line.match(/^## (.+)$/);
  if (heading2) {
    return (
      <p key={key} className="mt-2 mb-1 font-semibold text-base">
        {parseInline(heading2[1] ?? "")}
      </p>
    );
  }

  // List item
  const listItem = line.match(/^[-*] (.+)$/);
  if (listItem) {
    return (
      <li key={key} className="ml-4 list-disc">
        {parseInline(listItem[1] ?? "")}
      </li>
    );
  }

  // Numbered list
  const numList = line.match(/^(\d+)\. (.+)$/);
  if (numList) {
    return (
      <li key={key} className="ml-4 list-decimal">
        {parseInline(numList[2] ?? "")}
      </li>
    );
  }

  if (line.trim() === "") return <br key={key} />;

  return (
    <p key={key} className={key > 0 ? "mt-1" : ""}>
      {parseInline(line)}
    </p>
  );
}

/** Parser inline : **gras**, *italique*, `code`, [link](url) */
function parseInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Tokenize (greedy, simple)
  const re = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      out.push(<span key={`t-${i++}`}>{text.slice(last, m.index)}</span>);
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`b-${i++}`} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={`c-${i++}`}
          className="bg-gray-100 dark:bg-slate-800 rounded px-1 py-0.5 text-xs font-mono"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("[")) {
      const linkMatch = tok.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        out.push(
          <a
            key={`l-${i++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-900 dark:text-blue-400 underline"
          >
            {linkMatch[1]}
          </a>,
        );
      }
    } else if (tok.startsWith("*")) {
      out.push(
        <em key={`i-${i++}`} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length)
    out.push(<span key={`t-${i++}`}>{text.slice(last)}</span>);
  return out;
}

export function MarkdownRenderer({ content, dense }: MarkdownRendererProps) {
  const segments = segmentize(content);
  return (
    <div
      className={dense ? "text-sm leading-relaxed" : "text-sm leading-relaxed"}
    >
      {segments.map((seg, idx) => {
        if (seg.type === "code") {
          return (
            <CodeBlock key={idx} code={seg.content} language={seg.language} />
          );
        }
        const lines = seg.content.split("\n");
        return (
          <div key={idx}>{lines.map((line, i) => renderInline(line, i))}</div>
        );
      })}
    </div>
  );
}
