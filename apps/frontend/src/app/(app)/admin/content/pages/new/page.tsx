"use client";

import { FilePlus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageForm } from "../../_components/PageForm";

export default function AdminContentPageNew() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHeader
        hub="admin"
        icon={FilePlus}
        title="Nouvelle page"
        subtitle="Créer une page éditoriale (statut brouillon par défaut)"
      />
      <PageForm />
    </div>
  );
}
