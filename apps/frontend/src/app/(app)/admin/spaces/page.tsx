'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, Button, Badge, Skeleton } from '@omnitech/ui';
import { Layers, Save, RefreshCw, Lock, Check, X } from 'lucide-react';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { useTranslation } from '@/lib/i18n';

interface ModuleDef {
  code: string;
  label: string;
  alwaysOn?: boolean;
  section?: string;
}

const SECTION_LABELS: Record<string, string> = {
  monEspace: 'Mon espace',
  work: 'Travail & connaissance',
  security: 'Sécurité & conformité',
  admin: 'Administration',
  transverse: 'Transversal',
};

const SECTION_ORDER = ['monEspace', 'work', 'security', 'admin', 'transverse'];

interface SpaceConfig {
  id: string;
  module: string;
  scopeType: 'GLOBAL' | 'DEPARTMENT' | 'ROLE';
  scopeValue: string | null;
  enabled: boolean;
  config?: unknown;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'DIRECTION',
  'MANAGER',
  'REVIEWER',
  'AUDITEUR',
  'COLLABORATEUR',
  'PRESTATAIRE',
] as const;

type RoleKey = (typeof ROLES)[number];

type ScopeKey = `GLOBAL` | `ROLE:${string}` | `DEPT:${string}`;

/**
 * Local pending state: tracks enabled/disabled toggles that haven't been
 * saved yet. Key is `${module}::${scopeKey}`.
 */
type PendingMap = Record<string, boolean>;

function keyOf(module: string, scopeKey: ScopeKey): string {
  return `${module}::${scopeKey}`;
}

export default function SpacesAdminPage() {
  const { t } = useTranslation();
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [configs, setConfigs] = useState<SpaceConfig[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [pending, setPending] = useState<PendingMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [modulesRes, configsRes, deptsRes] = await Promise.allSettled([
        api.get('/spaces/modules'),
        api.get('/spaces/configs'),
        api.get('/departments'),
      ]);
      if (modulesRes.status === 'fulfilled') {
        setModules(modulesRes.value.data?.modules || []);
      } else console.error('Failed to load modules:', modulesRes.reason);
      if (configsRes.status === 'fulfilled') {
        setConfigs(configsRes.value.data?.data || []);
      } else console.error('Failed to load configs:', configsRes.reason);
      if (deptsRes.status === 'fulfilled') {
        const deptsData: Department[] = deptsRes.value.data?.data || deptsRes.value.data || [];
        setDepartments(Array.isArray(deptsData) ? deptsData : []);
      } else console.error('Failed to load departments:', deptsRes.reason);
      setPending({});
    } catch (err: any) {
      console.error('Failed to load spaces admin data', err);
      toast.error(err?.response?.data?.message || err?.message || 'Impossible de charger la configuration des espaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /**
   * Computes the effective "enabled" value for a (module, scope) pair.
   * Priority: pending change > stored config > default (true).
   */
  const isEnabled = useCallback(
    (moduleCode: string, scopeKey: ScopeKey): boolean => {
      const k = keyOf(moduleCode, scopeKey);
      if (k in pending) return pending[k]!;

      if (scopeKey === 'GLOBAL') {
        const row = configs.find(
          (c) => c.module === moduleCode && c.scopeType === 'GLOBAL',
        );
        return row ? row.enabled : true;
      }
      if (scopeKey.startsWith('ROLE:')) {
        const role = scopeKey.slice(5);
        const row = configs.find(
          (c) =>
            c.module === moduleCode &&
            c.scopeType === 'ROLE' &&
            c.scopeValue === role,
        );
        // If no specific rule, inherit global
        if (!row) return isEnabled(moduleCode, 'GLOBAL');
        return row.enabled;
      }
      if (scopeKey.startsWith('DEPT:')) {
        const deptId = scopeKey.slice(5);
        const row = configs.find(
          (c) =>
            c.module === moduleCode &&
            c.scopeType === 'DEPARTMENT' &&
            c.scopeValue === deptId,
        );
        if (!row) return isEnabled(moduleCode, 'GLOBAL');
        return row.enabled;
      }
      return true;
    },
    [configs, pending],
  );

  const toggle = (moduleCode: string, scopeKey: ScopeKey) => {
    const mod = modules.find((m) => m.code === moduleCode);
    if (mod?.alwaysOn) return;
    const current = isEnabled(moduleCode, scopeKey);
    setPending((prev) => ({
      ...prev,
      [keyOf(moduleCode, scopeKey)]: !current,
    }));
  };

  const hasChanges = Object.keys(pending).length > 0;

  const saveChanges = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const entries = Object.entries(pending);
      for (const [k, enabled] of entries) {
        const [moduleCode, scopeKey] = k.split('::') as [string, ScopeKey];
        let scopeType: 'GLOBAL' | 'ROLE' | 'DEPARTMENT' = 'GLOBAL';
        let scopeValue: string | null = null;
        if (scopeKey.startsWith('ROLE:')) {
          scopeType = 'ROLE';
          scopeValue = scopeKey.slice(5);
        } else if (scopeKey.startsWith('DEPT:')) {
          scopeType = 'DEPARTMENT';
          scopeValue = scopeKey.slice(5);
        }
        await api.post('/spaces/configs', {
          module: moduleCode,
          scopeType,
          scopeValue,
          enabled,
        });
      }
      toast.success(`${entries.length} règle(s) sauvegardée(s)`);
      await loadAll();
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const resetChanges = () => setPending({});

  const roleColumns = useMemo(() => ROLES as readonly RoleKey[], []);

  /** Modules groupés par section (dans l'ordre canonique). */
  const modulesBySection = useMemo(() => {
    const map = new Map<string, ModuleDef[]>();
    for (const mod of modules) {
      const sec = mod.section ?? 'transverse';
      const list = map.get(sec) ?? [];
      list.push(mod);
      map.set(sec, list);
    }
    return SECTION_ORDER
      .map((sec) => ({ section: sec, label: SECTION_LABELS[sec] ?? sec, modules: map.get(sec) ?? [] }))
      .filter((g) => g.modules.length > 0);
  }, [modules]);

  // Colspan for section headers = 1 (label column) + 1 (global) + N roles
  const sectionColspan = 2 + roleColumns.length;
  const deptColspan = 1 + departments.length;

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="config" />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <Layers className="h-6 w-6" /> Espaces & modules
          </h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            Activez ou désactivez chaque module pour l&apos;ensemble de
            l&apos;organisation, pour un rôle spécifique ou pour un département.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={loadAll} disabled={loading || saving}>
            <RefreshCw className="h-4 w-4" /> Actualiser
          </Button>
          {hasChanges && (
            <Button variant="outline" onClick={resetChanges} disabled={saving}>
              Annuler
            </Button>
          )}
          <Button onClick={saveChanges} loading={saving} disabled={!hasChanges}>
            <Save className="h-4 w-4" /> Sauvegarder
            {hasChanges && (
              <Badge variant="primary" className="ml-1">
                {Object.keys(pending).length}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          {/* Global scope + per-role scope */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-left px-4 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Module</th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-center px-3 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Global</th>
                    {roleColumns.map((r) => (
                      <th key={r} className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-center px-2 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500 whitespace-nowrap">
                        {r.replace('_', ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {modulesBySection.map((group) => (
                    <React.Fragment key={group.section}>
                      <tr className="bg-seal-navy/5 dark:bg-slate-800/60">
                        <td
                          colSpan={sectionColspan}
                          className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-seal-navy dark:text-slate-300"
                        >
                          {group.label}
                          <span className="ml-2 text-[10px] font-normal text-seal-gray-500 dark:text-slate-500">
                            ({group.modules.length})
                          </span>
                        </td>
                      </tr>
                      {group.modules.map((mod) => (
                        <tr
                          key={mod.code}
                          className="even:bg-gray-50/50 dark:even:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-seal-navy dark:text-white">
                                {mod.label}
                              </span>
                              {mod.alwaysOn && (
                                <Badge variant="navy" className="gap-1">
                                  <Lock className="h-3 w-3" />
                                  Obligatoire
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 font-mono mt-0.5">
                              {mod.code}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <ToggleCell
                              enabled={isEnabled(mod.code, 'GLOBAL')}
                              disabled={mod.alwaysOn}
                              onClick={() => toggle(mod.code, 'GLOBAL')}
                            />
                          </td>
                          {roleColumns.map((r) => (
                            <td key={r} className="px-2 py-3 text-center">
                              <ToggleCell
                                enabled={isEnabled(mod.code, `ROLE:${r}`)}
                                disabled={mod.alwaysOn}
                                onClick={() => toggle(mod.code, `ROLE:${r}`)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Per-department scope */}
          {departments.length > 0 && (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
                  <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                    Accès par département
                  </h2>
                  <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
                    Une règle départementale surpasse la règle globale. Un rôle reste prioritaire.
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700">
                      <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-left px-4 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Module</th>
                      {departments.map((d) => (
                        <th
                          key={d.id}
                          className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-center px-2 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500 whitespace-nowrap"
                          title={d.code}
                        >
                          {d.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {modulesBySection.map((group) => (
                      <React.Fragment key={group.section}>
                        <tr className="bg-seal-navy/5 dark:bg-slate-800/60">
                          <td
                            colSpan={deptColspan}
                            className="px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-seal-navy dark:text-slate-300"
                          >
                            {group.label}
                          </td>
                        </tr>
                        {group.modules.map((mod) => (
                          <tr
                            key={mod.code}
                            className="even:bg-gray-50/50 dark:even:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <span className="font-semibold text-seal-navy dark:text-white">
                                {mod.label}
                              </span>
                            </td>
                            {departments.map((d) => (
                              <td key={d.id} className="px-2 py-3 text-center">
                                <ToggleCell
                                  enabled={isEnabled(mod.code, `DEPT:${d.id}`)}
                                  disabled={mod.alwaysOn}
                                  onClick={() => toggle(mod.code, `DEPT:${d.id}`)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-seal-gray-500 dark:text-slate-400 italic">
            Priorité des règles : Rôle &gt; Département &gt; Global. Un module sans
            règle explicite est actif par défaut.
          </p>
        </>
      )}
    </div>
  );
}

function ToggleCell({
  enabled,
  disabled,
  onClick,
}: {
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={enabled}
      className={`inline-flex items-center justify-center h-6 w-6 rounded-full transition ${
        enabled
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}`}
    >
      {enabled ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
    </button>
  );
}
