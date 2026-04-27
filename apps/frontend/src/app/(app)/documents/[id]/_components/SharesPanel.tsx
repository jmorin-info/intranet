"use client";

import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  Button,
  Dialog,
  Input,
  Badge,
  EmptyState,
  Skeleton,
} from "@omnitech/ui";
import {
  Link2,
  Plus,
  Copy,
  Check,
  Trash2,
  Lock,
  Globe,
  Calendar,
} from "lucide-react";

interface ShareItem {
  id: string;
  token: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  requiresAuth: boolean;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  failedAttempts: number;
  hasPassword: boolean;
  createdAt: string;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

interface CreatedShare extends ShareItem {
  // token est uniquement renvoyé en clair à la création
}

interface SharesPanelProps {
  documentId: string;
  /** L'utilisateur courant a-t-il le droit d'administrer (owner / ADMIN+) ? */
  canAdmin: boolean;
}

function buildShareUrl(token: string) {
  if (typeof window === "undefined") return `/shared/${token}`;
  return `${window.location.origin}/shared/${token}`;
}

/**
 * Panneau de gestion des liens de partage publics (ISO 27001 A.5.14).
 * Liste les shares actifs/révoqués + permet d'en créer / révoquer.
 */
export function SharesPanel({ documentId, canAdmin }: SharesPanelProps) {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createdShare, setCreatedShare] = useState<CreatedShare | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ShareItem[]>(`/documents/${documentId}/shares`);
      setShares(res.data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status !== 403) {
        toast.error("Impossible de charger les partages");
      }
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (canAdmin) load();
    else setLoading(false);
  }, [canAdmin, load]);

  const handleRevoke = async (id: string) => {
    if (!confirm("Révoquer ce lien de partage ?")) return;
    try {
      await api.delete(`/documents/${documentId}/shares/${id}`);
      toast.success("Partage révoqué");
      await load();
    } catch {
      toast.error("Impossible de révoquer");
    }
  };

  if (!canAdmin) {
    return (
      <Card>
        <CardContent className="py-8">
          <EmptyState
            title="Accès restreint"
            description="Seul le propriétaire ou un administrateur peut gérer les partages."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-seal-navy" />
              <h3 className="font-semibold text-seal-navy">Liens de partage</h3>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreate(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Créer un lien
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : shares.length === 0 ? (
            <EmptyState
              title="Aucun lien de partage"
              description="Créez un lien à durée limitée pour partager ce document avec un tiers."
            />
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => (
                <ShareRow
                  key={s.id}
                  share={s}
                  onRevoke={() => handleRevoke(s.id)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CreateShareDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        documentId={documentId}
        onCreated={(share) => {
          setShowCreate(false);
          setCreatedShare(share);
          load();
        }}
      />

      {createdShare && (
        <CreatedShareDialog
          share={createdShare}
          onClose={() => setCreatedShare(null)}
        />
      )}
    </>
  );
}

function ShareRow({
  share,
  onRevoke,
}: {
  share: ShareItem;
  onRevoke: () => void;
}) {
  const expired =
    share.expiresAt && new Date(share.expiresAt).getTime() < Date.now();
  const exhausted =
    share.maxDownloads !== null && share.downloadCount >= share.maxDownloads;
  const status = share.revokedAt
    ? "Révoqué"
    : expired
      ? "Expiré"
      : exhausted
        ? "Quota atteint"
        : "Actif";
  const statusColor = share.revokedAt
    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
    : expired || exhausted
      ? "bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";

  return (
    <li className="rounded-card border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={statusColor}>{status}</Badge>
          {share.requiresAuth ? (
            <Badge className="bg-blue-100 text-blue-800">
              <Lock className="h-3 w-3 mr-1 inline" />
              Auth requise
            </Badge>
          ) : (
            <Badge className="bg-amber-100 text-amber-800">
              <Globe className="h-3 w-3 mr-1 inline" />
              Anonyme
            </Badge>
          )}
          {share.hasPassword && (
            <Badge className="bg-purple-100 text-purple-800">
              <Lock className="h-3 w-3 mr-1 inline" />
              Mot de passe
            </Badge>
          )}
        </div>
        {!share.revokedAt && (
          <Button variant="ghost" size="sm" onClick={onRevoke}>
            <Trash2 className="h-3.5 w-3.5" />
            Révoquer
          </Button>
        )}
      </div>
      <div className="mt-2 text-xs text-seal-gray-500 space-y-0.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            Téléchargements&nbsp;: {share.downloadCount}
            {share.maxDownloads !== null ? ` / ${share.maxDownloads}` : ""}
          </span>
          {share.expiresAt && (
            <span>
              <Calendar className="inline h-3 w-3 mr-1" />
              Expire le {new Date(share.expiresAt).toLocaleDateString("fr-FR")}
            </span>
          )}
          {share.lastAccessedAt && (
            <span>
              Dernier accès&nbsp;:{" "}
              {new Date(share.lastAccessedAt).toLocaleString("fr-FR")}
            </span>
          )}
        </div>
        {share.createdBy && (
          <div>
            Créé par {share.createdBy.firstName} {share.createdBy.lastName} le{" "}
            {new Date(share.createdAt).toLocaleDateString("fr-FR")}
          </div>
        )}
      </div>
    </li>
  );
}

function CreateShareDialog({
  open,
  onClose,
  documentId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  documentId: string;
  onCreated: (share: CreatedShare) => void;
}) {
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [requiresAuth, setRequiresAuth] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setExpiresAt("");
    setPassword("");
    setMaxDownloads("");
    setRequiresAuth(true);
  };

  const handleSubmit = async () => {
    const body: Record<string, unknown> = {
      requiresAuth,
    };
    if (expiresAt) body.expiresAt = new Date(expiresAt).toISOString();
    if (password) body.password = password;
    if (maxDownloads) {
      const n = parseInt(maxDownloads, 10);
      if (!Number.isFinite(n) || n < 1) {
        toast.error("Quota de téléchargements invalide");
        return;
      }
      body.maxDownloads = n;
    }

    setSubmitting(true);
    try {
      const res = await api.post<CreatedShare>(
        `/documents/${documentId}/shares`,
        body,
      );
      reset();
      onCreated(res.data);
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === "MFA_REVALIDATION_REQUIRED") {
        toast.error("Re-validation MFA requise. Vous allez être redirigé.");
        // L'intercepteur axios redirige déjà vers /mfa/revalidate
        return;
      }
      const msg = e?.response?.data?.message || "Impossible de créer le lien";
      toast.error(typeof msg === "string" ? msg : "Erreur");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Créer un lien de partage"
      description="Génère un lien à durée limitée. La création d'un lien anonyme nécessite une validation MFA récente."
      size="md"
    >
      <div className="space-y-4">
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={requiresAuth}
              onChange={(e) => setRequiresAuth(e.target.checked)}
              className="rounded"
            />
            <span>
              Exiger une authentification (le destinataire doit être connecté à
              l'intranet)
            </span>
          </label>
        </div>

        <Input
          label="Expiration (optionnel)"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />

        <Input
          label="Mot de passe (optionnel, min 8 car.)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Laisser vide pour ne pas en exiger"
        />

        <Input
          label="Quota de téléchargements (optionnel)"
          type="number"
          min={1}
          value={maxDownloads}
          onChange={(e) => setMaxDownloads(e.target.value)}
          placeholder="Illimité"
        />

        <div className="rounded-card bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
          Pour des raisons de conformité (ISO 27001 A.5.14), tous les accès au
          lien sont audités&nbsp;: création, succès, échecs et expiration. Après
          5 mauvais mots de passe consécutifs, le lien est automatiquement
          révoqué.
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            Créer le lien
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CreatedShareDialog({
  share,
  onClose,
}: {
  share: CreatedShare;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const url = buildShareUrl(share.token);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier");
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Lien créé"
      description="Copiez ce lien maintenant — il ne sera plus affiché en entier."
      size="md"
    >
      <div className="space-y-3">
        <div className="rounded-card bg-gray-50 dark:bg-slate-800 p-3 break-all text-sm font-mono">
          {url}
        </div>
        <Button variant="primary" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copié
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copier le lien
            </>
          )}
        </Button>
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
