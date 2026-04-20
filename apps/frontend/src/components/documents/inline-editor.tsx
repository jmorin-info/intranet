'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Quote, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@omnitech/ui';

/**
 * Simple contentEditable rich-text editor — no external dependency.
 * Works with document.execCommand which remains supported in all
 * evergreen browsers (deprecation notwithstanding) and is perfectly
 * adequate for policy / procedure drafting inside the intranet.
 * ISO 27001 A.5.1 — GED native authoring.
 */
export interface InlineEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  disabled?: boolean;
}

export function InlineEditor({
  value,
  onChange,
  placeholder = 'Rédigez votre document ici…',
  minHeight = 360,
  disabled = false,
}: InlineEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const lastExternalValue = useRef<string>(value);

  // Keep the DOM in sync when the parent changes the value (e.g. on load)
  useEffect(() => {
    if (!ref.current) return;
    if (value !== lastExternalValue.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
      lastExternalValue.current = value;
    }
  }, [value]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      if (disabled) return;
      ref.current?.focus();
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      document.execCommand(command, false, arg);
      if (ref.current) {
        const html = ref.current.innerHTML;
        lastExternalValue.current = html;
        onChange(html);
      }
    },
    [disabled, onChange],
  );

  const handleInput = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastExternalValue.current = html;
    onChange(html);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-white dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-1 p-1.5 border-b bg-slate-50 dark:bg-slate-800">
        <ToolbarBtn onClick={() => exec('bold')} title="Gras (Ctrl+B)" icon={Bold} />
        <ToolbarBtn onClick={() => exec('italic')} title="Italique (Ctrl+I)" icon={Italic} />
        <Separator />
        <ToolbarBtn onClick={() => exec('formatBlock', 'H1')} title="Titre 1" icon={Heading1} />
        <ToolbarBtn onClick={() => exec('formatBlock', 'H2')} title="Titre 2" icon={Heading2} />
        <ToolbarBtn onClick={() => exec('formatBlock', 'BLOCKQUOTE')} title="Citation" icon={Quote} />
        <Separator />
        <ToolbarBtn onClick={() => exec('insertUnorderedList')} title="Liste à puces" icon={List} />
        <ToolbarBtn onClick={() => exec('insertOrderedList')} title="Liste numérotée" icon={ListOrdered} />
        <Separator />
        <ToolbarBtn onClick={() => exec('undo')} title="Annuler" icon={Undo2} />
        <ToolbarBtn onClick={() => exec('redo')} title="Rétablir" icon={Redo2} />
      </div>
      <div
        ref={ref}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={handleInput}
        className="prose prose-sm dark:prose-invert max-w-none px-4 py-3 focus:outline-none"
        style={{ minHeight }}
        data-placeholder={placeholder}
      />
      <style jsx>{`
        div[contenteditable='true']:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  onClick,
  title,
}: {
  icon: React.ElementType;
  onClick: () => void;
  title: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      title={title}
      className="h-7 w-7 p-0"
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}

function Separator() {
  return <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />;
}
