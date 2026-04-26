import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import * as crypto from "crypto";

/**
 * Generateur PDF pour l'export RGPD utilisateur (Art. 20).
 *
 * Synthese lisible humain accompagnant le data.json brut dans le ZIP.
 * Inspire de RssiSmsiPdfGenerator (charte SEAL navy/orange, footer SHA-256).
 *
 * IMPORTANT: pdf-lib StandardFonts utilise WinAnsi (Latin-1 only).
 * Eviter: emoji, fleches unicode (->), ellipses (...), caracteres mathematiques
 * non Latin-1 (Delta, ~=). Les accents francais simples (e, e, a, c, ...) passent.
 */

export interface GdprPdfPayload {
  exportDate: string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    role?: string | null;
    jobTitle?: string | null;
    createdAt?: Date | string | null;
    lastLoginAt?: Date | string | null;
    department?: { id: string; name: string; code?: string | null } | null;
  } & Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
  tickets: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  auditLogs: Array<{
    id: string;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    severity?: string | null;
    createdAt: Date | string;
    metadata?: unknown;
  }>;
}

export interface GdprPdfResult {
  buffer: Buffer;
  hash: string;
  generatedAt: string;
}

interface RenderCtx {
  pdfDoc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  fontMono: PDFFont;
  fontItalic: PDFFont;
  colorNavy: ReturnType<typeof rgb>;
  colorOrange: ReturnType<typeof rgb>;
  colorText: ReturnType<typeof rgb>;
  colorMuted: ReturnType<typeof rgb>;
  pageW: number;
  pageH: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  usableW: number;
  currentPage: PDFPage;
  y: number;
}

/**
 * Genere le PDF de synthese RGPD.
 * @param payload payload brut (le meme que data.json)
 * @param dataJsonHash SHA-256 hex du data.json (deja calcule par le packager)
 */
export async function generateGdprPdf(
  payload: GdprPdfPayload,
  dataJsonHash: string,
): Promise<GdprPdfResult> {
  const generatedAt = new Date();

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const ctx: RenderCtx = {
    pdfDoc,
    font,
    fontBold,
    fontMono,
    fontItalic,
    colorNavy: rgb(0, 68 / 255, 105 / 255), // SEAL navy #004469
    colorOrange: rgb(246 / 255, 141 / 255, 46 / 255),
    colorText: rgb(0.15, 0.15, 0.2),
    colorMuted: rgb(0.42, 0.45, 0.5), // ~ #6b7280
    pageW: 595.28,
    pageH: 841.89,
    marginX: 50,
    marginTop: 90,
    marginBottom: 75,
    currentPage: null as unknown as PDFPage,
    y: 0,
    usableW: 0,
  };
  ctx.usableW = ctx.pageW - ctx.marginX * 2;

  // ---- Page de garde ------------------------------------------------------
  renderCoverPage(ctx, payload, generatedAt);

  // ---- Identite utilisateur ----------------------------------------------
  startContentPage(ctx);
  h1(ctx, "1. Informations personnelles");
  paragraph(
    ctx,
    "Cette synthese restitue, sous forme lisible, les principales donnees a caractere personnel detenues par OMNITECH SECURITY a votre sujet. Le fichier data.json fourni en parallele contient l'integralite des donnees au format machine.",
  );

  const u = payload.user;
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "-";
  const lines: Array<[string, string]> = [
    ["Identifiant", sanitize(String(u.id))],
    ["Nom complet", sanitize(fullName)],
    ["Email", sanitize(u.email)],
    ["Role", sanitize(String(u.role ?? "-"))],
    ["Poste", sanitize(String(u.jobTitle ?? "-"))],
    ["Departement", sanitize(u.department?.name ?? "-")],
    ["Cree le", formatDate(u.createdAt)],
    ["Derniere connexion", formatDate(u.lastLoginAt)],
  ];
  keyValueBlock(ctx, lines);

  // ---- Resume statistique -------------------------------------------------
  h1(ctx, "2. Resume statistique");
  paragraph(
    ctx,
    "Volumes des donnees liees a votre compte (limites selon les regles de retention applicables).",
  );
  kpiGrid(ctx, [
    { label: "Documents possedes", value: String(payload.documents.length) },
    {
      label: "Tickets (createur ou assigne)",
      value: String(payload.tickets.length),
    },
    { label: "Notifications", value: String(payload.notifications.length) },
    { label: "Evenements d'audit", value: String(payload.auditLogs.length) },
  ]);

  // ---- Top 10 audit logs --------------------------------------------------
  startContentPage(ctx);
  h1(ctx, "3. Activite recente (top 10)");
  paragraph(
    ctx,
    "Les 10 evenements d'audit les plus recents associes a votre compte. La liste complete est disponible dans audit-logs.csv.",
  );

  const top = payload.auditLogs.slice(0, 10);
  if (top.length === 0) {
    paragraph(ctx, "Aucun evenement d'audit enregistre.");
  } else {
    auditLogTable(ctx, top);
  }

  // ---- Mention legale finale ---------------------------------------------
  ensureSpace(ctx, 80);
  ctx.y -= 10;
  ctx.currentPage.drawLine({
    start: { x: ctx.marginX, y: ctx.y },
    end: { x: ctx.pageW - ctx.marginX, y: ctx.y },
    thickness: 0.5,
    color: ctx.colorMuted,
  });
  ctx.y -= 18;
  paragraph(
    ctx,
    "Export genere conformement a l'article 20 du Reglement General sur la Protection des Donnees (RGPD). Pour toute question relative a vos donnees personnelles, contactez le DPO d'OMNITECH SECURITY.",
  );

  // ---- Footer + metadata -------------------------------------------------
  pdfDoc.setTitle("OMNITECH - Export RGPD utilisateur");
  pdfDoc.setAuthor("OMNITECH SECURITY");
  pdfDoc.setSubject("Export de donnees personnelles - Article 20 RGPD");
  pdfDoc.setCreator("OMNITECH Intranet");
  pdfDoc.setProducer("OMNITECH Intranet (pdf-lib)");
  pdfDoc.setCreationDate(generatedAt);
  pdfDoc.setKeywords([
    "OMNITECH",
    "RGPD",
    "GDPR",
    "Article20",
    `sha256:${dataJsonHash}`,
  ]);

  const pages = pdfDoc.getPages();
  pages.forEach((page, idx) => {
    drawHeader(ctx, page);
    drawFooter(
      ctx,
      page,
      dataJsonHash,
      idx + 1,
      pages.length,
      generatedAt,
      payload.user.email,
    );
  });

  const bytes = await pdfDoc.save();
  const pdfHash = crypto.createHash("sha256").update(bytes).digest("hex");

  return {
    buffer: Buffer.from(bytes),
    hash: pdfHash,
    generatedAt: generatedAt.toISOString(),
  };
}

// ============================================================================
// RENDER PRIMITIVES
// ============================================================================

function renderCoverPage(
  ctx: RenderCtx,
  payload: GdprPdfPayload,
  generatedAt: Date,
) {
  const page = ctx.pdfDoc.addPage([ctx.pageW, ctx.pageH]);
  ctx.currentPage = page;

  // Bloc navy en haut
  page.drawRectangle({
    x: 0,
    y: ctx.pageH - 280,
    width: ctx.pageW,
    height: 280,
    color: ctx.colorNavy,
  });
  // Bande orange
  page.drawRectangle({
    x: 0,
    y: ctx.pageH - 285,
    width: ctx.pageW,
    height: 5,
    color: ctx.colorOrange,
  });

  page.drawText("OMNITECH SECURITY", {
    x: ctx.marginX,
    y: ctx.pageH - 110,
    size: 24,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Export RGPD", {
    x: ctx.marginX,
    y: ctx.pageH - 165,
    size: 34,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Synthese lisible de vos donnees personnelles", {
    x: ctx.marginX,
    y: ctx.pageH - 200,
    size: 12,
    font: ctx.fontItalic,
    color: rgb(0.85, 0.9, 0.95),
  });
  page.drawText(
    "Article 20 du Reglement General sur la Protection des Donnees",
    {
      x: ctx.marginX,
      y: ctx.pageH - 222,
      size: 10,
      font: ctx.font,
      color: rgb(0.85, 0.9, 0.95),
    },
  );

  // Cartouche
  const boxY = 320;
  page.drawRectangle({
    x: ctx.marginX,
    y: boxY,
    width: ctx.usableW,
    height: 180,
    borderColor: ctx.colorNavy,
    borderWidth: 1.5,
    color: rgb(0.97, 0.97, 0.99),
  });

  const fullName =
    [payload.user.firstName, payload.user.lastName].filter(Boolean).join(" ") ||
    "-";
  const lines: Array<[string, string]> = [
    ["Utilisateur", sanitize(fullName)],
    ["Email", sanitize(payload.user.email)],
    ["Date d'export", formatDateLong(generatedAt)],
    [
      "Format",
      "Archive ZIP (data.json + rapport.pdf + audit-logs.csv + README.txt)",
    ],
  ];
  let cy = boxY + 145;
  for (const [k, v] of lines) {
    page.drawText(k, {
      x: ctx.marginX + 20,
      y: cy,
      size: 10,
      font: ctx.fontBold,
      color: ctx.colorMuted,
    });
    page.drawText(v, {
      x: ctx.marginX + 130,
      y: cy,
      size: 11,
      font: ctx.font,
      color: ctx.colorText,
    });
    cy -= 30;
  }

  // Mention finale page de garde
  page.drawText(
    "Document confidentiel - destine exclusivement a son destinataire",
    {
      x: ctx.marginX,
      y: 240,
      size: 9,
      font: ctx.fontItalic,
      color: ctx.colorMuted,
    },
  );
}

function startContentPage(ctx: RenderCtx) {
  ctx.currentPage = ctx.pdfDoc.addPage([ctx.pageW, ctx.pageH]);
  ctx.y = ctx.pageH - ctx.marginTop;
}

function drawHeader(ctx: RenderCtx, page: PDFPage) {
  // Skip header on cover page (page 0 = first page added)
  if (page === ctx.pdfDoc.getPages()[0]) return;
  page.drawRectangle({
    x: 0,
    y: ctx.pageH - 50,
    width: ctx.pageW,
    height: 50,
    color: ctx.colorNavy,
  });
  page.drawRectangle({
    x: 0,
    y: ctx.pageH - 52,
    width: ctx.pageW,
    height: 2,
    color: ctx.colorOrange,
  });
  page.drawText("OMNITECH SECURITY - Export RGPD", {
    x: ctx.marginX,
    y: ctx.pageH - 32,
    size: 11,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("PERSONNEL", {
    x: ctx.pageW - ctx.marginX - 60,
    y: ctx.pageH - 32,
    size: 9,
    font: ctx.fontBold,
    color: rgb(1, 0.9, 0.5),
  });
}

function drawFooter(
  ctx: RenderCtx,
  page: PDFPage,
  hash: string,
  pageNum: number,
  pageCount: number,
  generatedAt: Date,
  userEmail: string,
) {
  page.drawLine({
    start: { x: ctx.marginX, y: 55 },
    end: { x: ctx.pageW - ctx.marginX, y: 55 },
    thickness: 0.5,
    color: ctx.colorMuted,
  });
  page.drawText(
    `Genere le ${generatedAt.toISOString()} pour ${sanitize(userEmail)}`,
    { x: ctx.marginX, y: 40, size: 7, font: ctx.font, color: ctx.colorMuted },
  );
  page.drawText("Export conforme a l'article 20 du RGPD", {
    x: ctx.marginX,
    y: 28,
    size: 7,
    font: ctx.fontItalic,
    color: ctx.colorMuted,
  });
  page.drawText(`SHA-256 data.json: ${hash}`, {
    x: ctx.marginX,
    y: 16,
    size: 6,
    font: ctx.fontMono,
    color: ctx.colorMuted,
  });
  page.drawText(`Page ${pageNum} / ${pageCount}`, {
    x: ctx.pageW - ctx.marginX - 60,
    y: 40,
    size: 7,
    font: ctx.font,
    color: ctx.colorMuted,
  });
}

function h1(ctx: RenderCtx, text: string) {
  ensureSpace(ctx, 40);
  ctx.currentPage.drawText(sanitize(text), {
    x: ctx.marginX,
    y: ctx.y,
    size: 17,
    font: ctx.fontBold,
    color: ctx.colorNavy,
  });
  ctx.y -= 8;
  ctx.currentPage.drawLine({
    start: { x: ctx.marginX, y: ctx.y },
    end: { x: ctx.marginX + 60, y: ctx.y },
    thickness: 2,
    color: ctx.colorOrange,
  });
  ctx.y -= 20;
}

function paragraph(ctx: RenderCtx, text: string) {
  const lines = wrapText(sanitize(text), ctx.usableW, ctx.font, 10);
  for (const line of lines) {
    ensureSpace(ctx, 14);
    ctx.currentPage.drawText(line, {
      x: ctx.marginX,
      y: ctx.y,
      size: 10,
      font: ctx.font,
      color: ctx.colorText,
    });
    ctx.y -= 13;
  }
  ctx.y -= 6;
}

function keyValueBlock(ctx: RenderCtx, items: Array<[string, string]>) {
  ensureSpace(ctx, items.length * 18 + 20);
  for (const [k, v] of items) {
    ensureSpace(ctx, 18);
    ctx.currentPage.drawText(sanitize(k), {
      x: ctx.marginX,
      y: ctx.y,
      size: 10,
      font: ctx.fontBold,
      color: ctx.colorMuted,
    });
    // Truncate value if too long for the available width
    const valueX = ctx.marginX + 130;
    const maxValueW = ctx.pageW - ctx.marginX - valueX;
    const safeV = truncateToWidth(sanitize(v), ctx.font, 10, maxValueW);
    ctx.currentPage.drawText(safeV, {
      x: valueX,
      y: ctx.y,
      size: 10,
      font: ctx.font,
      color: ctx.colorText,
    });
    ctx.y -= 16;
  }
  ctx.y -= 6;
}

function kpiGrid(
  ctx: RenderCtx,
  items: Array<{ label: string; value: string }>,
) {
  for (const it of items) {
    ensureSpace(ctx, 50);
    const boxY = ctx.y - 40;
    ctx.currentPage.drawRectangle({
      x: ctx.marginX,
      y: boxY,
      width: ctx.usableW,
      height: 40,
      color: rgb(0.97, 0.97, 0.99),
      borderColor: ctx.colorNavy,
      borderWidth: 0.5,
    });
    ctx.currentPage.drawRectangle({
      x: ctx.marginX,
      y: boxY,
      width: 4,
      height: 40,
      color: ctx.colorOrange,
    });
    ctx.currentPage.drawText(sanitize(it.label), {
      x: ctx.marginX + 15,
      y: boxY + 25,
      size: 10,
      font: ctx.fontBold,
      color: ctx.colorMuted,
    });
    ctx.currentPage.drawText(sanitize(it.value), {
      x: ctx.marginX + 15,
      y: boxY + 8,
      size: 16,
      font: ctx.fontBold,
      color: ctx.colorNavy,
    });
    ctx.y = boxY - 10;
  }
}

function auditLogTable(ctx: RenderCtx, rows: GdprPdfPayload["auditLogs"]) {
  // Colonnes: Date | Action | Resource | Severity
  const dateW = 110;
  const actionW = 150;
  const resourceW = 140;
  const severityW = ctx.usableW - dateW - actionW - resourceW;

  ensureSpace(ctx, 30);
  // Header
  ctx.currentPage.drawRectangle({
    x: ctx.marginX,
    y: ctx.y - 16,
    width: ctx.usableW,
    height: 18,
    color: ctx.colorNavy,
  });
  const hy = ctx.y - 12;
  ctx.currentPage.drawText("Date", {
    x: ctx.marginX + 6,
    y: hy,
    size: 9,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  ctx.currentPage.drawText("Action", {
    x: ctx.marginX + dateW + 6,
    y: hy,
    size: 9,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  ctx.currentPage.drawText("Ressource", {
    x: ctx.marginX + dateW + actionW + 6,
    y: hy,
    size: 9,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  ctx.currentPage.drawText("Severite", {
    x: ctx.marginX + dateW + actionW + resourceW + 6,
    y: hy,
    size: 9,
    font: ctx.fontBold,
    color: rgb(1, 1, 1),
  });
  ctx.y -= 18;

  for (let i = 0; i < rows.length; i++) {
    ensureSpace(ctx, 20);
    const row = rows[i]!;
    const rowH = 16;
    if (i % 2 === 1) {
      ctx.currentPage.drawRectangle({
        x: ctx.marginX,
        y: ctx.y - rowH,
        width: ctx.usableW,
        height: rowH,
        color: rgb(0.96, 0.97, 0.99),
      });
    }
    const ry = ctx.y - 11;
    const dateStr = formatDate(row.createdAt);
    const action = sanitize(row.action || "-");
    const resource = sanitize(
      row.resourceType
        ? `${row.resourceType}${row.resourceId ? " #" + String(row.resourceId).slice(0, 8) : ""}`
        : "-",
    );
    const severity = sanitize(row.severity || "-");

    ctx.currentPage.drawText(truncateToWidth(dateStr, ctx.font, 9, dateW - 8), {
      x: ctx.marginX + 6,
      y: ry,
      size: 9,
      font: ctx.font,
      color: ctx.colorText,
    });
    ctx.currentPage.drawText(
      truncateToWidth(action, ctx.font, 9, actionW - 8),
      {
        x: ctx.marginX + dateW + 6,
        y: ry,
        size: 9,
        font: ctx.font,
        color: ctx.colorText,
      },
    );
    ctx.currentPage.drawText(
      truncateToWidth(resource, ctx.font, 9, resourceW - 8),
      {
        x: ctx.marginX + dateW + actionW + 6,
        y: ry,
        size: 9,
        font: ctx.font,
        color: ctx.colorText,
      },
    );
    ctx.currentPage.drawText(
      truncateToWidth(severity, ctx.font, 9, severityW - 8),
      {
        x: ctx.marginX + dateW + actionW + resourceW + 6,
        y: ry,
        size: 9,
        font: ctx.font,
        color: ctx.colorText,
      },
    );
    ctx.y -= rowH;
  }
  ctx.y -= 8;
}

function ensureSpace(ctx: RenderCtx, requiredHeight: number) {
  if (ctx.y - requiredHeight < ctx.marginBottom) {
    startContentPage(ctx);
  }
}

function wrapText(
  text: string,
  maxW: number,
  fontRef: PDFFont,
  size: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (fontRef.widthOfTextAtSize(test, size) > maxW && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateToWidth(
  text: string,
  fontRef: PDFFont,
  size: number,
  maxW: number,
): string {
  if (fontRef.widthOfTextAtSize(text, size) <= maxW) return text;
  let out = text;
  while (out.length > 0 && fontRef.widthOfTextAtSize(out + "..", size) > maxW) {
    out = out.slice(0, -1);
  }
  return out + "..";
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "-";
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "-";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "-";
  }
}

function formatDateLong(d: Date): string {
  try {
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString();
  }
}

/**
 * Remplace les caracteres non Latin-1 par un equivalent ASCII safe.
 * pdf-lib StandardFonts utilise WinAnsi qui plante sur emoji, fleches unicode,
 * symboles math (Delta, ~=, ...), etc.
 */
function sanitize(input: unknown): string {
  if (input === null || input === undefined) return "";
  let s = String(input);
  // Replacements specifically called out as known bad chars
  s = s
    .replace(/→/g, "->") // right arrow
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/…/g, "...") // horizontal ellipsis
    .replace(/≈/g, "~") // ~=
    .replace(/Δ/g, "Var.") // Delta
    .replace(/±/g, "+/-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, "-") // en dash
    .replace(/—/g, "-") // em dash
    .replace(/•/g, "*"); // bullet
  // Strip any remaining non-Latin1 (codepoints > 0xFF)
  s = s.replace(/[^\x00-\xFF]/g, "?");
  return s;
}
