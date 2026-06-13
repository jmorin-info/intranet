import { Injectable } from "@nestjs/common";
import {
  DocumentCategory,
  DocumentLevel,
  DocumentPriority,
  DocumentStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { rowsToCsv, CsvColumn } from "../common/utils/csv-export";
import { RegistreFilter, RegistreRow, RegistreStats } from "./types";

/**
 * Mapping DocumentCategory -> code PRO_040 §7.4.
 *
 * Duplique depuis packages/shared/src/enums.ts (DOCUMENT_CATEGORY_CODE) car
 * le backend ne depend pas de @omnitech/shared (cf. apps/backend/src/common/
 * enums.ts qui documente la regle : eviter la dependance circulaire). La
 * source de verite reste packages/shared/src/enums.ts — toute evolution
 * doit etre repercutee ici.
 */
const DOCUMENT_CATEGORY_CODE: Record<DocumentCategory, string> = {
  POLICY: "POL",
  PROCEDURE: "PRO",
  PLAN: "PLA",
  ORGANIZATION: "ORG",
  INSTRUCTION: "INS",
  STANDARD: "STD",
  GUIDE: "GUI",
  REGISTRY: "REG",
  FORM: "FOR",
  RECORD: "RAP",
  REPORT: "RAP",
  CHARTER: "CHA",
  COMMUNICATION: "COM",
  CONTRACT: "CTR",
  OTHER: "AUT",
};

/**
 * Mapping DocumentCategory -> DocumentLevel (PRO_040 §7.1 pyramide).
 * Duplique de packages/shared/src/enums.ts pour la meme raison.
 */
const DOCUMENT_CATEGORY_LEVEL: Record<DocumentCategory, DocumentLevel> = {
  POLICY: "GOVERNANCE",
  PLAN: "GOVERNANCE",
  ORGANIZATION: "GOVERNANCE",
  PROCEDURE: "OPERATIONAL",
  INSTRUCTION: "OPERATIONAL",
  STANDARD: "OPERATIONAL",
  GUIDE: "OPERATIONAL",
  REGISTRY: "EVIDENCE",
  FORM: "EVIDENCE",
  RECORD: "EVIDENCE",
  REPORT: "EVIDENCE",
  CHARTER: "COMMUNICATION",
  COMMUNICATION: "COMMUNICATION",
  CONTRACT: "EVIDENCE",
  OTHER: "EVIDENCE",
};

/**
 * Libelles canoniques POL_015 §5 (echelle 4 niveaux). Le frontend a son
 * propre helper (@/components/ui/classification-badge.tsx) — on duplique
 * la chaine pour les exports backend (CSV / API).
 */
const CLASSIFICATION_LABELS: Record<string, string> = {
  SECRET: "Niveau 1 — Tres sensible",
  CONFIDENTIEL: "Niveau 2 — Sensible",
  INTERNE: "Niveau 3 — Restreint",
  PUBLIC: "Niveau 4 — Public",
};

/**
 * Libelles fr DocumentLevel (miroir de DOCUMENT_LEVEL_LABELS shared).
 */
const DOCUMENT_LEVEL_LABELS: Record<DocumentLevel, string> = {
  GOVERNANCE: "Gouvernance",
  OPERATIONAL: "Operationnel / maitrise",
  EVIDENCE: "Preuve / enregistrement",
  COMMUNICATION: "Communication / engagement",
};

/** Libelles fr DocumentPriority (miroir DOCUMENT_PRIORITY_LABELS shared). */
const DOCUMENT_PRIORITY_LABELS: Record<DocumentPriority, string> = {
  CRITICAL: "Critique",
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
};

/**
 * Libelles fr DocumentStatus (miroir DOCUMENT_STATUS_LABELS shared).
 */
const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: "Brouillon",
  IN_REVIEW: "En revue",
  REVIEW_APPROVED: "Revue validee",
  PENDING_APPROVAL: "En attente d'approbation",
  APPROVED: "Approuve",
  OBSOLETE: "Obsolete",
  ARCHIVED: "Archive",
};

/**
 * Libelles fr DocumentCategory (miroir DOCUMENT_CATEGORY_LABELS shared).
 */
const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  POLICY: "Politique",
  PROCEDURE: "Procedure",
  PLAN: "Plan",
  ORGANIZATION: "Organisation",
  INSTRUCTION: "Instruction",
  STANDARD: "Standard",
  GUIDE: "Guide",
  REGISTRY: "Registre",
  FORM: "Formulaire",
  RECORD: "Enregistrement",
  REPORT: "Rapport",
  CHARTER: "Charte",
  COMMUNICATION: "Communication",
  CONTRACT: "Contrat",
  OTHER: "Autre",
};

/**
 * Convertit un mime-type / extension en label de format compact pour la
 * colonne P du registre (ex. "application/pdf" -> "PDF").
 */
function formatFromFileType(fileType: string | null | undefined): string {
  if (!fileType) return "";
  const ft = fileType.toLowerCase();
  if (ft.includes("pdf")) return "PDF";
  if (ft.includes("word") || ft.endsWith(".docx") || ft.endsWith(".doc"))
    return "DOCX";
  if (
    ft.includes("spreadsheet") ||
    ft.endsWith(".xlsx") ||
    ft.endsWith(".xls")
  )
    return "XLSX";
  if (
    ft.includes("presentation") ||
    ft.endsWith(".pptx") ||
    ft.endsWith(".ppt")
  )
    return "PPTX";
  if (ft.includes("markdown") || ft.endsWith(".md")) return "MD";
  if (ft.startsWith("image/")) return ft.split("/")[1]?.toUpperCase() || "IMG";
  if (ft.startsWith("text/")) return "TXT";
  // Fallback : derniere extension reconnaissable
  const ext = ft.split(/[./]/).pop();
  return ext ? ext.toUpperCase() : "";
}

/**
 * Service backend du Registre Documentaire (REG_016).
 *
 * Ce module est en LECTURE SEULE — les mutations passent par /documents/*.
 * Il agrege les Documents avec leurs relations (owner, approver, isoControls,
 * versions) pour produire la vue admin REG_016.
 */
@Injectable()
export class RegistreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Construit la clause Prisma `where` a partir des filtres query.
   * Les valeurs invalides (enum inconnu) sont ignorees silencieusement —
   * cote controller on fait la validation forte si necessaire.
   */
  private buildWhere(filter: RegistreFilter) {
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (filter.category && filter.category in DOCUMENT_CATEGORY_CODE) {
      where.category = filter.category;
    }

    if (filter.level && filter.level in DOCUMENT_LEVEL_LABELS) {
      // Filtre sur le niveau STOCKE. Les documents sans documentLevel sont
      // exclus quand on filtre — c'est volontaire : la derivation via
      // DOCUMENT_CATEGORY_LEVEL ne sert qu'a l'affichage, pas a la requete.
      where.documentLevel = filter.level;
    }

    if (filter.priority && filter.priority in DOCUMENT_PRIORITY_LABELS) {
      where.priority = filter.priority;
    }

    if (typeof filter.blocking === "boolean") {
      where.blocking = filter.blocking;
    }

    if (filter.classification) {
      where.classification = filter.classification;
    }

    return where;
  }

  /**
   * Retourne le libelle POL_015 §5 d'une valeur de classification.
   * Fallback : retourne la valeur brute si non reconnue (ex. ancien C3/C4).
   */
  private getClassificationLabel(value: string | null | undefined): string {
    if (!value) return CLASSIFICATION_LABELS.INTERNE!;
    return CLASSIFICATION_LABELS[value] || value;
  }

  /**
   * Construit une ligne RegistreRow a partir d'un Document Prisma enrichi
   * des relations necessaires.
   */
  private mapDocumentToRow(doc: any): RegistreRow {
    const category = doc.category as DocumentCategory;
    const documentLevel: DocumentLevel | null =
      (doc.documentLevel as DocumentLevel | null) ??
      DOCUMENT_CATEGORY_LEVEL[category] ??
      null;

    const isoControls: Array<{ code: string; title: string }> = Array.isArray(
      doc.isoControls,
    )
      ? doc.isoControls
          .map((link: any) => ({
            code: link.isoControl?.code ?? "",
            title: link.isoControl?.titleFr || link.isoControl?.title || "",
          }))
          .filter((c: { code: string }) => c.code)
      : [];

    // formats : on liste les types de fichier distincts presents dans les
    // versions. Si la derniere version a un fichier, on le considere comme
    // "disponible".
    const formats = Array.from(
      new Set(
        (doc.versions ?? [])
          .map((v: any) => formatFromFileType(v.fileType))
          .filter(Boolean),
      ),
    ) as string[];

    const currentVersion =
      doc.versions?.find((v: any) => v.id === doc.currentVersionId) ??
      doc.versions?.[0] ??
      null;

    const owner = doc.owner
      ? {
          id: doc.owner.id,
          name:
            [doc.owner.firstName, doc.owner.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            doc.owner.email ||
            doc.owner.id,
        }
      : null;

    // expectedApprover : on s'appuie sur la relation `approver` du document
    // (deja modelisee dans le schema). Si elle est nulle, on laisse null —
    // la pyramide PRO_040 §7.1 indique par defaut qui devrait approuver,
    // mais c'est de la responsabilite du frontend de l'afficher comme hint.
    const expectedApprover = doc.approver
      ? {
          id: doc.approver.id,
          name:
            [doc.approver.firstName, doc.approver.lastName]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            doc.approver.email ||
            doc.approver.id,
        }
      : null;

    return {
      id: doc.id,
      reference: doc.reference,
      parentReference: doc.parentReference ?? null,
      category,
      categoryCode: DOCUMENT_CATEGORY_CODE[category] ?? "AUT",
      documentLevel,
      title: doc.title,
      status: doc.status,
      classification: {
        value: doc.classification ?? "INTERNE",
        label: this.getClassificationLabel(doc.classification),
      },
      priority: doc.priority ?? null,
      blocking: Boolean(doc.blocking),
      owner,
      expectedApprover,
      isoControls,
      currentVersion: currentVersion
        ? { version: currentVersion.versionNumber }
        : null,
      reviewPeriodicity: doc.reviewPeriodicity ?? null,
      nextReviewDate: doc.nextReviewDate ?? null,
      hasFile: Boolean(currentVersion?.fileUrl),
      formats,
      externalStorageProvider: doc.externalStorageProvider ?? null,
      externalStoragePath: doc.externalStoragePath ?? null,
    };
  }

  /**
   * Charge la liste des documents pour la vue REG_016 avec toutes les
   * relations utiles. Renvoie une RegistreRow[] prete a etre serialisee.
   *
   * Pas de pagination explicite (le registre SMSI est lu en bloc — typiquement
   * quelques centaines d'entrees max). L'export CSV utilise la meme source.
   */
  async listForRegistre(filter: RegistreFilter): Promise<RegistreRow[]> {
    const where = this.buildWhere(filter);

    const docs = await this.prisma.document.findMany({
      where,
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        approver: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        isoControls: {
          include: {
            isoControl: {
              select: {
                code: true,
                title: true,
                titleFr: true,
              },
            },
          },
        },
        versions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            versionNumber: true,
            fileUrl: true,
            fileType: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ category: "asc" }, { reference: "asc" }],
    });

    return docs.map((d) => this.mapDocumentToRow(d));
  }

  /**
   * Export CSV RFC 4180 compatible Excel FR (BOM UTF-8, separateur `;`).
   * Reprend les memes colonnes que listForRegistre + libelles plus parlants
   * pour les filtres Excel.
   */
  async exportCsv(filter: RegistreFilter): Promise<string> {
    const rows = await this.listForRegistre(filter);

    const columns: CsvColumn<RegistreRow>[] = [
      { header: "Reference", accessor: (r) => r.reference },
      { header: "Reference parente", accessor: (r) => r.parentReference ?? "" },
      { header: "Code categorie", accessor: (r) => r.categoryCode },
      {
        header: "Categorie",
        accessor: (r) =>
          DOCUMENT_CATEGORY_LABELS[r.category as DocumentCategory] ||
          r.category,
      },
      {
        header: "Niveau pyramide",
        accessor: (r) =>
          r.documentLevel
            ? DOCUMENT_LEVEL_LABELS[r.documentLevel as DocumentLevel] ||
              r.documentLevel
            : "",
      },
      { header: "Titre", accessor: (r) => r.title },
      {
        header: "Statut",
        accessor: (r) =>
          DOCUMENT_STATUS_LABELS[r.status as DocumentStatus] || r.status,
      },
      { header: "Classification", accessor: (r) => r.classification.label },
      {
        header: "Priorite",
        accessor: (r) =>
          r.priority
            ? DOCUMENT_PRIORITY_LABELS[r.priority as DocumentPriority] ||
              r.priority
            : "",
      },
      { header: "Bloquant", accessor: (r) => r.blocking },
      { header: "Proprietaire", accessor: (r) => r.owner?.name ?? "" },
      {
        header: "Approbateur attendu",
        accessor: (r) => r.expectedApprover?.name ?? "",
      },
      {
        header: "Controles ISO 27001",
        accessor: (r) => r.isoControls.map((c) => c.code).join(", "),
      },
      {
        header: "Version courante",
        accessor: (r) => r.currentVersion?.version ?? "",
      },
      {
        header: "Periodicite de revue",
        accessor: (r) => r.reviewPeriodicity ?? "",
      },
      { header: "Prochaine revue", accessor: (r) => r.nextReviewDate },
      { header: "Fichier disponible", accessor: (r) => r.hasFile },
      { header: "Formats", accessor: (r) => r.formats.join(", ") },
      {
        header: "Stockage externe",
        accessor: (r) => r.externalStorageProvider ?? "",
      },
      {
        header: "Chemin externe",
        accessor: (r) => r.externalStoragePath ?? "",
      },
    ];

    return rowsToCsv(rows, columns, "Registre Documentaire SMSI (REG_016)");
  }

  /**
   * Compte les documents non supprimes par dimension (niveau, categorie,
   * priorite, classification, statut, bloquant). Sert au tableau de bord
   * admin.
   *
   * Implementation: on charge en une passe les projections necessaires
   * (rester sur un dataset ~quelques centaines de lignes). Pour un volume
   * plus important, basculer sur des `groupBy` Prisma.
   */
  async stats(): Promise<RegistreStats> {
    const docs = await this.prisma.document.findMany({
      where: { deletedAt: null },
      select: {
        category: true,
        documentLevel: true,
        priority: true,
        classification: true,
        status: true,
        blocking: true,
      },
    });

    const byLevel: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byPriority: Record<string, number> = {};
    const byClassification: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let blocking = 0;

    for (const d of docs) {
      const lvl =
        (d.documentLevel as DocumentLevel | null) ??
        DOCUMENT_CATEGORY_LEVEL[d.category as DocumentCategory] ??
        "UNKNOWN";
      byLevel[lvl] = (byLevel[lvl] ?? 0) + 1;

      byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;

      const prio = d.priority ?? "UNSPECIFIED";
      byPriority[prio] = (byPriority[prio] ?? 0) + 1;

      const cls = d.classification ?? "INTERNE";
      byClassification[cls] = (byClassification[cls] ?? 0) + 1;

      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;

      if (d.blocking) blocking++;
    }

    return {
      total: docs.length,
      byLevel,
      byCategory,
      byPriority,
      byClassification,
      byStatus,
      blocking,
    };
  }
}
