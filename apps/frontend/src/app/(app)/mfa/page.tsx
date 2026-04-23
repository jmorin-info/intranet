"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { UserRole } from "@omnitech/shared";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  Input,
  Badge,
  Dialog,
} from "@omnitech/ui";
import {
  Shield,
  Smartphone,
  CheckCircle2,
  QrCode,
  Key,
  AlertTriangle,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export default function MfaPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<"intro" | "setup" | "verify" | "done">(
    "intro",
  );
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showManualSecret, setShowManualSecret] = useState(false);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [disableMethod, setDisableMethod] = useState<"password" | "code">(
    "password",
  );
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const isSuperAdmin = user?.role === UserRole.SUPER_ADMIN;

  // Check MFA status on load
  React.useEffect(() => {
    setStatusLoading(true);
    api
      .get("/mfa/status")
      .then(({ data }) => {
        setMfaEnabled(data.mfaEnabled);
        setLastLoginAt(data.lastLoginAt || null);
        if (data.mfaEnabled) setStep("done");
      })
      .catch(console.error)
      .finally(() => setStatusLoading(false));
  }, []);

  const handleSetup = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/mfa/setup");
      setQrCode(data.qrCodeDataUrl);
      setSecret(data.secret);
      setStep("setup");
    } catch {
      toast.error("Erreur lors de la configuration MFA");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error("Le code doit faire 6 chiffres");
      return;
    }
    setLoading(true);
    try {
      await api.post("/mfa/activate", { code });
      toast.success("MFA activé avec succès");
      setStep("done");
      setMfaEnabled(true);
      // Clear prestataire MFA setup flag (no longer required)
      localStorage.removeItem("mfaSetupRequired");

      // Generate backup codes after successful activation
      try {
        const { data } = await api.post("/mfa/backup-codes");
        setBackupCodes(data.codes || []);
      } catch {
        // Non-blocking if backup codes endpoint is unavailable
      }
    } catch {
      toast.error(t("mfa.invalidCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setRegenerating(true);
    try {
      const { data } = await api.post("/mfa/backup-codes");
      setBackupCodes(data.codes || []);
      toast.success("Nouveaux codes de secours générés");
    } catch {
      toast.error("Impossible de régénérer les codes de secours");
    } finally {
      setRegenerating(false);
    }
  };

  const handleDisable = async () => {
    if (!user?.id) return;
    const body =
      disableMethod === "password"
        ? { password: disablePassword }
        : { code: disableCode };
    if (disableMethod === "password" && !disablePassword) {
      toast.error("Saisissez votre mot de passe");
      return;
    }
    if (disableMethod === "code" && disableCode.length < 6) {
      toast.error("Saisissez un code TOTP (6 chiffres) ou un code de secours");
      return;
    }
    setLoading(true);
    try {
      await api.post("/mfa/disable/me", body);
      toast.success("MFA désactivé");
      setShowDisableConfirm(false);
      setDisablePassword("");
      setDisableCode("");
      setStep("intro");
      setMfaEnabled(false);
      setBackupCodes([]);
      setCode("");
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        toast.error("Mot de passe ou code MFA invalide");
      } else if (status === 400) {
        toast.error(err?.response?.data?.message || "Requête invalide");
      } else {
        toast.error("Erreur lors de la désactivation du MFA");
      }
    } finally {
      setLoading(false);
    }
  };

  const closeDisableDialog = () => {
    if (loading) return;
    setShowDisableConfirm(false);
    setDisablePassword("");
    setDisableCode("");
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white">
            Authentification MFA
          </h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            Double authentification TOTP
          </p>
        </div>
      </div>

      {step === "intro" && (
        <Card>
          <CardContent className="text-center py-8">
            <Shield className="h-16 w-16 text-[#F68D2E] mx-auto mb-4" />
            <h2 className="text-lg font-medium text-seal-navy dark:text-white mb-2">
              Protégez votre compte
            </h2>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 max-w-sm mx-auto mb-4">
              Activez la double authentification avec une application TOTP.
            </p>

            {/* Recommended authenticator apps */}
            <div className="flex justify-center gap-4 my-6">
              <div className="text-center">
                <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-1">
                  <Shield className="h-6 w-6 text-blue-600" />
                </div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Microsoft
                  <br />
                  Authenticator
                </p>
              </div>
              <div className="text-center">
                <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-1">
                  <Key className="h-6 w-6 text-green-600" />
                </div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Google
                  <br />
                  Authenticator
                </p>
              </div>
              <div className="text-center">
                <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-1">
                  <Smartphone className="h-6 w-6 text-purple-600" />
                </div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Aegis /<br />
                  FreeOTP
                </p>
              </div>
            </div>

            {/* Setup steps preview */}
            <div className="flex items-center justify-center gap-2 mb-6 text-xs text-seal-gray-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-[10px]">
                  1
                </span>
                Scanner QR
              </span>
              <span className="h-px w-6 bg-gray-300 dark:bg-slate-600" />
              <span className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-[10px]">
                  2
                </span>
                Vérifier code
              </span>
              <span className="h-px w-6 bg-gray-300 dark:bg-slate-600" />
              <span className="flex items-center gap-1.5">
                <span className="h-5 w-5 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-[10px]">
                  3
                </span>
                Codes de secours
              </span>
            </div>

            <Button onClick={handleSetup} loading={loading}>
              <Smartphone className="h-4 w-4" /> Configurer le MFA
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "setup" && (
        <Card>
          <CardHeader>
            {/* Step progress indicator */}
            <div className="flex items-center justify-center gap-0 mb-4">
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-7 rounded-full bg-primary text-white font-semibold flex items-center justify-center text-xs">
                  1
                </div>
                <span className="text-xs font-semibold text-primary">
                  Scanner QR
                </span>
              </div>
              <div className="h-px w-8 bg-primary mx-2" />
              <div className="flex items-center gap-1.5">
                <div
                  className={`h-7 w-7 rounded-full font-semibold flex items-center justify-center text-xs ${code.length === 6 ? "bg-primary text-white" : "bg-gray-200 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400"}`}
                >
                  2
                </div>
                <span
                  className={`text-xs font-semibold ${code.length === 6 ? "text-primary" : "text-seal-gray-500 dark:text-slate-400"}`}
                >
                  Vérifier
                </span>
              </div>
              <div className="h-px w-8 bg-gray-300 dark:bg-slate-600 mx-2" />
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-7 rounded-full bg-gray-200 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400 font-semibold flex items-center justify-center text-xs">
                  3
                </div>
                <span className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400">
                  Codes secours
                </span>
              </div>
            </div>
            <h2 className="font-semibold text-seal-navy dark:text-white flex items-center gap-2">
              <QrCode className="h-5 w-5 text-[#F68D2E]" /> Scannez le QR code
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              Ouvrez votre application TOTP et scannez ce QR code :
            </p>
            {qrCode && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCode}
                  alt="Scannez ce QR code avec votre application d'authentification"
                  className="w-48 h-48 rounded-lg border"
                />
              </div>
            )}

            {/* Manual secret toggle */}
            <div>
              <button
                onClick={() => setShowManualSecret(!showManualSecret)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Key className="h-3 w-3" />
                {showManualSecret ? "Masquer la clé" : "Entrer manuellement"}
              </button>
              {showManualSecret && (
                <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3 mt-2">
                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 mb-1">
                    Clé secrète (saisie manuelle) :
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-sm text-seal-navy dark:text-white break-all flex-1">
                      {secret}
                    </p>
                    <button
                      onClick={() => {
                        if (navigator.clipboard?.writeText) {
                          navigator.clipboard
                            .writeText(secret)
                            .then(() => toast.success("Clé copiée"));
                        }
                      }}
                      className="text-xs text-primary hover:underline flex-shrink-0"
                    >
                      Copier
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
              <Input
                label="Code de vérification (6 chiffres)"
                placeholder="000000"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="text-center text-2xl font-mono tracking-[0.5em]"
              />
            </div>
          </CardContent>
          <CardFooter>
            <div className="flex justify-between w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("intro");
                  setShowManualSecret(false);
                }}
              >
                Annuler
              </Button>
              <Button
                onClick={handleVerify}
                loading={loading}
                disabled={code.length !== 6}
              >
                <CheckCircle2 className="h-4 w-4" /> Activer le MFA
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {step === "done" && (
        <Card>
          <CardContent className="text-center py-8">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-seal-navy dark:text-white mb-2">
              MFA actif
            </h2>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-2">
              Votre compte est protégé par la double authentification.
            </p>
            <div className="flex items-center justify-center gap-2 mb-6">
              <Badge variant="success">Activé</Badge>
              {lastLoginAt && (
                <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Dernière connexion :{" "}
                  {new Date(lastLoginAt).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>
            {isSuperAdmin ? (
              <Button
                variant="outline"
                onClick={() => setShowDisableConfirm(true)}
                loading={loading}
              >
                Désactiver le MFA
              </Button>
            ) : (
              <div className="text-xs text-seal-gray-500 dark:text-slate-400 flex items-center justify-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Contactez un administrateur pour désactiver le MFA
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Backup codes reminder - shown when MFA is active but no codes displayed */}
      {step === "done" && backupCodes.length === 0 && (
        <Card className="border border-amber-200 dark:border-amber-800">
          <CardContent className="py-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                <Key className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-1">
                  Codes de secours
                </h3>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3">
                  Les codes de secours vous permettent de vous connecter si vous
                  perdez l&apos;accès à votre application TOTP. Conservez-les
                  dans un endroit sûr (gestionnaire de mots de passe,
                  coffre-fort).
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRegenerateBackupCodes}
                    loading={regenerating}
                  >
                    <Key className="h-3.5 w-3.5" /> Régénérer les codes
                  </Button>
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                    <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                    {t("mfa.codesInvalidated")}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {backupCodes.length > 0 && (
        <Card className="border-2 border-amber-400">
          <CardHeader>
            <h3 className="font-semibold text-seal-navy dark:text-white">
              Codes de secours
            </h3>
            <p className="text-xs text-amber-600">
              Conservez ces codes en lieu sûr. Ils ne seront plus affichés.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {backupCodes.map((code, i) => (
                <div
                  key={i}
                  className="bg-gray-100 dark:bg-slate-800 px-3 py-2 rounded font-mono text-sm text-center"
                >
                  {code}
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleRegenerateBackupCodes}
                loading={regenerating}
              >
                <Key className="h-3.5 w-3.5" /> Régénérer les codes
              </Button>
            </div>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => {
                const text = backupCodes.join("\n");
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard
                    .writeText(text)
                    .then(() => toast.success("Codes copiés"))
                    .catch(() => toast.error("Copie impossible"));
                } else {
                  const ta = document.createElement("textarea");
                  ta.value = text;
                  ta.style.position = "fixed";
                  ta.style.opacity = "0";
                  document.body.appendChild(ta);
                  ta.select();
                  try {
                    document.execCommand("copy");
                    toast.success("Codes copiés");
                  } catch {
                    toast.error("Copie impossible — copiez manuellement");
                  }
                  document.body.removeChild(ta);
                }
              }}
            >
              Copier les codes
            </Button>
          </CardContent>
        </Card>
      )}
      <Dialog
        open={showDisableConfirm}
        onClose={closeDisableDialog}
        title="Désactiver le MFA"
        description="Confirmez votre identité pour désactiver la double authentification. Votre compte sera ensuite moins sécurisé."
      >
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={disableMethod === "password" ? "primary" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setDisableMethod("password")}
              disabled={loading}
            >
              Mot de passe
            </Button>
            <Button
              type="button"
              variant={disableMethod === "code" ? "primary" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setDisableMethod("code")}
              disabled={loading}
            >
              Code TOTP / secours
            </Button>
          </div>

          {disableMethod === "password" ? (
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Mot de passe du compte"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDisable()}
              disabled={loading}
            />
          ) : (
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code TOTP à 6 chiffres ou code de secours"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.trim())}
              onKeyDown={(e) => e.key === "Enter" && handleDisable()}
              disabled={loading}
            />
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={closeDisableDialog}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button variant="danger" onClick={handleDisable} loading={loading}>
              Désactiver
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
