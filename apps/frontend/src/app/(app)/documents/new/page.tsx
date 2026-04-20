'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { DocumentCategory, DOCUMENT_CATEGORY_LABELS, formatFileSize, isRoleAtLeast, UserRole } from '@omnitech/shared';
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
} from '@omnitech/ui';
import { ArrowLeft, Save, X, Sparkles, FileText, FileSpreadsheet, File, FilePlus, ShieldCheck, BookOpen, LifeBuoy, ClipboardList, BookMarked, HelpCircle, AlertTriangle } from 'lucide-react';

function Tooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex ml-1 cursor-help">
      <HelpCircle className="h-3.5 w-3.5 text-taupe/60 dark:text-slate-500" />
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-52 rounded-lg bg-navy dark:bg-slate-700 text-white text-[11px] leading-snug px-3 py-2 shadow-lg z-10 pointer-events-none transition-opacity duration-200">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy dark:border-t-slate-700" />
      </span>
    </span>
  );
}

const documentSchema = z.object({
  title: z.string().min(3, 'Titre requis (min 3 caractères)'),
  description: z.string().optional(),
  category: z.nativeEnum(DocumentCategory, { required_error: 'Catégorie requise' }),
  domain: z.string().min(1, 'Domaine requis'),
  classification: z.string().optional(),
  isPublic: z.boolean().optional(),
  nextReviewDate: z.string().optional(),
});

type DocumentForm = z.infer<typeof documentSchema>;

interface IsoControl {
  id: string;
  code: string;
  title: string;
  titleFr?: string;
}

interface DocumentTemplate {
  id: string;
  titlePrefix: string;
  category: DocumentCategory;
  classificationDefault: string;
  description: string;
  icon: React.ReactNode;
}

const ISO_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'policy',
    titlePrefix: 'Politique de sécurité',
    category: DocumentCategory.POLICY,
    classificationDefault: 'CONFIDENTIEL',
    description: 'Règles et orientations de sécurité (ISO 27001 A.5.1)',
    icon: <ShieldCheck className="h-5 w-5 text-orange-500" />,
  },
  {
    id: 'procedure',
    titlePrefix: 'Procédure opérationnelle',
    category: DocumentCategory.PROCEDURE,
    classificationDefault: 'INTERNE',
    description: 'Étapes d\'un processus de contrôle (ISO 27001 A.8)',
    icon: <ClipboardList className="h-5 w-5 text-blue-500" />,
  },
  {
    id: 'plan',
    titlePrefix: 'Plan de continuité',
    category: DocumentCategory.PLAN,
    classificationDefault: 'CONFIDENTIEL',
    description: 'Continuité d\'activité et reprise (ISO 27001 A.5.30)',
    icon: <LifeBuoy className="h-5 w-5 text-red-500" />,
  },
  {
    id: 'report',
    titlePrefix: 'Rapport d\'audit',
    category: DocumentCategory.REPORT,
    classificationDefault: 'CONFIDENTIEL',
    description: 'Résultats d\'audit interne ou externe (ISO 27001 A.9.2)',
    icon: <BookMarked className="h-5 w-5 text-purple-500" />,
  },
  {
    id: 'guide',
    titlePrefix: 'Guide utilisateur',
    category: DocumentCategory.GUIDE,
    classificationDefault: 'PUBLIC',
    description: 'Sensibilisation et usage pour collaborateurs (ISO 27001 A.6.3)',
    icon: <BookOpen className="h-5 w-5 text-green-500" />,
  },
];

const ALL_CLASSIFICATIONS = [
  { value: 'PUBLIC', label: '🟢', key: 'classificationPublic', color: 'text-emerald-600' },
  { value: 'INTERNE', label: '🔵', key: 'classificationInternal', color: 'text-blue-600' },
  { value: 'CONFIDENTIEL', label: '🟠', key: 'classificationConfidential', color: 'text-orange-600' },
  { value: 'SECRET', label: '🔴', key: 'classificationSecret', color: 'text-red-600' },
] as const;

const CLASSIFICATION_COLORS: Record<string, string> = {
  PUBLIC: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
  INTERNE: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  CONFIDENTIEL: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800',
  SECRET: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
};

const SLA_CLASSIFICATION_HELP: Record<string, string> = {
  PUBLIC: 'Diffusion libre, aucune restriction',
  INTERNE: 'Usage interne uniquement, non diffusable',
  CONFIDENTIEL: 'Accès restreint, diffusion contrôlée',
  SECRET: 'Accès strictement limité, chiffrement requis',
};

const STEPPER_STEPS = [
  { number: 1, label: 'Informations', description: 'Titre, domaine et description du document' },
  { number: 2, label: 'Classification', description: 'Categorie, niveau de confidentialite et controles ISO' },
  { number: 3, label: 'Validation', description: 'Fichier, réviseur et soumission' },
] as const;

function StepperIndicator({ currentStep }: { currentStep: number }) {
  return (
    <nav aria-label="Etapes du formulaire" className="flex items-center justify-center gap-0">
      {STEPPER_STEPS.map((step, idx) => {
        const state: 'completed' | 'current' | 'upcoming' =
          step.number < currentStep ? 'completed' : step.number === currentStep ? 'current' : 'upcoming';
        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center min-w-[120px]">
              <div
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                  state === 'completed'
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : state === 'current'
                      ? 'border-primary bg-primary text-white shadow-lg shadow-primary/30'
                      : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-taupe dark:text-slate-500',
                ].join(' ')}
              >
                {state === 'completed' ? '\u2713' : step.number}
              </div>
              <p className={[
                'mt-1.5 text-xs font-semibold leading-tight text-center',
                state === 'upcoming' ? 'text-taupe dark:text-slate-500' : 'text-navy dark:text-white',
              ].join(' ')}>
                {step.label}
              </p>
              <p className="text-[10px] text-taupe dark:text-slate-500 text-center mt-0.5 max-w-[130px] leading-snug">
                {step.description}
              </p>
            </div>
            {idx < STEPPER_STEPS.length - 1 && (
              <div className={[
                'h-0.5 w-16 mx-2 rounded transition-all duration-300',
                state === 'completed' ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700',
              ].join(' ')} />
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function NewDocumentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);

  const classificationOptions = ALL_CLASSIFICATIONS.filter(({ value }) => {
    if (!user) return false;
    const role = user.role;
    if (value === 'SECRET') return isRoleAtLeast(role, UserRole.DIRECTION);
    if (value === 'CONFIDENTIEL') return isRoleAtLeast(role, UserRole.REVIEWER) || role === UserRole.AUDITEUR;
    return true; // PUBLIC and INTERNE are always available
  }).map(({ value, label, key }) => ({
    value,
    label: `${label} ${t(`documents.new.${key}`)}`,
  }));

  const [loading, setLoading] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isoControls, setIsoControls] = useState<IsoControl[]>([]);
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [controlSearch, setControlSearch] = useState('');
  const [reviewers, setReviewers] = useState<{ id: string; firstName: string; lastName: string; role: string }[]>([]);
  const [selectedReviewerId, setSelectedReviewerId] = useState('');
  const [classifying, setClassifying] = useState(false);
  const [autoClassifySuggestion, setAutoClassifySuggestion] = useState<{ classification?: string; category?: string } | null>(null);
  const autoClassifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // --- Duplicate detection ---
  const [duplicates, setDuplicates] = useState<Array<{ id: string; title: string; reference: string; status: string }>>([]);
  const duplicateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<DocumentForm>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      isPublic: true,
      category: (searchParams.get('category') as DocumentCategory) || undefined,
    },
  });

  useEffect(() => {
    api.get('/iso-controls', { params: { limit: 100 } }).then(({ data }) => {
      setIsoControls(data.data || []);
    }).catch(err => console.error('Failed to load ISO controls:', err));
    // Load reviewers (REVIEWER+ roles)
    api.get('/users/directory', { params: { limit: 200 } }).then(({ data }) => {
      const eligible = (data.data || []).filter((u: any) =>
        ['SUPER_ADMIN', 'ADMIN', 'DIRECTION', 'REVIEWER'].includes(u.role) && u.isActive
      );
      setReviewers(eligible);
    }).catch(console.error);
  }, []);

  // Auto-classify when title reaches 10+ characters (debounced 800ms)
  const watchedTitle = watch('title');
  useEffect(() => {
    if (!watchedTitle || watchedTitle.length < 10) {
      setAutoClassifySuggestion(null);
      return;
    }
    if (autoClassifyTimer.current) clearTimeout(autoClassifyTimer.current);
    autoClassifyTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/iso-analyzer/classify', { title: watchedTitle, description: watch('description') || '' });
        if (data.classification || data.category) {
          setAutoClassifySuggestion({ classification: data.classification, category: data.category });
        }
      } catch {
        // silently ignore
      }
    }, 800);
    return () => {
      if (autoClassifyTimer.current) clearTimeout(autoClassifyTimer.current);
    };
  }, [watchedTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Duplicate detection: debounced search by title (600ms)
  useEffect(() => {
    if (!watchedTitle || watchedTitle.length < 5) {
      setDuplicates([]);
      return;
    }
    if (duplicateTimer.current) clearTimeout(duplicateTimer.current);
    duplicateTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/documents', { params: { search: watchedTitle, limit: 5 } });
        const results = (data?.data || data || []) as Array<{ id: string; title: string; reference: string; status: string }>;
        setDuplicates(results.filter((d) => d.title.toLowerCase() !== watchedTitle.toLowerCase()).slice(0, 3));
      } catch {
        setDuplicates([]);
      }
    }, 600);
    return () => {
      if (duplicateTimer.current) clearTimeout(duplicateTimer.current);
    };
  }, [watchedTitle]);

  // Warn on unsaved changes when navigating away
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty || file) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, file]);

  const handleAutoClassify = async () => {
    const title = watch('title');
    const description = watch('description');
    if (!title || title.length < 3) {
      toast.error('Saisissez un titre avant de lancer l\'auto-classification');
      return;
    }
    setClassifying(true);
    try {
      const { data } = await api.post('/iso-analyzer/classify', { title, description: description || '' });
      if (data.classification) setValue('classification', data.classification);
      if (data.category) setValue('category', data.category);
      toast.success(`Suggestion : ${data.classification || '—'} / ${data.category || '—'}`);
    } catch {
      toast.error('Erreur lors de l\'auto-classification');
    } finally {
      setClassifying(false);
    }
  };

  // Compute the current wizard step based on form completion
  const watchedCategory = watch('category');
  const watchedClassification = watch('classification');
  const watchedDomain = watch('domain');
  const currentStep: number = (() => {
    // Step 1: title + domain + description filled
    if (!watchedTitle || watchedTitle.length < 3 || !watchedDomain || watchedDomain.length < 1) return 1;
    // Step 2: category + classification chosen
    if (!watchedCategory || !watchedClassification) return 2;
    // Step 3: validation (reviewer, file, submit)
    return 3;
  })();

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

  const handleSaveDraft = async () => {
    const formData = watch();
    if (!formData.title || formData.title.length < 3) {
      toast.error('Un titre (min 3 caractères) est requis même pour un brouillon');
      return;
    }
    if (!formData.category) {
      toast.error('Une catégorie est requise');
      return;
    }
    if (!formData.domain || formData.domain.length < 1) {
      toast.error('Un domaine est requis');
      return;
    }
    setSavingDraft(true);
    try {
      const { data: doc } = await api.post('/documents', {
        ...formData,
        isoControlIds: selectedControls,
        ...(selectedReviewerId && { reviewerId: selectedReviewerId }),
      });
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('changeLog', 'Version initiale (brouillon)');
        await api.post(`/documents/${doc.id}/versions`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success('Brouillon enregistré');
      router.push(`/documents/${doc.id}`);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur';
      toast.error(msg);
    } finally {
      setSavingDraft(false);
    }
  };

  const onSubmit = async (data: DocumentForm) => {
    setLoading(true);
    try {
      // Create document
      const { data: doc } = await api.post('/documents', {
        ...data,
        isoControlIds: selectedControls,
        ...(selectedReviewerId && { reviewerId: selectedReviewerId }),
      });

      // Upload file if provided
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('changeLog', t('documents.new.initialVersion'));
        await api.post(`/documents/${doc.id}/versions`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      toast.success(t('documents.new.success'));
      router.push(`/documents/${doc.id}`);
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || t('documents.new.error');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-taupe" />
        </button>
        <div>
          <h1 className="text-2xl font-medium text-navy dark:text-white">{t('documents.new.title')}</h1>
          <p className="text-sm text-taupe dark:text-slate-400 mt-1">{t('documents.new.subtitle')}</p>
        </div>
      </div>

      {/* Wizard stepper */}
      <Card>
        <CardContent className="py-5 px-6">
          <StepperIndicator currentStep={currentStep} />
        </CardContent>
      </Card>

      {/* Template selector */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-navy dark:text-white">Choisir un modèle</h2>
          <p className="text-sm text-taupe dark:text-slate-400 mt-0.5">Sélectionnez un modèle ISO 27001 pour pré-remplir le formulaire</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ISO_TEMPLATES.map((tpl) => {
              const isActive = selectedTemplate === tpl.id;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      setSelectedTemplate(null);
                    } else {
                      setSelectedTemplate(tpl.id);
                      setValue('title', tpl.titlePrefix + ' — ');
                      setValue('category', tpl.category);
                      setValue('classification', tpl.classificationDefault);
                    }
                  }}
                  className={[
                    'flex items-start gap-3 rounded-lg border p-3 text-left transition-all',
                    isActive
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                      : 'border-gray-200 dark:border-slate-700 hover:border-primary/50 hover:bg-gray-50 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  <div className="mt-0.5 flex-shrink-0">{tpl.icon}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy dark:text-white leading-snug">{tpl.titlePrefix}</p>
                    <p className="text-xs text-taupe dark:text-slate-400 mt-0.5 leading-snug">{tpl.description}</p>
                    <span className={[
                      'mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      tpl.classificationDefault === 'CONFIDENTIEL' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                      tpl.classificationDefault === 'INTERNE' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                    ].join(' ')}>
                      {tpl.classificationDefault}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedTemplate && (
            <p className="mt-3 text-xs text-taupe dark:text-slate-400">
              Modèle appliqué — vous pouvez modifier les champs ci-dessous.{' '}
              <button
                type="button"
                className="text-primary hover:underline font-semibold"
                onClick={() => setSelectedTemplate(null)}
              >
                Réinitialiser
              </button>
            </p>
          )}
        </CardContent>
      </Card>

      <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(onSubmit)(); } }}>
        <Card>
          <CardHeader>
            <h2 className="text-lg font-medium text-navy dark:text-white">{t('documents.new.formTitle')}</h2>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reference preview */}
            {watchedTitle && watchedTitle.length >= 3 && (
              <div className="rounded-xl border border-dashed border-gray-300 dark:border-slate-600 bg-gray-50/50 dark:bg-slate-800/30 px-4 py-2.5 flex items-center gap-3 transition-all duration-200">
                <FileText className="h-4 w-4 text-taupe dark:text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-taupe dark:text-slate-500 font-medium">Référence générée</p>
                  <p className="text-sm font-mono font-medium text-navy dark:text-white">
                    {(watch('category') || 'DOC').substring(0, 3).toUpperCase()}-{new Date().getFullYear()}-{String(Math.floor(Math.random() * 900) + 100).padStart(3, '0')}
                  </p>
                </div>
                {watch('classification') && (
                  <span className={`ml-auto inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${CLASSIFICATION_COLORS[watch('classification') || ''] || ''}`}>
                    {watch('classification')}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left column: Title, Domain, Description */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.titleLabel')}</label>
                    <Tooltip text="Titre complet du document. Sera utilise pour la recherche et la reference." />
                  </div>
                  <Input
                    placeholder={t('documents.new.titlePlaceholder')}
                    error={errors.title?.message}
                    autoFocus
                    {...register('title')}
                  />
                  {/* Duplicate detection warning */}
                  {duplicates.length > 0 && (
                    <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                            Documents similaires existants
                          </p>
                          <ul className="mt-1.5 space-y-1">
                            {duplicates.map((d) => (
                              <li key={d.id} className="text-xs text-amber-600 dark:text-amber-400">
                                <a
                                  href={`/documents/${d.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:underline"
                                >
                                  {d.reference}
                                </a>{' '}
                                — {d.title} <span className="text-[10px] opacity-75">({d.status})</span>
                              </li>
                            ))}
                          </ul>
                          <p className="text-[10px] text-amber-600/80 dark:text-amber-400/70 mt-1">
                            Ceci n&apos;est pas bloquant, vous pouvez poursuivre la creation.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.domainLabel')}</label>
                    <Tooltip text="Domaine d'application du document (ex: Securite reseau, Gestion des acces)." />
                  </div>
                  <Input
                    placeholder={t('documents.new.domainPlaceholder')}
                    error={errors.domain?.message}
                    {...register('domain')}
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.descriptionLabel')}</label>
                    <Tooltip text="Description detaillee du contenu et de l'objectif du document." />
                  </div>
                  <Textarea
                    placeholder={t('documents.new.descriptionPlaceholder')}
                    {...register('description')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center mb-1">
                      <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.nextReview')}</label>
                      <Tooltip text="Date de la prochaine revision obligatoire du document." />
                    </div>
                    <input
                      type="date"
                      {...register('nextReviewDate')}
                      aria-label={t('documents.new.nextReview')}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        {...register('isPublic')}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-navy dark:text-white">{t('documents.new.isPublic')}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right column: Category, Classification, Reviewer */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.categoryLabel')}</label>
                    <Tooltip text="Categorie ISO 27001 du document (Politique, Procedure, Plan, etc.)." />
                  </div>
                  <Select
                    options={categoryOptions}
                    placeholder={t('documents.new.selectPlaceholder')}
                    error={errors.category?.message}
                    {...register('category')}
                  />
                </div>

                <div>
                  <div className="flex items-center mb-1">
                    <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.classificationLabel')}</label>
                    <Tooltip text="Niveau de confidentialité. Détermine les droits d'accès au document." />
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select
                        options={classificationOptions}
                        placeholder={t('documents.new.selectPlaceholder')}
                        {...register('classification')}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAutoClassify}
                      loading={classifying}
                      className="mb-0.5 flex-shrink-0"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Auto
                    </Button>
                  </div>
                  {/* Classification color indicator */}
                  {watch('classification') && SLA_CLASSIFICATION_HELP[watch('classification') || ''] && (
                    <p className={`mt-1.5 text-[11px] font-medium ${ALL_CLASSIFICATIONS.find(c => c.value === watch('classification'))?.color || 'text-taupe'}`}>
                      {SLA_CLASSIFICATION_HELP[watch('classification') || '']}
                    </p>
                  )}
                </div>

                {/* Auto-classify suggestion banner */}
                {autoClassifySuggestion && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-between transition-all duration-200">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="text-xs">
                        <span className="font-medium text-navy dark:text-white">Suggestion IA : </span>
                        {autoClassifySuggestion.category && (
                          <span className="text-taupe dark:text-slate-400">
                            Categorie <span className="font-medium text-navy dark:text-white">{DOCUMENT_CATEGORY_LABELS[autoClassifySuggestion.category as DocumentCategory] || autoClassifySuggestion.category}</span>
                          </span>
                        )}
                        {autoClassifySuggestion.classification && (
                          <span className="text-taupe dark:text-slate-400">
                            {autoClassifySuggestion.category ? ' / ' : ''}
                            Classification <span className="font-medium text-navy dark:text-white">{autoClassifySuggestion.classification}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (autoClassifySuggestion.category) setValue('category', autoClassifySuggestion.category as DocumentCategory);
                        if (autoClassifySuggestion.classification) setValue('classification', autoClassifySuggestion.classification);
                        setAutoClassifySuggestion(null);
                        toast.success('Suggestion appliquee');
                      }}
                      className="text-xs font-medium text-primary hover:underline flex-shrink-0"
                    >
                      Appliquer
                    </button>
                  </div>
                )}

                {/* Reviewer selection */}
                {reviewers.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center mb-1">
                      <label className="text-[13px] font-medium text-navy dark:text-white">Réviseur / Approbateur</label>
                      <Tooltip text="Personne responsable de la validation du document avant publication." />
                    </div>
                    <select
                      value={selectedReviewerId}
                      onChange={(e) => setSelectedReviewerId(e.target.value)}
                      aria-label="Réviseur / Approbateur"
                      className="w-full rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    >
                      <option value="">Aucun (assignation ultérieure)</option>
                      {reviewers.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.firstName} {r.lastName} -- {r.role}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-taupe dark:text-slate-500">Le réviseur sera notifié lors de la soumission</p>
                  </div>
                )}
              </div>
            </div>

            {/* ISO Controls - full width section */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-slate-700">
              <div className="flex items-center">
                <label className="text-[13px] font-medium text-navy dark:text-white">{t('documents.new.isoControls')}</label>
                <Tooltip text="Controles ISO 27001 couverts par ce document. Impacte le taux de couverture conformité." />
              </div>
              <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                {selectedControls.map((id) => {
                  const ctrl = isoControls.find((c) => c.id === id);
                  if (!ctrl) return null;
                  return (
                    <IsoControlBadge
                      key={id}
                      code={ctrl.code}
                      title={ctrl.titleFr || ctrl.title}
                      onClick={() => setSelectedControls((prev) => prev.filter((c) => c !== id))}
                    />
                  );
                })}
              </div>
              <input
                type="text"
                placeholder={t('documents.new.isoSearch')}
                value={controlSearch}
                onChange={(e) => setControlSearch(e.target.value)}
                aria-label={t('documents.new.isoSearch')}
                className="w-full rounded-btn border border-gray-300 dark:border-slate-700 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white placeholder:text-taupe focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              {controlSearch && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
                  {filteredControls.slice(0, 10).map((ctrl) => (
                    <button
                      key={ctrl.id}
                      type="button"
                      onClick={() => {
                        setSelectedControls((prev) => [...prev, ctrl.id]);
                        setControlSearch('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 text-sm transition-colors duration-200"
                    >
                      <span className="font-mono font-medium text-navy dark:text-white">{ctrl.code}</span>
                      <span className="text-taupe ml-2">{ctrl.titleFr || ctrl.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* File upload */}
            <div>
              <label className="block text-[13px] font-semibold text-navy dark:text-white mb-1">
                {t('documents.new.fileLabel')}
              </label>
              <FileUploadZone
                onFileSelect={setFile}
                selectedFile={file}
                onClear={() => setFile(null)}
              />
              {/* File preview */}
              {file && (
                <div className="mt-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-3 flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {file.type.includes('pdf') ? (
                      <FileText className="h-8 w-8 text-red-500" />
                    ) : file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.doc') ? (
                      <FileText className="h-8 w-8 text-blue-500" />
                    ) : file.type.includes('sheet') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ? (
                      <FileSpreadsheet className="h-8 w-8 text-green-500" />
                    ) : (
                      <File className="h-8 w-8 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy dark:text-white truncate">{file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-taupe dark:text-slate-400">{formatFileSize(file.size)}</span>
                      <span className="text-xs text-taupe dark:text-slate-400">{file.type || 'Type inconnu'}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-taupe hover:text-red-500 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter>
            <div className="flex justify-between">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                <X className="h-4 w-4" />
                {t('documents.new.cancel')}
              </Button>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleSaveDraft}
                  loading={savingDraft}
                  disabled={loading}
                >
                  <FilePlus className="h-4 w-4" />
                  Brouillon
                </Button>
                <Button type="submit" loading={loading} disabled={savingDraft}>
                  <Save className="h-4 w-4" />
                  {t('documents.new.submit')}
                </Button>
              </div>
            </div>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}
