import * as crypto from "crypto";
import { PassThrough } from "stream";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import archiverFactory = require("archiver");
import { generateGdprPdf, GdprPdfPayload } from "./gdpr-export-pdf";
import { rowsToCsv, CsvColumn } from "../common/utils/csv-export";

/**
 * Package l'export RGPD utilisateur en archive ZIP.
 *
 * Contenu:
 * - data.json     - payload structure complet (Art. 20, machine-readable)
 * - rapport.pdf   - synthese lisible humain (charte SEAL)
 * - audit-logs.csv - audit logs en CSV (potentiellement volumineux, separe)
 * - README.txt    - explique le contenu et la verification d'integrite
 *
 * Streaming: archiver est branche sur un PassThrough, on agrege en buffer.
 * Pour 1000 audit logs + 500 docs + 500 tickets + 500 notifs, le ZIP final
 * pese typiquement < 2 MB. La limite de 50 MB n'est pas atteinte en pratique.
 */

export interface GdprZipResult {
  buffer: Buffer;
  dataJsonHash: string;
  fileName: string;
  byteLength: number;
}

const AUDIT_LOG_CSV_COLUMNS: CsvColumn<{
  id: string;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  severity?: string | null;
  createdAt: Date | string;
  metadata?: unknown;
}>[] = [
  { header: "ID", accessor: (r) => r.id },
  { header: "Date", accessor: (r) => r.createdAt },
  { header: "Action", accessor: (r) => r.action },
  { header: "Type ressource", accessor: (r) => r.resourceType ?? "" },
  { header: "ID ressource", accessor: (r) => r.resourceId ?? "" },
  { header: "Severite", accessor: (r) => r.severity ?? "" },
  {
    header: "Metadonnees",
    accessor: (r) => {
      if (r.metadata == null) return "";
      try {
        return typeof r.metadata === "string"
          ? r.metadata
          : JSON.stringify(r.metadata);
      } catch {
        return "";
      }
    },
  },
];

export async function packageGdprExport(
  payload: GdprPdfPayload,
): Promise<GdprZipResult> {
  // 1. Serialise data.json (canonique avec indent 2 - meme format qu'avant)
  const dataJson = JSON.stringify(payload, null, 2);
  const dataJsonBuffer = Buffer.from(dataJson, "utf-8");
  const dataJsonHash = crypto
    .createHash("sha256")
    .update(dataJsonBuffer)
    .digest("hex");

  // 2. Genere le PDF (depend du hash data.json pour le footer)
  const pdfResult = await generateGdprPdf(payload, dataJsonHash);

  // 3. Genere le CSV des audit logs
  const csvText = rowsToCsv(
    payload.auditLogs,
    AUDIT_LOG_CSV_COLUMNS,
    "Export RGPD - Journaux d'audit",
  );
  const csvBuffer = Buffer.from(csvText, "utf-8");

  // 4. README.txt
  const readme = buildReadme(payload, dataJsonHash, pdfResult.generatedAt);
  const readmeBuffer = Buffer.from(readme, "utf-8");

  // 5. ZIP via archiver en streaming
  const zipBuffer = await buildZip([
    { name: "data.json", buffer: dataJsonBuffer },
    { name: "rapport.pdf", buffer: pdfResult.buffer },
    { name: "audit-logs.csv", buffer: csvBuffer },
    { name: "README.txt", buffer: readmeBuffer },
  ]);

  const date = new Date().toISOString().split("T")[0];
  const fileName = `export-rgpd-${date}.zip`;

  return {
    buffer: zipBuffer,
    dataJsonHash,
    fileName,
    byteLength: zipBuffer.length,
  };
}

function buildZip(
  entries: Array<{ name: string; buffer: Buffer }>,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // archiver streame les chunks dans un PassThrough; on collecte sans tout
    // garder en memoire en double (les buffers sources le sont deja, mais
    // archiver compresse au vol et libere ses tampons internes).
    const archive = archiverFactory("zip", {
      zlib: { level: 9 },
    });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    let total = 0;

    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
    });
    stream.on("end", () => resolve(Buffer.concat(chunks, total)));
    stream.on("error", (err) => reject(err));

    archive.on("warning", (err: NodeJS.ErrnoException) => {
      // ENOENT = fichier ignore, on tolere; le reste = erreur
      if (err && err.code !== "ENOENT") reject(err);
    });
    archive.on("error", (err: Error) => reject(err));

    archive.pipe(stream);

    for (const entry of entries) {
      archive.append(entry.buffer, { name: entry.name });
    }

    void archive.finalize();
  });
}

function buildReadme(
  payload: GdprPdfPayload,
  dataJsonHash: string,
  generatedAt: string,
): string {
  const fullName =
    [payload.user.firstName, payload.user.lastName].filter(Boolean).join(" ") ||
    payload.user.email;
  const lines = [
    "================================================================",
    "EXPORT RGPD - OMNITECH SECURITY",
    "================================================================",
    "",
    `Utilisateur     : ${fullName}`,
    `Email           : ${payload.user.email}`,
    `Date d'export   : ${generatedAt}`,
    "",
    "Cette archive contient l'integralite de vos donnees personnelles",
    "detenues par OMNITECH SECURITY, conformement a l'article 20 du",
    "Reglement General sur la Protection des Donnees (RGPD).",
    "",
    "----------------------------------------------------------------",
    "CONTENU DE L'ARCHIVE",
    "----------------------------------------------------------------",
    "",
    "  data.json",
    "    Payload structure complet au format JSON (machine-readable).",
    "    Version legale et faisant autorite. Inclut votre profil,",
    "    documents, tickets, notifications et journaux d'audit.",
    "",
    "  rapport.pdf",
    "    Synthese lisible des memes donnees (resume statistique,",
    "    top 10 evenements d'audit). Ouvrir avec n'importe quel",
    "    lecteur PDF (Adobe Reader, Preview, navigateur web, etc.).",
    "",
    "  audit-logs.csv",
    "    Liste complete de vos evenements d'audit (jusqu'a 1000 plus",
    "    recents). Format CSV separe par point-virgule, encodage UTF-8",
    "    avec BOM. Compatible Excel (FR), LibreOffice, Numbers, etc.",
    "",
    "  README.txt",
    "    Le present fichier.",
    "",
    "----------------------------------------------------------------",
    "VERIFICATION D'INTEGRITE",
    "----------------------------------------------------------------",
    "",
    "Le hash SHA-256 du fichier data.json est imprime dans le pied de",
    "page du rapport.pdf. Pour verifier l'integrite des donnees:",
    "",
    `  Hash attendu : ${dataJsonHash}`,
    "",
    "  Sous Linux/macOS :",
    "    shasum -a 256 data.json",
    "",
    "  Sous Windows (PowerShell) :",
    "    Get-FileHash data.json -Algorithm SHA256",
    "",
    "Le hash calcule doit correspondre exactement a celui ci-dessus",
    "et a celui imprime en pied de page du rapport.pdf.",
    "",
    "----------------------------------------------------------------",
    "STATISTIQUES",
    "----------------------------------------------------------------",
    "",
    `  Documents       : ${payload.documents.length}`,
    `  Tickets         : ${payload.tickets.length}`,
    `  Notifications   : ${payload.notifications.length}`,
    `  Journaux audit  : ${payload.auditLogs.length}`,
    "",
    "----------------------------------------------------------------",
    "VOS DROITS",
    "----------------------------------------------------------------",
    "",
    "Au-dela du droit a la portabilite (Art. 20), vous disposez des",
    "droits suivants :",
    "  - Droit d'acces (Art. 15)",
    "  - Droit de rectification (Art. 16)",
    "  - Droit a l'effacement (Art. 17)",
    "  - Droit a la limitation du traitement (Art. 18)",
    "  - Droit d'opposition (Art. 21)",
    "",
    "Pour toute question ou exercice de vos droits, contactez le DPO",
    "d'OMNITECH SECURITY.",
    "",
    "================================================================",
    "Export genere conformement a l'article 20 du RGPD",
    "================================================================",
    "",
  ];
  return lines.join("\r\n");
}
