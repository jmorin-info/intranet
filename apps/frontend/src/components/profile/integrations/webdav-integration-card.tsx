"use client";

/**
 * Card "Sync vault Obsidian (WebDAV)" — Wave B item enrichissement F1.
 *
 * Permet à l'utilisateur de :
 *  - Voir la liste de ses tokens WebDAV (label / dernière utilisation / expire)
 *  - Générer un nouveau token (modale → label → token affiché 1 SEULE fois)
 *  - Révoquer un token précis ou tous (panic button)
 *
 * Backend (cf webdav.controller.ts) :
 *  - POST   /users/me/webdav-token       → { token, id, expiresAt, url, username }
 *  - GET    /users/me/webdav-token       → { items: [{ id, label, lastUsedAt, expiresAt, createdAt }] }
 *  - DELETE /users/me/webdav-token/:id
 *  - DELETE /users/me/webdav-token       (revoke all)
 *
 * Pré-requis backend (User.webdavEnabled = true ET feature globale ON) — si
 * l'un des deux est OFF, la première tentative de mint renvoie un 403 avec un
 * message clair (cf ensureUserAllowed dans webdav.service.ts). On capture
 * l'erreur et on affiche le bandeau adapté.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  HardDrive,
  Plus,
  Copy,
  Trash2,
  AlertTriangle,
  ExternalLink,
  KeyRound,
  ShieldAlert,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  EmptyState,
  Skeleton,
} from "@omnitech/ui";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import type { WebDAVMintResponse, WebDAVTokenSummary } from "./types";

type ListResponse = { items: WebDAVTokenSummary[] };

/**
 * Détecte (best-effort) si l'erreur renvoyée par le backend correspond au cas
 * "permission user OFF" vs "feature globale OFF" — pour afficher le bon
 * bandeau pédagogique.
 */
function classifyForbiddenMessage(
  msg: string | undefined,
): "userDisabled" | "featureDisabled" | "other" {
  if (!msg) return "other";
  const m = msg.toLowerCase();
  if (m.includes("désactivé sur cette instance") || m.includes("appconfig")) {
    return "featureDisabled";
  }
  if (m.includes("ton compte") || m.includes("administrateur")) {
    return "userDisabled";
  }
  return "other";
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback (HTTP local non sécurisé : pas de clipboard API)
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function WebdavIntegrationCard(): React.ReactElement {
  const t = useTranslations("profile.integrations.webdav");

  const [tokens, setTokens] = useState<WebDAVTokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState<
    "userDisabled" | "featureDisabled" | null
  >(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<WebDAVMintResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>("/users/me/webdav-token");
      setTokens(data?.items ?? []);
      setForbidden(null);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (status === 403) {
        setForbidden(
          classifyForbiddenMessage(msg) === "featureDisabled"
            ? "featureDisabled"
            : "userDisabled",
        );
      } else {
        logger.error("webdav.list.failed", { error: String(err) });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const { data } = await api.post<WebDAVMintResponse>(
        "/users/me/webdav-token",
        { label: label.trim() || undefined },
      );
      setMinted(data);
      setLabel("");
      toast.success(t("createSuccess"));
      await load();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      if (status === 403) {
        setForbidden(
          classifyForbiddenMessage(msg) === "featureDisabled"
            ? "featureDisabled"
            : "userDisabled",
        );
        setCreateOpen(false);
      } else {
        toast.error(msg ?? "Impossible de créer le token");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm(t("revokeConfirm"))) return;
    try {
      await api.delete(`/users/me/webdav-token/${id}`);
      toast.success(t("revokeSuccess"));
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? t("revokeError"));
    }
  };

  const handleRevokeAll = async () => {
    if (!confirm(t("revokeAllConfirm"))) return;
    try {
      const { data } = await api.delete<{ revoked: number }>(
        "/users/me/webdav-token",
      );
      toast.success(t("revokeAllSuccess", { count: data?.revoked ?? 0 }));
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? t("revokeError"));
    }
  };

  const handleCopy = async (
    text: string,
    label?: string,
  ): Promise<void> => {
    const ok = await copyToClipboard(text);
    if (ok) toast.success(label ?? t("copied"));
    else toast.error(t("copyError"));
  };

  const closeMintModal = () => {
    setCreateOpen(false);
    setMinted(null);
  };

  // -------- Render --------

  return (
    <Card data-testid="webdav-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Obsidian WebDAV
          </h3>
          {tokens.length > 0 && !forbidden && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevokeAll}
              data-testid="webdav-revoke-all"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {t("revokeAll")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400">
          {t("sectionDescription")}
        </p>

        {/* État : permission OFF */}
        {forbidden === "userDisabled" && (
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{t("permissionDisabled")}</span>
          </div>
        )}
        {forbidden === "featureDisabled" && (
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{t("featureDisabled")}</span>
          </div>
        )}

        {/* Loading */}
        {loading && <Skeleton className="h-16 w-full" />}

        {/* CTA création */}
        {!loading && !forbidden && (
          <div>
            <Button
              variant="primary"
              onClick={() => {
                setMinted(null);
                setLabel("");
                setCreateOpen(true);
              }}
              data-testid="webdav-create-token"
            >
              <Plus className="h-4 w-4" />
              {t("createTokenButton")}
            </Button>
          </div>
        )}

        {/* Liste */}
        {!loading && !forbidden && (
          <div className="pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-2">
              {t("tokensListTitle")}
            </h4>
            {tokens.length === 0 ? (
              <EmptyState
                icon={KeyRound}
                title={t("noTokens")}
                description=""
              />
            ) : (
              <ul className="space-y-2" data-testid="webdav-tokens-list">
                {tokens.map((tok) => (
                  <li
                    key={tok.id}
                    className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm"
                    data-testid={`webdav-token-item-${tok.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-seal-navy dark:text-white truncate">
                        {tok.label || "Token sans label"}
                      </div>
                      <div className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                        {tok.lastUsedAt
                          ? t("tokenLastUsed", {
                              when: formatRelativeTime(tok.lastUsedAt),
                            })
                          : t("tokenNeverUsed")}
                        {" · "}
                        {t("tokenExpiresAt", {
                          date: formatDate(tok.expiresAt),
                        })}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(tok.id)}
                      aria-label={`${t("revoke")} ${tok.label ?? ""}`}
                      data-testid={`webdav-revoke-${tok.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>

      {/* Modale création + affichage one-shot du token */}
      <Dialog
        open={createOpen}
        onClose={closeMintModal}
        title={
          minted ? t("tokenWarningTitle") : t("createTokenButton")
        }
        size="md"
      >
        {!minted ? (
          // -------- Étape 1 : saisie du label --------
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-seal-navy dark:text-white">
                {t("createTokenLabel")}
              </span>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                placeholder={t("createTokenPlaceholder")}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                data-testid="webdav-label-input"
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button
                variant="primary"
                onClick={handleCreate}
                disabled={submitting}
                data-testid="webdav-submit-create"
              >
                {submitting ? t("createTokenSubmitting") : t("createTokenSubmit")}
              </Button>
            </div>
          </div>
        ) : (
          // -------- Étape 2 : token affiché 1 SEULE fois --------
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-md px-3 py-2 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{t("tokenWarningBody")}</span>
            </div>

            <CredentialField
              label={t("tokenLabel")}
              value={minted.token}
              onCopy={() => handleCopy(minted.token, t("copied"))}
              testId="webdav-mint-token"
              monospace
              critical
            />
            <CredentialField
              label={t("urlLabel")}
              value={minted.url}
              onCopy={() => handleCopy(minted.url)}
              testId="webdav-mint-url"
              monospace
            />
            <CredentialField
              label={t("usernameLabel")}
              value={minted.username}
              onCopy={() => handleCopy(minted.username)}
              testId="webdav-mint-username"
            />

            <div className="text-xs text-seal-gray-500 dark:text-slate-400 flex items-center gap-1">
              <Badge variant="info" size="sm">
                {t("tokenExpiresAt", { date: formatDate(minted.expiresAt) })}
              </Badge>
            </div>

            <a
              href="/docs/integrations/OBSIDIAN_SETUP.md"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-seal-blue hover:underline"
            >
              {t("docsLink")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            <div className="flex justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button variant="primary" onClick={closeMintModal}>
                Terminé
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Champ "credential" avec bouton Copier — utilisé pour token, URL, username.
// ----------------------------------------------------------------------------

function CredentialField({
  label,
  value,
  onCopy,
  testId,
  monospace,
  critical,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  testId: string;
  monospace?: boolean;
  /** Si true, affiche en monospace + warning visuel (pour token clair) */
  critical?: boolean;
}): React.ReactElement {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400">
        {label}
      </label>
      <div className="mt-1 flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          data-testid={testId}
          className={`flex-1 rounded-md border ${
            critical
              ? "border-amber-300 bg-amber-50 dark:bg-amber-900/20"
              : "border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-900"
          } px-3 py-2 text-sm ${
            monospace ? "font-mono" : ""
          } text-seal-navy dark:text-white`}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopy}
          aria-label={`${label} — copier`}
          data-testid={`${testId}-copy`}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
