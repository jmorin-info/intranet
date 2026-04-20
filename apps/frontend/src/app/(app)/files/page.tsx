'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, Button, Badge, EmptyState, ConfirmDialog } from '@omnitech/ui';
import { useTranslation } from '@/lib/i18n';
import {
  Folder, File, Download, Upload, ArrowLeft, HardDrive, Globe, Server,
  Briefcase, Calculator, ClipboardList, Users, Lightbulb, Handshake, ChevronRight,
  FileText, Image, FileSpreadsheet, FileArchive, Trash2, FolderPlus, Cloud, Copy,
  Edit3, FileCode, FileVideo, FileAudio, Presentation,
} from 'lucide-react';

const OFFICE_EDITABLE_EXT = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'doc', 'xls', 'ppt'];
function isOfficeFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return OFFICE_EDITABLE_EXT.includes(ext);
}

interface Share { name: string; label: string; icon: string; }
interface FileItem { name: string; type: 'file' | 'directory'; size: number; modified: string; }

const SHARE_ICONS: Record<string, React.ElementType> = {
  globe: Globe, server: Server, briefcase: Briefcase, calculator: Calculator,
  clipboard: ClipboardList, folder: Folder, users: Users, lightbulb: Lightbulb,
  handshake: Handshake,
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext || '')) return <FileText className="h-4 w-4 text-red-500" />;
  if (['doc', 'docx', 'odt'].includes(ext || '')) return <FileText className="h-4 w-4 text-blue-500" />;
  if (['xls', 'xlsx', 'ods', 'csv'].includes(ext || '')) return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  if (['ppt', 'pptx', 'odp'].includes(ext || '')) return <Presentation className="h-4 w-4 text-orange-500" />;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext || '')) return <Image className="h-4 w-4 text-purple-500" />;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext || '')) return <FileArchive className="h-4 w-4 text-amber-500" />;
  if (['mp4', 'avi', 'mkv', 'mov', 'wmv'].includes(ext || '')) return <FileVideo className="h-4 w-4 text-pink-500" />;
  if (['mp3', 'wav', 'ogg', 'flac', 'aac'].includes(ext || '')) return <FileAudio className="h-4 w-4 text-teal-500" />;
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'sh', 'json', 'xml', 'html', 'css', 'sql', 'yaml', 'yml'].includes(ext || '')) return <FileCode className="h-4 w-4 text-cyan-500" />;
  if (['txt', 'md', 'log', 'rtf'].includes(ext || '')) return <FileText className="h-4 w-4 text-gray-500" />;
  return <File className="h-4 w-4 text-seal-gray-500" />;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function FilesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const [shares, setShares] = useState<Share[]>([]);
  const [smbAuthenticated, setSmbAuthenticated] = useState(false);
  const [currentShare, setCurrentShare] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sharesError, setSharesError] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // SMB auth form
  const [smbUsername, setSmbUsername] = useState('');
  const [smbPassword, setSmbPassword] = useState('');
  const [smbAuthLoading, setSmbAuthLoading] = useState(false);

  useEffect(() => {
    api.get('/fileserver/shares').then(({ data }) => {
      setShares(data.shares || data);
      setSmbAuthenticated(data.authenticated ?? false);
    }).catch(() => {
      setSharesError(true);
    }).finally(() => setLoading(false));
  }, []);

  const handleSmbAuth = async () => {
    if (!smbUsername || !smbPassword) return;
    setSmbAuthLoading(true);
    try {
      const { data } = await api.post('/fileserver/authenticate', { username: smbUsername, password: smbPassword });
      if (data.success) {
        toast.success('Connecté au serveur de fichiers');
        setSmbAuthenticated(true);
        setSmbPassword('');
      } else {
        toast.error(data.message || 'Identifiants invalides');
      }
    } catch { toast.error('Erreur de connexion au serveur'); }
    finally { setSmbAuthLoading(false); }
  };

  const loadFiles = useCallback(async (share: string, dir: string) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/fileserver/list/${encodeURIComponent(share)}`, { params: { path: dir } });
      setFiles(data);
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error('Accès refusé — permissions insuffisantes sur ce partage');
      } else {
        toast.error('Impossible de lister les fichiers');
      }
      setFiles([]);
    }
    finally { setLoading(false); }
  }, []);

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === files.length) setSelected(new Set());
    else setSelected(new Set(files.map(f => f.name)));
  };

  const handleDeleteSelected = async () => {
    let deleted = 0;
    for (const name of selected) {
      const filePath = currentPath ? `${currentPath}\\${name}` : name;
      try {
        await api.delete(`/fileserver/file/${encodeURIComponent(currentShare!)}`, { params: { path: filePath } });
        deleted++;
      } catch { /* skip failed */ }
    }
    toast.success(`${deleted} élément(s) supprimé(s)`);
    setSelected(new Set());
    loadFiles(currentShare!, currentPath);
  };

  const handleDownloadSelected = async () => {
    for (const name of selected) {
      const file = files.find(f => f.name === name);
      if (file?.type === 'file') await handleDownload(name);
    }
    setSelected(new Set());
  };

  const handleCreateFolder = async () => {
    if (!newFolderName || !currentShare) return;
    try {
      await api.post(`/fileserver/mkdir/${encodeURIComponent(currentShare)}`, { path: currentPath, name: newFolderName });
      toast.success(`Dossier "${newFolderName}" créé`);
      setShowNewFolder(false); setNewFolderName('');
      loadFiles(currentShare, currentPath);
    } catch { toast.error('Impossible de créer le dossier'); }
  };

  const openShare = (share: string) => {
    setCurrentShare(share);
    setCurrentPath('');
    setSelected(new Set());
    loadFiles(share, '');
  };

  const openFolder = (folderName: string) => {
    const newPath = currentPath ? `${currentPath}\\${folderName}` : folderName;
    setCurrentPath(newPath);
    setSelected(new Set());
    loadFiles(currentShare!, newPath);
  };

  const goBack = () => {
    if (!currentPath) { setCurrentShare(null); setFiles([]); return; }
    const parts = currentPath.split('\\');
    parts.pop();
    const newPath = parts.join('\\');
    setCurrentPath(newPath);
    loadFiles(currentShare!, newPath);
  };

  const handleDownload = async (fileName: string) => {
    const filePath = currentPath ? `${currentPath}\\${fileName}` : fileName;
    try {
      const response = await api.get(`/fileserver/download/${encodeURIComponent(currentShare!)}`, {
        params: { path: filePath },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Erreur de téléchargement'); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentShare) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/fileserver/upload/${encodeURIComponent(currentShare)}?path=${encodeURIComponent(currentPath)}`, formData);
      toast.success(`${file.name} uploadé`);
      loadFiles(currentShare, currentPath);
    } catch { toast.error('Erreur d\'upload'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const handleOpenInOnlyOffice = async (fileName: string) => {
    if (!currentShare) return;
    // Convertit le path local (backslashes) en chemin "share/sub/dir/file" pour le backend
    const relPath = currentPath ? `${currentPath}\\${fileName}` : fileName;
    const fullPath = `${currentShare}/${relPath.replace(/\\/g, '/')}`;
    try {
      const { data } = await api.post('/fileserver/smb-office/open', { path: fullPath });
      if (!data?.sessionId || !data?.config) {
        toast.error("Réponse OnlyOffice invalide");
        return;
      }
      sessionStorage.setItem('smb-office-' + data.sessionId, JSON.stringify(data));
      router.push('/files/smb-editor/' + data.sessionId);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Impossible d'ouvrir le fichier dans OnlyOffice";
      toast.error(msg);
    }
  };

  // Breadcrumbs
  const pathParts = currentPath ? currentPath.split('\\') : [];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium text-seal-navy dark:text-white">{t('nav.networkFiles')}</h1>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            {currentShare ? `\\\\10.33.50.5\\${currentShare}` : 'Parcourez les partages réseau OMNITECH'}
          </p>
        </div>
        {currentShare && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="h-4 w-4" /> Nouveau dossier
            </Button>
            <label className="cursor-pointer">
              <Button variant="secondary" size="sm" loading={uploading} onClick={() => {}}>
                <Upload className="h-4 w-4" /> Déposer un fichier
              </Button>
              <input type="file" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        )}
      </div>

      {/* SMB server unreachable */}
      {sharesError && (
        <Card className="border-2 border-red-200 dark:border-red-900/40">
          <CardContent className="py-6">
            <div className="max-w-md mx-auto text-center">
              <Server className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <h2 className="text-lg font-medium text-seal-navy dark:text-white mb-1">Serveur de fichiers inaccessible</h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                Impossible de contacter le serveur SMB. Vérifiez que le serveur est en ligne et que les variables <span className="font-mono text-xs">FILESERVER_HOST</span>, <span className="font-mono text-xs">FILESERVER_USER</span> et <span className="font-mono text-xs">FILESERVER_PASSWORD</span> sont configurées dans le backend.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Breadcrumbs */}
      {currentShare && (
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => { setCurrentShare(null); setFiles([]); }} className="text-primary hover:underline font-medium">Partages</button>
          <ChevronRight className="h-3 w-3 text-seal-gray-500" />
          <button onClick={() => { setCurrentPath(''); loadFiles(currentShare, ''); }} className="text-primary hover:underline font-medium">{currentShare}</button>
          {pathParts.map((part, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="h-3 w-3 text-seal-gray-500" />
              <button onClick={() => {
                const newPath = pathParts.slice(0, i + 1).join('\\');
                setCurrentPath(newPath);
                loadFiles(currentShare, newPath);
              }} className={i === pathParts.length - 1 ? 'text-seal-navy dark:text-white font-semibold' : 'text-primary hover:underline'}>
                {part}
              </button>
            </React.Fragment>
          ))}
          <button
            onClick={() => {
              const fullPath = `\\\\10.33.50.5\\${currentShare}${currentPath ? '\\' + currentPath : ''}`;
              if (navigator.clipboard?.writeText) {
                navigator.clipboard.writeText(fullPath).then(() => toast.success('Chemin copié : ' + fullPath));
              } else {
                toast.error('Copie non supportée par le navigateur');
              }
            }}
            className="ml-2 flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white transition-colors"
            title="Copier le chemin UNC"
          >
            <Copy className="h-3 w-3" />
            Copier le chemin
          </button>
        </div>
      )}

      {/* New folder form */}
      {showNewFolder && (
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 rounded-lg px-3 py-2">
          <Folder className="h-4 w-4 text-primary" />
          <input className="rounded border px-2 py-1 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white"
            placeholder="Nom du dossier" value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); }} autoFocus />
          <Button size="sm" disabled={!newFolderName} onClick={handleCreateFolder}>Créer</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}>&#x2715;</Button>
        </div>
      )}

      {/* Multi-select action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-primary/10 rounded-lg px-4 py-2">
          <span className="text-sm font-semibold text-seal-navy dark:text-white">{selected.size} sélectionné(s)</span>
          <Button size="sm" variant="ghost" className="text-red-500" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDownloadSelected}>
            <Download className="h-4 w-4" /> Télécharger
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Désélectionner
          </Button>
        </div>
      )}

      {/* SMB Authentication */}
      {!smbAuthenticated && !currentShare && (
        <Card className="border-2 border-primary/30">
          <CardContent className="py-6">
            <div className="max-w-md mx-auto text-center">
              <HardDrive className="h-10 w-10 text-primary mx-auto mb-3" />
              <h2 className="text-lg font-medium text-seal-navy dark:text-white mb-1">Connexion au serveur de fichiers</h2>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-4">
                Entrez vos identifiants Active Directory pour accéder aux partages réseau avec vos propres droits.
              </p>
              <div className="space-y-3 text-left">
                <div>
                  <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400">Identifiant AD</label>
                  <input className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="prenom.nom ou jmorin" value={smbUsername} onChange={e => setSmbUsername(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSmbAuth(); }} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400">Mot de passe</label>
                  <input type="password" className="w-full mt-1 rounded border px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    placeholder="Votre mot de passe Windows" value={smbPassword} onChange={e => setSmbPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSmbAuth(); }} />
                </div>
                <Button className="w-full" loading={smbAuthLoading} disabled={!smbUsername || !smbPassword} onClick={handleSmbAuth}>
                  Se connecter au serveur de fichiers
                </Button>
              </div>
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-3">
                Vos identifiants sont utilisés uniquement pour cette session et ne sont pas stockés de manière permanente.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Share selection */}
      {!currentShare && smbAuthenticated && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 animate-pulse bg-gray-100 dark:bg-slate-800 rounded-xl" />)
          ) : shares.length === 0 ? (
            <div className="col-span-full"><EmptyState type="general" title="Aucun partage réseau accessible" description="Les partages réseau sont attribués selon votre fonction et votre équipe Active Directory. Si vous pensez que c'est une erreur, ouvrez un ticket de catégorie « Accès » en précisant le nom du partage et la justification métier. Vous pouvez aussi accéder à vos fichiers via Nextcloud." /></div>
          ) : shares.map((share, idx) => {
            const Icon = SHARE_ICONS[share.icon] || HardDrive;
            return (
              <Card key={share.name} hoverable className="stagger-item cursor-pointer" style={{ animationDelay: `${idx * 50}ms` }} onClick={() => openShare(share.name)}>
                <CardContent className="py-5 text-center">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">{share.label}</p>
                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 font-mono mt-1">\\\\10.33.50.5\\{share.name}</p>
                </CardContent>
              </Card>
            );
          })}
          {/* Nextcloud link */}
          <a href="https://fichiers.omnitech-security.fr" target="_blank" rel="noopener noreferrer"
            className="block">
            <Card hoverable className="cursor-pointer border-2 border-dashed border-primary/30 hover:border-primary">
              <CardContent className="py-5 text-center">
                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                  <Cloud className="h-6 w-6 text-blue-500" />
                </div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">Nextcloud</p>
                <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">fichiers.omnitech-security.fr</p>
              </CardContent>
            </Card>
          </a>
        </div>
      )}

      {/* File listing */}
      {currentShare && (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-1 p-4">{[1,2,3,4,5].map(i => <div key={i} className="h-10 animate-pulse bg-gray-100 dark:bg-slate-800 rounded" />)}</div>
            ) : files.length === 0 ? (
              <div className="py-12 text-center">
                <Folder className="h-12 w-12 text-seal-gray-500/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-seal-gray-500 dark:text-slate-400">Ce dossier est vide</p>
                <p className="text-xs text-seal-gray-500/70 dark:text-slate-500 mt-1">Déposez un fichier ou créez un sous-dossier pour commencer.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 w-10 px-2 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      <input type="checkbox" checked={selected.size === files.length && files.length > 0}
                        onChange={selectAll} className="rounded" />
                    </th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-left px-4 py-3 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Nom</th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-right px-4 py-3 w-24 text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Taille</th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 text-right px-4 py-3 w-48 hidden md:table-cell text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Modifié</th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {files.map(file => (
                    <tr key={file.name}
                      className="even:bg-gray-50/50 dark:even:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      onClick={() => file.type === 'directory' ? openFolder(file.name) : handleDownload(file.name)}>
                      <td className="px-2" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(file.name)}
                          onChange={() => toggleSelect(file.name)} className="rounded" />
                      </td>
                      <td className="px-4 py-2.5 flex items-center gap-3">
                        {file.type === 'directory' ? <Folder className="h-4 w-4 text-primary" /> : getFileIcon(file.name)}
                        <span className={`text-sm ${file.type === 'directory' ? 'font-semibold text-seal-navy dark:text-white' : 'text-seal-navy dark:text-slate-200'}`}>
                          {file.name}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-seal-gray-500 dark:text-slate-400">
                        {file.type === 'file' ? formatSize(file.size) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-seal-gray-500 dark:text-slate-500 hidden md:table-cell">
                        {file.modified}
                      </td>
                      <td className="px-2" onClick={e => e.stopPropagation()}>
                        {file.type === 'file' && (
                          <div className="flex items-center justify-end gap-1">
                            {isOfficeFile(file.name) && (
                              <button
                                className="p-1 rounded hover:bg-primary/10 transition"
                                title="Éditer dans OnlyOffice"
                                onClick={() => handleOpenInOnlyOffice(file.name)}
                              >
                                <Edit3 className="h-3.5 w-3.5 text-primary" />
                              </button>
                            )}
                            <button
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition"
                              title="Télécharger"
                              onClick={() => handleDownload(file.name)}
                            >
                              <Download className="h-3.5 w-3.5 text-seal-gray-500" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => { handleDeleteSelected(); setShowDeleteConfirm(false); }}
        title="Supprimer les éléments sélectionnés"
        description={`Supprimer ${selected.size} élément(s) ? Cette action est irréversible.`}
        confirmLabel="Supprimer"
        variant="danger"
      />
    </div>
  );
}
