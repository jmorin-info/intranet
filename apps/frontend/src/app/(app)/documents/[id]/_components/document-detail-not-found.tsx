"use client";

import React from "react";
import { Button, EmptyState } from "@omnitech/ui";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";

/**
 * État "document introuvable" — affiché si l'API renvoie 404 / 403 ou si le doc
 * a été supprimé. CTA retour à la liste documents.
 */
export const DocumentDetailNotFound = React.memo(function DocumentDetailNotFound() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <div className="max-w-5xl mx-auto py-12">
      <EmptyState
        type="documents"
        title="Document introuvable"
        description="Ce document n'existe pas, a été supprimé, ou vous n'y avez pas accès. Vérifiez vos droits ou retournez à la liste."
        action={
          <Button
            variant="outline"
            onClick={() => router.push("/documents")}
            aria-label="Retour à la liste des documents"
          >
            <ArrowLeft className="h-4 w-4" /> {t("documents.detail.back")}
          </Button>
        }
      />
    </div>
  );
});
