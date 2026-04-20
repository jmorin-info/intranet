'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, Badge, Avatar } from '@omnitech/ui';
import { Building2, Users, ChevronDown, ChevronRight, Mail, Phone, ExternalLink, GitBranchPlus } from 'lucide-react';
import { getAvatarUrl } from '@/lib/avatar';
import { useTranslation } from '@/lib/i18n';

interface DepartmentMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  jobTitle: string | null;
  phone: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  managerId?: string | null;
  _count?: { subordinates?: number };
}

interface Department {
  id: string;
  name: string;
  code: string;
  _count?: { users: number; userMemberships: number };
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  REVIEWER: 'Réviseur',
  COLLABORATEUR: 'Collaborateur',
  PRESTATAIRE: 'Prestataire',
};

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  ADMIN: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  REVIEWER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  COLLABORATEUR: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PRESTATAIRE: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] || 'bg-blue-500';
}

function DepartmentCard({ dept, isLast }: { dept: Department; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const memberCount = (dept._count?.users || 0) + (dept._count?.userMemberships || 0);

  const handleToggle = async () => {
    if (!loaded && !expanded) {
      setLoading(true);
      try {
        const { data } = await api.get(`/departments/${dept.id}/members`);
        const list = Array.isArray(data) ? data : data?.data || [];
        setMembers(list.filter((m: DepartmentMember) => m.isActive));
        setLoaded(true);
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* Vertical connector from horizontal bar down to card */}
      <div className="w-0.5 h-8 bg-gray-300 dark:bg-slate-600 rounded-full" />

      <Card className="w-full overflow-hidden cursor-pointer">
        {/* Department header */}
        <button
          onClick={handleToggle}
          className="w-full text-left"
          aria-expanded={expanded}
        >
          <div className="px-5 py-4 bg-gradient-to-r from-primary/5 to-transparent dark:from-primary/10 border-b border-gray-100 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 dark:bg-primary/20">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-seal-navy dark:text-white text-sm">{dept.name}</h3>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">{dept.code}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                  memberCount > 0
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-gray-200 text-gray-500 dark:bg-slate-600 dark:text-slate-400'
                }`}>
                  <Users className="h-4 w-4" />
                  {memberCount}
                </span>
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 transition-transform" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 transition-transform" />
                )}
              </div>
            </div>
          </div>
        </button>

        {/* Members list */}
        {expanded && (
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-slate-700 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="w-28 h-3 rounded bg-gray-200 dark:bg-slate-700" />
                      <div className="w-40 h-2 rounded bg-gray-200 dark:bg-slate-700 mt-1.5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : members.length === 0 ? (
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-6">
                Aucun membre dans ce département
              </p>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-slate-800">
                {(() => {
                  // Compute direct report counts from managerId
                  const directReportCounts = new Map<string, number>();
                  members.forEach((m) => {
                    if (m.managerId) {
                      directReportCounts.set(m.managerId, (directReportCounts.get(m.managerId) || 0) + 1);
                    }
                  });
                  // Sort: managers first
                  const sorted = [...members].sort((a, b) => {
                    const aCount = (a._count?.subordinates ?? 0) + (directReportCounts.get(a.id) ?? 0);
                    const bCount = (b._count?.subordinates ?? 0) + (directReportCounts.get(b.id) ?? 0);
                    return bCount - aCount;
                  });
                  return sorted.map((member, idx) => {
                    const initials = `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase();
                    const color = getAvatarColor(member.firstName + member.lastName);
                    const subCount = (member._count?.subordinates ?? 0) || (directReportCounts.get(member.id) ?? 0);
                    const isSubordinate = !!member.managerId && members.some((m) => m.id === member.managerId);
                    return (
                      <div key={member.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors ${isSubordinate ? 'pl-10' : ''}`}>
                        {/* Connection line for subordinates */}
                        {isSubordinate && (
                          <div className="absolute left-6 flex items-center">
                            <div className="w-px h-full bg-gray-200 dark:bg-slate-700" />
                            <div className="w-3 h-px bg-gray-200 dark:bg-slate-700" />
                          </div>
                        )}
                        <Avatar
                          src={getAvatarUrl(member.avatarUrl)}
                          initials={initials}
                          size="sm"
                          className={`flex-shrink-0 ${!member.avatarUrl ? color : ''}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                            {member.firstName} {member.lastName}
                          </p>
                          {member.jobTitle ? (
                            <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">{member.jobTitle}</p>
                          ) : (
                            <a
                              href={`mailto:${member.email}`}
                              className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-primary truncate"
                            >
                              <Mail className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{member.email}</span>
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {subCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" title={`${subCount} subordonné${subCount > 1 ? 's' : ''} direct${subCount > 1 ? 's' : ''}`}>
                              <GitBranchPlus className="h-3 w-3" />
                              {subCount}
                            </span>
                          )}
                          <a
                            href={`mailto:${member.email}`}
                            title={member.email}
                            className="p-1 rounded text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </a>
                          {member.phone && (
                            <a
                              href={`tel:${member.phone}`}
                              title={member.phone}
                              className="p-1 rounded text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <Badge className={`text-[10px] ${ROLE_COLORS[member.role] || 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200'}`}>
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default function OrganigrammePage() {
  const { t } = useTranslation();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDepartments() {
      try {
        const { data } = await api.get('/departments');
        const depts = Array.isArray(data) ? data : data?.data || [];
        setDepartments(depts);
      } catch {
        /* silent — empty state shown */
      } finally {
        setLoading(false);
      }
    }
    fetchDepartments();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Organigramme
          </h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            Vue hiérarchique des départements et de leurs membres
          </p>
        </div>
        {!loading && (
          <Badge className="bg-primary/10 text-primary dark:bg-primary/20 self-start">
            {departments.length} département{departments.length > 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
        <Link
          href="/directory"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
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
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Contacts externes
        </Link>
      </div>

      {/* Loading state */}
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
      {!loading && departments.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-gray-300 dark:text-slate-600 mb-4" />
            <p className="text-lg font-medium text-seal-navy dark:text-white">Aucun département</p>
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
              Les départements apparaîtront ici une fois créés.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tree layout */}
      {!loading && departments.length > 0 && (
        <div className="flex flex-col items-center">
          {/* Root node */}
          <Card className="w-full max-w-xs shadow-md cursor-default">
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
                <h2 className="font-semibold text-seal-navy dark:text-white text-sm">OMNITECH Security</h2>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Organisation</p>
              </div>
            </CardContent>
          </Card>

          {/* Vertical stem from root */}
          <div className="w-0.5 h-8 bg-gradient-to-b from-primary/40 to-gray-300 dark:from-primary/50 dark:to-slate-600 rounded-full" />

          {/* Horizontal branch bar spanning the columns */}
          {departments.length > 1 && (
            <div className="relative w-full max-w-5xl">
              {/* The horizontal bar */}
              <div className="absolute top-0 left-[calc(1/(2*var(--cols,3))*100%)] right-[calc(1/(2*var(--cols,3))*100%)] h-0.5 bg-gray-300 dark:bg-slate-600 rounded-full"
                style={{ '--cols': Math.min(departments.length, 3) } as React.CSSProperties}
              />
            </div>
          )}

          {/* Department cards grid — each card draws its own top connector */}
          <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
            {departments.map((dept, idx) => (
              <DepartmentCard key={dept.id} dept={dept} isLast={idx === departments.length - 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
