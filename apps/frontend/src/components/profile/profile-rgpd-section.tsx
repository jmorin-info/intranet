"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, Button } from "@omnitech/ui";
import { Shield, Download } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import type { ApiError } from "./types";

export function ProfileRgpdSection() {
  const { t } = useTranslation();
  const [requestingExport, setRequestingExport] = useState(false);

  const handleDataExport = async () => {
    setRequestingExport(true);
    try {
      const response = await api.post(
        "/users/me/gdpr-export",
        {},
        {
          responseType: "blob",
        },
      );
      const blob = new Blob([response.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.setAttribute("download", `export-rgpd-${date}.json`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(t("profile.rgpdExported"));
    } catch (err) {
      const axiosErr = err as ApiError & { response?: { data?: unknown } };
      let message: string | undefined;
      const data = axiosErr?.response?.data;
      if (data instanceof Blob) {
        try {
          const text = await data.text();
          const parsed = JSON.parse(text) as { message?: string };
          message = parsed?.message;
        } catch {}
      } else if (data && typeof data === "object" && "message" in data) {
        message = (data as { message?: string }).message;
      }
      toast.error(message || axiosErr?.message || t("profile.rgpdError"));
    } finally {
      setRequestingExport(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Données personnelles (RGPD)
        </h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-seal-gray-500 mb-4">
          Conformément au RGPD, vous pouvez télécharger l&apos;ensemble de vos
          données personnelles au format JSON (profil, documents, tickets,
          notifications, journaux).
        </p>
        <Button
          variant="secondary"
          onClick={handleDataExport}
          loading={requestingExport}
        >
          <Download className="h-4 w-4" />
          Exporter mes données
        </Button>
      </CardContent>
    </Card>
  );
}
