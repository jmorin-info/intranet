"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Button } from "@omnitech/ui";
import { FileImage, Maximize2 } from "lucide-react";
import { extensionForMime } from '@/lib/download';

const MarkdownViewer = dynamic(
  () =>
    import("@/components/viewers/markdown-viewer").then(
      (m) => m.MarkdownViewer,
    ),
  { ssr: false },
);
const ImageViewer = dynamic(
  () => import("@/components/viewers/image-viewer").then((m) => m.ImageViewer),
  { ssr: false },
);
const PdfViewer = dynamic(
  () => import("@/components/viewers/pdf-viewer").then((m) => m.PdfViewer),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);
const DocxViewer = dynamic(
  () => import("@/components/viewers/docx-viewer").then((m) => m.DocxViewer),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

interface DocumentViewerProps {
  fileType: string;
  previewUrl: string;
  title: string;
  canOpenReadingMode: boolean;
  onOpenReadingMode: () => void;
}

/**
 * Wrapper viewer qui sélectionne le composant d'aperçu approprié
 * (PDF / DOCX / Markdown / Image) selon le type de fichier.
 */
export function DocumentViewer({
  fileType,
  previewUrl,
  title,
  canOpenReadingMode,
  onOpenReadingMode,
}: DocumentViewerProps) {
  const extension = extensionForMime(fileType, fileType.startsWith('.') ? `file${fileType}` : fileType);
  if (!previewUrl) return <p role="status" className="py-10 text-center text-sm text-seal-gray-500">Préparation de l’aperçu…</p>;
  const renderViewer = () => {
    if (extension === 'pdf') {
      return (
        <PdfViewer url={previewUrl} onOpenReadingMode={onOpenReadingMode} />
      );
    }
    if (extension === 'docx') {
      return <DocxViewer url={previewUrl} />;
    }
    if (['md', 'markdown'].includes(extension)) {
      return <MarkdownViewer url={previewUrl} />;
    }
    if (extension === 'txt') {
      return <MarkdownViewer url={previewUrl} />;
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
      return <ImageViewer url={previewUrl} alt={title} />;
    }
    return (
      <div className="flex items-center justify-center py-12 text-sm text-seal-gray-500 dark:text-slate-400">
        <FileImage className="h-5 w-5 mr-2" />
        Aperçu non disponible pour ce format
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {canOpenReadingMode && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenReadingMode}
            className="text-[11px]"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Plein écran
          </Button>
        </div>
      )}
      <div className="min-h-[70vh]">{renderViewer()}</div>
    </div>
  );
}
