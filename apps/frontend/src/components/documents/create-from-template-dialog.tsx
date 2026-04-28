'use client';

/**
 * Wave D — Create from template dialog.
 *
 * Modale réutilisable affichée depuis /documents (et potentiellement
 * d'autres pages). Liste les templates disponibles, demande les variables
 * définies par le template, puis instancie un Document via
 * `POST /document-templates/:id/instantiate`.
 *
 * REVIEWER+ peut instancier ; pour les rôles inférieurs le bouton trigger
 * doit être conditionné côté parent.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Dialog,
  Button,
  Input,
  Select,
  Skeleton,
  Badge,
  EmptyState,
} from '@omnitech/ui';
import { FileText, Sparkles, ArrowRight, AlertTriangle } from 'lucide-react';
import { logger } from '@/lib/logger';
import { DOCUMENT_CATEGORY_LABELS } from '@omnitech/shared';

type VariableType = 'TEXT' | 'DATE' | 'NUMBER' | 'SELECT';

interface TemplateVariable {
  key: string;
  label: string;
  type: VariableType;
  required?: boolean;
  defaultValue?: string;
  options?: string[];
}

interface TemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  classification: string;
  variableCount: number;
}

interface TemplateFull extends TemplateRow {
  content: string;
  variables: TemplateVariable[];
}

export interface CreateFromTemplateDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (documentId: string) => void;
}

export function CreateFromTemplateDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateFromTemplateDialogProps) {
  const router = useRouter();

  // Step 1 — pick template
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<TemplateFull | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Step 2 — variables values
  const [values, setValues] = useState<Record<string, string>>({});
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data } = await api.get<TemplateRow[]>('/document-templates');
      setTemplates(data);
    } catch (err) {
      logger.error(err, { component: 'create-from-template', context: 'list' });
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchTemplates();
      setSelected(null);
      setValues({});
      setTitle('');
    }
  }, [open, fetchTemplates]);

  const pickTemplate = async (id: string) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get<TemplateFull>(`/document-templates/${id}`);
      setSelected(data);
      // Pre-fill defaults
      const initial: Record<string, string> = {};
      for (const v of data.variables || []) {
        if (v.defaultValue !== undefined) initial[v.key] = String(v.defaultValue);
      }
      setValues(initial);
      setTitle(data.name);
    } catch (err) {
      logger.error(err, {
        component: 'create-from-template',
        context: 'detail',
      });
      toast.error('Impossible de charger le template');
    } finally {
      setLoadingDetail(false);
    }
  };

  const requiredMissing = (selected?.variables || [])
    .filter((v) => v.required)
    .filter((v) => !values[v.key] || String(values[v.key]).trim() === '')
    .map((v) => v.label || v.key);

  const handleInstantiate = async () => {
    if (!selected) return;
    if (requiredMissing.length > 0) {
      toast.error(`Variables requises : ${requiredMissing.join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post(
        `/document-templates/${selected.id}/instantiate`,
        {
          variables: values,
          title: title || undefined,
        },
      );
      toast.success(`Document « ${data.title} » créé`);
      onOpenChange(false);
      onCreated?.(data.id);
      router.push(`/documents/${data.id}`);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || err?.message || 'Création impossible',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        selected
          ? `Instancier : ${selected.name}`
          : 'Créer un document depuis un template'
      }
      className="max-w-2xl"
    >
      {!selected ? (
        // Step 1 — Pick template
        <div className="space-y-3">
          {loadingList ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Aucun template disponible"
              description="Demandez à un administrateur de créer des modèles depuis /admin/document-templates."
            />
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pickTemplate(t.id)}
                  className="w-full text-left border rounded-lg p-3 hover:bg-slate-50 hover:border-blue-300 transition-colors"
                  disabled={loadingDetail}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {(DOCUMENT_CATEGORY_LABELS as any)[t.category] ||
                            t.category}
                        </Badge>
                      </div>
                      {t.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {t.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                        <span>{t.variableCount} variables</span>
                        <span>•</span>
                        <span>{t.classification}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Step 2 — Fill variables
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            ← Choisir un autre template
          </button>

          <div>
            <label className="text-xs font-medium text-slate-700">
              Titre du document
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selected.name}
            />
          </div>

          {selected.variables.length === 0 ? (
            <p className="text-sm text-slate-500 italic">
              Ce template n'a pas de variables — le document sera créé tel
              quel.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Renseignez les variables :
              </p>
              {selected.variables.map((v) => (
                <div key={v.key}>
                  <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                    {v.label || v.key}
                    {v.required && <span className="text-rose-600">*</span>}
                    <code className="text-[10px] bg-slate-100 px-1 rounded text-slate-500">
                      {`{{${v.key}}}`}
                    </code>
                  </label>
                  {v.type === 'SELECT' && v.options && v.options.length > 0 ? (
                    <Select
                      value={values[v.key] || ''}
                      onChange={(e) =>
                        setValues({ ...values, [v.key]: e.target.value })
                      }
                    >
                      <option value="">— Choisir —</option>
                      {v.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={
                        v.type === 'DATE'
                          ? 'date'
                          : v.type === 'NUMBER'
                            ? 'number'
                            : 'text'
                      }
                      value={values[v.key] || ''}
                      onChange={(e) =>
                        setValues({ ...values, [v.key]: e.target.value })
                      }
                      placeholder={v.defaultValue || ''}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {requiredMissing.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 p-2 rounded">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5" />
              <span>
                Variables requises manquantes : {requiredMissing.join(', ')}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button
              onClick={handleInstantiate}
              disabled={submitting || requiredMissing.length > 0}
              className="seal-btn-primary"
            >
              {submitting ? 'Création…' : 'Créer le document'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
