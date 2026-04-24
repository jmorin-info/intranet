'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DocumentCategory, DOCUMENT_CATEGORY_LABELS, isRoleAtLeast, UserRole } from '@omnitech/shared';
import { useAuthStore } from '@/stores/auth-store';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  Input,
  Textarea,
  Select,
  FileUploadZone,
  IsoControlBadge,
  Skeleton,
  Badge,
} from '@omnitech/ui';
import { ArrowLeft, Save, X, Upload, Info, FileEdit } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

const CLASSIFICATIONS = [
  { value: 'PUBLIC', label: 'Public', desc: 'Aucune restriction', color: 'text-emerald-600' },
  { value: 'INTERNE', label: 'Interne', desc: 'Réservé aux collaborateurs', color: 'text-blue-600' },
  { value: 'CONFIDENTIEL', label: 'Confidentiel', desc: 'Accès restreint', color: 'text-amber-600' },
  { value: 'SECRET', label: 'Secret', desc: 'Nominatif uniquement', color: 'text-red-600' },
];

const editSchema = z.object({
  title: z.string().min(3, 'Titre requis'),
  description: z.string().optional(),
  category: z.nativeEnum(DocumentCategory),
  classification: z.string().optional(),
  isPublic: z.boolean().optional(),
  nextReviewDate: z.string().optional(),
  reviewerId: z.string().optional(),
  approverId: z.string().optional(),
});

type EditForm = z.infer<typeof editSchema>;

interface IsoControl {
  id: string;
  code: string;
  title: string;
  titleFr?: string;
}

interface UserLite {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
}

export default function EditDocumentPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const allowedClassifications = CLASSIFICATIONS.filter(({ value }) => {
    if (!user) return false;
    const role = user.role;
    if (value === 'SECRET') return isRoleAtLeast(role, UserRole.DIRECTION);
    if (value === 'CONFIDENTIEL') return isRoleAtLeast(role, UserRole.REVIEWER) || role === UserRole.AUDITEUR;
    return true; // PUBLIC and INTERNE are always available
  });

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [changeLog, setChangeLog] = useState('');
  const [isoControls, setIsoControls] = useState<IsoControl[]>([]);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [controlSearch, setControlSearch] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [doc, setDoc] = useState<{ currentVersion?: { versionNumber?: string }; status?: string; reference?: string; owner?: { firstName?: string; lastName?: string }; classification?: string; domain?: string } | null>(null);
  const [users, setUsers] = useState<UserLite[]>([]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
  });

  // Track changes on every form field modification
  useEffect(() => {
    setHasChanges(isDirty || !!file || !!changeLog);
  }, [isDirty, file, changeLog]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [docRes, ctrlRes, usersRes] = await Promise.all([
          api.get(`/documents/${id}`),
          api.get('/iso-controls', { params: { limit: 100 } }),
          // Candidats reviewer/approver : on charge un large set et on filtre par role en UI
          api.get('/users', { params: { limit: 200 } }).catch(() => ({ data: { data: [] } })),
        ]);
        const docData = docRes.data;
        setDoc(docData);
        setIsoControls(ctrlRes.data?.data || []);
        setSelectedControls(docData.isoControls?.map((c: { isoControl: { id: string } }) => c.isoControl.id) || []);
        setUsers(
          Array.isArray(usersRes.data?.data)
            ? usersRes.data.data
            : Array.isArray(usersRes.data)
              ? usersRes.data
              : [],
        );
        reset({
          title: docData.title,
          description: docData.description || '',
          category: docData.category,
          classification: docData.classification || 'INTERNE',
          isPublic: docData.isPublic,
          nextReviewDate: docData.nextReviewDate?.split('T')[0] || '',
          reviewerId: docData.reviewerId || '',
          approverId: docData.approverId || '',
        });
      } catch {
        toast.error('Document introuvable');
        router.push('/documents');
      } finally {
        setFetching(false);
      }
    }
    if (id) fetchData();
  }, [id, reset, router]);

  const categoryOptions = Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const filteredControls = isoControls.filter(
    (c) =>
      !selectedControls.includes(c.id) &&
      (c.code.toLowerCase().includes(controlSearch.toLowerCase()) ||
        c.title.toLowerCase().includes(controlSearch.toLowerCase()) ||
        (c.titleFr && c.titleFr.toLowerCase().includes(controlSearch.toLowerCase()))),
  );

  const onSubmit = async (data: EditForm) => {
    setLoading(true);
    try {
      // class-validator @IsUUID() rejette la chaîne vide. On omet le champ
      // si vide pour laisser la valeur DB inchangée ; pour explicitement
      // deassigner, l'user doit passer par un endpoint dédié (non implémenté
      // actuellement — à prévoir si besoin).
      const { reviewerId, approverId, ...rest } = data;
      const payload: Record<string, unknown> = {
        ...rest,
        isoControlIds: selectedControls,
      };
      if (reviewerId) payload.reviewerId = reviewerId;
      if (approverId) payload.approverId = approverId;

      await api.patch(`/documents/${id}`, payload);

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        if (changeLog) formData.append('changeLog', changeLog);
        await api.post(`/documents/${id}/versions`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      toast.success('Document mis à jour');
      router.push(`/documents/${id}`);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Modifier le document"
        icon={FileEdit}
        hub="work"
        actions={
          <>
            <button onClick={() => router.back()} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Revenir au document">
              <ArrowLeft className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
            </button>
            {hasChanges && (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <Info className="h-3 w-3" />
                Modifications non enregistrées
              </span>
            )}
          </>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="order-2 lg:order-1 lg:col-span-2">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input label="Titre" error={errors.title?.message} {...register('title')} />
            <Textarea label="Description" {...register('description')} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Catégorie"
                options={categoryOptions}
                error={errors.category?.message}
                {...register('category')}
              />
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">Prochaine révision</label>
                <input
                  type="date"
                  {...register('nextReviewDate')}
                  className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-seal-navy dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Workflow : reviewer (étape revue) + approver (approbation finale) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-slate-700">
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                  Reviewer <span className="text-seal-gray-400 text-[11px]">(valide la revue technique)</span>
                </label>
                <select
                  {...register('reviewerId')}
                  className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-seal-navy dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— Aucun —</option>
                  {users
                    .filter((u) => ['REVIEWER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTION'].includes(u.role || ''))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}{u.role ? ` — ${u.role}` : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                  Approbateur final <span className="text-seal-gray-400 text-[11px]">(DIRECTION / SUPER_ADMIN)</span>
                </label>
                <select
                  {...register('approverId')}
                  className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-seal-navy dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">— Aucun —</option>
                  {users
                    .filter((u) => ['DIRECTION', 'SUPER_ADMIN'].includes(u.role || ''))
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}{u.role ? ` — ${u.role}` : ''}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                  Requis avant soumission en revue. Seuls DIRECTION ou SUPER_ADMIN peuvent approuver un document.
                </p>
              </div>
            </div>

            {/* Classification selector with descriptions */}
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">Classification</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allowedClassifications.map((cls) => {
                  const currentCls = watch('classification') || 'INTERNE';
                  return (
                    <button
                      key={cls.value}
                      type="button"
                      onClick={() => {
                        setValue('classification', cls.value, { shouldDirty: true });
                        setHasChanges(true);
                      }}
                      className={`text-left rounded-lg border-2 p-3 transition-all ${
                        currentCls === cls.value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className={`text-sm font-semibold ${cls.color}`}>{cls.label}</span>
                      <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">{cls.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('isPublic')}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span className="text-sm text-seal-navy dark:text-white">Document public</span>
            </label>

            {/* ISO Controls */}
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">Contrôles de sécurité</label>
              <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                {selectedControls.map((ctrlId) => {
                  const ctrl = isoControls.find((c) => c.id === ctrlId);
                  if (!ctrl) return null;
                  return (
                    <IsoControlBadge
                      key={ctrlId}
                      code={ctrl.code}
                      title={ctrl.titleFr || ctrl.title}
                      onClick={() => setSelectedControls((prev) => prev.filter((c) => c !== ctrlId))}
                    />
                  );
                })}
              </div>
              <input
                type="text"
                placeholder="Rechercher un contrôle ISO..."
                value={controlSearch}
                onChange={(e) => setControlSearch(e.target.value)}
                className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {controlSearch && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
                  {filteredControls.slice(0, 10).map((ctrl) => (
                    <button
                      key={ctrl.id}
                      type="button"
                      onClick={() => {
                        setSelectedControls((prev) => [...prev, ctrl.id]);
                        setControlSearch('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800 text-sm"
                    >
                      <span className="font-mono font-semibold text-seal-navy dark:text-white">{ctrl.code}</span>
                      <span className="text-seal-gray-500 dark:text-slate-400 ml-2">{ctrl.titleFr || ctrl.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* New version upload */}
            <div className="border-t border-gray-100 dark:border-slate-700 pt-4">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-2">
                <Upload className="inline h-4 w-4 mr-1" />
                Nouvelle version (optionnel)
              </h3>
              <FileUploadZone
                onFileSelect={setFile}
                selectedFile={file}
                onClear={() => setFile(null)}
              />
              {file && (
                <Input
                  label="Journal des modifications"
                  placeholder="Ex: Mise a jour section 4.2"
                  value={changeLog}
                  onChange={(e) => setChangeLog(e.target.value)}
                  className="mt-2"
                />
              )}
            </div>
          </CardContent>

          <CardFooter>
            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                <X className="h-4 w-4" />
                Annuler
              </Button>
              <Button type="submit" loading={loading}>
                <Save className="h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </CardFooter>
        </Card>
          </div>

          {/* Side-by-side preview */}
          <div className="order-1 lg:order-2 space-y-4">
            <Card>
              <CardHeader><h3 className="text-sm font-semibold text-seal-navy dark:text-white">Version actuelle</h3></CardHeader>
              <CardContent className="text-xs space-y-2">
                <div><span className="text-seal-gray-500 dark:text-slate-400">Version :</span> <span className="text-seal-navy dark:text-white font-semibold">{doc?.currentVersion?.versionNumber || '1.0'}</span></div>
                <div><span className="text-seal-gray-500 dark:text-slate-400">Statut :</span> <Badge variant={doc?.status === 'APPROVED' ? 'approved' : doc?.status === 'DRAFT' ? 'draft' : 'info'}>{doc?.status || 'N/A'}</Badge></div>
                <div><span className="text-seal-gray-500 dark:text-slate-400">Classification :</span> <span className={`font-semibold ${
                  watch('classification') === 'PUBLIC' ? 'text-emerald-600' :
                  watch('classification') === 'CONFIDENTIEL' ? 'text-amber-600' :
                  watch('classification') === 'SECRET' ? 'text-red-600' : 'text-blue-600'
                }`}>{watch('classification') || doc?.classification || 'INTERNE'}</span></div>
                <div><span className="text-seal-gray-500 dark:text-slate-400">Référence :</span> <span className="font-mono">{doc?.reference || 'N/A'}</span></div>
                <div><span className="text-seal-gray-500 dark:text-slate-400">Propriétaire :</span> {doc?.owner?.firstName} {doc?.owner?.lastName}</div>
              </CardContent>
            </Card>

            {hasChanges && (
              <Card>
                <CardContent className="py-3">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                    Des modifications non enregistrées seront perdues si vous quittez cette page.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
