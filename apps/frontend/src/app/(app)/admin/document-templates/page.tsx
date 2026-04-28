'use client';

/**
 * Wave D — Admin / Document Templates.
 *
 * CRUD complet sur les templates de documents Markdown avec variables {{var}}.
 * Réservé aux ADMIN+ ; les autres rôles voient une bannière 403.
 *
 * Capacités :
 *  - Liste avec filtre catégorie + recherche par nom/description
 *  - Création / édition (nom, slug, catégorie, contenu MD, variables, classification)
 *  - Suppression (soft-delete) avec ConfirmDialog
 *  - Aperçu live des variables détectées dans le contenu
 *
 * Référence backend : apps/backend/src/document-templates/
 *
 * Wave G : réactivée depuis worktree-agent-aa82b7046e34551c3 avec adaptation
 *  des types UI (Column key+render, Button primary, Dialog onClose).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole, DOCUMENT_CATEGORY_LABELS } from '@omnitech/shared';
import {
  Card,
  CardContent,
  Button,
  Badge,
  DataTable,
  EmptyState,
  ConfirmDialog,
  Skeleton,
  Dialog,
  Input,
  Textarea,
  Select,
  Tooltip,
} from '@omnitech/ui';
import type { Column } from '@omnitech/ui';
import { formatDate } from '@/lib/utils';
import {
  FileText,
  Plus,
  Trash2,
  Edit2,
  Hash,
  FolderOpen,
  AlertTriangle,
  Variable,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { logger } from '@/lib/logger';

type VariableType = 'TEXT' | 'DATE' | 'NUMBER' | 'SELECT';

interface TemplateVariable {
  key: string;
  label: string;
  type: VariableType;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
}

interface DocumentTemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  classification: string;
  variableCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DocumentTemplateFull extends DocumentTemplateRow {
  content: string;
  variables: TemplateVariable[];
}

const CATEGORY_OPTIONS = Object.entries(DOCUMENT_CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const CLASSIFICATION_OPTIONS = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNE', label: 'Interne' },
  { value: 'CONFIDENTIEL', label: 'Confidentiel' },
  { value: 'SECRET', label: 'Secret' },
];

const VAR_TYPE_OPTIONS: { value: VariableType; label: string }[] = [
  { value: 'TEXT', label: 'Texte' },
  { value: 'DATE', label: 'Date' },
  { value: 'NUMBER', label: 'Nombre' },
  { value: 'SELECT', label: 'Liste' },
];

export default function AdminDocumentTemplatesPage() {
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState<DocumentTemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Create / edit modal
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('POLICY');
  const [classification, setClassification] = useState<string>('INTERNE');
  const [content, setContent] = useState('');
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Delete dialog
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState('');

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      const { data } = await api.get('/document-templates', { params });
      setRows(data);
    } catch (err) {
      logger.error(err, { page: 'admin/document-templates', context: 'list' });
      toast.error('Impossible de charger les templates');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Detect referenced variables in content for live preview
  const detectVariablesInContent = (md: string): string[] => {
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    const seen = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      seen.add(m[1]!);
    }
    return [...seen];
  };

  const referencedVars = detectVariablesInContent(content);
  const declaredKeys = new Set(variables.map((v) => v.key));
  const undeclaredVars = referencedVars.filter((v) => !declaredKeys.has(v));

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSlug('');
    setDescription('');
    setCategory('POLICY');
    setClassification('INTERNE');
    setContent('');
    setVariables([]);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = async (id: string) => {
    try {
      const { data } = await api.get<DocumentTemplateFull>(
        `/document-templates/${id}`,
      );
      setEditingId(id);
      setName(data.name);
      setSlug(data.slug);
      setDescription(data.description || '');
      setCategory(data.category);
      setClassification(data.classification);
      setContent(data.content);
      setVariables(Array.isArray(data.variables) ? data.variables : []);
      setDialogOpen(true);
    } catch (err) {
      logger.error(err, { page: 'admin/document-templates', context: 'load' });
      toast.error('Impossible de charger le template');
    }
  };

  const addVariable = () => {
    setVariables([
      ...variables,
      { key: '', label: '', type: 'TEXT', required: false },
    ]);
  };

  const updateVariable = (idx: number, patch: Partial<TemplateVariable>) => {
    setVariables(variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  };

  const removeVariable = (idx: number) => {
    setVariables(variables.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !slug.trim() || !content.trim()) {
      toast.error('Nom, slug et contenu sont requis');
      return;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      toast.error('Slug doit être en kebab-case (a-z, 0-9, -)');
      return;
    }
    // Front-side validation : keys uniques + non vides + match \w+
    const keys = variables.map((v) => v.key);
    if (keys.some((k) => !k || !/^\w+$/.test(k))) {
      toast.error('Toutes les variables doivent avoir une clé valide (a-z, 0-9, _)');
      return;
    }
    if (new Set(keys).size !== keys.length) {
      toast.error('Les clés de variables doivent être uniques');
      return;
    }
    for (const v of variables) {
      if (v.type === 'SELECT' && (!v.options || v.options.length === 0)) {
        toast.error(`Variable SELECT "${v.key}" doit avoir au moins une option`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name,
        description: description || undefined,
        category,
        classification,
        content,
        variables,
      };
      if (editingId) {
        await api.patch(`/document-templates/${editingId}`, payload);
        toast.success('Template mis à jour');
      } else {
        payload.slug = slug;
        await api.post('/document-templates', payload);
        toast.success('Template créé');
      }
      setDialogOpen(false);
      resetForm();
      fetchTemplates();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(
        e?.response?.data?.message || e?.message || "Erreur lors de l'enregistrement",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/document-templates/${deleteId}`);
      toast.success('Template supprimé');
      setDeleteId(null);
      fetchTemplates();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message || 'Suppression impossible');
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          title="Templates de documents"
          subtitle="Gestion des modèles Markdown variabilisés"
          icon={FileText}
        />
        <Card className="shadow-sm rounded-xl border-amber-200 bg-amber-50">
          <CardContent className="py-6 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">Accès réservé</p>
              <p className="text-xs text-amber-700 mt-1">
                Cette page est réservée aux administrateurs. Vous pouvez
                instancier un template depuis la page Documents.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const columns: Column<DocumentTemplateRow>[] = [
    {
      key: 'name',
      header: 'Nom',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-sm">{r.name}</span>
          {r.description && (
            <span className="text-xs text-slate-500 line-clamp-1">
              {r.description}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (r) => (
        <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">
          {r.slug}
        </code>
      ),
    },
    {
      key: 'category',
      header: 'Catégorie',
      render: (r) => (
        <Badge variant="navy">
          {(DOCUMENT_CATEGORY_LABELS as Record<string, string>)[r.category] || r.category}
        </Badge>
      ),
    },
    {
      key: 'variableCount',
      header: 'Variables',
      render: (r) => (
        <div className="flex items-center gap-1 text-xs text-slate-600">
          <Variable className="h-3 w-3" />
          {r.variableCount}
        </div>
      ),
    },
    {
      key: 'classification',
      header: 'Classification',
      render: (r) => <Badge variant="navy">{r.classification}</Badge>,
    },
    {
      key: 'updatedAt',
      header: 'Mis à jour',
      render: (r) => (
        <span className="text-xs text-slate-500">
          {formatDate(r.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <Tooltip content="Éditer">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openEdit(r.id)}
              aria-label="Éditer"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Supprimer">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDeleteId(r.id);
                setDeleteName(r.name);
              }}
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4 text-rose-600" />
            </Button>
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title="Templates de documents"
        subtitle="Modèles Markdown variabilisés (politiques, procédures, plans)"
        icon={FileText}
        hub="admin"
        actions={
          <Button onClick={openCreate} variant="primary">
            <Plus className="h-4 w-4 mr-1" />
            Nouveau template
          </Button>
        }
      />

      {/* Filtres */}
      <Card className="shadow-sm rounded-xl">
        <CardContent className="py-3 flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Rechercher (nom, description)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="sm:w-56"
            placeholder="Toutes catégories"
            options={CATEGORY_OPTIONS}
          />
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm rounded-xl">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Aucun template"
              description="Créez un premier template pour standardiser vos documents."
            />
          ) : (
            <DataTable<DocumentTemplateRow>
              data={rows}
              columns={columns}
              keyExtractor={(r) => r.id}
            />
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          resetForm();
          setDialogOpen(false);
        }}
        title={editingId ? 'Éditer le template' : 'Nouveau template'}
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">Nom *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Politique de mots de passe"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                Slug (URL stable) *
              </label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="politique-mots-de-passe"
                disabled={Boolean(editingId)}
              />
              {editingId && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Le slug est immuable après création.
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700">
              Description
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brève description du template"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-700">
                Catégorie *
              </label>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={CATEGORY_OPTIONS}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-700">
                Classification *
              </label>
              <Select
                value={classification}
                onChange={(e) => setClassification(e.target.value)}
                options={CLASSIFICATION_OPTIONS}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
              Contenu Markdown * <Hash className="h-3 w-3 text-slate-400" />
              <span className="text-[11px] text-slate-500 font-normal">
                — variables : {'{{nom_variable}}'}
              </span>
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={'# Politique\n\nDate : {{date_publication}}\nAuteur : {{auteur}}\n\n…'}
              rows={10}
              className="font-mono text-xs"
            />
            {undeclaredVars.length > 0 && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
                <span>
                  Variables référencées mais non déclarées :{' '}
                  <code>{undeclaredVars.join(', ')}</code>
                </span>
              </div>
            )}
          </div>

          {/* Variables editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-700">
                Variables ({variables.length})
              </label>
              <Button size="sm" variant="outline" onClick={addVariable}>
                <Plus className="h-3 w-3 mr-1" /> Ajouter
              </Button>
            </div>
            {variables.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                Aucune variable. Ajoutez-en pour définir les champs à remplir
                lors de l&apos;instanciation.
              </p>
            ) : (
              <div className="space-y-2">
                {variables.map((v, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-2 bg-slate-50 space-y-2"
                  >
                    <div className="grid grid-cols-12 gap-2">
                      <Input
                        placeholder="key"
                        value={v.key}
                        onChange={(e) =>
                          updateVariable(idx, { key: e.target.value })
                        }
                        className="col-span-3"
                      />
                      <Input
                        placeholder="Label"
                        value={v.label}
                        onChange={(e) =>
                          updateVariable(idx, { label: e.target.value })
                        }
                        className="col-span-4"
                      />
                      <Select
                        value={v.type}
                        onChange={(e) =>
                          updateVariable(idx, {
                            type: e.target.value as VariableType,
                          })
                        }
                        className="col-span-2"
                        options={VAR_TYPE_OPTIONS}
                      />
                      <label className="col-span-2 flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={Boolean(v.required)}
                          onChange={(e) =>
                            updateVariable(idx, { required: e.target.checked })
                          }
                        />
                        Requis
                      </label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeVariable(idx)}
                        className="col-span-1"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </div>
                    {v.type === 'SELECT' && (
                      <Input
                        placeholder="Options (séparées par virgules)"
                        value={(v.options || []).join(',')}
                        onChange={(e) =>
                          updateVariable(idx, {
                            options: e.target.value
                              .split(',')
                              .map((o) => o.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    )}
                    <Input
                      placeholder="Valeur par défaut (optionnel)"
                      value={v.defaultValue || ''}
                      onChange={(e) =>
                        updateVariable(idx, { defaultValue: e.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setDialogOpen(false);
              }}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              variant="primary"
            >
              {submitting
                ? 'Enregistrement…'
                : editingId
                  ? 'Mettre à jour'
                  : 'Créer'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Supprimer le template"
        description={`Le template « ${deleteName} » sera soft-deleted. Les documents existants instanciés depuis ce template restent inchangés.`}
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
