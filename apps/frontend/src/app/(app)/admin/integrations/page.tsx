"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Input,
} from "@omnitech/ui";
import {
  Plug,
  Calendar,
  Mail,
  Copy,
  Save,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { PageHeader } from "@/components/layout/page-header";
import { logger } from "@/lib/logger";

type CredSource = "db" | "env" | "none";
type TenantSource = "db" | "env" | "default";

interface IntegrationsStatus {
  redirectUris: { google: string; outlook: string };
  google: {
    clientId: string;
    clientIdSource: CredSource;
    hasSecret: boolean;
    secretSource: CredSource;
  };
  outlook: {
    clientId: string;
    clientIdSource: CredSource;
    hasSecret: boolean;
    secretSource: CredSource;
    tenantId: string;
    tenantSource: TenantSource;
  };
}

function SourceBadge({ source }: { source: CredSource | TenantSource }) {
  if (source === "db") return <Badge variant="success">Base de données</Badge>;
  if (source === "env") return <Badge variant="info">Variable d'env</Badge>;
  if (source === "default")
    return <Badge variant="navy">Défaut (common)</Badge>;
  return <Badge variant="warning">Non configuré</Badge>;
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success(`${label} copié dans le presse-papier`))
    .catch(() => toast.error("Copie impossible"));
}

export default function AdminIntegrationsPage() {
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  const [status, setStatus] = useState<IntegrationsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGoogle, setSavingGoogle] = useState(false);
  const [savingOutlook, setSavingOutlook] = useState(false);

  const [googleClientId, setGoogleClientId] = useState("");
  const [googleSecret, setGoogleSecret] = useState("");
  const [outlookClientId, setOutlookClientId] = useState("");
  const [outlookSecret, setOutlookSecret] = useState("");
  const [outlookTenant, setOutlookTenant] = useState("");

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get<IntegrationsStatus>(
        "/admin/integrations/oauth",
      );
      setStatus(data);
      setGoogleClientId(data.google.clientId);
      setOutlookClientId(data.outlook.clientId);
      setOutlookTenant(data.outlook.tenantId);
    } catch (e) {
      logger.error("admin.integrations.fetchFailed", { error: String(e) });
      toast.error("Impossible de charger l'état des intégrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const saveGoogle = async (clearSecret = false) => {
    setSavingGoogle(true);
    try {
      const payload: Record<string, string> = {};
      if (googleClientId !== status?.google.clientId)
        payload.clientId = googleClientId;
      if (clearSecret) payload.clientSecret = "";
      else if (googleSecret) payload.clientSecret = googleSecret;
      if (Object.keys(payload).length === 0) {
        toast.info("Aucune modification à enregistrer");
        return;
      }
      const { data } = await api.patch<IntegrationsStatus>(
        "/admin/integrations/oauth/google",
        payload,
      );
      setStatus(data);
      setGoogleClientId(data.google.clientId);
      setGoogleSecret("");
      toast.success("Google Calendar : configuration enregistrée");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Échec de la mise à jour";
      toast.error(msg);
    } finally {
      setSavingGoogle(false);
    }
  };

  const saveOutlook = async (clearSecret = false) => {
    setSavingOutlook(true);
    try {
      const payload: Record<string, string> = {};
      if (outlookClientId !== status?.outlook.clientId)
        payload.clientId = outlookClientId;
      if (clearSecret) payload.clientSecret = "";
      else if (outlookSecret) payload.clientSecret = outlookSecret;
      if (outlookTenant !== status?.outlook.tenantId)
        payload.tenantId = outlookTenant;
      if (Object.keys(payload).length === 0) {
        toast.info("Aucune modification à enregistrer");
        return;
      }
      const { data } = await api.patch<IntegrationsStatus>(
        "/admin/integrations/oauth/outlook",
        payload,
      );
      setStatus(data);
      setOutlookClientId(data.outlook.clientId);
      setOutlookTenant(data.outlook.tenantId);
      setOutlookSecret("");
      toast.success("Microsoft Outlook : configuration enregistrée");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Échec de la mise à jour";
      toast.error(msg);
    } finally {
      setSavingOutlook(false);
    }
  };

  const fullyConfigured = useMemo(() => {
    if (!status) return { google: false, outlook: false };
    return {
      google: Boolean(status.google.clientId && status.google.hasSecret),
      outlook: Boolean(status.outlook.clientId && status.outlook.hasSecret),
    };
  }, [status]);

  if (!isSuperAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-amber-300/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="py-6 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <div>
              <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                Accès réservé
              </h3>
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Cette page est réservée aux SUPER_ADMIN.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <PageHeader
        title="Intégrations OAuth"
        subtitle="Configuration des Client ID + Client Secret Google Calendar et Microsoft Outlook. Les secrets sont chiffrés AES-256-GCM en base."
        icon={Plug}
      />

      {loading || !status ? (
        <Card>
          <CardContent className="py-12 text-center text-seal-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Chargement…
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Google Calendar */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#296DC1]" />
                  Google Calendar
                </h2>
                {fullyConfigured.google ? (
                  <Badge variant="success">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Configuré
                  </Badge>
                ) : (
                  <Badge variant="warning">À compléter</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-xs">
                <div className="font-semibold text-seal-navy dark:text-white mb-1">
                  Redirect URI à déclarer dans Google Cloud Console
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all">
                    {status.redirectUris.google}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        status.redirectUris.google,
                        "Redirect URI",
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-seal-gray-500 uppercase tracking-wider flex items-center gap-2">
                  Client ID
                  <SourceBadge source={status.google.clientIdSource} />
                </label>
                <Input
                  className="mt-1 font-mono text-sm"
                  placeholder="xxxxx.apps.googleusercontent.com"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-gray-500 uppercase tracking-wider flex items-center gap-2">
                  Client Secret
                  <SourceBadge source={status.google.secretSource} />
                  {status.google.hasSecret && (
                    <span className="text-[10px] text-emerald-600">
                      ● secret défini (masqué)
                    </span>
                  )}
                </label>
                <Input
                  className="mt-1 font-mono text-sm"
                  type="password"
                  placeholder={
                    status.google.hasSecret
                      ? "Laisser vide pour conserver le secret actuel"
                      : "GOCSPX-xxxxxxxxxxxx"
                  }
                  value={googleSecret}
                  onChange={(e) => setGoogleSecret(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => saveGoogle(false)}
                  disabled={savingGoogle}
                >
                  {savingGoogle ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Enregistrer
                </Button>
                {status.google.secretSource === "db" && (
                  <Button
                    variant="outline"
                    onClick={() => saveGoogle(true)}
                    disabled={savingGoogle}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer le secret (revenir à l'env)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Microsoft Outlook */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                  <Mail className="h-5 w-5 text-[#0078D4]" />
                  Microsoft Outlook
                </h2>
                {fullyConfigured.outlook ? (
                  <Badge variant="success">
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Configuré
                  </Badge>
                ) : (
                  <Badge variant="warning">À compléter</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg text-xs">
                <div className="font-semibold text-seal-navy dark:text-white mb-1">
                  Redirect URI à déclarer dans Azure AD
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all">
                    {status.redirectUris.outlook}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      copyToClipboard(
                        status.redirectUris.outlook,
                        "Redirect URI",
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-seal-gray-500 uppercase tracking-wider flex items-center gap-2">
                  Tenant ID (Directory ID)
                  <SourceBadge source={status.outlook.tenantSource} />
                </label>
                <Input
                  className="mt-1 font-mono text-sm"
                  placeholder='"common" ou GUID Azure AD'
                  value={outlookTenant}
                  onChange={(e) => setOutlookTenant(e.target.value)}
                />
                <p className="text-[11px] text-seal-gray-500 mt-1">
                  « common » pour multi-tenant. GUID pour single-tenant
                  (recommandé en production).
                </p>
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-gray-500 uppercase tracking-wider flex items-center gap-2">
                  Application (client) ID
                  <SourceBadge source={status.outlook.clientIdSource} />
                </label>
                <Input
                  className="mt-1 font-mono text-sm"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={outlookClientId}
                  onChange={(e) => setOutlookClientId(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-seal-gray-500 uppercase tracking-wider flex items-center gap-2">
                  Client Secret (valeur)
                  <SourceBadge source={status.outlook.secretSource} />
                  {status.outlook.hasSecret && (
                    <span className="text-[10px] text-emerald-600">
                      ● secret défini (masqué)
                    </span>
                  )}
                </label>
                <Input
                  className="mt-1 font-mono text-sm"
                  type="password"
                  placeholder={
                    status.outlook.hasSecret
                      ? "Laisser vide pour conserver le secret actuel"
                      : "Valeur du secret (visible 1 fois dans Azure)"
                  }
                  value={outlookSecret}
                  onChange={(e) => setOutlookSecret(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  onClick={() => saveOutlook(false)}
                  disabled={savingOutlook}
                >
                  {savingOutlook ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Enregistrer
                </Button>
                {status.outlook.secretSource === "db" && (
                  <Button
                    variant="outline"
                    onClick={() => saveOutlook(true)}
                    disabled={savingOutlook}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer le secret (revenir à l'env)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-dashed border-primary/30 bg-primary/5">
            <CardContent className="py-4 text-xs text-seal-gray-600 dark:text-slate-400 space-y-1">
              <p>
                <strong>Source des creds :</strong> ordre de priorité « Base de
                données » &gt; « Variable d'env ». Une valeur vide enregistrée
                en BDD est traitée comme « non définie » et fait basculer sur
                l'env.
              </p>
              <p>
                <strong>Sécurité :</strong> les secrets sont chiffrés
                AES-256-GCM via <code>CryptoService</code> (clé{" "}
                <code>CRYPTO_SECRET</code>). Cette page ne renvoie jamais les
                secrets en clair — elle expose seulement la source et un flag «
                hasSecret ». Toute modification est tracée dans l'audit log
                (action <code>INTEGRATION_OAUTH_UPDATED</code>).
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
