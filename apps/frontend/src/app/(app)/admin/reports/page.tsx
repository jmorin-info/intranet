"use client";

import React, { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Card, CardContent, Button, Skeleton } from "@omnitech/ui";
import {
  Download,
  FileSpreadsheet,
  Users,
  BarChart3,
  ClipboardList,
  Clock,
  ShieldCheck,
  GraduationCap,
  FileText,
  TrendingUp,
  Loader2,
  FileJson,
  Table2,
} from "lucide-react";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";

interface ReportConfig {
  id: string;
  i18nKey: string;
  icon: React.ElementType;
  endpoint: string;
  filename: string;
  format?: string;
}

const reportConfigs: ReportConfig[] = [
  {
    id: "doc-registry",
    i18nKey: "docRegistry",
    icon: FileSpreadsheet,
    endpoint: "/reports/document-registry",
    filename: "registre-documentaire-iso.xlsx",
    format: "XLSX",
  },
  {
    id: "ack-report",
    i18nKey: "ackReport",
    icon: Users,
    endpoint: "/reports/acknowledgment-stats",
    filename: "rapport-accuses-reception.xlsx", // filename kept ASCII-safe intentionally
    format: "XLSX",
  },
  {
    id: "compliance-dashboard",
    i18nKey: "complianceDashboard",
    icon: BarChart3,
    endpoint: "/reports/dashboard-stats",
    filename: "tableau-bord-conformité.json",
    format: "JSON",
  },
  {
    id: "audit-export",
    i18nKey: "auditExport",
    icon: ClipboardList,
    endpoint: "/reports/audit-trail",
    filename: "journal-audit.xlsx",
    format: "XLSX",
  },
  {
    id: "monthly-smsi",
    i18nKey: "monthlySMSI",
    icon: BarChart3,
    endpoint: "/reports/monthly-smsi",
    filename: "rapport-smsi-mensuel.xlsx",
    format: "XLSX",
  },
  {
    id: "external-access",
    i18nKey: "externalAccess",
    icon: ShieldCheck,
    endpoint: "/reports/external-access",
    filename: "registre-acces-prestataires.xlsx", // filename kept ASCII-safe intentionally
    format: "XLSX",
  },
  {
    id: "quiz-stats",
    i18nKey: "quizStats",
    icon: GraduationCap,
    endpoint: "/reports/quiz-stats",
    filename: "bilan-quiz-sécurité.xlsx",
    format: "XLSX",
  },
  {
    id: "documents-csv",
    i18nKey: "documentsCsv",
    icon: FileText,
    endpoint: "/documents/export/csv",
    filename: "documents-export.csv",
    format: "CSV",
  },
  {
    id: "tickets-csv",
    i18nKey: "ticketsCsv",
    icon: FileText,
    endpoint: "/tickets/export/csv",
    filename: "tickets-export.csv",
    format: "CSV",
  },
  {
    id: "audit-csv",
    i18nKey: "auditCsv",
    icon: ClipboardList,
    endpoint: "/audit/export/csv",
    filename: "audit-trail-export.csv",
    format: "CSV",
  },
  {
    id: "smsi-indicators",
    i18nKey: "smsiIndicators",
    icon: TrendingUp,
    endpoint: "/reports/smsi-indicators",
    filename: "indicateurs-smsi.json",
    format: "JSON",
  },
];

export default function AdminReportsPage() {
  const t = useTranslations("admin.reportsPage");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [lastGenerated, setLastGenerated] = useState<Record<string, string>>(
    {},
  );
  interface QuickStats {
    totalDocuments?: number;
    totalUsers?: number | null;
    activeUsers?: number;
    totalTickets?: number | null;
    complianceRate?: number;
    mfaAdoption?: number;
  }
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get("/reports/dashboard-stats").catch(() => ({ data: {} })),
      api.get("/tickets/stats").catch(() => ({ data: {} })),
      api.get("/users").catch(() => ({ data: { total: null } })),
    ])
      .then(([dashR, tickR, usersR]) => {
        const dash = dashR.data || {};
        const tick = tickR.data || {};
        const usersData = usersR.data;
        const totalUsers =
          usersData?.meta?.total ??
          usersData?.total ??
          (Array.isArray(usersData?.data) ? usersData.data.length : null) ??
          (Array.isArray(usersData) ? usersData.length : null);
        const totalTickets =
          (tick.open ?? 0) +
          (tick.inProgress ?? 0) +
          (tick.resolved ?? 0) +
          (tick.closed ?? 0);
        setQuickStats({
          ...dash,
          totalUsers,
          totalTickets: totalTickets || dash.totalTickets,
        });
      })
      .catch((err) =>
        logger.error(err, { page: "admin/reports", context: "load stats" }),
      )
      .finally(() => setStatsLoading(false));
  }, []);

  const handleDownload = async (report: ReportConfig) => {
    setDownloading(report.id);
    try {
      const params: Record<string, string> = {};
      if (report.id === "monthly-smsi") params.month = reportMonth;
      const { data } = await api.get(report.endpoint, {
        params,
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = report.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setLastGenerated((prev) => ({
        ...prev,
        [report.id]: new Date().toLocaleString("fr-FR"),
      }));
      toast.success(
        `${t("downloaded")} — ${t(`reports.${report.i18nKey}.title`)}`,
      );
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { message?: string }; status?: number };
      };
      if (err.response?.status === 504) {
        toast.error(t("tooLarge"));
      } else {
        toast.error(err.response?.data?.message || t("generateError"));
      }
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="audit" />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        icon={BarChart3}
        hub="admin"
      />

      {/* Dashboard quick stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-card" />
          ))}
        </div>
      ) : (
        quickStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                key: "totalDocuments",
                label: t("stats.totalDocuments"),
                value: quickStats.totalDocuments ?? "-",
                icon: FileText,
                color: "text-primary",
                bg: "bg-primary/10",
                numValue: quickStats.totalDocuments,
              },
              {
                key: "users",
                label: t("stats.users"),
                value: quickStats.totalUsers ?? quickStats.activeUsers ?? "-",
                icon: Users,
                color: "text-blue-600",
                bg: "bg-blue-50 dark:bg-blue-900/30",
                numValue: quickStats.totalUsers ?? quickStats.activeUsers,
              },
              {
                key: "tickets",
                label: t("stats.tickets"),
                value: quickStats.totalTickets ?? "-",
                icon: ClipboardList,
                color: "text-amber-600",
                bg: "bg-amber-50 dark:bg-amber-900/30",
                numValue: quickStats.totalTickets,
              },
              {
                key: "complianceRate",
                label: t("stats.complianceRate"),
                value: quickStats.complianceRate
                  ? `${quickStats.complianceRate}%`
                  : "-",
                icon: TrendingUp,
                color: "text-emerald-600",
                bg: "bg-emerald-50 dark:bg-emerald-900/30",
                numValue: quickStats.complianceRate,
              },
            ].map((stat, idx) => (
              <Card
                key={stat.key}
                className="stagger-item"
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <CardContent className="py-4">
                  <div
                    className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}
                  >
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                  <p className="text-2xl font-medium text-seal-navy dark:text-white">
                    {stat.value}
                  </p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                    {stat.label}
                  </p>
                  {stat.key === "complianceRate" &&
                    typeof stat.numValue === "number" && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            stat.numValue >= 80
                              ? "bg-emerald-500"
                              : stat.numValue >= 50
                                ? "bg-amber-500"
                                : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(stat.numValue, 100)}%` }}
                        />
                      </div>
                    )}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      <Card className="mb-6 animate-fade-in-up">
        <CardContent className="py-3">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                {t("automatic.title")}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {t("automatic.description")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportConfigs.map((report) => {
          const Icon = report.icon;
          const FormatIcon =
            report.format === "XLSX"
              ? FileSpreadsheet
              : report.format === "CSV"
                ? Table2
                : FileJson;
          const formatBadgeClass =
            report.format === "XLSX"
              ? "bg-[#006233]/10 text-[#006233] dark:bg-[#006233]/20 dark:text-emerald-300 border border-[#006233]/20"
              : report.format === "CSV"
                ? "bg-[#296DC1]/10 text-[#296DC1] dark:bg-[#296DC1]/20 dark:text-blue-300 border border-[#296DC1]/20"
                : "bg-[#F68D2E]/10 text-slate-900 dark:bg-[#F68D2E]/20 dark:text-orange-300 border border-[#F68D2E]/20";
          const hasBeenGenerated = !!lastGenerated[report.id];
          return (
            <Card
              key={report.id}
              className={`shadow-sm rounded-xl flex flex-col transition-all duration-200 hover:shadow-md stagger-item ${hasBeenGenerated ? "ring-1 ring-[#006233]/20" : ""}`}
            >
              <CardContent className="flex-1">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light flex-shrink-0">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                        {t(`reports.${report.i18nKey}.title`)}
                      </h3>
                      {report.format && (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${formatBadgeClass}`}
                        >
                          <FormatIcon className="h-3 w-3" />
                          {report.format}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                      {t(`reports.${report.i18nKey}.description`)}
                    </p>
                    {hasBeenGenerated && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#006233]/5 dark:bg-[#006233]/10 px-2.5 py-1 border border-[#006233]/10">
                        <Clock className="h-3 w-3 text-[#006233]" />
                        <span className="text-[10px] font-medium text-[#006233] dark:text-emerald-400">
                          {t("lastGeneratedAt", {
                            date: lastGenerated[report.id] ?? "",
                          })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <div className="px-6 pb-4 space-y-2">
                {report.id === "monthly-smsi" && (
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="w-full rounded-xl border px-3 py-1.5 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  />
                )}
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => handleDownload(report)}
                  loading={downloading === report.id}
                >
                  {downloading === report.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {report.format === "CSV"
                    ? t("export.csv")
                    : report.format === "XLSX"
                      ? t("export.xlsx")
                      : report.format === "JSON"
                        ? t("export.json")
                        : t("download")}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
