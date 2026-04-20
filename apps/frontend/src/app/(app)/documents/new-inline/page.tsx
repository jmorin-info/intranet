'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  Input,
  Textarea,
  Select,
} from '@omnitech/ui';
import { ArrowLeft, Save, FileText } from 'lucide-react';
import { api } from '@/lib/api';
const InlineEditor = dynamic(
  () => import('@/components/documents/inline-editor').then((m) => m.InlineEditor),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);
import {
  DocumentCategory,
  DOCUMENT_CATEGORY_LABELS,
} from '@omnitech/shared';
import { useTranslation } from '@/lib/i18n';

const CATEGORY_OPTIONS = Object.values(DocumentCategory).map((c) => ({
  value: c,
  label: DOCUMENT_CATEGORY_LABELS[c],
}));

const CLASSIFICATION_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNE', label: 'Interne' },
  { value: 'CONFIDENTIEL', label: 'Confidentiel' },
  { value: 'SECRET', label: 'Secret' },
];

export default function NewInlineDocumentPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory | ''>('');
  const [classification, setClassification] = useState('INTERNE');
  const [domain, setDomain] = useState('GEN');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (title.trim().length < 3) {
      toast.error('Titre requis (min. 3 caractères)');
      return;
    }
    if (!category) {
      toast.error('Catégorie requise');
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post('/documents/inline', {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        classification,
        domain,
        content,
      });
      toast.success('Document créé');
      router.push(`/documents/${data.id}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Erreur lors de la création';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.push('/documents')}>
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
      </div>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-medium text-navy dark:text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Nouveau document en ligne
          </h1>
          <p className="text-sm text-taupe dark:text-slate-400">
            Rédigez directement une politique ou une procédure sans fichier
            externe. ISO 27001 A.5.1 — GED native.
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">
                Titre
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Politique de mots de passe"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">
                Domaine
              </label>
              <Input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="GEN"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">
                Catégorie
              </label>
              <Select
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as DocumentCategory)
                }
                options={[
                  { value: '', label: '— Choisir —' },
                  ...CATEGORY_OPTIONS,
                ]}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">
                Classification
              </label>
              <Select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                options={CLASSIFICATION_OPTIONS}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider">
              Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Résumé court du document…"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-navy dark:text-slate-300 uppercase tracking-wider mb-1 block">
              Contenu
            </label>
            <InlineEditor value={content} onChange={setContent} />
          </div>
        </CardContent>

        <CardFooter className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/documents')}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            <Save className="h-4 w-4" />
            {submitting ? 'Création…' : 'Créer'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
