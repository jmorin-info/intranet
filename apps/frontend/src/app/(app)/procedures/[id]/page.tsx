"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import {
  DOCUMENT_CATEGORY_LABELS,
  formatFileSize,
  UserRole,
} from "@omnitech/shared";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  StatusBadge,
  IsoControlBadge,
  Badge,
  Skeleton,
  Tabs,
  EmptyState,
} from "@omnitech/ui";
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
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildDocumentFilename } from "@/lib/download";
import {
  ArrowLeft,
  Download,
  FileText,
  CheckCircle2,
  Hash,
  FolderOpen,
  ShieldCheck,
  Clock,
  FileDown,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import Link from "next/link";

interface RelatedProcedure {
  id: string;
  title: string;
  reference: string;
  status: string;
}

interface ProcedureDetail {
  id: string;
  title: string;
  reference: string;
  description: string | null;
  category: string;
  status: string;
  owner: { firstName: string; lastName: string };
  updatedAt: string;
  isoControls: Array<{
    isoControl: { code: string; title: string; titleFr?: string };
  }>;
  versions: Array<{
    id: string;
    versionNumber: string;
    fileUrl: string;
    fileType: string;
    fileSizeBytes: number;
    checksum: string;
    createdAt: string;
  }>;
  acknowledgments: Array<{ userId: string }>;
}

export default function ProcedureViewerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const [doc, setDoc] = useState<ProcedureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasAcked, setHasAcked] = useState(false);
  const [acking, setAcking] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [relatedProcedures, setRelatedProcedures] = useState<
    RelatedProcedure[]
  >([]);
  const [activeTab, setActiveTab] = useState("document");
  const [allVersions, setAllVersions] = useState<ProcedureDetail["versions"]>(
    [],
  );
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    async function fetch() {
      try {
        const { data } = await api.get(`/documents/${id}`);
        setDoc(data);
        if (user) {
          setHasAcked(
            data.acknowledgments?.some(
              (a: { userId: string }) => a.userId === user.id,
            ) || false,
          );
        }
        // Fetch related procedures in the same category
        if (data.category) {
          api
            .get("/documents", {
              params: {
                category: data.category,
                limit: 5,
                sortBy: "updatedAt",
                sortOrder: "desc",
              },
            })
            .then(({ data: relData }) => {
              const items = (relData?.data || []).filter(
                (d: RelatedProcedure) => d.id !== id,
              );
              setRelatedProcedures(items.slice(0, 4));
            })
            .catch(() => {});
        }
      } catch {
        setDoc(null);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router, user]);

  useEffect(() => {
    if (activeTab === "versions" && doc && allVersions.length === 0) {
      setLoadingVersions(true);
      api
        .get(`/documents/${doc.id}/versions`)
        .then(({ data }) =>
          setAllVersions(Array.isArray(data) ? data : doc.versions || []),
        )
        .catch(() => setAllVersions(doc.versions || []))
        .finally(() => setLoadingVersions(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, doc?.id]);

  const handleAcknowledge = async () => {
    if (!doc) return;
    setAcking(true);
    try {
      await api.post(`/documents/${doc.id}/acknowledge`);
      toast.success(t("procedureDetail.ackSuccess"));
      setHasAcked(true);
    } catch {
      toast.error(t("procedureDetail.ackError"));
    } finally {
      setAcking(false);
    }
  };

  const currentVersion = doc?.versions?.[0] ?? null;
  const isPdf = currentVersion?.fileType?.includes("pdf");
  const isDocx =
    currentVersion?.fileType?.includes("word") ||
    currentVersion?.fileType?.includes("docx");

  const handleDownload = async (
    url: string,
    filename: string,
    inline = false,
  ) => {
    try {
      const token = localStorage.getItem("accessToken");
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(
        /\/api\/?$/,
        "/api/v1",
      );
      const response = await fetch(`${apiBase}${url}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      if (inline) {
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      toast.error(t("procedureDetail.downloadError"));
    }
  };

  const downloadPath =
    doc && currentVersion
      ? `/documents/${doc.id}/versions/${currentVersion.id}/download`
      : null;

  useEffect(() => {
    if (!downloadPath) return;
    const token = localStorage.getItem("accessToken");
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(
      /\/api\/?$/,
      "/api/v1",
    );
    fetch(`${apiBase}${downloadPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.blob();
      })
      .then((blob) => {
        setFileUrl(URL.createObjectURL(blob));
      })
      .catch((err) => logger.error(err, { page: "procedures/[id]", context: "download" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloadPath]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse bg-gray-200 dark:bg-slate-700 rounded" />
        <div className="h-[400px] w-full animate-pulse bg-gray-200 dark:bg-slate-700 rounded-card" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <Link
          href="/procedures"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux procédures
        </Link>
        <EmptyState
          type="documents"
          title="Procédure introuvable"
          description="Cette procédure n'existe plus, a été archivée ou son document source est manquant. Revenez à la liste pour trouver ce que vous cherchez."
          action={
            <Link
              href="/procedures"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition"
            >
              Voir toutes les procédures
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back to procedures link */}
      <Link
        href="/procedures"
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline transition-colors mb-2"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("procedures.detail.back")}
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div>
            <h1 className="text-2xl font-medium text-seal-navy">{doc.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-sm text-seal-gray-500 font-semibold">
                {doc.reference}
              </span>
              <Badge variant="navy">
                {
                  DOCUMENT_CATEGORY_LABELS[
                    doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                  ]
                }
              </Badge>
              <StatusBadge status={doc.status as "APPROVED"} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!hasAcked && user?.role === UserRole.COLLABORATEUR && (
            <Button onClick={handleAcknowledge} loading={acking}>
              <CheckCircle2 className="h-4 w-4" />
              {t("procedureDetail.readAndApproved")}
            </Button>
          )}
          {hasAcked && (
            <Badge variant="approved">
              <CheckCircle2 className="h-3 w-3" />
              {t("procedureDetail.acknowledged")}
            </Badge>
          )}
          {downloadPath && isPdf && (
            <Button
              variant="primary"
              onClick={() =>
                handleDownload(
                  downloadPath,
                  buildDocumentFilename(
                    doc.reference,
                    currentVersion?.versionNumber,
                    currentVersion?.fileType,
                    currentVersion?.fileUrl,
                  ),
                )
              }
            >
              <FileDown className="h-4 w-4" />
              Télécharger PDF
            </Button>
          )}
          {downloadPath && !isPdf && (
            <Button
              variant="secondary"
              onClick={() =>
                handleDownload(
                  downloadPath,
                  buildDocumentFilename(
                    doc.reference,
                    currentVersion?.versionNumber,
                    currentVersion?.fileType,
                    currentVersion?.fileUrl,
                  ),
                )
              }
            >
              <Download className="h-4 w-4" />
              {t("common.download")}
            </Button>
          )}
          {downloadPath && (
            <Button
              variant="outline"
              onClick={() =>
                handleDownload(
                  downloadPath,
                  buildDocumentFilename(
                    doc.reference,
                    currentVersion?.versionNumber,
                    currentVersion?.fileType,
                    currentVersion?.fileUrl,
                  ),
                  true,
                )
              }
            >
              <Download className="h-4 w-4" />
              Ouvrir
            </Button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div>
              <span className="text-seal-gray-500">
                {t("procedureDetail.author")} :{" "}
              </span>
              <span className="font-semibold text-seal-navy">
                {doc.owner.firstName} {doc.owner.lastName}
              </span>
            </div>
            {currentVersion && (
              <>
                <div>
                  <span className="text-seal-gray-500">
                    {t("procedureDetail.version")} :{" "}
                  </span>
                  <span className="font-semibold text-seal-navy">
                    v{currentVersion.versionNumber}
                  </span>
                </div>
                <div>
                  <span className="text-seal-gray-500">
                    {t("procedureDetail.size")} :{" "}
                  </span>
                  <span className="text-seal-navy">
                    {formatFileSize(currentVersion.fileSizeBytes)}
                  </span>
                </div>
              </>
            )}
            <div>
              <span className="text-seal-gray-500">
                {t("procedureDetail.updatedAt")} :{" "}
              </span>
              <span className="text-seal-navy">
                {formatDate(doc.updatedAt)}
              </span>
            </div>
          </div>
          {doc.isoControls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
              {doc.isoControls.map(({ isoControl }) => (
                <IsoControlBadge
                  key={isoControl.code}
                  code={isoControl.code}
                  title={isoControl.titleFr || isoControl.title}
                />
              ))}
            </div>
          )}
          {currentVersion && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="font-mono text-[10px] text-seal-gray-500">
                <Hash className="inline h-3 w-3 mr-0.5" />
                SHA-256 : {currentVersion.checksum}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Document / Versions */}
      <Tabs
        tabs={[
          { id: "document", label: t("procedureDetail.preview") },
          {
            id: "versions",
            label: "Historique des versions",
            count: doc.versions?.length || 0,
          },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Inline viewer */}
      {activeTab === "document" && fileUrl && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-seal-navy">
              {t("procedureDetail.preview")}
            </h2>
          </CardHeader>
          <CardContent>
            {isPdf && <PdfViewer url={fileUrl} />}
            {isDocx && <DocxViewer url={fileUrl} />}
            {!isPdf && !isDocx && (
              <div className="flex flex-col items-center py-12 text-seal-gray-500">
                <FileText className="h-12 w-12 mb-3" />
                <p className="text-sm">
                  {t("procedureDetail.previewUnavailable")}
                </p>
                <Button
                  variant="primary"
                  className="mt-4"
                  onClick={() =>
                    downloadPath &&
                    handleDownload(
                      downloadPath,
                      buildDocumentFilename(
                        doc.reference,
                        currentVersion?.versionNumber,
                        currentVersion?.fileType,
                        currentVersion?.fileUrl,
                      ),
                    )
                  }
                >
                  <Download className="h-4 w-4" />
                  {t("procedureDetail.downloadFile")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Versions history tab */}
      {activeTab === "versions" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-medium text-seal-navy dark:text-white">
                Historique des versions
              </h2>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loadingVersions ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800"
                  />
                ))}
              </div>
            ) : (allVersions.length > 0 ? allVersions : doc.versions || [])
                .length === 0 ? (
              <div className="p-6 text-center text-sm text-seal-gray-500">
                Aucun historique de version disponible
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {(allVersions.length > 0
                  ? allVersions
                  : doc.versions || []
                ).map((ver, idx) => (
                  <div
                    key={ver.id}
                    className={`flex items-center gap-4 px-6 py-4 ${idx === 0 ? "bg-primary/5" : ""}`}
                  >
                    <div
                      className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${idx === 0 ? "bg-primary/10" : "bg-gray-50 dark:bg-slate-800"}`}
                    >
                      <FileText
                        className={`h-5 w-5 ${idx === 0 ? "text-primary" : "text-seal-gray-500 dark:text-slate-400"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-seal-navy dark:text-white">
                          v{ver.versionNumber}
                        </span>
                        {idx === 0 && (
                          <Badge variant="approved">Actuelle</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-seal-gray-500 dark:text-slate-400">
                        <span>{formatDateTime(ver.createdAt)}</span>
                        <span>{formatFileSize(ver.fileSizeBytes)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        handleDownload(
                          `/documents/${doc.id}/versions/${ver.id}/download`,
                          `${doc.reference}-v${ver.versionNumber}`,
                        )
                      }
                    >
                      <Download className="h-3 w-3" /> Télécharger
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ISO Controls linked to this procedure */}
      {doc.isoControls.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#004469] dark:text-blue-400" />
              <h2 className="text-lg font-medium text-seal-navy dark:text-white">
                Contrôles ISO associés
              </h2>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {doc.isoControls.map(({ isoControl }) => (
                <div
                  key={isoControl.code}
                  className="flex items-center gap-4 px-6 py-3.5"
                >
                  <div className="h-8 w-8 rounded-lg bg-[#004469]/10 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <ShieldCheck className="h-4 w-4 text-[#004469] dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      {isoControl.code}
                    </p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                      {isoControl.titleFr || isoControl.title}
                    </p>
                  </div>
                  <IsoControlBadge
                    code={isoControl.code}
                    title={isoControl.titleFr || isoControl.title}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related procedures (same category) */}
      {relatedProcedures.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-medium text-seal-navy dark:text-white">
                  Procédures connexes
                </h2>
              </div>
              <Link
                href={`/procedures?category=${doc.category}`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Voir tout <ArrowLeft className="h-3 w-3 rotate-180" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {relatedProcedures.map((rel) => (
                <Link
                  key={rel.id}
                  href={`/procedures/${rel.id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50/80 dark:hover:bg-slate-800/50 transition-colors group"
                >
                  <div className="h-8 w-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                    <FileText className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white truncate group-hover:text-primary transition-colors">
                      {rel.title}
                    </p>
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
                      {rel.reference}
                    </p>
                  </div>
                  <StatusBadge status={rel.status as "APPROVED"} />
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
