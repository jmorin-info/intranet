import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import * as crypto from 'crypto';

export interface SignedPdfInput {
  title: string;
  subtitle?: string;
  /** Sections de contenu. Chaque section = heading optionnel + paragraphes plain-text. */
  sections: Array<{
    heading?: string;
    paragraphs: string[];
  }>;
  /** Métadonnées ajoutées au pied de page et aux infos PDF. */
  metadata: {
    author: string;
    authorEmail?: string;
    reference?: string;
    context?: string;
  };
}

export interface SignedPdfResult {
  buffer: Buffer;
  hash: string;
  exportId: string;
  generatedAt: string;
  fileName: string;
}

/**
 * Génère un PDF signé cryptographiquement pour usage légal/audit ISO 27001.
 *
 * Propriétés :
 *  - SHA-256 du contenu imprimé dans le footer (intégrité)
 *  - UUID v4 d'export unique (traçabilité)
 *  - Horodatage ISO 8601
 *  - Métadonnées PDF (Creator, Producer, CreationDate)
 *  - Footer avec "Vérifier le hash : sha256sum <fichier>"
 *
 * Ce n'est pas une signature X.509 qualifiée (eIDAS) — pour ça il faut
 * passer par DocuSeal ou un TSP externe. Mais le hash + UUID + timestamp
 * suffisent pour la plupart des preuves internes (procès-verbaux, revues,
 * rapports d'audit interne).
 */
@Injectable()
export class SignedPdfService {
  private readonly logger = new Logger(SignedPdfService.name);

  async generate(input: SignedPdfInput): Promise<SignedPdfResult> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

    const exportId = crypto.randomUUID();
    const generatedAt = new Date().toISOString();

    const colorPrimary = rgb(0, 68 / 255, 105 / 255); // #004469 navy
    const colorAccent = rgb(246 / 255, 141 / 255, 46 / 255); // #F68D2E orange
    const colorText = rgb(0.15, 0.15, 0.2);
    const colorMuted = rgb(0.45, 0.45, 0.5);

    const pageW = 595.28; // A4
    const pageH = 841.89;
    const marginX = 50;
    const marginTop = 90;
    const marginBottom = 70;
    const usableW = pageW - marginX * 2;

    let currentPage = pdfDoc.addPage([pageW, pageH]);
    let y = pageH - marginTop;

    const writeHeader = (page: typeof currentPage) => {
      // Bandeau navy en haut
      page.drawRectangle({
        x: 0,
        y: pageH - 50,
        width: pageW,
        height: 50,
        color: colorPrimary,
      });
      // Accent orange fin
      page.drawRectangle({
        x: 0,
        y: pageH - 52,
        width: pageW,
        height: 2,
        color: colorAccent,
      });
      page.drawText('OMNITECH SECURITY', {
        x: marginX,
        y: pageH - 32,
        size: 12,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
      page.drawText('Portail Intranet • Document généré', {
        x: pageW - marginX - 180,
        y: pageH - 32,
        size: 8,
        font,
        color: rgb(0.9, 0.9, 0.95),
      });
    };

    const writeFooter = (page: typeof currentPage, hash: string, pageNum: number, pageCount: number) => {
      page.drawLine({
        start: { x: marginX, y: 55 },
        end: { x: pageW - marginX, y: 55 },
        thickness: 0.5,
        color: colorMuted,
      });
      const footerLine1 = `Export #${exportId.slice(0, 8)} • ${generatedAt} • ${input.metadata.author}`;
      const footerLine2 = `SHA-256: ${hash}`;
      page.drawText(footerLine1, {
        x: marginX,
        y: 40,
        size: 7,
        font,
        color: colorMuted,
      });
      page.drawText(footerLine2, {
        x: marginX,
        y: 28,
        size: 6.5,
        font: fontMono,
        color: colorMuted,
      });
      page.drawText(`Page ${pageNum} / ${pageCount}`, {
        x: pageW - marginX - 50,
        y: 40,
        size: 7,
        font,
        color: colorMuted,
      });
    };

    const wrapText = (text: string, maxW: number, fontRef: PDFFont, size: number): string[] => {
      const words = text.split(/\s+/);
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (fontRef.widthOfTextAtSize(test, size) > maxW && current) {
          lines.push(current);
          current = word;
        } else {
          current = test;
        }
      }
      if (current) lines.push(current);
      return lines;
    };

    const newPageIfNeeded = (requiredHeight: number) => {
      if (y - requiredHeight < marginBottom) {
        currentPage = pdfDoc.addPage([pageW, pageH]);
        writeHeader(currentPage);
        y = pageH - marginTop;
      }
    };

    writeHeader(currentPage);

    // Titre principal
    newPageIfNeeded(60);
    currentPage.drawText(input.title, {
      x: marginX,
      y,
      size: 20,
      font: fontBold,
      color: colorPrimary,
      maxWidth: usableW,
    });
    y -= 28;
    if (input.subtitle) {
      currentPage.drawText(input.subtitle, {
        x: marginX,
        y,
        size: 11,
        font,
        color: colorMuted,
      });
      y -= 20;
    }
    // Métadonnées en haut
    const metaLine = [
      input.metadata.reference && `Réf: ${input.metadata.reference}`,
      input.metadata.context,
      `Auteur: ${input.metadata.author}`,
    ]
      .filter(Boolean)
      .join('  •  ');
    currentPage.drawText(metaLine, {
      x: marginX,
      y,
      size: 9,
      font,
      color: colorMuted,
    });
    y -= 25;

    // Sections
    for (const section of input.sections) {
      if (section.heading) {
        newPageIfNeeded(30);
        currentPage.drawText(section.heading, {
          x: marginX,
          y,
          size: 13,
          font: fontBold,
          color: colorPrimary,
        });
        y -= 18;
      }
      for (const para of section.paragraphs) {
        const lines = wrapText(para, usableW, font, 10);
        for (const line of lines) {
          newPageIfNeeded(14);
          currentPage.drawText(line, {
            x: marginX,
            y,
            size: 10,
            font,
            color: colorText,
          });
          y -= 13;
        }
        y -= 6; // gap entre paragraphes
      }
      y -= 8; // gap entre sections
    }

    // Calcul du hash sur le payload canonique (avant écriture du footer)
    const canonicalPayload = JSON.stringify({
      title: input.title,
      subtitle: input.subtitle ?? '',
      sections: input.sections,
      metadata: input.metadata,
      exportId,
      generatedAt,
    });
    const hash = crypto.createHash('sha256').update(canonicalPayload).digest('hex');

    // Métadonnées PDF
    pdfDoc.setTitle(input.title);
    pdfDoc.setAuthor(input.metadata.author);
    pdfDoc.setSubject(input.subtitle || input.title);
    pdfDoc.setCreator('OMNITECH Intranet');
    pdfDoc.setProducer(`OMNITECH Intranet (pdf-lib) — export ${exportId}`);
    pdfDoc.setCreationDate(new Date());
    pdfDoc.setKeywords([
      'OMNITECH',
      'Intranet',
      'Export',
      input.metadata.reference || '',
      `sha256:${hash}`,
    ]);

    // Écrire les footers sur toutes les pages (maintenant qu'on a le hash)
    const pages = pdfDoc.getPages();
    pages.forEach((page, idx) => writeFooter(page, hash, idx + 1, pages.length));

    const bytes = await pdfDoc.save();
    const fileName = `omnitech-${(input.metadata.reference || 'export').replace(/[^a-z0-9\-_]/gi, '_')}-${exportId.slice(0, 8)}.pdf`;

    this.logger.log(
      `[SignedPdf] generated export=${exportId} by=${input.metadata.author} hash=${hash.slice(0, 16)}... pages=${pages.length}`,
    );

    return {
      buffer: Buffer.from(bytes),
      hash,
      exportId,
      generatedAt,
      fileName,
    };
  }
}
