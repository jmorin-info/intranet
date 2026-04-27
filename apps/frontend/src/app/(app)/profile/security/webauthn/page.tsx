"use client";

import React, { useEffect, useState } from "react";
import {
  startRegistration,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Input,
  Badge,
} from "@omnitech/ui";
import {
  Key,
  Trash2,
  Plus,
  ShieldCheck,
  Smartphone,
  Usb,
  Cloud,
} from "lucide-react";

type Credential = {
  id: string;
  label: string | null;
  deviceType: string | null;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
};

export default function WebAuthnPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const supported =
    typeof window !== "undefined" && browserSupportsWebAuthn();

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Credential[]>(
        "/mfa/webauthn/credentials",
      );
      setCredentials(data);
    } catch (err) {
      logger.error(err, { page: "webauthn", context: "list" });
      toast.error("Impossible de charger les clés");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleRegister = async () => {
    if (!supported) {
      toast.error("Votre navigateur ne supporte pas WebAuthn");
      return;
    }
    setRegistering(true);
    try {
      const { data: options } = await api.post(
        "/mfa/webauthn/register/options",
      );
      const attResp = await startRegistration({ optionsJSON: options });
      await api.post("/mfa/webauthn/register/verify", {
        response: attResp,
        label: newLabel.trim() || undefined,
      });
      toast.success("Clé enregistrée avec succès");
      setNewLabel("");
      await refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Échec de l'enrôlement";
      // Cas fréquent : l'utilisateur a annulé la demande système — silencieux.
      if (message.includes("cancel") || message.includes("NotAllowed")) {
        toast.info("Enrôlement annulé");
      } else {
        logger.error(err, { page: "webauthn", context: "register" });
        toast.error(message);
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string, label: string | null) => {
    if (
      !window.confirm(
        `Supprimer la clé "${label ?? "sans nom"}" ? Vous ne pourrez plus l'utiliser pour vous connecter.`,
      )
    ) {
      return;
    }
    try {
      await api.delete(`/mfa/webauthn/credentials/${id}`);
      toast.success("Clé supprimée");
      await refresh();
    } catch (err) {
      logger.error(err, { page: "webauthn", context: "delete" });
      toast.error("Suppression impossible");
    }
  };

  const transportIcon = (transports: string[]) => {
    if (transports.includes("internal")) return <Smartphone className="h-4 w-4" />;
    if (transports.includes("usb")) return <Usb className="h-4 w-4" />;
    return <Key className="h-4 w-4" />;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-seal-navy dark:text-white">
          Clés de sécurité (WebAuthn / FIDO2)
        </h1>
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
          Authentifiez-vous avec une clé matérielle (YubiKey), un capteur
          biométrique (Touch ID, Windows Hello) ou une passkey synchronisée.
          Plus sûr que le code TOTP — phishing-resistant.
        </p>
      </div>

      {!supported && (
        <Card className="border-amber-300">
          <CardContent className="py-4 text-sm text-amber-700 dark:text-amber-300">
            Votre navigateur ne supporte pas WebAuthn. Utilisez Chrome, Firefox,
            Edge ou Safari à jour.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#F68D2E]" /> Ajouter une clé
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            label="Nom de la clé (optionnel)"
            placeholder="Ex : YubiKey bureau, iPhone perso"
            value={newLabel}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setNewLabel(e.target.value.slice(0, 80))
            }
            disabled={registering}
          />
          <Button
            onClick={handleRegister}
            loading={registering}
            disabled={!supported}
            className="w-full"
          >
            <ShieldCheck className="h-4 w-4" /> Enregistrer une nouvelle clé
          </Button>
          <p className="text-xs text-seal-gray-500 dark:text-slate-500">
            Votre navigateur va vous demander d&apos;insérer/toucher la clé ou
            d&apos;utiliser votre biométrie.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-seal-navy dark:text-white">
            Mes clés enregistrées
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="shimmer h-20 rounded-lg" />
          ) : credentials.length === 0 ? (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 py-4 text-center">
              Aucune clé enregistrée.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-700">
              {credentials.map((c) => (
                <li
                  key={c.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                      {transportIcon(c.transports)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-seal-navy dark:text-white truncate">
                        {c.label || "Clé sans nom"}
                      </p>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                        Ajoutée le{" "}
                        {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                        {c.lastUsedAt &&
                          ` • Dernière utilisation ${new Date(
                            c.lastUsedAt,
                          ).toLocaleDateString("fr-FR")}`}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {c.backedUp && (
                          <Badge variant="info" className="text-[10px]">
                            <Cloud className="h-3 w-3" /> Synchronisée
                          </Badge>
                        )}
                        {c.deviceType === "singleDevice" && (
                          <Badge variant="draft" className="text-[10px]">
                            Clé physique
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(c.id, c.label)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
