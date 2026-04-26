"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, Button, Input, Skeleton } from "@omnitech/ui";
import { Lock, FileText, AlertTriangle } from "lucide-react";

interface ShareAccessResponse {
  requiresPassword: boolean;
  shareId: string;
  documentId?: string;
  documentTitle?: string | null;
  documentReference?: string;
  classification?: string | null;
  currentVersionId?: string | null;
  isNative?: boolean;
  content?: string | null;
}

const API_URL = (() => {
  if (typeof window === "undefined") return "";
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env.replace(/\/api\/?$/, "/api/v1");
  return "/api/v1";
})();

/**
 * Page publique d'accès à un document partagé via token.
 *
 * Comportement :
 *  1. GET /shared/:token — découvre si un mot de passe est requis.
 *  2. Si oui, affiche un formulaire ; POST /shared/:token avec body { password }.
 *  3. Sinon (ou après mdp valide), affiche un bouton de téléchargement.
 *
 * Aucune dépendance à axios ici (route publique, pas de cookies JWT).
 */
export default function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShareAccessResponse | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/shared/${token}`, {
          method: "GET",
          credentials: "include", // si le user est connecté, on profite du JWT
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;
          setError(body?.message || "Lien invalide ou expiré");
          setLoading(false);
          return;
        }
        const json = (await res.json()) as ShareAccessResponse;
        if (cancelled) return;
        setData(json);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Connexion impossible au serveur");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 1) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/shared/${token}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | ShareAccessResponse
        | { message?: string; statusCode?: number };
      if (!res.ok) {
        setError(
          (json as { message?: string }).message || "Mot de passe invalide",
        );
        setSubmitting(false);
        return;
      }
      setData(json as ShareAccessResponse);
      setSubmitting(false);
    } catch {
      setError("Erreur de communication");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-rose-500" />
            <h1 className="text-lg font-semibold text-seal-navy">
              Accès impossible
            </h1>
            <p className="text-sm text-seal-gray-500">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data?.requiresPassword) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-seal-navy" />
              <h1 className="text-lg font-semibold text-seal-navy">
                Document protégé
              </h1>
            </div>
            <p className="text-sm text-seal-gray-500">
              Ce document est protégé par un mot de passe. Veuillez le saisir
              pour y accéder.
            </p>
            <form onSubmit={submitPassword} className="space-y-3">
              <Input
                label="Mot de passe"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && (
                <div className="text-sm text-rose-600" role="alert">
                  {error}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={submitting}
              >
                Accéder au document
              </Button>
            </form>
            <div className="text-xs text-seal-gray-500 pt-2">
              Après 5 tentatives infructueuses, le lien sera automatiquement
              révoqué.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data && !data.requiresPassword) {
    const downloadUrl = `${API_URL}/documents/${data.documentId}/download?inline=false`;
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-seal-navy" />
              <h1 className="text-lg font-semibold text-seal-navy">
                {data.documentTitle || "Document partagé"}
              </h1>
            </div>
            {data.documentReference && (
              <div className="text-sm text-seal-gray-500">
                Référence&nbsp;: <code>{data.documentReference}</code>
              </div>
            )}
            {data.classification && (
              <div className="text-sm">
                Classification&nbsp;:{" "}
                <span className="font-semibold">{data.classification}</span>
              </div>
            )}

            {data.isNative && data.content ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none mt-4"
                dangerouslySetInnerHTML={{ __html: data.content }}
              />
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  // Lien de download authenticated — on ouvre dans un nouvel onglet
                  window.location.href = downloadUrl;
                }}
              >
                Télécharger le document
              </Button>
            )}

            <div className="text-xs text-seal-gray-500 pt-3 border-t border-gray-100 dark:border-slate-700">
              Tous les accès à ce lien sont enregistrés à des fins de
              traçabilité (ISO 27001 A.5.14).
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
