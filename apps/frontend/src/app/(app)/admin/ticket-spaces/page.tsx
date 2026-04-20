'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Inbox, Monitor, Briefcase, Shield, Plus, Trash2, UserPlus, UserMinus,
  ArrowLeft, Edit3, X, Check, Users, Tag, Building2,
} from 'lucide-react';
import {
  Card, CardContent, CardHeader, Button, Input, Textarea, Badge, EmptyState, Skeleton,
} from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

type Permission = 'VIEWER' | 'CREATOR' | 'AGENT' | 'MANAGER';

interface Member {
  id: string;
  spaceId: string;
  userId: string | null;
  role: string | null;
  departmentId: string | null;
  permission: Permission;
  createdAt: string;
}

interface Space {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  members?: Member[];
}

interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface DepartmentLite {
  id: string;
  name: string;
}

const PERMISSIONS: Array<{ value: Permission; label: string; desc: string }> = [
  { value: 'VIEWER', label: 'Viewer', desc: 'Lecture seule des tickets' },
  { value: 'CREATOR', label: 'Creator', desc: 'Peut créer et lire' },
  { value: 'AGENT', label: 'Agent', desc: 'Créer, lire, commenter, être assigné' },
  { value: 'MANAGER', label: 'Manager', desc: 'Contrôle total + gestion membres' },
];

const ROLE_OPTIONS = [
  'COLLABORATEUR', 'REVIEWER', 'AUDITEUR', 'DIRECTION', 'ADMIN', 'SUPER_ADMIN', 'PRESTATAIRE',
];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Inbox, Monitor, Briefcase, Shield,
};

export default function TicketSpacesAdminPage() {
  const user = useAuthStore((s) => s.user);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [departments, setDepartments] = useState<DepartmentLite[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Add member state
  const [memberScope, setMemberScope] = useState<'user' | 'role' | 'department'>('user');
  const [memberUserId, setMemberUserId] = useState('');
  const [memberRole, setMemberRole] = useState('COLLABORATEUR');
  const [memberDeptId, setMemberDeptId] = useState('');
  const [memberPermission, setMemberPermission] = useState<Permission>('CREATOR');
  const [addingMember, setAddingMember] = useState(false);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Space[]>('/ticket-spaces');
      setSpaces(data);
      if (!selectedId && data.length > 0) {
        const first = data[0];
        if (first) setSelectedId(first.id);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur de chargement des espaces');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    loadSpaces();
    api.get('/users', { params: { limit: 500 } }).then(({ data }) => {
      setUsers(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    }).catch(() => setUsers([]));
    api.get('/departments').then(({ data }) => {
      setDepartments(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
    }).catch(() => setDepartments([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedSpace = useMemo(
    () => spaces.find((s) => s.id === selectedId) ?? null,
    [spaces, selectedId],
  );

  const loadMembers = useCallback(async (spaceId: string) => {
    try {
      const { data } = await api.get<Space>(`/ticket-spaces/${spaceId}`);
      setSpaces((prev) => prev.map((s) => (s.id === spaceId ? data : s)));
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur chargement membres');
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadMembers(selectedId);
  }, [selectedId, loadMembers]);

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) {
      toast.error('Nom requis');
      return;
    }
    setCreating(true);
    try {
      await api.post('/ticket-spaces', { name, description: createDesc.trim() || undefined });
      toast.success(`Espace "${name}" créé`);
      setShowCreate(false);
      setCreateName('');
      setCreateDesc('');
      await loadSpaces();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur création');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteSpace = async (space: Space) => {
    if (space.isDefault) {
      toast.error("L'espace par défaut ne peut pas être supprimé.");
      return;
    }
    if (!confirm(`Supprimer l'espace "${space.name}" ? Les tickets seront réassignés à l'espace par défaut.`)) {
      return;
    }
    try {
      await api.delete(`/ticket-spaces/${space.id}`);
      toast.success(`Espace supprimé`);
      setSelectedId(null);
      await loadSpaces();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur suppression');
    }
  };

  const handleAddMember = async () => {
    if (!selectedSpace) return;
    const payload: Record<string, unknown> = { permission: memberPermission };
    if (memberScope === 'user') {
      if (!memberUserId) { toast.error('Sélectionnez un utilisateur'); return; }
      payload.userId = memberUserId;
    } else if (memberScope === 'role') {
      payload.role = memberRole;
    } else {
      if (!memberDeptId) { toast.error('Sélectionnez un département'); return; }
      payload.departmentId = memberDeptId;
    }
    setAddingMember(true);
    try {
      await api.post(`/ticket-spaces/${selectedSpace.id}/members`, payload);
      toast.success('Membre ajouté');
      setMemberUserId(''); setMemberDeptId('');
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur ajout membre');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (member: Member) => {
    if (!selectedSpace) return;
    if (!confirm('Retirer ce membre de l\'espace ?')) return;
    try {
      await api.delete(`/ticket-spaces/${selectedSpace.id}/members/${member.id}`);
      toast.success('Membre retiré');
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur suppression membre');
    }
  };

  const handleChangePermission = async (member: Member, newPerm: Permission) => {
    if (!selectedSpace || member.permission === newPerm) return;
    try {
      await api.patch(`/ticket-spaces/${selectedSpace.id}/members/${member.id}`, { permission: newPerm });
      toast.success('Permission mise à jour');
      await loadMembers(selectedSpace.id);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur mise à jour');
    }
  };

  const memberLabel = (m: Member): { primary: string; secondary: string } => {
    if (m.userId) {
      const u = users.find((x) => x.id === m.userId);
      return {
        primary: u ? `${u.firstName} ${u.lastName}` : `User ${m.userId.slice(0, 8)}…`,
        secondary: u?.email ?? 'Utilisateur',
      };
    }
    if (m.role) return { primary: `Rôle : ${m.role}`, secondary: 'Tous les utilisateurs de ce rôle' };
    if (m.departmentId) {
      const d = departments.find((x) => x.id === m.departmentId);
      return {
        primary: `Département : ${d?.name ?? m.departmentId.slice(0, 8)}`,
        secondary: 'Tous les membres de ce département',
      };
    }
    return { primary: '—', secondary: '' };
  };

  if (loading) {
    return <div className="p-6"><Skeleton className="h-8 w-64" /></div>;
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-seal-gray-500 hover:text-seal-navy dark:hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <PageHeader
          title="Espaces de ticketing"
          subtitle="Créez des espaces distincts (IT, RH, Sécurité, …) et gérez l'accès par utilisateur, rôle ou département."
          icon={Inbox}
          hub="admin"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left : Spaces list */}
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
                  Espaces ({spaces.length})
                </h2>
                <Button size="sm" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nouveau
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {spaces.map((space) => {
                const Icon = (space.icon && ICONS[space.icon]) || Inbox;
                const active = space.id === selectedId;
                return (
                  <button
                    key={space.id}
                    type="button"
                    onClick={() => setSelectedId(space.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${
                      active
                        ? 'bg-seal-orange/10 border border-seal-orange/30'
                        : 'hover:bg-gray-100 dark:hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" style={{ color: space.color ?? '#676d7f' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-seal-navy dark:text-white truncate">{space.name}</span>
                        {space.isDefault && (
                          <Badge variant="seal-blue" className="text-[9px]">défaut</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-seal-gray-500 line-clamp-1">{space.description ?? '—'}</p>
                    </div>
                  </button>
                );
              })}
              {spaces.length === 0 && (
                <EmptyState title="Aucun espace" description="Créez le premier espace de ticketing." />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right : Detail + Members */}
        <div className="lg:col-span-2 space-y-4">
          {selectedSpace ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
                        {selectedSpace.name}
                      </h2>
                      <p className="text-xs text-seal-gray-500 mt-0.5">
                        Slug : <code className="font-mono">{selectedSpace.slug}</code>
                      </p>
                      {selectedSpace.description && (
                        <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-2">
                          {selectedSpace.description}
                        </p>
                      )}
                    </div>
                    {!selectedSpace.isDefault && (
                      <Button variant="danger" size="sm" onClick={() => handleDeleteSpace(selectedSpace)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Supprimer
                      </Button>
                    )}
                  </div>
                </CardHeader>
              </Card>

              {/* Membres */}
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Membres ({selectedSpace.members?.length ?? 0})
                  </h3>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Add member row */}
                  <div className="rounded-lg border border-dashed border-seal-gray-300 dark:border-slate-700 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-seal-gray-500">Scope :</span>
                      {(['user', 'role', 'department'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setMemberScope(s)}
                          className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                            memberScope === s
                              ? 'bg-seal-orange text-white'
                              : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {s === 'user' ? 'Utilisateur' : s === 'role' ? 'Rôle' : 'Département'}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                      {memberScope === 'user' && (
                        <select
                          className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                          value={memberUserId}
                          onChange={(e) => setMemberUserId(e.target.value)}
                        >
                          <option value="">— Choisir un utilisateur —</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.firstName} {u.lastName} — {u.role}
                            </option>
                          ))}
                        </select>
                      )}
                      {memberScope === 'role' && (
                        <select
                          className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                          value={memberRole}
                          onChange={(e) => setMemberRole(e.target.value)}
                        >
                          {ROLE_OPTIONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      )}
                      {memberScope === 'department' && (
                        <select
                          className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                          value={memberDeptId}
                          onChange={(e) => setMemberDeptId(e.target.value)}
                        >
                          <option value="">— Choisir un département —</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      )}
                      <select
                        className="w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                        value={memberPermission}
                        onChange={(e) => setMemberPermission(e.target.value as Permission)}
                      >
                        {PERMISSIONS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <Button size="sm" onClick={handleAddMember} loading={addingMember}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" /> Ajouter
                      </Button>
                    </div>
                  </div>

                  {/* Members list */}
                  <div className="space-y-1.5">
                    {(selectedSpace.members ?? []).length === 0 && (
                      <p className="text-xs text-seal-gray-500 py-4 text-center">Aucun membre pour cet espace.</p>
                    )}
                    {(selectedSpace.members ?? []).map((m) => {
                      const { primary, secondary } = memberLabel(m);
                      const scopeIcon =
                        m.userId ? <Users className="h-3.5 w-3.5" /> :
                        m.role ? <Tag className="h-3.5 w-3.5" /> :
                        <Building2 className="h-3.5 w-3.5" />;
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800"
                        >
                          <span className="text-seal-gray-500">{scopeIcon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-seal-navy dark:text-white truncate">{primary}</p>
                            <p className="text-[11px] text-seal-gray-500 truncate">{secondary}</p>
                          </div>
                          <select
                            value={m.permission}
                            onChange={(e) => handleChangePermission(m, e.target.value as Permission)}
                            className="text-xs rounded border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                          >
                            {PERMISSIONS.map((p) => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m)}
                            aria-label="Retirer le membre"
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 transition"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <EmptyState
              title="Sélectionnez un espace"
              description="Choisissez un espace dans la liste de gauche pour voir ses membres."
            />
          )}
        </div>
      </div>

      {/* Create space modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-seal-navy dark:text-white">Nouvel espace</h2>
              <button onClick={() => setShowCreate(false)} aria-label="Fermer">
                <X className="h-5 w-5 text-seal-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-seal-gray-500">Nom *</label>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="RH, Finance, …" />
              </div>
              <div>
                <label className="text-xs font-medium text-seal-gray-500">Description</label>
                <Textarea value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={3} placeholder="Description courte de l'espace" />
              </div>
              <p className="text-[11px] text-seal-gray-500">
                Vous serez ajouté comme <strong>Manager</strong> de cet espace automatiquement.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
              <Button onClick={handleCreate} loading={creating}>Créer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
