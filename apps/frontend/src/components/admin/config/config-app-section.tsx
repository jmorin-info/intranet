"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardFooter,
  Button,
  Input,
  Badge,
  Tabs,
  ConfirmDialog,
} from "@omnitech/ui";
import {
  Save,
  Settings,
  Shield,
  Server,
  Mail,
  PenLine,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  X,
  Info,
  Plug,
  Eye,
  EyeOff,
} from "lucide-react";
import type { ServiceHealth, SyncTimes } from "./config-system-info";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

interface IntegrationDef {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  fields: {
    key: string;
    label: string;
    type: "text" | "password";
    placeholder: string;
  }[];
  testEndpoint: string;
  testLabel: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_GROUPS: Record<
  string,
  {
    label: string;
    description: string;
    icon: React.ElementType;
    keys: string[];
    healthKey?: string;
  }
> = {
  general: {
    label: "Général",
    description:
      "Paramètres globaux de l'application : nom, URL, limites de téléchargement et durée de session",
    icon: Settings,
    keys: [
      "app_name",
      "app_url",
      "max_upload_size_mb",
      "session_timeout_hours",
      "review_reminder_days",
    ],
  },
  ldap: {
    label: "LDAP / Active Directory",
    description:
      "Connexion au serveur Active Directory pour l'authentification centralisée et la synchronisation des comptes",
    icon: Shield,
    keys: [
      "ldap.enabled",
      "ldap.url",
      "ldap.bind_dn",
      "ldap.bind_password",
      "ldap.search_base",
      "ldap.search_filter",
      "ldap.user_filter",
      "ldap.tls_reject_unauthorized",
      "ldap.attr_email",
      "ldap.attr_firstname",
      "ldap.attr_lastname",
      "ldap.attr_group",
      "ldap.role_mapping",
      "ldap.default_role",
    ],
    healthKey: "ldap",
  },
  smtp: {
    label: "Messagerie SMTP",
    description:
      "Configuration du serveur de messagerie pour l'envoi de notifications, alertes et rapports par email",
    icon: Mail,
    keys: [
      "smtp.enabled",
      "smtp_host",
      "smtp_port",
      "smtp_from",
      "smtp_user",
      "smtp_password",
    ],
    healthKey: "smtp",
  },
  docuseal: {
    label: "DocuSeal (Signature)",
    description:
      "Intégration avec DocuSeal pour la signature électronique des chartes et documents réglementaires",
    icon: PenLine,
    keys: ["docuseal_url", "docuseal_api_key"],
  },
  integrations: {
    label: "Intégrations & API",
    description:
      "Configuration des intégrations externes (KnowBe4, etc.) : URL, tokens et test de connexion",
    icon: Plug,
    keys: ["knowbe4_api_url", "knowbe4_api_token"],
  },
};

const LDAP_DEFAULTS: Record<string, { value: string; description: string }> = {
  "ldap.enabled": {
    value: "false",
    description: "Activer l'authentification LDAP Active Directory",
  },
  "ldap.url": {
    value: "ldaps://dc.omnitech.local:636",
    description: "URL du serveur LDAPS (ex: ldaps://dc.omnitech.local:636)",
  },
  "ldap.bind_dn": {
    value: "",
    description:
      "DN du compte de service (ex: CN=svc_intranet,OU=Services,DC=omnitech,DC=local)",
  },
  "ldap.bind_password": {
    value: "",
    description: "Mot de passe du compte de service LDAP",
  },
  "ldap.search_base": {
    value: "DC=omnitech,DC=local",
    description: "Base de recherche LDAP (ex: DC=omnitech,DC=local)",
  },
  "ldap.search_filter": {
    value: "(sAMAccountName={{username}})",
    description:
      "Filtre de recherche ({{username}} sera remplacé par le login)",
  },
  "ldap.user_filter": {
    value:
      "(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))",
    description:
      "Filtre LDAP pour la synchronisation des utilisateurs (ex: filtre pour exclure les comptes désactivés)",
  },
  "ldap.tls_reject_unauthorized": {
    value: "false",
    description: "Vérifier le certificat TLS du serveur LDAP (true/false)",
  },
  "ldap.attr_email": {
    value: "mail",
    description: "Attribut LDAP pour l'email",
  },
  "ldap.attr_firstname": {
    value: "givenName",
    description: "Attribut LDAP pour le prénom",
  },
  "ldap.attr_lastname": {
    value: "sn",
    description: "Attribut LDAP pour le nom",
  },
  "ldap.attr_group": {
    value: "memberOf",
    description: "Attribut LDAP pour les groupes",
  },
  "ldap.role_mapping": {
    value: "{}",
    description:
      'Mapping JSON groupes AD → roles (ex: {"CN=GG_Direction":"DIRECTION","CN=GG_DSI":"ADMIN"})',
  },
  "ldap.default_role": {
    value: "COLLABORATEUR",
    description: "Rôle par défaut si aucun groupe AD ne correspond",
  },
};

const EXTRA_DESCRIPTIONS: Record<string, string> = {
  "smtp.enabled":
    "Activer/désactiver l'envoi d'emails. Quand désactivé, aucune notification email ne sera envoyée.",
  smtp_host: "Adresse du serveur SMTP (ex: smtp.omnitech-security.fr)",
  smtp_port: "Port du serveur SMTP (25, 465 ou 587)",
  smtp_from: "Adresse email d'expédition (ex: intranet@omnitech-security.fr)",
  smtp_user: "Nom d'utilisateur SMTP (laisser vide si pas d'authentification)",
  smtp_password: "Mot de passe SMTP",
};

const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    id: "knowbe4",
    label: "KnowBe4",
    description:
      "Plateforme de sensibilisation à la sécurité : synchronisation des campagnes et certificats de formation",
    icon: ShieldCheck,
    fields: [
      {
        key: "knowbe4_api_url",
        label: "URL de l'API KnowBe4",
        type: "text",
        placeholder: "https://api.events.knowbe4.com",
      },
      {
        key: "knowbe4_api_token",
        label: "Token API KnowBe4",
        type: "password",
        placeholder: "Votre token API KnowBe4",
      },
    ],
    testEndpoint: "/knowbe4/account",
    testLabel: "Tester la connexion",
  },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ConfigAppSectionProps {
  serviceHealthMap: Record<string, ServiceHealth>;
  lastSyncTimes: SyncTimes | null;
  onChangeCountChange?: (count: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Section générique d'édition des AppConfig (key/value) avec :
 * - Tabs par groupe (général, LDAP, SMTP, DocuSeal, intégrations)
 * - Masquage des champs sensibles (password/secret/api_key)
 * - Validation inline (URL LDAP, port SMTP)
 * - Toggle auto-save pour les booléens
 * - Widgets de test SMTP, LDAP, KnowBe4
 */
export function ConfigAppSection({
  serviceHealthMap,
  lastSyncTimes,
}: ConfigAppSectionProps) {
  const [configs, setConfigs] = useState<AppConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("general");
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [editingPasswords, setEditingPasswords] = useState<
    Record<string, boolean>
  >({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {},
  );
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // LDAP-specific
  const [testingLdap, setTestingLdap] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [ldapSyncResult, setLdapSyncResult] = useState<{
    created?: number;
    updated?: number;
    deactivated?: number;
    errors?: number;
    total?: number;
  } | null>(null);
  const [ldapTestEmail, setLdapTestEmail] = useState("");
  const [ldapTestPassword, setLdapTestPassword] = useState("");
  const [showLdapTest, setShowLdapTest] = useState<"auth" | "sync" | null>(
    null,
  );
  const [showSyncAllConfirm, setShowSyncAllConfirm] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // Integrations state
  const [integrationTestResults, setIntegrationTestResults] = useState<
    Record<string, { success: boolean; message: string } | null>
  >({});
  const [integrationTesting, setIntegrationTesting] = useState<
    Record<string, boolean>
  >({});

  const fetchConfig = () => {
    setLoading(true);
    api
      .get("/config")
      .then(({ data }) => setConfigs(data?.data || data || []))
      .catch(() => toast.error("Impossible de charger la configuration"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const getConfigValue = (key: string): string => {
    if (changes[key] !== undefined) return changes[key];
    const found = configs.find((c) => c.key === key);
    if (found) return found.value;
    return LDAP_DEFAULTS[key]?.value || "";
  };

  const getConfigDescription = (key: string): string => {
    const found = configs.find((c) => c.key === key);
    if (found?.description) return found.description;
    return LDAP_DEFAULTS[key]?.description || EXTRA_DESCRIPTIONS[key] || "";
  };

  const validateField = (key: string, value: string): string | null => {
    if (
      key === "ldap.url" &&
      value &&
      !value.startsWith("ldap://") &&
      !value.startsWith("ldaps://")
    ) {
      return "L'URL doit commencer par ldap:// ou ldaps://";
    }
    if (
      key === "smtp_port" &&
      value &&
      (isNaN(Number(value)) || Number(value) < 1 || Number(value) > 65535)
    ) {
      return "Le port doit être un nombre entre 1 et 65535";
    }
    return null;
  };

  const handleChange = (key: string, value: string) => {
    setChanges((prev) => ({ ...prev, [key]: value }));
    const error = validateField(key, value);
    setValidationErrors((prev) => {
      const next = { ...prev };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
  };

  const hasValidationErrors = Object.keys(validationErrors).length > 0;
  const changeCount = Object.keys(changes).length;

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(changes).map(([key, value]) =>
          api.patch(`/config/${key}`, { value }),
        ),
      );
      toast.success("Configuration sauvegardée avec succès");
      setChanges({});
      setEditingPasswords({});
      fetchConfig();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Erreur lors de la sauvegarde",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleInitLdapConfig = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(LDAP_DEFAULTS).map(([key, def]) => {
          const existing = configs.find((c) => c.key === key);
          if (!existing) {
            return api.patch(`/config/${key}`, { value: def.value });
          }
          return Promise.resolve();
        }),
      );
      toast.success("Configuration LDAPS initialisée");
      fetchConfig();
    } catch {
      toast.error("Erreur d'initialisation");
    } finally {
      setSaving(false);
    }
  };

  const handleTestIntegration = async (def: IntegrationDef) => {
    setIntegrationTesting((prev) => ({ ...prev, [def.id]: true }));
    setIntegrationTestResults((prev) => ({ ...prev, [def.id]: null }));
    try {
      const { data } = await api.get(def.testEndpoint);
      const name = data?.name || data?.account || "";
      setIntegrationTestResults((prev) => ({
        ...prev,
        [def.id]: {
          success: true,
          message: name ? `Connecté : ${name}` : "Connexion réussie",
        },
      }));
      toast.success(`${def.label} : connexion réussie`);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Connexion échouée";
      setIntegrationTestResults((prev) => ({
        ...prev,
        [def.id]: { success: false, message },
      }));
      toast.error(`${def.label} : ${message}`);
    } finally {
      setIntegrationTesting((prev) => ({ ...prev, [def.id]: false }));
    }
  };

  const handleSaveIntegration = async (def: IntegrationDef) => {
    setSaving(true);
    try {
      await Promise.all(
        def.fields
          .filter((f) => changes[f.key] !== undefined)
          .map((f) => api.patch(`/config/${f.key}`, { value: changes[f.key] })),
      );
      toast.success(`${def.label} : configuration sauvegardée`);
      const updatedChanges = { ...changes };
      def.fields.forEach((f) => delete updatedChanges[f.key]);
      setChanges(updatedChanges);
      fetchConfig();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Erreur lors de la sauvegarde";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const ldapEnabled = getConfigValue("ldap.enabled") === "true";
  const hasLdapConfig = configs.some((c) => c.key.startsWith("ldap."));

  const tabs = Object.entries(CONFIG_GROUPS).map(([id, group]) => ({
    id,
    label: group.label,
  }));

  const currentGroup = CONFIG_GROUPS[activeTab];
  const isPasswordField = (key: string) =>
    key.includes("password") ||
    key.includes("secret") ||
    key.includes("api_key");

  return (
    <>
      <Card className="animate-fade-in-up">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <CardContent>
          {/* Section description + health indicator */}
          {currentGroup && (
            <div className="mb-6 flex items-start justify-between gap-4 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 p-4">
              <div className="flex items-start gap-3">
                <currentGroup.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                    {currentGroup.label}
                  </h3>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                    {currentGroup.description}
                  </p>
                </div>
              </div>
              {currentGroup.healthKey &&
                serviceHealthMap[currentGroup.healthKey] &&
                (() => {
                  const svc = serviceHealthMap[currentGroup.healthKey]!;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex-shrink-0 ${
                        svc.status === "up"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                          : svc.status === "down"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"
                      }`}
                    >
                      {svc.status === "up" ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> Connecté
                        </>
                      ) : svc.status === "down" ? (
                        <>
                          <XCircle className="h-3 w-3" /> Hors ligne
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3" /> Inconnu
                        </>
                      )}
                    </span>
                  );
                })()}
            </div>
          )}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {/* SMTP test button */}
              {activeTab === "smtp" && (
                <div className="mb-6 rounded-lg border-2 border-seal-navy/20 bg-seal-navy/5 dark:bg-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="h-6 w-6 text-seal-navy dark:text-white" />
                      <div>
                        <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                          Configuration SMTP
                        </h3>
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                          Paramètres du serveur de messagerie pour l&apos;envoi
                          de notifications par email
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={async () => {
                        try {
                          const { data } = await api.post("/config/test-smtp");
                          if (data.success) toast.success(data.message);
                          else toast.error(data.message);
                        } catch {
                          toast.error("Erreur de test SMTP");
                        }
                      }}
                    >
                      <Mail className="h-4 w-4" />
                      Tester SMTP
                    </Button>
                  </div>
                </div>
              )}

              {/* Integrations & API — generic blocks */}
              {activeTab === "integrations" && (
                <div className="space-y-6 mb-6">
                  {INTEGRATION_DEFS.map((def) => {
                    const testResult = integrationTestResults[def.id];
                    const testing = integrationTesting[def.id] ?? false;
                    const hasFieldChanges = def.fields.some(
                      (f) => changes[f.key] !== undefined,
                    );

                    return (
                      <div
                        key={def.id}
                        className="rounded-lg border-2 border-seal-navy/20 bg-seal-navy/5 dark:bg-slate-800 p-5 space-y-4"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <def.icon className="h-6 w-6 text-seal-navy dark:text-white" />
                            <div>
                              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                                {def.label}
                              </h3>
                              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                                {def.description}
                              </p>
                            </div>
                          </div>
                          {testResult && (
                            <Badge
                              variant={testResult.success ? "success" : "error"}
                            >
                              {testResult.success ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : (
                                <XCircle className="h-3 w-3" />
                              )}
                              {testResult.success ? "Connecté" : "Erreur"}
                            </Badge>
                          )}
                        </div>

                        {/* Fields */}
                        <div className="space-y-3">
                          {def.fields.map((field) => {
                            const currentValue =
                              changes[field.key] ?? getConfigValue(field.key);
                            const isPassword = field.type === "password";
                            const passwordVisible =
                              showPasswords[field.key] ?? false;
                            const isMasked =
                              isPassword &&
                              !editingPasswords[field.key] &&
                              currentValue === "********";

                            if (isMasked) {
                              return (
                                <div
                                  key={field.key}
                                  className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900"
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs font-semibold text-seal-navy dark:text-white">
                                        {field.label}
                                      </p>
                                      <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 font-mono tracking-widest">
                                        ********
                                      </p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEditingPasswords((prev) => ({
                                          ...prev,
                                          [field.key]: true,
                                        }));
                                        handleChange(field.key, "");
                                      }}
                                    >
                                      <PenLine className="h-3.5 w-3.5" />
                                      Modifier
                                    </Button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={field.key}
                                className={
                                  changes[field.key] !== undefined
                                    ? "ring-2 ring-primary/30 rounded-lg"
                                    : ""
                                }
                              >
                                <label className="block text-xs font-semibold text-seal-navy dark:text-white mb-1">
                                  {field.label}
                                </label>
                                <div className="relative">
                                  <Input
                                    type={
                                      isPassword && !passwordVisible
                                        ? "password"
                                        : "text"
                                    }
                                    value={currentValue}
                                    onChange={(e) =>
                                      handleChange(field.key, e.target.value)
                                    }
                                    placeholder={field.placeholder}
                                  />
                                  {isPassword && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setShowPasswords((prev) => ({
                                          ...prev,
                                          [field.key]: !passwordVisible,
                                        }))
                                      }
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition-colors"
                                      title={
                                        passwordVisible ? "Masquer" : "Afficher"
                                      }
                                    >
                                      {passwordVisible ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Test result detail */}
                        {testResult && (
                          <div
                            className={`flex items-start gap-2 rounded-md px-3 py-2 border text-xs ${
                              testResult.success
                                ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                                : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                            }`}
                          >
                            {testResult.success ? (
                              <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            ) : (
                              <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                            )}
                            <p className="font-semibold">
                              {testResult.message}
                            </p>
                            <button
                              onClick={() =>
                                setIntegrationTestResults((prev) => ({
                                  ...prev,
                                  [def.id]: null,
                                }))
                              }
                              className="ml-auto flex-shrink-0"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestIntegration(def)}
                            loading={testing}
                            disabled={testing}
                          >
                            <RefreshCw
                              className={`h-4 w-4${testing ? " animate-spin" : ""}`}
                            />
                            {def.testLabel}
                          </Button>
                          {hasFieldChanges && (
                            <Button
                              size="sm"
                              onClick={() => handleSaveIntegration(def)}
                              loading={saving}
                            >
                              <Save className="h-4 w-4" />
                              Sauvegarder
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LDAP specific header */}
              {activeTab === "ldap" && (
                <LdapTestingPanel
                  ldapEnabled={ldapEnabled}
                  hasLdapConfig={hasLdapConfig}
                  lastSyncTimes={lastSyncTimes}
                  ldapTestResult={ldapTestResult}
                  setLdapTestResult={setLdapTestResult}
                  ldapSyncResult={ldapSyncResult}
                  setLdapSyncResult={setLdapSyncResult}
                  testingLdap={testingLdap}
                  setTestingLdap={setTestingLdap}
                  showLdapTest={showLdapTest}
                  setShowLdapTest={setShowLdapTest}
                  ldapTestEmail={ldapTestEmail}
                  setLdapTestEmail={setLdapTestEmail}
                  ldapTestPassword={ldapTestPassword}
                  setLdapTestPassword={setLdapTestPassword}
                  syncingAll={syncingAll}
                  setSyncingAll={setSyncingAll}
                  showSyncAllConfirm={showSyncAllConfirm}
                  setShowSyncAllConfirm={setShowSyncAllConfirm}
                  saving={saving}
                  onInitLdapConfig={handleInitLdapConfig}
                />
              )}

              {/* Config fields */}
              <div className="space-y-4">
                {currentGroup?.keys.map((key) => {
                  const value = getConfigValue(key);
                  const description = getConfigDescription(key);
                  const isChanged = changes[key] !== undefined;
                  const isToggle =
                    key === "ldap.enabled" ||
                    key === "ldap.tls_reject_unauthorized" ||
                    key === "smtp.enabled";

                  if (isToggle) {
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 p-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {key}
                          </p>
                          {description && (
                            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                              {description}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            const newVal = value === "true" ? "false" : "true";
                            handleChange(key, newVal);
                            try {
                              await api.patch(`/config/${key}`, {
                                value: newVal,
                              });
                              toast.success(
                                `${key} : ${newVal === "true" ? "activé" : "désactivé"}`,
                              );
                              setChanges((prev) => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                              fetchConfig();
                            } catch {
                              toast.error(`Erreur de sauvegarde pour ${key}`);
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            (changes[key] ?? value) === "true"
                              ? "bg-primary"
                              : "bg-gray-300 dark:bg-slate-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              (changes[key] ?? value) === "true"
                                ? "translate-x-6"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    );
                  }

                  const fieldError = validationErrors[key];
                  const isPassword = isPasswordField(key);
                  const currentValue = changes[key] ?? value;
                  const isMasked =
                    isPassword &&
                    !editingPasswords[key] &&
                    currentValue === "********";

                  if (isMasked) {
                    return (
                      <div
                        key={key}
                        className="rounded-lg border border-gray-200 dark:border-slate-700 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-seal-navy dark:text-white">
                              {key}
                            </p>
                            {description && (
                              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                                {description}
                              </p>
                            )}
                            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 font-mono tracking-widest">
                              ••••••••
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPasswords((prev) => ({
                                ...prev,
                                [key]: true,
                              }));
                              handleChange(key, "");
                            }}
                          >
                            <PenLine className="h-3.5 w-3.5" />
                            Modifier le mot de passe
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={key}
                      className={`${isChanged ? "ring-2 ring-primary/30 rounded-lg" : ""} ${fieldError ? "ring-2 ring-red-500/50 rounded-lg" : ""}`}
                    >
                      <Input
                        label={key}
                        hint={description || undefined}
                        type={isPassword ? "password" : "text"}
                        value={currentValue}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={
                          isPassword
                            ? "Saisir le nouveau mot de passe"
                            : LDAP_DEFAULTS[key]?.value || ""
                        }
                        error={fieldError || undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>

        {changeCount > 0 && (
          <CardFooter>
            <div className="flex items-center justify-between">
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {changeCount} paramètre
                {changeCount > 1 ? "s" : ""} modifié
                {changeCount > 1 ? "s" : ""}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setChanges({})}>
                  Annuler
                </Button>
                <Button
                  onClick={() => setShowSaveConfirm(true)}
                  loading={saving}
                  disabled={hasValidationErrors}
                >
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Save confirmation dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 pt-[5vh] pb-[5vh]">
          <Card className="max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
            <CardContent className="pt-6">
              <h3 className="font-semibold text-seal-navy dark:text-white mb-4">
                Confirmer les modifications
              </h3>
              <div className="space-y-2 mb-4">
                {Object.entries(changes).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between text-xs py-1 border-b border-gray-100 dark:border-slate-700"
                  >
                    <span className="text-seal-gray-500 dark:text-slate-400 font-mono">
                      {key}
                    </span>
                    <span className="text-seal-navy dark:text-white font-semibold truncate ml-2 max-w-[200px]">
                      {key.includes("password") ||
                      key.includes("secret") ||
                      key.includes("api_key")
                        ? "••••••••"
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => {
                    setShowSaveConfirm(false);
                    handleSave();
                  }}
                >
                  Confirmer ({changeCount} modification
                  {changeCount > 1 ? "s" : ""})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSaveConfirm(false)}
                >
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* LDAP sync-all confirm dialog */}
      <ConfirmDialog
        open={showSyncAllConfirm}
        onClose={() => setShowSyncAllConfirm(false)}
        onConfirm={async () => {
          setShowSyncAllConfirm(false);
          setSyncingAll(true);
          setLdapSyncResult(null);
          toast.info(
            "Synchronisation en cours — cela peut prendre quelques minutes...",
          );
          try {
            const { data } = await api.post(
              "/ldap/sync-all",
              {},
              { timeout: 120000 },
            );
            if (data.success) {
              toast.success(data.message);
              setLdapSyncResult({
                created: data.created,
                updated: data.updated,
                deactivated: data.deactivated,
                errors: data.errors,
                total: data.total,
              });
            } else {
              toast.error(data.message);
            }
          } catch (err: any) {
            if (err.code === "ECONNABORTED") {
              toast.error(
                "Timeout — la synchronisation prend plus de temps que prévu. Vérifiez les logs.",
              );
            } else if (err.response?.status === 403) {
              toast.error(
                "Permissions insuffisantes — rôle ADMIN ou supérieur requis",
              );
            } else {
              const msg =
                err.response?.data?.message || err.message || "Erreur inconnue";
              const status = err.response?.status || "";
              toast.error(
                `Erreur de synchronisation${status ? ` (${status})` : ""} : ${msg}`,
              );
            }
          } finally {
            setSyncingAll(false);
          }
        }}
        title="Synchroniser tous les utilisateurs AD"
        description="Cela va créer les nouveaux comptes AD en tant que COLLABORATEUR et mettre à jour les comptes existants (nom, rôle selon les groupes AD). Cette opération peut prendre quelques minutes."
        confirmLabel="Synchroniser"
        variant="primary"
      />

      {/* Sticky save bar */}
      {changeCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              <span className="font-semibold text-seal-navy dark:text-white">
                {changeCount}
              </span>{" "}
              paramètre{changeCount > 1 ? "s" : ""} modifié
              {changeCount > 1 ? "s" : ""} — pensez à sauvegarder
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setChanges({})}>
                Annuler
              </Button>
              <Button
                onClick={() => setShowSaveConfirm(true)}
                loading={saving}
                disabled={hasValidationErrors}
              >
                <Save className="h-4 w-4" />
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LDAP Testing Panel (sub-component)
// ---------------------------------------------------------------------------

interface LdapTestingPanelProps {
  ldapEnabled: boolean;
  hasLdapConfig: boolean;
  lastSyncTimes: SyncTimes | null;
  ldapTestResult: {
    success: boolean;
    message: string;
    details?: any;
  } | null;
  setLdapTestResult: (
    r: { success: boolean; message: string; details?: any } | null,
  ) => void;
  ldapSyncResult: {
    created?: number;
    updated?: number;
    deactivated?: number;
    errors?: number;
    total?: number;
  } | null;
  setLdapSyncResult: (
    r: {
      created?: number;
      updated?: number;
      deactivated?: number;
      errors?: number;
      total?: number;
    } | null,
  ) => void;
  testingLdap: boolean;
  setTestingLdap: (v: boolean) => void;
  showLdapTest: "auth" | "sync" | null;
  setShowLdapTest: (v: "auth" | "sync" | null) => void;
  ldapTestEmail: string;
  setLdapTestEmail: (v: string) => void;
  ldapTestPassword: string;
  setLdapTestPassword: (v: string) => void;
  syncingAll: boolean;
  setSyncingAll: (v: boolean) => void;
  showSyncAllConfirm: boolean;
  setShowSyncAllConfirm: (v: boolean) => void;
  saving: boolean;
  onInitLdapConfig: () => void;
}

function LdapTestingPanel(props: LdapTestingPanelProps) {
  const {
    ldapEnabled,
    hasLdapConfig,
    lastSyncTimes,
    ldapTestResult,
    setLdapTestResult,
    ldapSyncResult,
    setLdapSyncResult,
    testingLdap,
    setTestingLdap,
    showLdapTest,
    setShowLdapTest,
    ldapTestEmail,
    setLdapTestEmail,
    ldapTestPassword,
    setLdapTestPassword,
    syncingAll,
    setSyncingAll,
    setShowSyncAllConfirm,
    saving,
    onInitLdapConfig,
  } = props;

  return (
    <div className="mb-6 rounded-lg border-2 border-seal-navy/20 bg-seal-navy/5 dark:bg-slate-800 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-seal-navy dark:text-white" />
          <div>
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
              Authentification LDAP Active Directory
            </h3>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
              {ldapEnabled
                ? "LDAPS est actif — les utilisateurs s'authentifient via Active Directory avec fallback local"
                : "LDAPS est désactivé — authentification locale uniquement"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {ldapEnabled ? (
            <Badge variant="approved">
              <CheckCircle2 className="h-3 w-3" />
              Active
            </Badge>
          ) : (
            <Badge variant="draft">
              <XCircle className="h-3 w-3" />
              Désactivé
            </Badge>
          )}
        </div>
      </div>
      {/* Last LDAP sync time */}
      <div className="mt-3 flex items-center gap-2 rounded-md bg-white/60 dark:bg-slate-700/50 px-3 py-2 border border-gray-200 dark:border-slate-600">
        <RefreshCw className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
        <span className="text-xs text-seal-gray-500 dark:text-slate-400">
          Dernière synchronisation LDAP :{" "}
          <span className="font-semibold text-seal-navy dark:text-white">
            {lastSyncTimes?.ldap
              ? new Date(lastSyncTimes.ldap).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Aucune synchronisation enregistrée"}
          </span>
        </span>
      </div>

      {ldapTestResult && (
        <div
          className={`mt-2 flex items-start gap-2 rounded-md px-3 py-2 border text-xs ${
            ldapTestResult.success
              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
              : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
          }`}
        >
          {ldapTestResult.success ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{ldapTestResult.message}</p>
            {ldapTestResult.details && (
              <div className="mt-1 text-[10px] opacity-80">
                {typeof ldapTestResult.details === "string" ? (
                  <pre className="whitespace-pre-wrap font-mono">
                    {ldapTestResult.details}
                  </pre>
                ) : (
                  <>
                    {ldapTestResult.details.url && (
                      <span>Serveur : {ldapTestResult.details.url}</span>
                    )}
                    {ldapTestResult.details.duration && (
                      <span className="ml-3">
                        Latence : {ldapTestResult.details.duration}ms
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setLdapTestResult(null)}
            className="ml-auto flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {ldapSyncResult && (
        <div className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Résultat de la synchronisation</p>
            <div className="flex gap-3 mt-1">
              <span>{ldapSyncResult.created ?? 0} créé(s)</span>
              <span>{ldapSyncResult.updated ?? 0} mis à jour</span>
              <span>{ldapSyncResult.deactivated ?? 0} désactivé(s)</span>
              {(ldapSyncResult.errors ?? 0) > 0 && (
                <span className="text-red-600 font-semibold">
                  {ldapSyncResult.errors} erreur(s)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setLdapSyncResult(null)}
            className="ml-auto flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {!hasLdapConfig && (
        <Button
          variant="secondary"
          className="mt-3"
          onClick={onInitLdapConfig}
          loading={saving}
        >
          <Server className="h-4 w-4" />
          Initialiser la configuration LDAPS
        </Button>
      )}

      {hasLdapConfig && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-seal-navy/10">
          <Button
            variant="primary"
            loading={testingLdap}
            onClick={async () => {
              setTestingLdap(true);
              setLdapTestResult(null);
              try {
                const { data } = await api.post("/ldap/test-connection");
                setLdapTestResult(data);
                if (data.success) {
                  toast.success(data.message);
                } else {
                  toast.error(data.message);
                }
              } catch {
                toast.error("Erreur de test");
                setLdapTestResult({
                  success: false,
                  message: "Erreur de connexion au serveur",
                });
              } finally {
                setTestingLdap(false);
              }
            }}
            className={`px-6 ${ldapTestResult ? (ldapTestResult.success ? "ring-2 ring-[#006233]/40" : "ring-2 ring-[#892034]/40") : ""}`}
          >
            {ldapTestResult ? (
              ldapTestResult.success ? (
                <CheckCircle2 className="h-4 w-4 text-white" />
              ) : (
                <XCircle className="h-4 w-4 text-white" />
              )
            ) : (
              <Server className="h-4 w-4" />
            )}
            Tester la connexion LDAPS
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const { data } = await api.get("/ldap/diagnostic");
                setLdapTestResult({
                  success: data.ready,
                  message: data.ready
                    ? "Configuration LDAP valide"
                    : `${data.issues.length} problème(s) détecté(s)`,
                  details: [
                    ...data.issues.map((i: string) => `❌ ${i}`),
                    ...(data.recommendations || []).map(
                      (r: string) => `→ ${r}`,
                    ),
                  ].join("\n"),
                });
                if (data.ready) {
                  toast.success("Diagnostic OK : configuration LDAP valide");
                } else {
                  toast.error(
                    `${data.issues.length} problème(s) — voir détails`,
                  );
                }
              } catch {
                toast.error("Erreur lors du diagnostic");
              }
            }}
          >
            <Server className="h-4 w-4" />
            Diagnostic complet
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setShowLdapTest(showLdapTest === "auth" ? null : "auth")
            }
          >
            Tester un compte utilisateur
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setShowLdapTest(showLdapTest === "sync" ? null : "sync")
            }
          >
            Synchroniser un utilisateur
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={syncingAll}
            onClick={() => setShowSyncAllConfirm(true)}
          >
            <RefreshCw
              className={`h-4 w-4${syncingAll ? " animate-spin" : ""}`}
            />
            {syncingAll
              ? "Synchronisation en cours..."
              : "Synchroniser TOUS les utilisateurs AD"}
          </Button>
        </div>
      )}
      {showLdapTest && (
        <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded border px-3 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Email"
              aria-label="Email de test LDAP"
              value={ldapTestEmail}
              onChange={(e) => setLdapTestEmail(e.target.value)}
            />
            <input
              type="password"
              className="rounded border px-3 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="Mot de passe"
              aria-label="Mot de passe de test LDAP"
              value={ldapTestPassword}
              onChange={(e) => setLdapTestPassword(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="mt-2"
            onClick={async () => {
              if (!ldapTestEmail || !ldapTestPassword) return;
              try {
                const endpoint =
                  showLdapTest === "auth"
                    ? "/ldap/test-auth"
                    : "/ldap/sync-user";
                const { data } = await api.post(endpoint, {
                  email: ldapTestEmail,
                  password: ldapTestPassword,
                });
                toast.success(data.success ? data.message : data.message);
              } catch {
                toast.error("Erreur");
              }
            }}
          >
            {showLdapTest === "auth" ? "Tester" : "Synchroniser"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync-all confirm dialog (controlled externally)
// ---------------------------------------------------------------------------

export { INTEGRATION_DEFS, CONFIG_GROUPS, LDAP_DEFAULTS };
