'use client';

/**
 * Organigramme refondu — visualisation hiérarchique de l'organisation.
 *
 * Données : `GET /directory/org-chart` (cf. DirectoryController côté backend,
 * branché sur DepartmentsModule existant). Retourne `{ departments, users }`
 * avec `managerId` (relation Prisma User.manager).
 *
 * Construction de l'arbre :
 *   1. Racine virtuelle "OMNITECH Security".
 *   2. Niveau 1 = départements (couleur dérivée du code).
 *   3. Niveau 2 = users sans `managerId` (ou dont le manager est dans un
 *      autre département) rattachés à leur département.
 *   4. Niveau 3+ = subordonnés via managerId, récursif.
 *
 * Visualisation en SVG + flexbox pur (aucune lib externe — vérifié dans
 * `apps/frontend/package.json`, ni react-organizational-chart ni reactflow
 * ne sont disponibles).
 *
 * Interactions :
 *   - Click sur card user → modal Dialog (réutilise @omnitech/ui).
 *   - Zoom +/- via boutons et Ctrl+molette.
 *   - Pan via drag sur le fond.
 *   - Filtre "par département" → réduit l'arbre à une seule branche.
 *
 * Export PNG : skippé — `html-to-image`/`dom-to-image` non disponibles.
 *
 * I18n : nouvelles clés sous `directory.organigramme.*`.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import {
  Card,
  CardContent,
  Badge,
  Avatar,
  EmptyState,
  Button,
  Dialog,
  Select,
} from '@omnitech/ui';
import {
  Building2,
  Users,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Mail,
  Phone,
  Crown,
  Briefcase,
} from 'lucide-react';
import { getAvatarUrl } from '@/lib/avatar';
import { useTranslation } from '@/lib/i18n';
import { PageHeader } from '@/components/layout/page-header';

// ── Types ────────────────────────────────────────────────────────────

interface OrgUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  phone: string | null;
  departmentId: string | null;
  managerId: string | null;
}

interface OrgDepartment {
  id: string;
  name: string;
  code: string;
}

interface OrgChartResponse {
  departments: OrgDepartment[];
  users: OrgUser[];
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  DIRECTION: 'Direction',
  MANAGER: 'Manager',
  REVIEWER: 'Réviseur',
  AUDITEUR: 'Auditeur',
  COLLABORATEUR: 'Collaborateur',
  PRESTATAIRE: 'Prestataire',
};

// Palette département (cohérente avec la charte SEAL — bleus/orangers/violets).
// Indexée stable via hash sur le code département.
const DEPT_COLORS = [
  { bg: 'bg-blue-500', ring: 'ring-blue-500', text: 'text-blue-600', soft: 'bg-blue-50 dark:bg-blue-900/20' },
  { bg: 'bg-emerald-500', ring: 'ring-emerald-500', text: 'text-emerald-600', soft: 'bg-emerald-50 dark:bg-emerald-900/20' },
  { bg: 'bg-violet-500', ring: 'ring-violet-500', text: 'text-violet-600', soft: 'bg-violet-50 dark:bg-violet-900/20' },
  { bg: 'bg-amber-500', ring: 'ring-amber-500', text: 'text-amber-600', soft: 'bg-amber-50 dark:bg-amber-900/20' },
  { bg: 'bg-rose-500', ring: 'ring-rose-500', text: 'text-rose-600', soft: 'bg-rose-50 dark:bg-rose-900/20' },
  { bg: 'bg-cyan-500', ring: 'ring-cyan-500', text: 'text-cyan-600', soft: 'bg-cyan-50 dark:bg-cyan-900/20' },
  { bg: 'bg-indigo-500', ring: 'ring-indigo-500', text: 'text-indigo-600', soft: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { bg: 'bg-teal-500', ring: 'ring-teal-500', text: 'text-teal-600', soft: 'bg-teal-50 dark:bg-teal-900/20' },
];

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % mod;
}

function getDeptColor(code: string) {
  return DEPT_COLORS[hashIndex(code, DEPT_COLORS.length)]!;
}

function initials(u: { firstName: string; lastName: string }): string {
  return `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();
}

// ── Tree node carte user ─────────────────────────────────────────────

interface UserNode extends OrgUser {
  children: UserNode[];
  deptColor: ReturnType<typeof getDeptColor>;
}

function UserCard({
  node,
  onClick,
  highlight,
}: {
  node: UserNode;
  onClick: (u: OrgUser) => void;
  highlight?: boolean;
}) {
  const c = node.deptColor;
  const hasChildren = node.children.length > 0;
  return (
    <button
      type="button"
      onClick={() => onClick(node)}
      className={`group flex flex-col items-center w-44 rounded-card border bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 px-3 py-3 ${
        highlight
          ? `${c.ring} ring-2 border-transparent`
          : 'border-gray-200 dark:border-slate-700'
      }`}
      aria-label={`Profil de ${node.firstName} ${node.lastName}`}
    >
      <Avatar
        src={getAvatarUrl(node.avatarUrl)}
        initials={initials(node)}
        size="md"
        className={`flex-shrink-0 ${!node.avatarUrl ? c.bg : ''}`}
      />
      <p className="mt-2 text-sm font-semibold text-seal-navy dark:text-white text-center truncate w-full">
        {node.firstName} {node.lastName}
      </p>
      <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 text-center truncate w-full">
        {node.jobTitle || ROLE_LABELS[node.role] || node.role}
      </p>
      {hasChildren && (
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-semibold">
          <Users className="h-3 w-3" />
          {node.children.length}
        </span>
      )}
    </button>
  );
}

// ── Sous-arbre récursif ──────────────────────────────────────────────

function SubTree({
  node,
  onUserClick,
}: {
  node: UserNode;
  onUserClick: (u: OrgUser) => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div className="flex flex-col items-center">
      <UserCard node={node} onClick={onUserClick} />
      {hasChildren && (
        <>
          {/* connecteur vertical */}
          <div className="w-px h-6 bg-gray-300 dark:bg-slate-600" aria-hidden />
          {/* connecteur horizontal SVG (s'étend sur la largeur des enfants) */}
          <div className="relative w-full flex justify-center">
            {node.children.length > 1 && (
              <div
                className="absolute top-0 left-0 right-0 h-px bg-gray-300 dark:bg-slate-600"
                style={{
                  left: `calc(50% / ${node.children.length})`,
                  right: `calc(50% / ${node.children.length})`,
                }}
                aria-hidden
              />
            )}
            <div className="flex items-start gap-6 pt-0">
              {node.children.map((child) => (
                <div key={child.id} className="flex flex-col items-center">
                  <div className="w-px h-6 bg-gray-300 dark:bg-slate-600" aria-hidden />
                  <SubTree node={child} onUserClick={onUserClick} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bloc département ─────────────────────────────────────────────────

function DepartmentBlock({
  dept,
  topUsers,
  onUserClick,
}: {
  dept: OrgDepartment;
  topUsers: UserNode[];
  onUserClick: (u: OrgUser) => void;
}) {
  const c = getDeptColor(dept.code);
  return (
    <div className="flex flex-col items-center">
      {/* En-tête département */}
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-1.5 ${c.soft} border-2 border-transparent`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${c.bg}`} aria-hidden />
        <span className="text-xs font-semibold text-seal-navy dark:text-white">
          {dept.name}
        </span>
        <Badge variant="navy" className="font-mono text-[10px]">
          {dept.code}
        </Badge>
      </div>
      {topUsers.length > 0 && (
        <>
          <div className="w-px h-6 bg-gray-300 dark:bg-slate-600 mt-2" aria-hidden />
          <div className="flex items-start gap-6">
            {topUsers.map((u) => (
              <SubTree key={u.id} node={u} onUserClick={onUserClick} />
            ))}
          </div>
        </>
      )}
      {topUsers.length === 0 && (
        <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 italic mt-2">
          Aucun membre
        </p>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export default function OrganigrammePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<OrgChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [filterDeptId, setFilterDeptId] = useState<string>('all');
  const [activeUser, setActiveUser] = useState<OrgUser | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  });

  // ── Chargement ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await api.get<OrgChartResponse>('/directory/org-chart');
        if (!cancelled) setData(res.data);
      } catch (err) {
        logger.error(err, { page: 'directory/organigramme', context: 'load org-chart' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Construction arbre ─────────────────────────────────────────────
  const tree = useMemo(() => {
    if (!data) return [];
    const visibleDepts =
      filterDeptId === 'all'
        ? data.departments
        : data.departments.filter((d) => d.id === filterDeptId);

    return visibleDepts.map((dept) => {
      const deptColor = getDeptColor(dept.code);
      // Users de ce département
      const deptUsers = data.users.filter((u) => u.departmentId === dept.id);
      const byId = new Map<string, UserNode>();
      deptUsers.forEach((u) => {
        byId.set(u.id, { ...u, children: [], deptColor });
      });
      const tops: UserNode[] = [];
      // Rattachement managerId (uniquement à l'intérieur du département pour
      // garder l'arbre lisible — un manager d'un autre département devient
      // un sommet local).
      deptUsers.forEach((u) => {
        const node = byId.get(u.id)!;
        if (u.managerId && byId.has(u.managerId)) {
          byId.get(u.managerId)!.children.push(node);
        } else {
          tops.push(node);
        }
      });
      // Tri : DIRECTION/MANAGER en haut, puis nb subordonnés desc
      const roleWeight: Record<string, number> = {
        SUPER_ADMIN: 100,
        DIRECTION: 90,
        ADMIN: 85,
        MANAGER: 80,
        REVIEWER: 60,
        COLLABORATEUR: 40,
        AUDITEUR: 30,
        PRESTATAIRE: 20,
      };
      tops.sort((a, b) => {
        const wa = (roleWeight[a.role] ?? 0) + a.children.length * 5;
        const wb = (roleWeight[b.role] ?? 0) + b.children.length * 5;
        return wb - wa;
      });
      return { dept, topUsers: tops };
    });
  }, [data, filterDeptId]);

  const totalUsers = data?.users.length ?? 0;
  const totalDepts = data?.departments.length ?? 0;

  // ── Pan & Zoom ─────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent) => {
    // ne déclenche le pan que si l'utilisateur drag le fond, pas une carte
    if ((e.target as HTMLElement).closest('button')) return;
    dragState.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: pan.x,
      baseY: pan.y,
    };
    document.body.style.cursor = 'grabbing';
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current.active) return;
    setPan({
      x: dragState.current.baseX + (e.clientX - dragState.current.startX),
      y: dragState.current.baseY + (e.clientY - dragState.current.startY),
    });
  };
  const stopDrag = () => {
    if (dragState.current.active) {
      dragState.current.active = false;
      document.body.style.cursor = '';
    }
  };
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.4, Math.min(2, +(z + delta).toFixed(2))));
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title={t('directory.organigramme.title') as string}
        subtitle={t('directory.organigramme.subtitle') as string}
        icon={Building2}
        hub="work"
        actions={
          !loading ? (
            <Badge className="bg-primary/10 text-primary dark:bg-primary/20 self-start">
              {totalDepts} départements · {totalUsers} membres
            </Badge>
          ) : undefined
        }
      />

      {/* Tabs annuaire */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
        <Link
          href="/directory"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent transition-colors"
        >
          <Users className="h-4 w-4" />
          Annuaire
        </Link>
        <div className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-primary border-b-2 border-primary">
          <Building2 className="h-4 w-4" />
          Organigramme
        </div>
        <Link
          href="/directory/contacts"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Contacts externes
        </Link>
      </div>

      {/* Toolbar zoom + filtre */}
      {!loading && data && data.departments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <label
              className="text-xs font-medium text-seal-gray-500 dark:text-slate-400"
              htmlFor="dept-filter"
            >
              {t('directory.organigramme.filterLabel') as string}
            </label>
            <Select
              id="dept-filter"
              value={filterDeptId}
              onChange={(e) => setFilterDeptId(e.target.value)}
              className="w-56"
              options={[
                { value: 'all', label: t('directory.organigramme.allDepts') as string },
                ...data.departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
              aria-label={t('directory.organigramme.zoomOut') as string}
              title={t('directory.organigramme.zoomOut') as string}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono text-seal-gray-500 dark:text-slate-400 min-w-[44px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.min(2, +(z + 0.1).toFixed(2)))}
              aria-label={t('directory.organigramme.zoomIn') as string}
              title={t('directory.organigramme.zoomIn') as string}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={resetView}
              aria-label={t('directory.organigramme.reset') as string}
              title={t('directory.organigramme.reset') as string}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-slate-700" />
                  <div className="flex-1">
                    <div className="w-28 h-4 rounded bg-gray-200 dark:bg-slate-700" />
                    <div className="w-16 h-3 rounded bg-gray-200 dark:bg-slate-700 mt-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && data && data.departments.length === 0 && (
        <EmptyState
          type="users"
          title={t('directory.organigramme.noDept') as string}
          description="Les départements apparaîtront ici une fois créés."
        />
      )}

      {/* Canvas (pan + zoom) */}
      {!loading && data && data.departments.length > 0 && (
        <div
          ref={containerRef}
          className="relative overflow-hidden rounded-card border border-gray-200 dark:border-slate-700 bg-gradient-to-b from-gray-50/60 to-white dark:from-slate-900/60 dark:to-slate-950 cursor-grab active:cursor-grabbing"
          style={{ minHeight: 540 }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          onWheel={onWheel}
        >
          <div
            className="origin-top-left transition-transform select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              padding: '32px',
              width: 'max-content',
              minWidth: '100%',
            }}
          >
            <div className="flex flex-col items-center">
              {/* Racine OMNITECH */}
              <Card className="w-56 shadow-md cursor-default">
                <CardContent className="py-4 px-6">
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/logo-icon.png"
                      alt="OMNITECH"
                      width={44}
                      height={44}
                      className="object-contain"
                      style={{ width: 44, height: 44 }}
                    />
                    <h2 className="font-semibold text-seal-navy dark:text-white text-sm text-center">
                      {t('directory.organigramme.orgName') as string}
                    </h2>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                      {t('directory.organigramme.organization') as string}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Connecteur racine → départements */}
              <div className="w-px h-8 bg-gradient-to-b from-primary/40 to-gray-300 dark:from-primary/50 dark:to-slate-600" aria-hidden />

              {/* Rangée des départements */}
              <div className="flex items-start gap-10 pt-2">
                {tree.map(({ dept, topUsers }) => (
                  <DepartmentBlock
                    key={dept.id}
                    dept={dept}
                    topUsers={topUsers}
                    onUserClick={setActiveUser}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Hint Ctrl+wheel */}
          <p className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 italic">
            {t('directory.organigramme.zoomHint') as string}
          </p>
        </div>
      )}

      {/* Drawer profil (Dialog réutilisé) */}
      <Dialog
        open={!!activeUser}
        onClose={() => setActiveUser(null)}
        title={
          activeUser
            ? `${activeUser.firstName} ${activeUser.lastName}`
            : ''
        }
        description={activeUser?.jobTitle || ROLE_LABELS[activeUser?.role || ''] || ''}
      >
        {activeUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar
                src={getAvatarUrl(activeUser.avatarUrl)}
                initials={initials(activeUser)}
                size="lg"
              />
              <div className="flex-1 min-w-0">
                <Badge variant="navy" className="text-[10px]">
                  {ROLE_LABELS[activeUser.role] || activeUser.role}
                </Badge>
                {activeUser.jobTitle && (
                  <p className="mt-1 text-sm text-seal-gray-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5" />
                    {activeUser.jobTitle}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <a
                href={`mailto:${activeUser.email}`}
                className="flex items-center gap-2 text-seal-navy dark:text-white hover:text-primary transition-colors"
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                {activeUser.email}
              </a>
              {activeUser.phone && (
                <a
                  href={`tel:${activeUser.phone}`}
                  className="flex items-center gap-2 text-seal-navy dark:text-white hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  {activeUser.phone}
                </a>
              )}
              {activeUser.managerId &&
                (() => {
                  const mgr = data?.users.find((u) => u.id === activeUser.managerId);
                  return mgr ? (
                    <p className="flex items-center gap-2 text-seal-gray-500 dark:text-slate-400">
                      <Crown className="h-4 w-4 flex-shrink-0" />
                      {t('directory.organigramme.reportsTo') as string}{' '}
                      <span className="font-semibold text-seal-navy dark:text-white">
                        {mgr.firstName} {mgr.lastName}
                      </span>
                    </p>
                  ) : null;
                })()}
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
              <Link
                href={`/directory?user=${activeUser.id}`}
                className="text-xs text-primary hover:underline"
                onClick={() => setActiveUser(null)}
              >
                {t('directory.organigramme.viewFullProfile') as string} →
              </Link>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
