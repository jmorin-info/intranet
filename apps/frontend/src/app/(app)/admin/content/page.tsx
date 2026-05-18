"use client";

import Link from "next/link";
import { FileText, LayoutGrid } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@omnitech/ui";

/**
 * Landing du module CMS — deux entrées : Pages éditoriales et Blocs réutilisables.
 * Documentation : docs/cms/architecture.md.
 */
export default function AdminContentLandingPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <PageHeader
        hub="admin"
        icon={FileText}
        title="Pages CMS"
        subtitle="Pages éditoriales et blocs de contenu réutilisables sur l'intranet"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/content/pages"
          className="block focus:outline-none focus:ring-2 focus:ring-seal-orange focus:ring-offset-2 rounded-card"
        >
          <Card className="p-5 transition-shadow hover:shadow-card-hover h-full">
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-seal-orange/10 text-seal-orange"
                aria-hidden="true"
              >
                <FileText className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-seal-navy dark:text-white">
                  Pages éditoriales
                </h2>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                  Mentions légales, politique de confidentialité, accueil, FAQ.
                  Chaque page a une URL publique propre et un historique de
                  versions.
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link
          href="/admin/content/blocks"
          className="block focus:outline-none focus:ring-2 focus:ring-seal-orange focus:ring-offset-2 rounded-card"
        >
          <Card className="p-5 transition-shadow hover:shadow-card-hover h-full">
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-seal-blue/10 text-seal-blue"
                aria-hidden="true"
              >
                <LayoutGrid className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-seal-navy dark:text-white">
                  Blocs réutilisables
                </h2>
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                  Sections éditables consommées par les composants front (hero
                  Welcome, services, FAQ, trust commitments…). Identifiés par
                  clé namespacée.
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
