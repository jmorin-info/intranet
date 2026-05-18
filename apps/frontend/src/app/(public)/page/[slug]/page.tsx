import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getContentPage } from "@/lib/cms";
import { SafeHtml } from "@/components/cms/safe-html";

interface RouteParams {
  params: { slug: string };
  searchParams: { locale?: string };
}

/**
 * Rendu public d'une `ContentPage` CMS par slug (`/page/<slug>`).
 *
 * - Server Component : pas d'interaction client, juste un fetch + render.
 * - HTML déjà sanitisé côté backend ; on relance DOMPurify ici en
 *   defense in depth (architecture § 5.3).
 * - 404 si la page est DRAFT, ARCHIVED, soft-deleted, ou inexistante.
 * - Accessible sans authentification (route backend `@Public()`).
 */
export default async function PublicCmsPage({
  params,
  searchParams,
}: RouteParams) {
  const locale = searchParams?.locale === "en" ? "en" : "fr";
  const page = await getContentPage(params.slug, locale);
  if (!page) notFound();

  return (
    <article className="seal-prose mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold text-seal-navy dark:text-white">
          {page.title}
        </h1>
        {page.excerpt && (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-2">
            {page.excerpt}
          </p>
        )}
        <p className="text-xs text-seal-gray-500 mt-3">
          Dernière mise à jour :{" "}
          {new Date(page.updatedAt).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>
      <SafeHtml
        html={page.content}
        className="prose dark:prose-invert max-w-none"
      />
    </article>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: RouteParams): Promise<Metadata> {
  const locale = searchParams?.locale === "en" ? "en" : "fr";
  const page = await getContentPage(params.slug, locale);
  if (!page) return { title: "Page introuvable" };
  return {
    title: page.seoTitle ?? page.title,
    description: page.seoDescription ?? page.excerpt ?? undefined,
    robots: { index: true, follow: true },
  };
}
