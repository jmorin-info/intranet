'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { Database, Download, Trash2, Upload, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
  type: 'db' | 'storage' | 'unknown';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TYPE_LABELS: Record<string, string> = {
  db: 'Base de données',
  storage: 'Fichiers',
  unknown: 'Autre',
};

export default function BackupsPage() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);
  const [downloadingProject, setDownloadingProject] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<File | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<BackupFile[]>('/backup/list');
      setBackups(data);
    } catch {
      toast.error('Impossible de charger la liste des sauvegardes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.post<{ success: boolean; message: string }>('/backup/export');
      if (data.success) {
        toast.success('Sauvegarde terminée avec succès');
        await loadBackups();
      } else {
        toast.error(data.message || 'Échec de la sauvegarde');
      }
    } catch {
      toast.error('Erreur lors du lancement de la sauvegarde');
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async (filename: string) => {
    try {
      const response = await api.get(`/backup/download/${encodeURIComponent(filename)}`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erreur lors du téléchargement');
    }
  };

  const handleDelete = async (filename: string) => {
    setDeletingFile(filename);
    try {
      await api.delete(`/backup/${encodeURIComponent(filename)}`);
      toast.success(`Sauvegarde supprimée : ${filename}`);
      await loadBackups();
    } catch {
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeletingFile(null);
    }
  };

  const handleFileSelect = (file: File) => {
    const valid = file.name.endsWith('.sql.gz') || file.name.endsWith('.tar.gz') || file.name.endsWith('.tgz');
    if (!valid) {
      toast.error('Format non supporté. Utilisez .sql.gz ou .tar.gz');
      return;
    }
    setConfirmRestore(file);
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setRestoring(true);
    setConfirmRestore(null);
    try {
      const formData = new FormData();
      formData.append('file', confirmRestore);
      const { data } = await api.post<{ success: boolean; message: string }>('/backup/restore', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600_000,
      });
      if (data.success) {
        toast.success('Restauration terminée avec succès');
      } else {
        toast.error(data.message || 'Échec de la restauration');
      }
    } catch {
      toast.error('Erreur lors de la restauration');
    } finally {
      setRestoring(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  return (
    <div className="animate-fade-in-up space-y-6 p-6">
      <PageHeader
        title="Sauvegardes & Restauration"
        subtitle="Gestion des backups de la base de données et du stockage"
        icon={Database}
        hub="admin"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg bg-[#004469] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#003352] disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {exporting ? 'En cours...' : 'Sauvegarde DB'}
            </button>
            <button
              onClick={async () => {
                setExportingFull(true);
                try {
                  const { data } = await api.post('/backup/export-full-network');
                  if (data.success) toast.success(data.message);
                  else toast.error(data.message);
                  loadBackups();
                } catch { toast.error('Échec sauvegarde réseau'); }
                finally { setExportingFull(false); }
              }}
              disabled={exportingFull}
              className="inline-flex items-center gap-2 rounded-lg bg-[#296DC1] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#1e5ba0] disabled:opacity-50"
            >
              {exportingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {exportingFull ? 'Envoi en cours...' : 'Sauvegarder sur serveur'}
            </button>
            <button
              onClick={async () => {
                setDownloadingProject(true);
                try {
                  const res = await api.get('/backup/download-project', { responseType: 'blob' });
                  const url = window.URL.createObjectURL(res.data);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `omnitech-project-${new Date().toISOString().slice(0,10)}.tar.gz`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                  toast.success('Téléchargement démarré');
                } catch { toast.error('Échec du téléchargement'); }
                finally { setDownloadingProject(false); }
              }}
              disabled={downloadingProject}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-[#004469] dark:text-white transition hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              {downloadingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloadingProject ? 'Préparation...' : 'Télécharger le projet'}
            </button>
          </div>
        }
      />

      <AdminGroupTabs group="config" />

      {/* Tableau des sauvegardes */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Sauvegardes disponibles
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="stagger-item shimmer h-12 rounded-lg bg-gray-100 dark:bg-slate-700" />
            ))}
          </div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-slate-400">
            Aucune sauvegarde disponible
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500 dark:border-slate-700 dark:text-slate-400">
                  <th className="px-6 py-3">Nom</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Taille</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b, idx) => (
                  <tr
                    key={b.filename}
                    className="stagger-item animate-fade-in-up border-b border-gray-50 transition hover:bg-gray-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30"
                    style={{ animationDelay: `${idx * 50}ms` }}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-gray-900 dark:text-white">
                      {b.filename}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.type === 'db'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                          : b.type === 'storage'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-slate-600 dark:text-slate-300'
                      }`}>
                        {TYPE_LABELS[b.type] || b.type}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-slate-300">
                      {formatBytes(b.size)}
                    </td>
                    <td className="px-6 py-3 text-gray-600 dark:text-slate-300">
                      {formatDate(b.createdAt)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(b.filename)}
                          className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-100 hover:text-[#004469] dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-blue-300"
                          title="Télécharger"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(b.filename)}
                          disabled={deletingFile === b.filename}
                          className="rounded-lg p-1.5 text-gray-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                          title="Supprimer"
                        >
                          {deletingFile === b.filename ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section Restaurer */}
      <div className="animate-fade-in-up rounded-xl border border-gray-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-gray-200 px-6 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Restaurer une sauvegarde
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Uploadez un fichier .sql.gz (base de données) ou .tar.gz (fichiers) pour restaurer
          </p>
        </div>
        <div className="p-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition ${
              dragOver
                ? 'border-[#004469] bg-blue-50 dark:border-blue-400 dark:bg-blue-900/10'
                : 'border-gray-300 hover:border-gray-400 dark:border-slate-600 dark:hover:border-slate-500'
            } ${restoring ? 'pointer-events-none opacity-50' : ''}`}
          >
            {restoring ? (
              <>
                <Loader2 className="mb-3 h-10 w-10 animate-spin text-[#004469] dark:text-blue-400" />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  Restauration en cours...
                </p>
              </>
            ) : (
              <>
                <Upload className="mb-3 h-10 w-10 text-gray-400 dark:text-slate-500" />
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  Glissez un fichier ici ou cliquez pour sélectionner
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  .sql.gz ou .tar.gz uniquement
                </p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".gz,.tgz"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {/* Dialog de confirmation de restauration */}
      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="animate-fade-in-up mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Confirmer la restauration
              </h3>
            </div>
            <p className="mb-2 text-sm text-gray-600 dark:text-slate-300">
              Vous allez restaurer le fichier :
            </p>
            <p className="mb-4 rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs text-gray-800 dark:bg-slate-700 dark:text-slate-200">
              {confirmRestore.name} ({formatBytes(confirmRestore.size)})
            </p>
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              <strong>Cette action est irréversible.</strong> Les données actuelles seront
              écrasées par le contenu de la sauvegarde.
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmRestore(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                onClick={handleRestore}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
              >
                Restaurer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
