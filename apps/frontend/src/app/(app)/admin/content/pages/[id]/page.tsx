"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { SkeletonCard } from "@omnitech/ui";
import { getPage } from "@/lib/cms-admin/api";
import type { ContentPage } from "@/lib/cms-admin/types";
import { PageForm } from "../../_components/PageForm";

export default function AdminContentPageEdit() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [page, setPage] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      try {
        const p = await getPage(params.id);
        if (!canceled) setPage(p);
      } catch {
        toast.error("Page introuvable");
        router.push("/admin/content/pages");
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [params.id, router]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <PageHeader
        hub="admin"
        icon={FileText}
        title={page?.title ?? "Édition"}
        subtitle={page ? `/${page.slug} · ${page.locale.toUpperCase()}` : ""}
      />
      {loading ? <SkeletonCard /> : page ? <PageForm page={page} /> : null}
    </div>
  );
}
