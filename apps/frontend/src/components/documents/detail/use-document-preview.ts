"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** Fetch once through the authenticated, audited document route. */
export function useDocumentPreview(documentId: string | undefined, versionId: string | undefined, enabled: boolean) {
  const [preview, setPreview] = useState<{ url: string; loading: boolean; error: boolean }>({ url: '', loading: false, error: false });
  useEffect(() => {
    if (!enabled || !documentId || !versionId) {
      setPreview({ url: '', loading: false, error: false });
      return;
    }
    const controller = new AbortController();
    let objectUrl = '';
    setPreview({ url: '', loading: true, error: false });
    void api.get(`/documents/${documentId}/versions/${versionId}/download`, {
      responseType: 'blob', signal: controller.signal, params: { inline: 'true' },
    }).then(({ data }) => {
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      setPreview({ url: objectUrl, loading: false, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setPreview({ url: '', loading: false, error: true });
    });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId, versionId, enabled]);
  return preview;
}
