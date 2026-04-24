'use client';

/**
 * Page unifiée « Accès & modules » (/admin/access) — fusion de l'ancienne
 * matrice documentaire de /admin/config et de /admin/spaces dans une seule
 * page à trois onglets. Voir docs/architecture/ACCESS_AND_SPACES_UNIFICATION.md
 * (Option B).
 *
 * Deep-link :
 *   /admin/access?tab=roles        (défaut) — Rôles & hiérarchie
 *   /admin/access?tab=departments  — Départements & modules
 *   /admin/access?tab=users        — Override par utilisateur (ex-/admin/spaces)
 *
 * Source de vérité unique : table SpaceAccessConfig
 * (backend `apps/backend/src/spaces/spaces.service.ts`, scopes GLOBAL, ROLE,
 * DEPARTMENT, USER — priorité USER > ROLE > DEPARTMENT > GLOBAL).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  KeyRound,
  Users as UsersIcon,
  Building2,
  ShieldCheck,
  Shield,
  Check,
  X,
  Save,
  RefreshCw,
  Lock,
  Info,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Tabs,
  Skeleton,
  Select,
} from '@omnitech/ui';
import { UserRole, ROLE_HIERARCHY, USER_ROLE_LABELS } from '@omnitech/shared';
import { PageHeader } from '@/components/layout/page-header';
import { RoleGuard } from '@/components/role-guard';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { api } from '@/lib/api';
import { toast } from 'sonner';

// ── Types ────────────────────────────────────────────────────────────

type AccessTab = 'roles' | 'departments' | 'users';

interface ModuleDef {
  code: string;
  label: string;
  alwaysOn?: boolean;
  section?: string;
}

interface SpaceConfig {
  id: string;
  module: string;
  scopeType: 'GLOBAL' | 'DEPARTMENT' | 'ROLE' | 'USER';
  scopeValue: string | null;
  enabled: boolean;
}

interface Department {
  id: string;
  name: string;
  code: string;
  _count?: { users?: number };
  managers?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  }>;
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  departmentId?: string | null;
  department?: { id: string; name: string } | null;
}

interface DeptAccessModule {
  code: string;
  label: string;
  section?: string;
  alwaysOn: boolean;
  explicit: boolean;
  enabled: boolean;
}

// ── Hiérarchie & capacités documentaires ─────────────────────────────

const ROLES_BY_LEVEL: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.DIRECTION,
  UserRole.MANAGER,
  UserRole.REVIEWER,
  UserRole.COLLABORATEUR,
  UserRole.AUDITEUR,
  UserRole.PRESTATAIRE,
];

const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]:
    'Accès total au système — gestion de tous les paramètres, utilisateurs, politiques.',
  [UserRole.ADMIN]:
    'Administration courante — gestion des utilisateurs, configuration, RBAC opérationnel.',
  [UserRole.DIRECTION]:
    'Supervision stratégique — accès à tous les modules métiers, sans administration système.',
  [UserRole.MANAGER]:
    'Encadrement — gestion d\'espaces ticketing, publication runbooks, validation 1er niveau.',
  [UserRole.REVIEWER]:
    'Revue et validation des documents, accès étendu en lecture.',
  [UserRole.COLLABORATEUR]:
    'Accès standard aux outils collaboratifs du quotidien.',
  [UserRole.AUDITEUR]:
    'Lecture seule pour audit et conformité — aucune modification.',
  [UserRole.PRESTATAIRE]:
    'Accès restreint aux modules nécessaires pour les intervenants externes.',
};

// Capacités canoniques (documentaires, alignées avec les @Roles() backend).
// Coché = "autorisé par défaut pour ce rôle" (simplification lecture seule).
interface Capability {
  id: string;
  label: string;
  description: string;
  minRole: UserRole;
}

const CAPABILITIES: Capability[] = [
  {
    id: 'docs.read',
    label: 'Lire les documents',
    description: 'Consultation GED (tous rôles authentifiés).',
    minRole: UserRole.PRESTATAIRE,
  },
  {
    id: 'docs.create',
    label: 'Créer des documents',
    description: 'Rédaction & dépôt en brouillon.',
    minRole: UserRole.COLLABORATEUR,
  },
  {
    id: 'docs.review',
    label: 'Reviewer documents',
    description: 'Valider une revue (ISO 27001 A.5.1).',
    minRole: UserRole.REVIEWER,
  },
  {
    id: 'docs.approve',
    label: 'Approuver documents',
    description: 'Approbation finale (signature DOA).',
    minRole: UserRole.DIRECTION,
  },
  {
    id: 'users.manage',
    label: 'Gérer utilisateurs',
    description: 'Création / modification / désactivation des comptes.',
    minRole: UserRole.ADMIN,
  },
  {
    id: 'config.system',
    label: 'Configuration système',
    description: 'Accès à /admin/config (LDAP, SMTP, intégrations).',
    minRole: UserRole.SUPER_ADMIN,
  },
  {
    id: 'audit.read',
    label: "Lire le journal d'audit",
    description: 'Consultation des traces ISO 27001 A.5.36.',
    minRole: UserRole.ADMIN,
  },
  {
    id: 'tickets.manage',
    label: 'Gérer les espaces ticketing',
    description: 'Ownership + configuration SLA des espaces tickets.',
    minRole: UserRole.MANAGER,
  },
  {
    id: 'incidents.declare',
    label: 'Déclarer un incident',
    description: 'Ouverture d\'un incident (ISO 27001 A.5.24).',
    minRole: UserRole.COLLABORATEUR,
  },
  {
    id: 'compliance.edit',
    label: 'Éditer les contrôles ISO',
    description: 'Modifier la couverture / statut des contrôles.',
    minRole: UserRole.REVIEWER,
  },
  {
    id: 'access.reviews',
    label: "Lancer une revue d'accès",
    description: 'Campagne ISO 27001 A.5.18.',
    minRole: UserRole.SUPER_ADMIN,
  },
];

function roleHasCapability(role: UserRole, cap: Capability): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[cap.minRole];
}

// ── Section labels ───────────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
  monEspace: 'Mon espace',
  work: 'Travail & connaissance',
  security: 'Sécurité & conformité',
  admin: 'Administration',
  transverse: 'Transversal',
};

const SECTION_ORDER = ['monEspace', 'work', 'security', 'admin', 'transverse'];

// ── Page ─────────────────────────────────────────────────────────────

function isAccessTab(value: string | null): value is AccessTab {
  return value === 'roles' || value === 'departments' || value === 'users';
}

export default function AdminAccessPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: AccessTab = isAccessTab(tabParam) ? tabParam : 'roles';

  const handleTabChange = useCallback(
    (tabId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === 'roles') {
        params.delete('tab');
      } else {
        params.set('tab', tabId);
      }
      const query = params.toString();
      router.replace(query ? `/admin/access?${query}` : '/admin/access');
    },
    [router, searchParams],
  );

  const tabs = useMemo(
    () => [
      {
        id: 'roles',
        label: 'Rôles & hiérarchie',
        icon: <ShieldCheck className="h-4 w-4" />,
      },
      {
        id: 'departments',
        label: 'Départements',
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        id: 'users',
        label: 'Utilisateurs',
        icon: <UsersIcon className="h-4 w-4" />,
      },
    ],
    [],
  );

  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <AdminGroupTabs group="identity" />

        <PageHeader
          title="Accès & modules"
          subtitle="Source unique de vérité RBAC modules (rôles, départements, utilisateurs). ISO 27001 A.5.15 / A.5.18."
          icon={KeyRound}
          hub="admin"
          meta={
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={handleTabChange}
            />
          }
        />

        {activeTab === 'roles' && <RolesTab />}
        {activeTab === 'departments' && <DepartmentsTab />}
        {activeTab === 'users' && <UsersTab />}
      </div>
    </RoleGuard>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Onglet 1 — Rôles & hiérarchie
// ─────────────────────────────────────────────────────────────────────

function RolesTab() {
  return (
    <div className="space-y-6">
      {/* Hiérarchie des rôles */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
              Hiérarchie des rôles ({ROLES_BY_LEVEL.length} niveaux)
            </h2>
          </div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
            Chaque rôle hérite des capacités des rôles de niveau inférieur.
            Source : <code className="font-mono">packages/shared/src/constants.ts</code>
            {' '}(ROLE_HIERARCHY) — miroir <code className="font-mono">apps/backend/src/common/enums.ts</code>.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-slate-700">
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Niveau
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Rôle
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLES_BY_LEVEL.map((role) => {
                  const level = ROLE_HIERARCHY[role];
                  const isAdminLevel = level >= ROLE_HIERARCHY[UserRole.ADMIN];
                  return (
                    <tr
                      key={role}
                      className={`border-b border-gray-100 dark:border-slate-800 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                        isAdminLevel
                          ? 'bg-amber-50/40 dark:bg-amber-900/5'
                          : ''
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-mono text-seal-gray-500 dark:text-slate-400">
                        {level}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isAdminLevel && (
                            <Shield className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          )}
                          <Badge
                            variant={
                              role === UserRole.SUPER_ADMIN
                                ? 'error'
                                : role === UserRole.ADMIN
                                  ? 'warning'
                                  : role === UserRole.DIRECTION ||
                                      role === UserRole.MANAGER
                                    ? 'primary'
                                    : role === UserRole.REVIEWER
                                      ? 'info'
                                      : 'navy'
                            }
                          >
                            {USER_ROLE_LABELS[role]}
                          </Badge>
                          <span className="font-mono text-[10px] text-seal-gray-500 dark:text-slate-500">
                            {role}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-seal-gray-500 dark:text-slate-400">
                        {ROLE_DESCRIPTIONS[role]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Matrice capacités × rôle (lecture seule, documentaire) */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-seal-navy dark:text-blue-400" />
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                  Capacités par rôle (lecture seule)
                </h2>
              </div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                Vue documentaire des permissions canoniques alignées avec les
                décorateurs <code className="font-mono">@Roles()</code> NestJS.
                Pour ajuster l'exposition de modules, utilisez l'onglet
                Utilisateurs ou Départements.
              </p>
            </div>
            <Badge variant="navy" className="gap-1 whitespace-nowrap">
              <Lock className="h-3 w-3" /> Documentaire
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-slate-700">
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap min-w-[220px]">
                    Capacité
                  </th>
                  {ROLES_BY_LEVEL.map((r) => (
                    <th
                      key={r}
                      className="px-2 py-2 font-semibold text-seal-navy dark:text-white text-center whitespace-nowrap"
                      title={USER_ROLE_LABELS[r]}
                    >
                      <span className="block text-[10px]">
                        {USER_ROLE_LABELS[r].split(' ')[0]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAPABILITIES.map((cap) => (
                  <tr
                    key={cap.id}
                    className="border-b border-gray-100 dark:border-slate-800"
                  >
                    <td className="py-2.5 pr-4">
                      <div className="font-semibold text-seal-navy dark:text-white">
                        {cap.label}
                      </div>
                      <div className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                        {cap.description}
                      </div>
                    </td>
                    {ROLES_BY_LEVEL.map((r) => {
                      const has = roleHasCapability(r, cap);
                      return (
                        <td key={r} className="px-2 py-2.5 text-center">
                          {has ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 dark:bg-red-900/10">
                              <X className="h-3 w-3 text-red-300 dark:text-red-500/50" />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[11px] text-seal-gray-500 dark:text-slate-400 italic">
            Une capacité cochée signifie que le rôle est au-dessus du minimum
            requis dans la hiérarchie canonique. Les overrides granulaires par
            module se configurent dans les onglets Départements / Utilisateurs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Onglet 2 — Départements
// ─────────────────────────────────────────────────────────────────────

function DepartmentsTab() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [deptConfig, setDeptConfig] = useState<DeptAccessModule[] | null>(null);
  const [deptLoading, setDeptLoading] = useState(false);
  const [deptSaving, setDeptSaving] = useState(false);
  const [pendingToggles, setPendingToggles] = useState<Record<string, boolean>>(
    {},
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [deptsRes, modulesRes] = await Promise.all([
        api.get('/departments'),
        api.get('/spaces/modules'),
      ]);
      const deptsData: Department[] =
        deptsRes.data?.data || deptsRes.data || [];
      setDepartments(Array.isArray(deptsData) ? deptsData : []);
      setModules(modulesRes.data?.modules || []);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message ||
          'Impossible de charger les départements',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadDeptConfig = useCallback(async (deptId: string) => {
    if (!deptId) return;
    setDeptLoading(true);
    try {
      const res = await api.get(`/spaces/departments/${deptId}/access-config`);
      setDeptConfig(res.data?.modules || []);
      setPendingToggles({});
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message ||
          'Impossible de charger la configuration du département',
      );
      setDeptConfig(null);
    } finally {
      setDeptLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDeptId) void loadDeptConfig(selectedDeptId);
  }, [selectedDeptId, loadDeptConfig]);

  const effectiveEnabled = useCallback(
    (mod: DeptAccessModule): boolean => {
      if (mod.code in pendingToggles) return pendingToggles[mod.code]!;
      return mod.enabled;
    },
    [pendingToggles],
  );

  const toggleModule = (mod: DeptAccessModule) => {
    if (mod.alwaysOn) return;
    setPendingToggles((prev) => ({
      ...prev,
      [mod.code]: !effectiveEnabled(mod),
    }));
  };

  const hasChanges = Object.keys(pendingToggles).length > 0;

  const saveConfig = async () => {
    if (!selectedDeptId || !deptConfig) return;
    setDeptSaving(true);
    try {
      const enabledModules = deptConfig
        .filter((m) => effectiveEnabled(m))
        .map((m) => m.code);
      await api.post(`/spaces/departments/${selectedDeptId}/access-config`, {
        modules: enabledModules,
      });
      toast.success('Configuration enregistrée');
      await loadDeptConfig(selectedDeptId);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message ||
          'Erreur lors de la sauvegarde de la configuration',
      );
    } finally {
      setDeptSaving(false);
    }
  };

  const modulesBySection = useMemo(() => {
    if (!deptConfig) return [];
    const map = new Map<string, DeptAccessModule[]>();
    for (const mod of deptConfig) {
      const sec = mod.section ?? 'transverse';
      const list = map.get(sec) ?? [];
      list.push(mod);
      map.set(sec, list);
    }
    return SECTION_ORDER.map((sec) => ({
      section: sec,
      label: SECTION_LABELS[sec] ?? sec,
      modules: map.get(sec) ?? [],
    })).filter((g) => g.modules.length > 0);
  }, [deptConfig]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Liste des départements */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
              Départements ({departments.length})
            </h2>
          </div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
            Sélectionnez un département pour configurer les modules accessibles
            par défaut à ses membres. Un override USER ou ROLE reste prioritaire.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-slate-700">
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Nom
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Code
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Membres
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Managers détectés
                  </th>
                  <th className="text-right py-2 pr-4 font-semibold text-seal-navy dark:text-white">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => {
                  const isSelected = d.id === selectedDeptId;
                  return (
                    <tr
                      key={d.id}
                      className={`border-b border-gray-100 dark:border-slate-800 transition-colors ${
                        isSelected
                          ? 'bg-primary/5 dark:bg-blue-900/10'
                          : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-semibold text-seal-navy dark:text-white">
                        {d.name}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="navy" className="font-mono">
                          {d.code}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 text-seal-gray-500 dark:text-slate-400">
                        {d._count?.users ?? 0}
                      </td>
                      <td className="py-2.5 pr-4 text-seal-gray-500 dark:text-slate-400">
                        {d.managers && d.managers.length > 0
                          ? d.managers
                              .map((m) => `${m.firstName} ${m.lastName}`)
                              .join(', ')
                          : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Button
                          variant={isSelected ? 'primary' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedDeptId(d.id)}
                        >
                          {isSelected ? 'Sélectionné' : 'Configurer'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {departments.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-seal-gray-500 dark:text-slate-400"
                    >
                      Aucun département défini. Créez-en via{' '}
                      <Link
                        href="/admin/departments"
                        className="text-primary underline"
                      >
                        /admin/departments
                      </Link>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Config modules par dept sélectionné */}
      {selectedDeptId && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                  Modules du département{' '}
                  <span className="text-primary">
                    {departments.find((d) => d.id === selectedDeptId)?.name ??
                      selectedDeptId}
                  </span>
                </h2>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                  Cochez les modules à exposer par défaut aux membres. Les
                  modules obligatoires ne peuvent pas être désactivés.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadDeptConfig(selectedDeptId)}
                  disabled={deptLoading || deptSaving}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                </Button>
                <Button
                  size="sm"
                  onClick={saveConfig}
                  disabled={!hasChanges || deptSaving}
                  loading={deptSaving}
                >
                  <Save className="h-3.5 w-3.5" /> Sauvegarder
                  {hasChanges && (
                    <Badge variant="primary" className="ml-1">
                      {Object.keys(pendingToggles).length}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {deptLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded" />
                ))}
              </div>
            ) : (
              modulesBySection.map((group) => (
                <div key={group.section} className="mb-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-seal-navy dark:text-slate-300 mb-2">
                    {group.label}
                    <span className="ml-2 text-[10px] font-normal text-seal-gray-500 dark:text-slate-500">
                      ({group.modules.length})
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.modules.map((mod) => {
                      const enabled = effectiveEnabled(mod);
                      const isPending = mod.code in pendingToggles;
                      return (
                        <button
                          key={mod.code}
                          type="button"
                          onClick={() => toggleModule(mod)}
                          disabled={mod.alwaysOn}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                            enabled
                              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                              : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                          } ${
                            mod.alwaysOn
                              ? 'opacity-60 cursor-not-allowed'
                              : 'hover:shadow-sm'
                          } ${isPending ? 'ring-2 ring-primary/40' : ''}`}
                        >
                          <div>
                            <div className="text-xs font-semibold text-seal-navy dark:text-white flex items-center gap-1.5">
                              {mod.label}
                              {mod.alwaysOn && (
                                <Lock className="h-3 w-3 text-seal-gray-500" />
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-500">
                              {mod.code}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${
                              enabled
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500'
                            }`}
                          >
                            {enabled ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <p className="mt-4 text-[11px] text-seal-gray-500 dark:text-slate-400 italic">
              Priorité : USER &gt; ROLE &gt; DEPARTMENT &gt; GLOBAL. Un
              utilisateur peut être surchargé individuellement dans l'onglet{' '}
              <button
                type="button"
                className="underline"
                onClick={() =>
                  (window.location.href = '/admin/access?tab=users')
                }
              >
                Utilisateurs
              </button>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Onglet 3 — Utilisateurs (override par user)
// ─────────────────────────────────────────────────────────────────────

function UsersTab() {
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [configs, setConfigs] = useState<SpaceConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [userConfigs, setUserConfigs] = useState<SpaceConfig[] | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [pendingUserToggles, setPendingUserToggles] = useState<
    Record<string, boolean>
  >({});

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const [modulesRes, configsRes, deptsRes, usersRes] = await Promise.all([
        api.get('/spaces/modules'),
        api.get('/spaces/configs'),
        api.get('/departments'),
        api.get('/users', { params: { limit: 200, page: 1 } }),
      ]);
      setModules(modulesRes.data?.modules || []);
      setConfigs(configsRes.data?.data || []);
      const deptsData: Department[] =
        deptsRes.data?.data || deptsRes.data || [];
      setDepartments(Array.isArray(deptsData) ? deptsData : []);
      const usersData: UserRow[] =
        usersRes.data?.data || usersRes.data || [];
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message ||
          'Impossible de charger les données utilisateurs',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadUserConfig = useCallback(async (userId: string) => {
    if (!userId) return;
    setUserLoading(true);
    try {
      const res = await api.get(`/spaces/users/${userId}/access-config`);
      setUserConfigs(res.data?.configs || []);
      setPendingUserToggles({});
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message ||
          "Impossible de charger la configuration de l'utilisateur",
      );
      setUserConfigs(null);
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) void loadUserConfig(selectedUserId);
  }, [selectedUserId, loadUserConfig]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId),
    [users, selectedUserId],
  );

  /**
   * Calcule l'état "effectif hérité" pour un user (avant ses propres
   * overrides) — permet de montrer ce qui serait vu sans le override USER.
   */
  const inheritedEnabled = useCallback(
    (moduleCode: string): boolean => {
      if (!selectedUser) return true;
      const role = selectedUser.role;
      const deptId = selectedUser.departmentId ?? null;

      let enabled = true;
      const g = configs.find(
        (c) => c.module === moduleCode && c.scopeType === 'GLOBAL',
      );
      if (g) enabled = g.enabled;
      if (deptId) {
        const d = configs.find(
          (c) =>
            c.module === moduleCode &&
            c.scopeType === 'DEPARTMENT' &&
            c.scopeValue === deptId,
        );
        if (d) enabled = d.enabled;
      }
      const r = configs.find(
        (c) =>
          c.module === moduleCode &&
          c.scopeType === 'ROLE' &&
          c.scopeValue === role,
      );
      if (r) enabled = r.enabled;
      return enabled;
    },
    [configs, selectedUser],
  );

  /**
   * État actuel après override USER (ou pending toggle).
   * Si un override existe → sa valeur. Sinon → valeur héritée.
   */
  const userEffectiveEnabled = useCallback(
    (moduleCode: string): boolean => {
      if (moduleCode in pendingUserToggles) {
        return pendingUserToggles[moduleCode]!;
      }
      const row = userConfigs?.find((c) => c.module === moduleCode);
      if (row) return row.enabled;
      return inheritedEnabled(moduleCode);
    },
    [pendingUserToggles, userConfigs, inheritedEnabled],
  );

  const hasUserOverride = useCallback(
    (moduleCode: string): boolean => {
      if (moduleCode in pendingUserToggles) return true;
      return !!userConfigs?.find((c) => c.module === moduleCode);
    },
    [pendingUserToggles, userConfigs],
  );

  const toggleUserModule = (mod: ModuleDef) => {
    if (mod.alwaysOn) return;
    const current = userEffectiveEnabled(mod.code);
    setPendingUserToggles((prev) => ({ ...prev, [mod.code]: !current }));
  };

  const hasChanges = Object.keys(pendingUserToggles).length > 0;

  const saveUserConfig = async () => {
    if (!selectedUserId) return;
    setUserSaving(true);
    try {
      // Liste finale des modules activés pour ce user (override).
      // On prend tous les modules où l'état effectif est vrai ET où l'état
      // diffère de l'hérité, pour ne pas polluer la table avec des règles
      // redondantes. Toutefois pour simplicité/robustesse (et conformément
      // au comportement existant de setUserModuleOverrides), on envoie
      // tous les modules à activer : ceux qui diffèrent de l'hérité.
      const allModules = modules.map((m) => m.code);
      const enabledModules = allModules.filter((code) => {
        return userEffectiveEnabled(code);
      });
      await api.post(`/spaces/users/${selectedUserId}/access-config`, {
        modules: enabledModules,
      });
      toast.success('Overrides utilisateur enregistrés');
      await loadUserConfig(selectedUserId);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.response?.data?.message ||
          'Erreur lors de la sauvegarde des overrides',
      );
    } finally {
      setUserSaving(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users.slice(0, 50);
    return users
      .filter((u) => {
        const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const email = (u.email ?? '').toLowerCase();
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 50);
  }, [users, userSearch]);

  const modulesBySection = useMemo(() => {
    const map = new Map<string, ModuleDef[]>();
    for (const mod of modules) {
      const sec = mod.section ?? 'transverse';
      const list = map.get(sec) ?? [];
      list.push(mod);
      map.set(sec, list);
    }
    return SECTION_ORDER.map((sec) => ({
      section: sec,
      label: SECTION_LABELS[sec] ?? sec,
      modules: map.get(sec) ?? [],
    })).filter((g) => g.modules.length > 0);
  }, [modules]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sélecteur user */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
              Override par utilisateur
            </h2>
          </div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
            Configurez les modules exposés pour un utilisateur précis. Les
            overrides USER sont prioritaires sur ROLE, DEPARTMENT et GLOBAL.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-seal-navy dark:text-white uppercase mb-1">
                Rechercher
              </label>
              <input
                type="search"
                placeholder="Nom, prénom ou email"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-seal-navy dark:text-white uppercase mb-1">
                Utilisateur
              </label>
              <Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                options={[
                  { label: '— Sélectionner —', value: '' },
                  ...filteredUsers.map((u) => ({
                    label: `${u.firstName} ${u.lastName} · ${u.email} · ${u.role}`,
                    value: u.id,
                  })),
                ]}
              />
              {users.length > filteredUsers.length && (
                <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
                  {filteredUsers.length} / {users.length} utilisateurs — affinez
                  la recherche pour voir les autres.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedUser && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                  {selectedUser.firstName} {selectedUser.lastName}
                </h2>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                  {selectedUser.email} ·{' '}
                  <Badge variant="navy">{selectedUser.role}</Badge>
                  {selectedUser.department?.name && (
                    <>
                      {' '}
                      · <Badge variant="info">{selectedUser.department.name}</Badge>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadUserConfig(selectedUserId)}
                  disabled={userLoading || userSaving}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                </Button>
                <Button
                  size="sm"
                  onClick={saveUserConfig}
                  disabled={!hasChanges || userSaving}
                  loading={userSaving}
                >
                  <Save className="h-3.5 w-3.5" /> Sauvegarder
                  {hasChanges && (
                    <Badge variant="primary" className="ml-1">
                      {Object.keys(pendingUserToggles).length}
                    </Badge>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {userLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded" />
                ))}
              </div>
            ) : (
              modulesBySection.map((group) => (
                <div key={group.section} className="mb-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-seal-navy dark:text-slate-300 mb-2">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.modules.map((mod) => {
                      const enabled = userEffectiveEnabled(mod.code);
                      const inherited = inheritedEnabled(mod.code);
                      const override = hasUserOverride(mod.code);
                      const isPending = mod.code in pendingUserToggles;
                      return (
                        <button
                          key={mod.code}
                          type="button"
                          onClick={() => toggleUserModule(mod)}
                          disabled={mod.alwaysOn}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition ${
                            enabled
                              ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                              : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                          } ${
                            mod.alwaysOn
                              ? 'opacity-60 cursor-not-allowed'
                              : 'hover:shadow-sm'
                          } ${isPending ? 'ring-2 ring-primary/40' : ''}`}
                        >
                          <div>
                            <div className="text-xs font-semibold text-seal-navy dark:text-white flex items-center gap-1.5">
                              {mod.label}
                              {mod.alwaysOn && (
                                <Lock className="h-3 w-3 text-seal-gray-500" />
                              )}
                              {override && (
                                <Badge variant="warning" className="text-[9px]">
                                  override
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] font-mono text-seal-gray-500 dark:text-slate-500">
                              {mod.code}
                              {override && enabled !== inherited && (
                                <span className="ml-2 italic text-seal-gray-500/80">
                                  (hérité: {inherited ? 'on' : 'off'})
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${
                              enabled
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500'
                            }`}
                          >
                            {enabled ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 p-3">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                La sauvegarde remplace l'intégralité des overrides USER existants
                par l'état actuellement affiché. Les modules sans override
                retombent automatiquement sur l'héritage ROLE / DEPARTMENT / GLOBAL.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
