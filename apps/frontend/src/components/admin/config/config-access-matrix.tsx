"use client";

import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, Button, Badge } from "@omnitech/ui";
import { USER_ROLE_LABELS, UserRole } from "@omnitech/shared";
import { Save, RefreshCw, Shield, ShieldCheck, Check, X, Info } from "lucide-react";

const ACCESS_MODULES = [
  "Documents",
  "Procédures",
  "Tickets",
  "News",
  "Wiki",
  "Veille",
  "Incidents",
  "Quiz",
  "Satisfaction",
  "Helpdesk",
  "Files",
  "Signatures",
  "Certificats",
  "Annuaire",
  "Calendrier",
  "Timeline",
  "Chartes",
  "Alertes",
  "Runbooks",
  "Outils PDF",
  "Recherche",
  "KnowBe4",
  "Conformité",
  "Workflows",
  "Médiathèque",
  "Avis & satisfaction",
  "Monitoring",
  "Admin",
] as const;

const ACCESS_MODULE_DESCRIPTIONS: Record<string, string> = {
  Documents:
    "GED ISO 27001 : création, revue, approbation et archivage des documents réglementaires",
  Procédures: "Procédures opérationnelles et modes opératoires",
  Tickets: "Système de tickets pour le support interne et la gestion des demandes",
  News: "Actualités et communications internes de l'entreprise",
  Wiki: "Base de connaissances collaborative et documentation interne",
  Veille: "Veille cyber : CVE, alertes ANSSI, bulletins CERT, threat intelligence",
  Incidents: "Déclaration et suivi des incidents de sécurité (ISO 27001 A.5.24)",
  Quiz: "Quiz de sensibilisation à la sécurité avec gamification et certificats",
  Satisfaction: "Enquêtes de satisfaction interne et suivi NPS",
  Helpdesk: "Support IT / Chatbot IA avec base de connaissances et RAG",
  Files: "Stockage et partage de fichiers sécurisé (SMB)",
  Signatures: "Signature électronique de documents via DocuSeal",
  Certificats: "Gestion des certifications de formation (internes, externes, KnowBe4)",
  Annuaire: "Annuaire des collaborateurs et organigramme",
  Calendrier: "Calendrier événements : réunions, formations, audits",
  Timeline: "Vue chronologique unifiée news + notifications + documents",
  Chartes: "Chartes et politiques à signer électroniquement",
  Alertes: "Alertes de sécurité critiques et notifications P1",
  Runbooks: "Runbooks opérationnels et procédures automatisées",
  "Outils PDF": "Manipulation PDF : merge, split, compression via Stirling",
  Recherche: "Recherche globale avec filtres intelligents et IA",
  KnowBe4: "Intégration KnowBe4 : sync formations, campagnes, certificats",
  Conformité: "Module conformité ISO 27001 : contrôles, couverture, planning",
  Workflows: "Workflows d'approbation configurables (ISO 27001 A.5.1)",
  Médiathèque:
    "Galerie photos & vidéos gérée par l'équipe Marketing (canManageMedia requis pour upload)",
  "Avis & satisfaction": "Modération des témoignages collaborateurs + enquêtes de satisfaction",
  Monitoring:
    "Monitoring système (CPU/RAM/disque) + utilisation intranet + stockage par utilisateur",
  Admin: "Administration système : configuration, utilisateurs, rôles et paramètres",
};

const ACCESS_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "DIRECTION",
  "MANAGER",
  "REVIEWER",
  "AUDITEUR",
  "COLLABORATEUR",
  "PRESTATAIRE",
] as const;

const ACCESS_ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: "Accès total au système, gestion de tous les paramètres et utilisateurs",
  ADMIN: "Administration courante, gestion des utilisateurs et de la configuration",
  DIRECTION: "Supervision stratégique, accès à tous les modules sauf administration",
  MANAGER:
    "Encadrement intermédiaire : gestion d'espaces ticketing, publication runbooks, validation 1er niveau",
  REVIEWER: "Revue et validation des documents, accès étendu en lecture",
  AUDITEUR: "Accès en lecture pour audit et conformité, sans modification",
  COLLABORATEUR: "Accès standard aux outils collaboratifs du quotidien",
  PRESTATAIRE: "Accès restreint aux modules nécessaires pour les intervenants externes",
};

const ADMIN_LEVEL_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "DIRECTION"]);

const ACCESS_MATRIX: Record<string, Set<string>> = {
  SUPER_ADMIN: new Set(ACCESS_MODULES),
  ADMIN: new Set(ACCESS_MODULES),
  DIRECTION: new Set([
    "Documents",
    "Procédures",
    "Tickets",
    "News",
    "Wiki",
    "Veille",
    "Incidents",
    "Quiz",
    "Satisfaction",
    "Helpdesk",
    "Files",
    "Signatures",
    "Certificats",
    "Annuaire",
    "Calendrier",
    "Timeline",
    "Chartes",
    "Alertes",
    "Runbooks",
    "Recherche",
    "Conformité",
    "Médiathèque",
    "Avis & satisfaction",
    "Monitoring",
  ]),
  MANAGER: new Set([
    "Documents",
    "Procédures",
    "Tickets",
    "News",
    "Wiki",
    "Veille",
    "Incidents",
    "Quiz",
    "Satisfaction",
    "Helpdesk",
    "Files",
    "Signatures",
    "Certificats",
    "Annuaire",
    "Calendrier",
    "Timeline",
    "Chartes",
    "Alertes",
    "Runbooks",
    "Outils PDF",
    "Recherche",
    "Médiathèque",
  ]),
  REVIEWER: new Set([
    "Documents",
    "Procédures",
    "Tickets",
    "News",
    "Wiki",
    "Veille",
    "Incidents",
    "Quiz",
    "Satisfaction",
    "Helpdesk",
    "Files",
    "Signatures",
    "Certificats",
    "Annuaire",
    "Calendrier",
    "Timeline",
    "Chartes",
    "Alertes",
    "Runbooks",
    "Recherche",
    "Médiathèque",
  ]),
  AUDITEUR: new Set([
    "Documents",
    "Procédures",
    "Tickets",
    "News",
    "Wiki",
    "Veille",
    "Incidents",
    "Quiz",
    "Satisfaction",
    "Files",
    "Certificats",
    "Annuaire",
    "Calendrier",
    "Timeline",
    "Chartes",
    "Alertes",
    "Recherche",
    "Conformité",
    "Médiathèque",
  ]),
  COLLABORATEUR: new Set([
    "Documents",
    "Procédures",
    "Tickets",
    "News",
    "Wiki",
    "Veille",
    "Quiz",
    "Satisfaction",
    "Helpdesk",
    "Files",
    "Signatures",
    "Certificats",
    "Annuaire",
    "Calendrier",
    "Timeline",
    "Chartes",
    "Alertes",
    "Recherche",
    "Outils PDF",
    "Médiathèque",
  ]),
  PRESTATAIRE: new Set(["Documents", "Tickets", "Files", "Signatures", "Certificats", "Helpdesk"]),
};

const DEFAULT_ACCESS_MATRIX_OBJ: Record<string, string[]> = Object.fromEntries(
  Object.entries(ACCESS_MATRIX).map(([role, mods]) => [role, [...mods]]),
);

function matrixObjToSets(obj: Record<string, string[]>): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {};
  for (const [role, mods] of Object.entries(obj)) {
    result[role] = new Set(mods);
  }
  return result;
}

function matrixSetsToObj(sets: Record<string, Set<string>>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [role, modSet] of Object.entries(sets)) {
    result[role] = [...modSet];
  }
  return result;
}

/**
 * Matrice documentaire (audit ISO 27001 A.5.15).
 * Le RBAC modules effectif se configure dans /admin/access (Option B).
 */
export function ConfigAccessMatrix() {
  const [editableMatrix, setEditableMatrix] = useState<Record<string, Set<string>>>(
    matrixObjToSets(DEFAULT_ACCESS_MATRIX_OBJ),
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/config/access_matrix")
      .then(({ data }) => {
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value) as Record<string, string[]>;
            setEditableMatrix(matrixObjToSets(parsed));
          } catch {
            // fallback defaults
          }
        }
      })
      .catch(() => {
        // Key not yet saved, use defaults
      });
  }, []);

  const handleToggleCell = (role: string, mod: string) => {
    setEditableMatrix((prev) => {
      const next = { ...prev };
      const roleSet = new Set(next[role] || []);
      if (roleSet.has(mod)) {
        roleSet.delete(mod);
      } else {
        roleSet.add(mod);
      }
      next[role] = roleSet;
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = matrixSetsToObj(editableMatrix);
      await api.patch("/config/access_matrix", {
        value: JSON.stringify(payload),
      });
      toast.success("Matrice des accès sauvegardée");
      setDirty(false);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Erreur lors de la sauvegarde de la matrice",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setEditableMatrix(matrixObjToSets(DEFAULT_ACCESS_MATRIX_OBJ));
    setDirty(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-900/10 p-3">
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-seal-gray-500 dark:text-slate-300">
            <strong>Matrice documentaire (audit ISO 27001 A.5.15).</strong> Pour configurer le RBAC
            modules effectif (rôle, département, utilisateur), rendez-vous sur{" "}
            <a href="/admin/access" className="text-primary underline font-medium">
              /admin/access
            </a>
            .
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-seal-navy dark:text-blue-400" />
              <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                Matrice des accès
              </h2>
            </div>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
              Cliquez sur une cellule pour modifier les permissions par role et module
            </p>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RefreshCw className="h-3.5 w-3.5" /> Réinitialiser
                </Button>
                <Button size="sm" onClick={handleSave} loading={saving}>
                  <Save className="h-3.5 w-3.5" /> Sauvegarder
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-slate-700">
                <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap">
                  Role
                </th>
                <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap min-w-[180px]">
                  Description
                </th>
                {ACCESS_MODULES.map((mod) => (
                  <th
                    key={mod}
                    className="px-2 py-2 font-semibold text-seal-navy dark:text-white text-center whitespace-nowrap group relative"
                  >
                    <span className="cursor-help border-b border-dotted border-seal-navy/30 dark:border-slate-500">
                      {mod}
                    </span>
                    <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block w-52 pointer-events-none">
                      <div className="bg-seal-navy dark:bg-slate-900 text-white text-[10px] font-normal leading-snug rounded-lg px-3 py-2 shadow-lg text-left whitespace-normal">
                        <p className="font-semibold mb-0.5">{mod}</p>
                        <p className="opacity-80">{ACCESS_MODULE_DESCRIPTIONS[mod] || mod}</p>
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-seal-navy dark:bg-slate-900" />
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ACCESS_ROLES.map((role, roleIdx) => {
                const isAdminLevel = ADMIN_LEVEL_ROLES.has(role);
                const isLastAdmin =
                  isAdminLevel && !ADMIN_LEVEL_ROLES.has(ACCESS_ROLES[roleIdx + 1] || "");
                return (
                  <tr
                    key={role}
                    className={`border-b transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                      isAdminLevel
                        ? "bg-amber-50/40 dark:bg-amber-900/5 border-amber-100 dark:border-amber-900/20"
                        : "border-gray-100 dark:border-slate-800"
                    } ${isLastAdmin ? "border-b-2 border-b-amber-200 dark:border-b-amber-800/40" : ""}`}
                  >
                    <td className="py-2.5 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {isAdminLevel && (
                          <Shield className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        )}
                        <Badge
                          variant={
                            role === "SUPER_ADMIN"
                              ? "error"
                              : role === "ADMIN"
                                ? "warning"
                                : role === "DIRECTION"
                                  ? "primary"
                                  : role === "MANAGER"
                                    ? "primary"
                                    : role === "REVIEWER"
                                      ? "info"
                                      : "navy"
                          }
                        >
                          {USER_ROLE_LABELS[role as UserRole] || role}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-[10px] text-seal-gray-500 dark:text-slate-400 leading-snug">
                      {ACCESS_ROLE_DESCRIPTIONS[role] || ""}
                    </td>
                    {ACCESS_MODULES.map((mod) => {
                      const hasAccess = editableMatrix[role]?.has(mod) ?? false;
                      return (
                        <td key={mod} className="px-2 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleCell(role, mod)}
                            className="focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-full transition-transform hover:scale-110"
                            title={
                              hasAccess
                                ? `Retirer l'acces ${mod} pour ${USER_ROLE_LABELS[role as UserRole] || role}`
                                : `Autoriser l'acces ${mod} pour ${USER_ROLE_LABELS[role as UserRole] || role}`
                            }
                            aria-label={
                              hasAccess
                                ? `Retirer l'accès ${mod} pour ${USER_ROLE_LABELS[role as UserRole] || role}`
                                : `Autoriser l'accès ${mod} pour ${USER_ROLE_LABELS[role as UserRole] || role}`
                            }
                            aria-pressed={hasAccess}
                          >
                            {hasAccess ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 dark:bg-red-900/10">
                                <X className="h-3.5 w-3.5 text-red-300 dark:text-red-500/50" />
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Légende */}
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
          <h4 className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-2.5">
            Légende
          </h4>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              </span>
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Accès autorisé (cliquer pour retirer)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 dark:bg-red-900/10">
                <X className="h-3 w-3 text-red-300 dark:text-red-500/50" />
              </span>
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Accès refusé (cliquer pour autoriser)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Niveau administrateur (lignes surlignees)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-400 border-b border-dotted border-seal-gray-500/30 cursor-help">
                Module
              </span>
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Survoler pour voir la description
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
