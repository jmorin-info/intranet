import { api } from './api';

export interface PdfSection {
  heading?: string;
  paragraphs: string[];
}

export interface SignedPdfRequest {
  title: string;
  subtitle?: string;
  sections: PdfSection[];
  reference?: string;
  context?: string;
}

/**
 * Génère un PDF signé côté backend et le télécharge immédiatement dans le navigateur.
 * Le backend calcule un SHA-256 du payload canonique et l'imprime en footer
 * + en métadonnées PDF. Traçabilité audit ISO 27001.
 */
export async function generateSignedPdf(payload: SignedPdfRequest): Promise<{
  exportId: string;
  hash: string;
  generatedAt: string;
  fileName: string;
}> {
  const response = await api.post('/exports/pdf', payload, { responseType: 'blob' });
  const exportId = (response.headers['x-export-id'] as string) || '';
  const hash = (response.headers['x-export-hash'] as string) || '';
  const generatedAt = (response.headers['x-export-generatedat'] as string) || new Date().toISOString();

  // Extraire le nom de fichier du Content-Disposition
  const disposition = (response.headers['content-disposition'] as string) || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const fileName = match?.[1] || `export-${exportId.slice(0, 8)}.pdf`;

  const blob = response.data instanceof Blob
    ? response.data
    : new Blob([response.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { exportId, hash, generatedAt, fileName };
}
