'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, Badge, Button } from '@omnitech/ui';
import {
  HelpCircle, Key, Wifi, Monitor, Printer, Mail, Shield, ChevronRight,
  CheckCircle2, AlertTriangle, Clock, Ticket, Lock, Download, Zap, RefreshCw,
  CreditCard, ShieldAlert, Search, MessageCircleQuestion,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

const FAQ_CATEGORY_ICONS: Record<string, React.ElementType> = {
  password: Key,
  vpn: Wifi,
  display: Monitor,
  printer: Printer,
  email: Mail,
  security: Shield,
};

const GUIDES = [
  { icon: Key, category: 'password', title: 'Réinitialiser mon mot de passe', desc: 'Procédure de réinitialisation de votre mot de passe AD', steps: ['Ouvrir Vaultwarden', 'Se connecter', 'Modifier le mot de passe'] },
  { icon: Wifi, category: 'vpn', title: 'Configurer le VPN', desc: 'Accès au réseau depuis l\'extérieur', steps: ['Installer FortiClient', 'Importer le profil VPN', 'Se connecter avec vos identifiants AD'] },
  { icon: Monitor, category: 'display', title: 'Problème d\'écran / affichage', desc: 'Diagnostic écran noir ou résolution', steps: ['Vérifier les câbles', 'Redémarrer le PC', 'Tester un autre port vidéo', 'Créer un ticket si le problème persiste'] },
  { icon: Printer, category: 'printer', title: 'Problème d\'imprimante', desc: 'L\'imprimante n\'imprime pas', steps: ['Vérifier la file d\'attente', 'Redémarrer le service d\'impression', 'Vérifier le réseau', 'Créer un ticket'] },
  { icon: Mail, category: 'email', title: 'Problème de messagerie', desc: 'Outlook ne synchronise pas', steps: ['Vérifier la connexion Internet', 'Redémarrer Outlook', 'Vider le cache', 'Contacter le support'] },
  { icon: Shield, category: 'security', title: 'Alerte de sécurité', desc: 'Comportement suspect ou phishing', steps: ['Ne pas cliquer sur les liens', 'Transférer l\'email au RSSI', 'Signaler via l\'intranet'] },
];

interface ServiceStatus { name: string; status: 'up' | 'degraded' | 'down' }

const REQUEST_TEMPLATES = [
  { id: 'password', icon: Lock, title: 'Réinitialisation mot de passe', category: 'ACCESS', priority: 'HIGH',
    color: 'bg-amber-500/10 border-amber-200 dark:border-amber-800', iconColor: 'text-amber-500',
    description: 'Réinitialisation du mot de passe Active Directory',
    fields: [{ name: 'username', label: 'Nom d\'utilisateur AD', placeholder: 'Ex: jean.dupont (identifiant Active Directory)' }] },
  { id: 'vpn', icon: Shield, title: 'Demande accès VPN', category: 'ACCESS', priority: 'MEDIUM',
    color: 'bg-emerald-500/10 border-emerald-200 dark:border-emerald-800', iconColor: 'text-emerald-500',
    description: 'Demande de configuration d\'un accès VPN SSL FortiClient',
    fields: [{ name: 'reason', label: 'Motif', placeholder: 'Ex: Télétravail 3j/semaine, déplacement client du 15 au 20 avril...' }] },
  { id: 'hardware', icon: Monitor, title: 'Demande de matériel', category: 'HARDWARE', priority: 'LOW',
    color: 'bg-blue-500/10 border-blue-200 dark:border-blue-800', iconColor: 'text-blue-500',
    description: 'Demande de matériel informatique (PC, écran, clavier...)',
    fields: [
      { name: 'type', label: 'Type de matériel', placeholder: 'Ex: PC portable Dell Latitude, écran 27\", dock USB-C...' },
      { name: 'justification', label: 'Justification', placeholder: 'Ex: Remplacement poste vétuste (> 5 ans), nouveau collaborateur...' },
    ] },
  { id: 'software', icon: Download, title: 'Demande de logiciel', category: 'SOFTWARE', priority: 'LOW',
    color: 'bg-purple-500/10 border-purple-200 dark:border-purple-800', iconColor: 'text-purple-500',
    description: 'Installation d\'un logiciel sur votre poste',
    fields: [
      { name: 'software', label: 'Nom du logiciel', placeholder: 'Ex: Adobe Acrobat Pro, Visual Studio Code, 7-Zip...' },
      { name: 'version', label: 'Version (optionnel)', placeholder: 'Ex: 2024, dernière version stable...' },
    ] },
  { id: 'access', icon: Key, title: 'Demande d\'accès', category: 'ACCESS', priority: 'MEDIUM',
    color: 'bg-indigo-500/10 border-indigo-200 dark:border-indigo-800', iconColor: 'text-indigo-500',
    description: 'Demande d\'accès à un partage réseau, application ou ressource',
    fields: [
      { name: 'resource', label: 'Ressource', placeholder: 'Ex: Partage \\\\srv-files\\projets, application CRM, SharePoint...' },
      { name: 'justification', label: 'Justification', placeholder: 'Ex: Nouveau projet, changement de poste, besoin validé par N+1...' },
    ] },
  { id: 'badge', icon: CreditCard, title: 'Demande de badge', category: 'ACCESS', priority: 'LOW',
    color: 'bg-teal-500/10 border-teal-200 dark:border-teal-800', iconColor: 'text-teal-500',
    description: 'Demande de cr\u00e9ation ou remplacement de badge d\u2019acc\u00e8s aux locaux',
    fields: [
      { name: 'type', label: 'Type de demande', placeholder: 'Ex: Nouveau badge, remplacement suite à perte, badge visiteur...' },
      { name: 'site', label: 'Site / batiment', placeholder: 'Ex: Siège Paris 9e, agence Lyon, datacenter Equinix PA3...' },
    ] },
  { id: 'security-incident', icon: ShieldAlert, title: 'Signalement d\u2019incident de s\u00e9curit\u00e9', category: 'SECURITY', priority: 'CRITICAL',
    color: 'bg-red-500/10 border-red-200 dark:border-red-800', iconColor: 'text-red-500',
    description: 'Signalement d\u2019un incident de s\u00e9curit\u00e9 (intrusion, fuite de donn\u00e9es, comportement suspect)',
    fields: [
      { name: 'description', label: 'Description de l\'incident', placeholder: 'Ex: Email suspect reçu avec pièce jointe .exe, tentative de connexion inconnue...' },
      { name: 'date', label: 'Date / heure de l\'incident', placeholder: 'Ex: 08/04/2026 14h30' },
      { name: 'impact', label: 'Impact estime', placeholder: 'Ex: 1 poste affecté, données client potentiellement exposées...' },
    ] },
];

export function SelfServicePortal() {
  const { t } = useTranslation();
  const [openGuide, setOpenGuide] = useState<number | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [showRequestForm, setShowRequestForm] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [systemInfo, setSystemInfo] = useState<any>(null);
  const [refreshingServices, setRefreshingServices] = useState(false);
  const [recentRequests, setRecentRequests] = useState<Array<{ id: string; title: string; status: string; createdAt: string }>>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [faqSearch, setFaqSearch] = useState('');

  useEffect(() => {
    api.get('/health').then(({ data }) => setSystemInfo(data)).catch(console.error);
  }, []);

  useEffect(() => {
    api.get('/tickets', { params: { limit: 20, sort: 'createdAt', order: 'desc' } })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const selfServiceTickets = list
          .filter((t: { title: string }) => t.title.startsWith('[Self-Service]'))
          .slice(0, 3);
        setRecentRequests(selfServiceTickets);
      })
      .catch(() => {})
      .finally(() => setLoadingRequests(false));
  }, []);

  const handleRequest = async (templateId: string, formData: Record<string, string>) => {
    const template = REQUEST_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    setRequestLoading(true);
    try {
      const description = Object.entries(formData)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
      await api.post('/tickets', {
        title: `[Self-Service] ${template.title}`,
        description: `${template.description}\n\n${description}`,
        category: template.category,
        priority: template.priority,
      });
      toast.success(t('selfservice.requestCreated'));
      setShowRequestForm(null);
    } catch { toast.error(t('selfservice.requestError')); }
    finally { setRequestLoading(false); }
  };

  const checkServices = async () => {
    const checks = [
      { name: 'API Backend', endpoint: '/health' },
      { name: 'Base de données', endpoint: '/health?check=db' },
      { name: 'Active Directory', endpoint: '/health?check=ldap' },
      { name: 'Messagerie SMTP', endpoint: '/health?check=smtp' },
      { name: 'Stockage fichiers', endpoint: '/health?check=storage' },
      { name: 'Antivirus ClamAV', endpoint: '/health?check=clamav' },
    ];

    const results: ServiceStatus[] = [];
    for (const svc of checks) {
      try {
        const { data } = await api.get(svc.endpoint, { timeout: 5000 });
        const status = data.status === 'up' || data.status === 'ok' || data.status === 'configured' ? 'up' : 'degraded';
        results.push({ name: svc.name, status });
      } catch {
        results.push({ name: svc.name, status: 'down' });
      }
    }
    setServices(results);
  };

  const handleRefreshServices = async () => {
    setRefreshingServices(true);
    await checkServices();
    setRefreshingServices(false);
  };

  useEffect(() => {
    checkServices();
    const interval = setInterval(checkServices, 60000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = (s: string) => {
    if (s === 'up') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (s === 'degraded') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    return <AlertTriangle className="h-4 w-4 text-red-500" />;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-taupe dark:text-slate-400">
            {t('selfservice.subtitle')}
          </p>
        </div>
        <Link href="/tickets">
          <Button><Ticket className="h-4 w-4" /> {t('selfservice.createTicket')}</Button>
        </Link>
      </div>

      {/* Quick Requests Section */}
      <Card>
        <CardContent className="py-4">
          <h2 className="text-sm font-semibold text-navy dark:text-white mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> {t('selfservice.quickRequests')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {REQUEST_TEMPLATES.map(tpl => {
              const Icon = tpl.icon;
              return (
                <button key={tpl.id} onClick={() => setShowRequestForm(showRequestForm === tpl.id ? null : tpl.id)}
                  className={`p-3 rounded-xl border text-left transition-all duration-200 hover:shadow-md shadow-sm ${showRequestForm === tpl.id ? `border-primary ${tpl.color}` : 'border-gray-200 dark:border-slate-700 hover:border-primary/50'}`}>
                  <div className={`h-9 w-9 rounded-lg ${tpl.color} flex items-center justify-center mb-2`}>
                    <Icon className={`h-4.5 w-4.5 ${tpl.iconColor}`} />
                  </div>
                  <p className="text-xs font-medium text-navy dark:text-white">{tpl.title}</p>
                </button>
              );
            })}
          </div>
          {showRequestForm && (() => {
            const tpl = REQUEST_TEMPLATES.find(t => t.id === showRequestForm);
            if (!tpl) return null;
            const formRef: Record<string, string> = {};
            const totalSteps = tpl.fields.length + 1; // fields + submit
            return (
              <div className="mt-4 p-5 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                {/* Progress indicator */}
                <div className="flex items-center gap-2 mb-4">
                  <div className={`h-8 w-8 rounded-lg ${tpl.color} flex items-center justify-center`}>
                    <tpl.icon className={`h-4 w-4 ${tpl.iconColor}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-navy dark:text-white">{tpl.title}</h3>
                    <p className="text-[10px] text-taupe dark:text-slate-400">{tpl.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 rounded-full px-3 py-1 border border-gray-200 dark:border-slate-600">
                    <span className="text-[10px] font-medium text-[#004469] dark:text-white">
                      {tpl.fields.length} champ{tpl.fields.length > 1 ? 's' : ''} a remplir
                    </span>
                  </div>
                </div>
                <div className="space-y-3">
                  {tpl.fields.map((f, idx) => (
                    <div key={f.name}>
                      <label className="text-xs font-medium text-navy dark:text-slate-300 flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-[#004469]/10 dark:bg-[#004469]/30 text-[#004469] dark:text-white text-[10px] font-medium flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        {f.label}
                      </label>
                      <input className="w-full mt-1 rounded-xl border border-gray-200 dark:border-slate-600 px-3 py-2.5 text-sm bg-white dark:bg-slate-900 dark:text-white placeholder:text-taupe dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200 shadow-sm"
                        placeholder={f.placeholder} onChange={e => formRef[f.label] = e.target.value} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-slate-700">
                  <Button onClick={() => handleRequest(tpl.id, formRef)} loading={requestLoading}>{t('selfservice.sendRequest')}</Button>
                  <Button variant="outline" onClick={() => setShowRequestForm(null)}>{t('common.cancel')}</Button>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Dernières demandes */}
      <Card>
        <CardContent className="py-4">
          <h2 className="text-sm font-semibold text-navy dark:text-white mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Dernières demandes
          </h2>
          {loadingRequests ? (
            <div className="flex gap-2 items-center text-xs text-taupe">
              <div className="h-3 w-3 border-2 border-taupe/30 border-t-taupe rounded-full animate-spin" />
              Chargement...
            </div>
          ) : recentRequests.length > 0 ? (
            <div className="space-y-2">
              {recentRequests.map((ticket) => (
                <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                  <Ticket className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-navy dark:text-white truncate">{ticket.title.replace('[Self-Service] ', '')}</p>
                    <p className="text-[10px] text-taupe dark:text-slate-400">
                      {new Date(ticket.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <Badge variant={ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? 'approved' : ticket.status === 'IN_PROGRESS' ? 'info' : 'warning'}>
                    {ticket.status === 'CLOSED' ? 'Fermé' : ticket.status === 'RESOLVED' ? 'Résolu' : ticket.status === 'IN_PROGRESS' ? 'En cours' : 'Ouvert'}
                  </Badge>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-taupe dark:text-slate-500 italic">Aucune demande r\u00e9cente. Vos futures demandes de support appara\u00eetront ici.</p>
          )}
        </CardContent>
      </Card>

      {/* Service status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-navy dark:text-white text-sm">{t('selfservice.serviceStatus')}</h2>
            <Button variant="ghost" size="sm" onClick={handleRefreshServices} disabled={refreshingServices}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingServices ? 'animate-spin' : ''}`} />
              {refreshingServices ? 'Actualisation...' : 'Actualiser'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Operational banner */}
          {services.length > 0 && services.every(s => s.status === 'up') && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 mb-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Tous les services sont opérationnels</p>
            </div>
          )}
          {services.length > 0 && services.some(s => s.status !== 'up') && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {services.filter(s => s.status !== 'up').length} service{services.filter(s => s.status !== 'up').length > 1 ? 's' : ''} en anomalie
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {services.map(s => (
              <div key={s.name} className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                <span className="relative flex h-3 w-3 flex-shrink-0">
                  {s.status === 'up' && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span className={`relative inline-flex h-3 w-3 rounded-full ${
                    s.status === 'up' ? 'bg-emerald-500' : s.status === 'degraded' ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'
                  }`} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-white">{s.name}</p>
                  <p className="text-[10px] text-taupe capitalize">{s.status === 'up' ? t('selfservice.status.up') : s.status === 'degraded' ? t('selfservice.status.degraded') : t('selfservice.status.down')}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Guided diagnostics / FAQ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-navy dark:text-white">{t('selfservice.guidedDiagnostics')}</h2>
        </div>
        {/* FAQ search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-taupe dark:text-slate-500" />
          <input
            type="text"
            value={faqSearch}
            onChange={(e) => setFaqSearch(e.target.value)}
            placeholder="Rechercher dans la FAQ..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-navy dark:text-white placeholder:text-taupe dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GUIDES
            .map((guide, i) => ({ guide, originalIndex: i }))
            .filter(({ guide }) => {
              if (!faqSearch.trim()) return true;
              const q = faqSearch.toLowerCase();
              return guide.title.toLowerCase().includes(q) || guide.desc.toLowerCase().includes(q) || guide.steps.some(s => s.toLowerCase().includes(q));
            })
            .map(({ guide, originalIndex: i }) => {
            const CatIcon = FAQ_CATEGORY_ICONS[guide.category] || HelpCircle;
            return (
            <Card key={i} hoverable className="cursor-pointer" onClick={() => setOpenGuide(openGuide === i ? null : i)}>
              <CardContent>
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    guide.category === 'security' ? 'bg-red-100 dark:bg-red-900/20' :
                    guide.category === 'password' ? 'bg-amber-100 dark:bg-amber-900/20' :
                    guide.category === 'vpn' ? 'bg-emerald-100 dark:bg-emerald-900/20' :
                    guide.category === 'email' ? 'bg-blue-100 dark:bg-blue-900/20' :
                    guide.category === 'printer' ? 'bg-purple-100 dark:bg-purple-900/20' :
                    'bg-primary/10'
                  }`}>
                    <CatIcon className={`h-5 w-5 ${
                      guide.category === 'security' ? 'text-red-500' :
                      guide.category === 'password' ? 'text-amber-500' :
                      guide.category === 'vpn' ? 'text-emerald-500' :
                      guide.category === 'email' ? 'text-blue-500' :
                      guide.category === 'printer' ? 'text-purple-500' :
                      'text-primary'
                    }`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-navy dark:text-white text-sm">{guide.title}</h3>
                    <p className="text-xs text-taupe dark:text-slate-400 mt-0.5">{guide.desc}</p>
                    {openGuide === i && (
                      <div className="mt-3 space-y-2">
                        {guide.steps.map((step, si) => (
                          <div key={si} className="flex items-center gap-2">
                            <div className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                              {si + 1}
                            </div>
                            <p className="text-xs text-navy dark:text-white">{step}</p>
                          </div>
                        ))}
                        <Link href="/tickets" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2">
                          {t('selfservice.stillBlocked')} <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                  <ChevronRight className={`h-4 w-4 text-taupe transition-transform ${openGuide === i ? 'rotate-90' : ''}`} />
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
        {faqSearch.trim() && GUIDES.filter(g => {
          const q = faqSearch.toLowerCase();
          return g.title.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q) || g.steps.some(s => s.toLowerCase().includes(q));
        }).length === 0 && (
          <div className="text-center py-6">
            <HelpCircle className="h-8 w-8 text-taupe/30 mx-auto mb-2" />
            <p className="text-sm text-taupe dark:text-slate-400">Aucun guide ne correspond \u00e0 \u00ab\u00a0{faqSearch}\u00a0\u00bb. Essayez un autre terme ou cr\u00e9ez un ticket pour obtenir de l\u2019aide.</p>
          </div>
        )}
        {/* CTA: not found? create a ticket */}
        <Card className="mt-6 border-dashed border-2 border-primary/30 bg-primary/5 dark:bg-primary/10">
          <CardContent className="py-5 text-center">
            <MessageCircleQuestion className="h-8 w-8 text-primary mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-navy dark:text-white mb-1">Pas trouvé de réponse ?</h3>
            <p className="text-xs text-taupe dark:text-slate-400 mb-3">Notre équipe support est là pour vous aider. Créez un ticket et nous reviendrons vers vous rapidement.</p>
            <Link href="/tickets">
              <Button><Ticket className="h-4 w-4" /> Créer un ticket</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* System information */}
      {systemInfo && (
        <Card>
          <CardContent className="py-4">
            <h3 className="text-sm font-semibold text-navy dark:text-white mb-3">Informations système</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800 rounded">
                <span className="text-taupe dark:text-slate-400">Serveur</span>
                <span className="font-semibold text-navy dark:text-white">{systemInfo.status === 'ok' ? 'Opérationnel' : 'Dégradé'}</span>
              </div>
              {Object.entries(systemInfo.services || {}).map(([svc, status]) => (
                <div key={svc} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800 rounded">
                  <span className="text-taupe dark:text-slate-400 capitalize">{svc}</span>
                  <span className={`font-semibold ${status === 'up' ? 'text-emerald-500' : status === 'configured' ? 'text-blue-500' : 'text-red-500'}`}>
                    {status === 'up' ? '\u25CF' : status === 'configured' ? '\u25D0' : '\u25CB'} {String(status)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <Card>
        <CardHeader><h2 className="font-semibold text-navy dark:text-white text-sm">{t('selfservice.usefulLinks')}</h2></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Vaultwarden', url: 'https://vaultwarden.omnitech-security.fr', icon: Key },
              { label: 'Lucca RH', url: 'https://omnitech-security.ilucca.net/', icon: Monitor },
              { label: 'Mes tickets', url: '/tickets', icon: Ticket, internal: true },
              { label: 'Mon profil', url: '/profile', icon: Shield, internal: true },
            ].map(l => l.internal ? (
              <Link key={l.label} href={l.url} className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800">
                <l.icon className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-navy dark:text-white">{l.label}</span>
              </Link>
            ) : (
              <a key={l.label} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:bg-gray-50 dark:hover:bg-slate-800">
                <l.icon className="h-4 w-4 text-primary" /><span className="text-sm font-semibold text-navy dark:text-white">{l.label}</span>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
