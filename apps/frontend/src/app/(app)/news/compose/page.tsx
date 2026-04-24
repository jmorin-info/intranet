'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n';
import { UserRole } from '@omnitech/shared';
import DOMPurify from 'dompurify';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  Input,
  ConfirmDialog,
  Dialog,
  Badge,
} from '@omnitech/ui';
import { ArrowLeft, Save, Send, X, Image, FileText, RefreshCw, Eye, EyeOff, Sparkles, Newspaper } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';

// Schéma local étendu (incl. champs optionnels) — réutilise les règles min de @/lib/validation/schemas
const newsSchema = z.object({
  title: z.string().min(3, 'Titre requis (min. 3 caractères)').max(200, '200 caractères max'),
  excerpt: z.string().max(500, '500 caractères max').optional().or(z.literal('')),
  content: z.string().min(10, 'Contenu requis (minimum 10 caractères)'),
  category: z.string().optional(),
  coverImageUrl: z.string().url('URL invalide').optional().or(z.literal('')),
  isPinned: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

type NewsForm = z.infer<typeof newsSchema>;

const TEMPLATES = [
  { name: 'Annonce', content: '<h2>Titre de l\'annonce</h2><p>Description...</p>' },
  { name: 'Mise à jour sécurité', content: '<h2>Mise à jour sécurité</h2><h3>Contexte</h3><p>...</p><h3>Actions requises</h3><ul><li>...</li></ul>' },
  { name: 'Événement', content: '<h2>Événement</h2><p><strong>Date :</strong> ...</p><p><strong>Lieu :</strong> ...</p><p>...</p>' },
];

const roleOptions = Object.values(UserRole);

export default function ComposeNewsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('image');
  const [notifyOnPublish, setNotifyOnPublish] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [suggestedCategories, setSuggestedCategories] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewsForm>({
    resolver: zodResolver(newsSchema),
    mode: 'onTouched',
    defaultValues: {
      isPublished: true,
      isPinned: false,
    },
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const editorInitialized = useRef(false);
  const content = watch('content') || '';
  const setContent = (val: string) => {
    setValue('content', val, { shouldValidate: true });
    if (editorRef.current && editorRef.current.innerHTML !== val) {
      editorRef.current.innerHTML = val;
    }
  };
  // Initialize editor content on mount (only once)
  React.useEffect(() => {
    if (editorRef.current && !editorInitialized.current) {
      editorInitialized.current = true;
      if (content) {
        editorRef.current.innerHTML = content;
      }
    }
  }, [content]);
  const plainText = content.replace(/<[^>]+>/g, '');
  const wordCount = plainText.split(/\s+/).filter(Boolean).length;
  const charCount = plainText.length;

  // Smart category suggestions based on content keywords
  const CATEGORY_KEYWORDS: Record<string, string[]> = {
    'Sécurité': ['sécurité', 'vulnérabilité', 'cyberattaque', 'phishing', 'ransomware', 'firewall', 'patch', 'cve', 'incident', 'menace'],
    'SMSI': ['smsi', 'iso 27001', 'audit', 'conformité', 'politique', 'certification', 'norme', 'procédure'],
    'RH': ['recrutement', 'congé', 'formation', 'paie', 'entretien', 'onboarding', 'collaborateur', 'télétravail'],
    'IT': ['serveur', 'réseau', 'infrastructure', 'déploiement', 'migration', 'cloud', 'sauvegarde', 'maintenance'],
    'Formation': ['formation', 'atelier', 'webinaire', 'sensibilisation', 'e-learning', 'certification', 'compétence'],
    'Événement': ['événement', 'séminaire', 'conférence', 'team building', 'afterwork', 'soirée', 'salon'],
    'Vie d\'entreprise': ['bienvenue', 'anniversaire', 'départ', 'arrivée', 'fête', 'équipe'],
    'Général': [],
  };

  useEffect(() => {
    const lowerText = (watch('title') || '').toLowerCase() + ' ' + plainText.toLowerCase();
    if (lowerText.trim().length < 10) { setSuggestedCategories([]); return; }
    const scored = Object.entries(CATEGORY_KEYWORDS)
      .filter(([, keywords]) => keywords.length > 0)
      .map(([cat, keywords]) => ({
        cat,
        score: keywords.reduce((s, kw) => s + (lowerText.includes(kw) ? 1 : 0), 0),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ cat }) => cat);
    setSuggestedCategories(scored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch('title'), plainText]);

  const onSubmit = async (data: NewsForm) => {
    setLoading(true);
    try {
      const result = await api.post('/news', {
        ...data,
        targetRoles: selectedRoles.length > 0 ? selectedRoles : undefined,
      });
      toast.success(t('newsCompose.published'));

      // Send broadcast notification if checkbox is checked
      if (notifyOnPublish && data.isPublished) {
        try {
          await api.post('/notifications/broadcast', {
            type: 'NEWS_POSTED',
            title: `Nouvel article : ${data.title}`,
            body: data.excerpt || data.title,
            resourceType: 'NewsPost',
            resourceId: result.data?.id,
          });
          toast.success('Notification envoyee a tous les utilisateurs');
        } catch {
          toast.error('Article publie mais la notification a echoue');
        }
      }

      router.push('/news');
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`mx-auto space-y-6 ${showPreview ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <PageHeader
        title={t('newsCompose.title')}
        subtitle={t('newsCompose.subtitle')}
        icon={Newspaper}
        hub="work"
        actions={
          <>
            <button onClick={() => router.back()} className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors" aria-label="Retour">
              <ArrowLeft className="h-5 w-5 text-seal-gray-500" />
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${showPreview ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 dark:border-slate-700 text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800'}`}
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? 'Masquer l\'aperçu' : 'Aperçu live'}
            </button>
          </>
        }
      />

      <div className={`${showPreview ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}`}>
      <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(onSubmit)(); } }}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input
              label={t('newsCompose.label.title')}
              placeholder={t('newsCompose.titlePlaceholder')}
              error={errors.title?.message}
              autoFocus
              {...register('title')}
            />

            <Input
              label={t('newsCompose.label.excerpt')}
              placeholder={t('newsCompose.excerptPlaceholder')}
              {...register('excerpt')}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">{t('newsCompose.label.category')}</label>
                <input
                  list="news-category-suggestions"
                  placeholder={t('newsCompose.categoryPlaceholder')}
                  {...register('category')}
                  className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <datalist id="news-category-suggestions">
                  <option value="Sécurité" />
                  <option value="RH" />
                  <option value="IT" />
                  <option value="Général" />
                  <option value="SMSI" />
                  <option value="Vie d'entreprise" />
                  <option value="Formation" />
                </datalist>
                {suggestedCategories.length > 0 && !watch('category') && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Sparkles className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">Suggestions :</span>
                    {suggestedCategories.map(cat => (
                      <button key={cat} type="button"
                        onClick={() => setValue('category', cat)}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition">
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">Image de couverture</label>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer">
                    <input type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const fd = new FormData();
                        fd.append('file', f);
                        try {
                          const { data } = await api.post('/news/upload-cover', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                          if (data.url) { setValue('coverImageUrl', data.url); toast.success('Image uploadée'); }
                        } catch { toast.error('Erreur upload image'); }
                      }}
                    />
                    <span className="flex items-center justify-center gap-1.5 w-full rounded-btn border border-dashed border-gray-300 dark:border-slate-600 px-3 py-2 text-xs text-seal-gray-500 hover:border-primary hover:text-primary transition cursor-pointer">
                      <Image className="h-3.5 w-3.5" /> Choisir une image
                    </span>
                  </label>
                </div>
                {watch('coverImageUrl') && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-emerald-600 truncate flex-1">{watch('coverImageUrl')}</span>
                    <button
                      type="button"
                      onClick={() => setValue('coverImageUrl', '')}
                      className="text-[10px] text-seal-gray-500 hover:text-red-500 underline"
                    >Retirer</button>
                  </div>
                )}
                {/* input registered hidden : permet au form de tracker la valeur */}
                <input type="hidden" {...register('coverImageUrl')} />
              </div>
            </div>

            {/* Template selector */}
            <div>
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white mb-1">Modèle</label>
              <div className="flex gap-2 flex-wrap">
                {TEMPLATES.map(tpl => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => {
                      if (content) { setPendingTemplate(tpl.content); return; }
                      setContent(tpl.content);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-seal-navy dark:text-white transition"
                  >
                    <FileText className="h-3 w-3" />
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">{t('newsCompose.label.content')}</label>
              {/* WYSIWYG toolbar */}
              <div className="flex flex-wrap items-center gap-1 border border-b-0 border-gray-300 dark:border-slate-600 rounded-t-lg p-2 bg-gray-50 dark:bg-slate-800 overflow-x-auto">
                {[
                  { cmd: 'bold', label: 'B', style: 'font-semibold', title: t('newsCompose.toolbar.bold') },
                  { cmd: 'italic', label: 'I', style: 'italic', title: t('newsCompose.toolbar.italic') },
                  { cmd: 'formatBlock:H2', label: 'H2', style: 'font-semibold', title: t('newsCompose.toolbar.heading') },
                  { cmd: 'formatBlock:H3', label: 'H3', style: 'font-semibold', title: t('newsCompose.toolbar.subheading') },
                  { cmd: 'insertUnorderedList', label: '\u2022', style: 'font-semibold', title: t('newsCompose.toolbar.list') },
                ].map(({ cmd, label, style, title }) => (
                  <button key={cmd} type="button" title={title}
                    onClick={() => {
                      const parts = cmd.split(':');
                      document.execCommand(parts[0]!, false, parts[1] ?? '');
                      editorRef.current?.focus();
                    }}
                    className={`px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white ${style || 'font-semibold'}`}
                  >{label}</button>
                ))}
                <button
                  type="button"
                  title="Citation"
                  onClick={() => {
                    document.execCommand('insertHTML', false, '<blockquote><p>Citation</p></blockquote><p><br></p>');
                    editorRef.current?.focus();
                  }}
                  className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
                >“
                </button>
                <button
                  type="button"
                  title="Bloc de code"
                  onClick={() => {
                    document.execCommand('insertHTML', false, '<pre><code>// code</code></pre><p><br></p>');
                    editorRef.current?.focus();
                  }}
                  className="px-2 py-1 text-[10px] font-mono font-semibold rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
                >&lt;/&gt;</button>
                <button
                  type="button"
                  title="Insérer une image"
                  onClick={() => { setImageUrl(''); setImageAlt('image'); setShowImageDialog(true); }}
                  className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
                >
                  <Image className="h-3.5 w-3.5 inline" />
                </button>
              </div>
              {/* Editable area — utilise .wiki-content pour un rendu cohérent
                  (code, citations, tables) avec le reader + dark mode propre. */}
              <div
                ref={editorRef}
                contentEditable
                className="w-full max-w-full min-h-[200px] rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-4 py-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 overflow-x-auto overflow-y-auto wiki-content break-words"
                onInput={(e) => setValue('content', (e.target as HTMLDivElement).innerHTML, { shouldValidate: true })}
                suppressContentEditableWarning
              />
              {errors.content?.message && (
                <p className="text-xs text-red-500 mt-1">{errors.content.message}</p>
              )}
              {/* Word / character count */}
              <div className="flex justify-end mt-1">
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                  {wordCount} mot{wordCount !== 1 ? 's' : ''}, {charCount} caractère{charCount !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            {/* Target roles */}
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                {t('newsCompose.targetRoles')}
              </label>
              <div className="flex flex-wrap gap-2">
                {roleOptions.map((role) => (
                  <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRoles((prev) => [...prev, role]);
                        } else {
                          setSelectedRoles((prev) => prev.filter((r) => r !== role));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-seal-navy dark:text-white">{role}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('isPinned')}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-seal-navy dark:text-white">{t('newsCompose.pinTop')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register('isPublished')}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-seal-navy dark:text-white">{t('newsCompose.publishNow')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyOnPublish}
                  onChange={(e) => setNotifyOnPublish(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-seal-navy dark:text-white">Publier et notifier</span>
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">(envoie une notification a tous les utilisateurs)</span>
              </label>
            </div>
          </CardContent>

          <CardFooter>
            <div className="flex justify-end gap-3">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                <X className="h-4 w-4" />
                {t('newsCompose.cancel')}
              </Button>
              <Button type="submit" loading={loading || isSubmitting} disabled={loading || isSubmitting}>
                {loading || isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {loading || isSubmitting ? 'Publication…' : t('newsCompose.publish')}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </form>

      {/* Live preview panel */}
      {showPreview && (
        <div className="hidden lg:block">
          <Card className="sticky top-20 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <CardHeader>
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Aperçu de l&apos;article
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {watch('coverImageUrl') && (
                <div className="relative h-40 rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={watch('coverImageUrl')} alt="Couverture" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex items-center gap-2">
                {watch('category') && (
                  <Badge variant="primary">{watch('category')}</Badge>
                )}
              </div>
              <h2 className="text-xl font-medium text-seal-navy dark:text-white">
                {watch('title') || 'Titre de l\'article'}
              </h2>
              {watch('excerpt') && (
                <p className="text-sm text-seal-gray-500 dark:text-slate-400 italic">
                  {watch('excerpt')}
                </p>
              )}
              <hr className="border-gray-100 dark:border-slate-700" />
              {content ? (
                <div
                  className="prose prose-sm max-w-none prose-headings:text-seal-navy dark:prose-headings:text-white prose-a:text-primary dark:prose-p:text-slate-300 dark:prose-li:text-slate-300 dark:prose-strong:text-white"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
                />
              ) : (
                <p className="text-sm text-seal-gray-500 dark:text-slate-500 italic">Le contenu apparaîtra ici...</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      </div>

      <ConfirmDialog
        open={!!pendingTemplate}
        onClose={() => setPendingTemplate(null)}
        onConfirm={() => { setContent(pendingTemplate!); setPendingTemplate(null); }}
        title="Remplacer le contenu"
        description="Remplacer le contenu actuel par le modèle ?"
        confirmLabel="Remplacer"
        variant="primary"
      />

      <Dialog open={showImageDialog} onClose={() => setShowImageDialog(false)} title="Insérer une image">
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-seal-navy dark:text-white mb-1">URL de l&apos;image</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..."
              aria-label="URL de l'image"
              className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-seal-navy dark:text-white mb-1">Texte alternatif</label>
            <input value={imageAlt} onChange={e => setImageAlt(e.target.value)} placeholder="Description de l'image"
              aria-label="Texte alternatif de l'image"
              className="w-full rounded-btn border border-gray-300 dark:border-slate-600 px-3 py-2 text-sm dark:bg-slate-800 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowImageDialog(false)}>Annuler</Button>
            <Button onClick={() => {
              if (!imageUrl) return;
              if (editorRef.current) {
                editorRef.current.focus();
                document.execCommand('insertImage', false, imageUrl);
                // Find the just-inserted image and set alt/style
                const imgs = editorRef.current.querySelectorAll('img');
                const lastImg = imgs[imgs.length - 1];
                if (lastImg) {
                  lastImg.alt = imageAlt;
                  lastImg.style.maxWidth = '100%';
                }
                setValue('content', editorRef.current.innerHTML, { shouldValidate: true });
              }
              setShowImageDialog(false);
            }}>Insérer</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
