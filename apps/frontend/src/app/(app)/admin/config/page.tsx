'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  Input,
  Badge,
  Tabs,
  ConfirmDialog,
} from '@omnitech/ui';
import {
  Save,
  Settings,
  Shield,
  Server,
  Mail,
  PenLine,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Megaphone,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
  Check,
  X,
  Info,
  Plug,
  Eye,
  EyeOff,
  Search,
  Database,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

interface AppConfigItem {
  id: string;
  key: string;
  value: string;
  description: string | null;
}

const CONFIG_GROUPS: Record<string, { label: string; description: string; icon: React.ElementType; keys: string[]; healthKey?: string }> = {
  general: {
    label: 'Général',
    description: 'Paramètres globaux de l\'application : nom, URL, limites de téléchargement et durée de session',
    icon: Settings,
    keys: ['app_name', 'app_url', 'max_upload_size_mb', 'session_timeout_hours', 'review_reminder_days'],
  },
  ldap: {
    label: 'LDAP / Active Directory',
    description: 'Connexion au serveur Active Directory pour l\'authentification centralisée et la synchronisation des comptes',
    icon: Shield,
    keys: [
      'ldap.enabled', 'ldap.url', 'ldap.bind_dn', 'ldap.bind_password',
      'ldap.search_base', 'ldap.search_filter', 'ldap.user_filter', 'ldap.tls_reject_unauthorized',
      'ldap.attr_email', 'ldap.attr_firstname', 'ldap.attr_lastname', 'ldap.attr_group',
      'ldap.role_mapping', 'ldap.default_role',
    ],
    healthKey: 'ldap',
  },
  smtp: {
    label: 'Messagerie SMTP',
    description: 'Configuration du serveur de messagerie pour l\'envoi de notifications, alertes et rapports par email',
    icon: Mail,
    keys: ['smtp.enabled', 'smtp_host', 'smtp_port', 'smtp_from', 'smtp_user', 'smtp_password'],
    healthKey: 'smtp',
  },
  docuseal: {
    label: 'DocuSeal (Signature)',
    description: 'Intégration avec DocuSeal pour la signature électronique des chartes et documents réglementaires',
    icon: PenLine,
    keys: ['docuseal_url', 'docuseal_api_key'],
  },
  integrations: {
    label: 'Intégrations & API',
    description: 'Configuration des intégrations externes (KnowBe4, etc.) : URL, tokens et test de connexion',
    icon: Plug,
    keys: ['knowbe4_api_url', 'knowbe4_api_token'],
  },
};

const LDAP_DEFAULTS: Record<string, { value: string; description: string }> = {
  'ldap.enabled': { value: 'false', description: 'Activer l\'authentification LDAP Active Directory' },
  'ldap.url': { value: 'ldaps://dc.omnitech.local:636', description: 'URL du serveur LDAPS (ex: ldaps://dc.omnitech.local:636)' },
  'ldap.bind_dn': { value: '', description: 'DN du compte de service (ex: CN=svc_intranet,OU=Services,DC=omnitech,DC=local)' },
  'ldap.bind_password': { value: '', description: 'Mot de passe du compte de service LDAP' },
  'ldap.search_base': { value: 'DC=omnitech,DC=local', description: 'Base de recherche LDAP (ex: DC=omnitech,DC=local)' },
  'ldap.search_filter': { value: '(sAMAccountName={{username}})', description: 'Filtre de recherche ({{username}} sera remplacé par le login)' },
  'ldap.user_filter': { value: '(&(objectClass=user)(objectCategory=person)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))', description: 'Filtre LDAP pour la synchronisation des utilisateurs (ex: filtre pour exclure les comptes désactivés)' },
  'ldap.tls_reject_unauthorized': { value: 'false', description: 'Vérifier le certificat TLS du serveur LDAP (true/false)' },
  'ldap.attr_email': { value: 'mail', description: 'Attribut LDAP pour l\'email' },
  'ldap.attr_firstname': { value: 'givenName', description: 'Attribut LDAP pour le prénom' },
  'ldap.attr_lastname': { value: 'sn', description: 'Attribut LDAP pour le nom' },
  'ldap.attr_group': { value: 'memberOf', description: 'Attribut LDAP pour les groupes' },
  'ldap.role_mapping': { value: '{}', description: 'Mapping JSON groupes AD → roles (ex: {"CN=GG_Direction":"DIRECTION","CN=GG_DSI":"ADMIN"})' },
  'ldap.default_role': { value: 'COLLABORATEUR', description: 'Rôle par défaut si aucun groupe AD ne correspond' },
};

const ACCESS_MODULES = [
  'Documents', 'Procédures', 'Tickets', 'News', 'Wiki', 'Veille', 'Incidents',
  'Quiz', 'Satisfaction', 'Helpdesk', 'Files', 'Signatures', 'Certificats',
  'Annuaire', 'Calendrier', 'Timeline', 'Chartes', 'Alertes', 'Runbooks',
  'Outils PDF', 'Recherche', 'KnowBe4', 'Conformité', 'Workflows', 'Admin',
] as const;

const ACCESS_MODULE_DESCRIPTIONS: Record<string, string> = {
  Documents: 'GED ISO 27001 : création, revue, approbation et archivage des documents réglementaires',
  'Procédures': 'Procédures opérationnelles et modes opératoires',
  Tickets: 'Système de tickets pour le support interne et la gestion des demandes',
  News: 'Actualités et communications internes de l\'entreprise',
  Wiki: 'Base de connaissances collaborative et documentation interne',
  Veille: 'Veille cyber : CVE, alertes ANSSI, bulletins CERT, threat intelligence',
  Incidents: 'Déclaration et suivi des incidents de sécurité (ISO 27001 A.5.24)',
  Quiz: 'Quiz de sensibilisation à la sécurité avec gamification et certificats',
  Satisfaction: 'Enquêtes de satisfaction interne et suivi NPS',
  Helpdesk: 'Support IT / Chatbot IA avec base de connaissances et RAG',
  Files: 'Stockage et partage de fichiers sécurisé (SMB)',
  Signatures: 'Signature électronique de documents via DocuSeal',
  Certificats: 'Gestion des certifications de formation (internes, externes, KnowBe4)',
  Annuaire: 'Annuaire des collaborateurs et organigramme',
  Calendrier: 'Calendrier événements : réunions, formations, audits',
  Timeline: 'Vue chronologique unifiée news + notifications + documents',
  Chartes: 'Chartes et politiques à signer électroniquement',
  Alertes: 'Alertes de sécurité critiques et notifications P1',
  Runbooks: 'Runbooks opérationnels et procédures automatisées',
  'Outils PDF': 'Manipulation PDF : merge, split, compression via Stirling',
  Recherche: 'Recherche globale avec filtres intelligents et IA',
  KnowBe4: 'Intégration KnowBe4 : sync formations, campagnes, certificats',
  'Conformité': 'Module conformité ISO 27001 : contrôles, couverture, planning',
  Workflows: 'Workflows d\'approbation configurables (ISO 27001 A.5.1)',
  Admin: 'Administration système : configuration, utilisateurs, rôles et paramètres',
};

const ACCESS_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'DIRECTION', 'REVIEWER', 'AUDITEUR', 'COLLABORATEUR', 'PRESTATAIRE',
] as const;

const ACCESS_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrateur',
  DIRECTION: 'Direction',
  REVIEWER: 'Réviseur',
  AUDITEUR: 'Auditeur',
  COLLABORATEUR: 'Collaborateur',
  PRESTATAIRE: 'Prestataire',
};

const ACCESS_ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Accès total au système, gestion de tous les paramètres et utilisateurs',
  ADMIN: 'Administration courante, gestion des utilisateurs et de la configuration',
  DIRECTION: 'Supervision stratégique, accès à tous les modules sauf administration',
  REVIEWER: 'Revue et validation des documents, accès étendu en lecture',
  AUDITEUR: 'Accès en lecture pour audit et conformité, sans modification',
  COLLABORATEUR: 'Accès standard aux outils collaboratifs du quotidien',
  PRESTATAIRE: 'Accès restreint aux modules nécessaires pour les intervenants externes',
};

const ADMIN_LEVEL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'DIRECTION']);

const ACCESS_MATRIX: Record<string, Set<string>> = {
  SUPER_ADMIN: new Set(ACCESS_MODULES),
  ADMIN: new Set(ACCESS_MODULES),
  DIRECTION: new Set(['Documents', 'Procédures', 'Tickets', 'News', 'Wiki', 'Veille', 'Incidents', 'Quiz', 'Satisfaction', 'Helpdesk', 'Files', 'Signatures', 'Certificats', 'Annuaire', 'Calendrier', 'Timeline', 'Chartes', 'Alertes', 'Runbooks', 'Recherche', 'Conformité']),
  REVIEWER: new Set(['Documents', 'Procédures', 'Tickets', 'News', 'Wiki', 'Veille', 'Incidents', 'Quiz', 'Satisfaction', 'Helpdesk', 'Files', 'Signatures', 'Certificats', 'Annuaire', 'Calendrier', 'Timeline', 'Chartes', 'Alertes', 'Runbooks', 'Recherche']),
  AUDITEUR: new Set(['Documents', 'Procédures', 'Tickets', 'News', 'Wiki', 'Veille', 'Incidents', 'Quiz', 'Satisfaction', 'Files', 'Certificats', 'Annuaire', 'Calendrier', 'Timeline', 'Chartes', 'Alertes', 'Recherche', 'Conformité']),
  COLLABORATEUR: new Set(['Documents', 'Procédures', 'Tickets', 'News', 'Wiki', 'Veille', 'Quiz', 'Satisfaction', 'Helpdesk', 'Files', 'Signatures', 'Certificats', 'Annuaire', 'Calendrier', 'Timeline', 'Chartes', 'Alertes', 'Recherche', 'Outils PDF']),
  PRESTATAIRE: new Set(['Documents', 'Tickets', 'Files', 'Signatures', 'Certificats', 'Helpdesk']),
};

interface ServiceHealth {
  status: 'up' | 'down' | 'unknown';
  label: string;
}

interface SystemInfo {
  version?: string;
  database?: string;
  redis?: string;
  totalUsers?: number;
  totalDocuments?: number;
  uptime?: string;
  memoryUsage?: string;
  memoryRss?: string;
}

interface SyncTimes {
  ldap: string | null;
  veille: string | null;
}

// Default access matrix as a serializable record (must match ACCESS_MATRIX above)
const DEFAULT_ACCESS_MATRIX_OBJ: Record<string, string[]> = Object.fromEntries(
  Object.entries(ACCESS_MATRIX).map(([role, mods]) => [role, [...mods]]),
);

function matrixObjToSets(obj: Record<string, string[]>): Record<string, Set<string>> {
  const result: Record<string, Set<string>> = {};
  for (const [role, mods] of Object.entries(obj)) {
    result[role] = new Set(mods);
  }
  return result;
}

function matrixSetsToObj(sets: Record<string, Set<string>>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [role, modSet] of Object.entries(sets)) {
    result[role] = [...modSet];
  }
  return result;
}

export default function AdminConfigPage() {
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<AppConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemInfoLoading, setSystemInfoLoading] = useState(true);
  const [lastSyncTimes, setLastSyncTimes] = useState<SyncTimes | null>(null);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState('general');
  const [testingLdap, setTestingLdap] = useState(false);
  const [ldapTestResult, setLdapTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [ldapSyncResult, setLdapSyncResult] = useState<{ created?: number; updated?: number; deactivated?: number; errors?: number; total?: number } | null>(null);
  const [ldapTestEmail, setLdapTestEmail] = useState('');
  const [ldapTestPassword, setLdapTestPassword] = useState('');
  const [showLdapTest, setShowLdapTest] = useState<'auth' | 'sync' | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showSyncAllConfirm, setShowSyncAllConfirm] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [editingPasswords, setEditingPasswords] = useState<Record<string, boolean>>({});
  const [serviceHealthMap, setServiceHealthMap] = useState<Record<string, ServiceHealth>>({});

  // Integrations state
  const [integrationTestResults, setIntegrationTestResults] = useState<Record<string, { success: boolean; message: string } | null>>({});
  const [integrationTesting, setIntegrationTesting] = useState<Record<string, boolean>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Editable access matrix state
  const [editableMatrix, setEditableMatrix] = useState<Record<string, Set<string>>>(matrixObjToSets(DEFAULT_ACCESS_MATRIX_OBJ));
  const [matrixDirty, setMatrixDirty] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState(false);

  // Load saved access matrix from backend config
  useEffect(() => {
    api.get('/config/access_matrix')
      .then(({ data }) => {
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value) as Record<string, string[]>;
            setEditableMatrix(matrixObjToSets(parsed));
          } catch {
            // Use defaults if parsing fails
          }
        }
      })
      .catch(() => {
        // Key does not exist yet - use defaults
      });
  }, []);

  const handleToggleMatrixCell = (role: string, mod: string) => {
    setEditableMatrix((prev) => {
      const next = { ...prev };
      const roleSet = new Set(next[role] || []);
      if (roleSet.has(mod)) {
        roleSet.delete(mod);
      } else {
        roleSet.add(mod);
      }
      next[role] = roleSet;
      return next;
    });
    setMatrixDirty(true);
  };

  const handleSaveMatrix = async () => {
    setMatrixSaving(true);
    try {
      const payload = matrixSetsToObj(editableMatrix);
      await api.patch('/config/access_matrix', { value: JSON.stringify(payload) });
      toast.success('Matrice des accès sauvegardée');
      setMatrixDirty(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erreur lors de la sauvegarde de la matrice');
    } finally {
      setMatrixSaving(false);
    }
  };

  const handleResetMatrix = () => {
    setEditableMatrix(matrixObjToSets(DEFAULT_ACCESS_MATRIX_OBJ));
    setMatrixDirty(true);
  };

  // Meilisearch state
  const [meiliStats, setMeiliStats] = useState<{ available: boolean; enabled: boolean; indexes: Record<string, number>; error?: string } | null>(null);
  const [meiliLoading, setMeiliLoading] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<{ documents: number; tickets: number; wiki: number; news: number } | null>(null);

  const fetchMeiliStats = () => {
    setMeiliLoading(true);
    api.get('/search/stats')
      .then(({ data }) => setMeiliStats(data))
      .catch(() => setMeiliStats({ available: false, enabled: false, indexes: {} }))
      .finally(() => setMeiliLoading(false));
  };

  const handleReindex = async () => {
    setReindexing(true);
    setReindexResult(null);
    try {
      const { data } = await api.post('/search/reindex');
      if (data.success) {
        toast.success(data.message || 'Réindexation terminée');
        setReindexResult(data.indexed);
        fetchMeiliStats();
      } else {
        toast.error('Erreur de reindexation');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur de reindexation');
    } finally {
      setReindexing(false);
    }
  };

  // Banner state
  const [banners, setBanners] = useState<Array<{ id: string; title: string; message: string; level: string; isActive: boolean; expiresAt: string | null; createdAt: string }>>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [newBanner, setNewBanner] = useState({ title: '', message: '', level: 'P3', expiresAt: '' });
  const [creatingBanner, setCreatingBanner] = useState(false);

  const fetchBanners = () => {
    setBannersLoading(true);
    api.get('/banners/all')
      .then(({ data }) => setBanners(Array.isArray(data) ? data : data?.data || []))
      .catch(() => {})
      .finally(() => setBannersLoading(false));
  };

  const handleCreateBanner = async () => {
    if (!newBanner.title || !newBanner.message) { toast.error('Titre et message requis'); return; }
    setCreatingBanner(true);
    try {
      await api.post('/banners', {
        title: newBanner.title,
        message: newBanner.message,
        level: newBanner.level,
        expiresAt: newBanner.expiresAt || undefined,
      });
      toast.success('Bannière créée');
      setNewBanner({ title: '', message: '', level: 'P3', expiresAt: '' });
      fetchBanners();
    } catch { toast.error('Erreur lors de la création'); }
    finally { setCreatingBanner(false); }
  };

  const handleToggleBanner = async (id: string, isActive: boolean) => {
    try {
      await api.patch(`/banners/${id}`, { isActive: !isActive });
      fetchBanners();
    } catch { toast.error('Erreur'); }
  };

  const handleDeleteBanner = async (id: string) => {
    try {
      await api.delete(`/banners/${id}`);
      toast.success('Bannière supprimée');
      fetchBanners();
    } catch { toast.error('Erreur'); }
  };

  const fetchConfig = () => {
    setLoading(true);
    api
      .get('/config')
      .then(({ data }) => setConfigs(data?.data || data || []))
      .catch(() => toast.error('Impossible de charger la configuration'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConfig();
    fetchBanners();
    fetchMeiliStats();
    // Fetch system info
    setSystemInfoLoading(true);
    Promise.all([
      api.get('/health').catch(() => ({ data: {} })),
      api.get('/users', { params: { limit: 1 } }).catch(() => ({ data: { meta: {} } })),
      api.get('/documents', { params: { limit: 1 } }).catch(() => ({ data: { meta: {} } })),
      api.get('/health/stats').catch(() => ({ data: {} })),
    ]).then(([healthRes, usersRes, docsRes, statsRes]) => {
      const h = healthRes.data;
      const memBytes = h.memoryUsage?.rss || h.memory?.rss;
      const memMB = memBytes ? `${Math.round(memBytes / 1024 / 1024)} MB` : h.memoryUsage || undefined;
      setSystemInfo({
        version: h.version || h.appVersion || 'N/A',
        database: h.database || h.db || (h.status === 'ok' ? 'OK' : 'N/A'),
        redis: h.redis || (h.status === 'ok' ? 'OK' : 'N/A'),
        totalUsers: usersRes.data?.meta?.total ?? undefined,
        totalDocuments: docsRes.data?.meta?.total ?? undefined,
        uptime: h.uptime || undefined,
        memoryUsage: memMB,
      });
      // Build service health map from /health response
      const svcMap: Record<string, ServiceHealth> = {};
      const svcData = h.services as Record<string, string> | undefined;
      if (svcData) {
        if (svcData.database) svcMap.database = { status: svcData.database === 'up' ? 'up' : 'down', label: 'PostgreSQL' };
        if (svcData.redis) svcMap.redis = { status: svcData.redis === 'up' ? 'up' : 'down', label: 'Redis' };
        if (svcData.smtp) svcMap.smtp = { status: svcData.smtp === 'up' ? 'up' : 'down', label: 'SMTP' };
        if (svcData.ldap) svcMap.ldap = { status: svcData.ldap === 'up' ? 'up' : 'down', label: 'LDAP' };
        if (svcData.storage) svcMap.storage = { status: svcData.storage === 'up' ? 'up' : 'down', label: 'Stockage' };
      } else {
        const dbOk = h.database === 'OK' || h.database === 'connected' || h.db === 'OK';
        svcMap.database = { status: dbOk ? 'up' : h.database ? 'down' : 'unknown', label: 'PostgreSQL' };
        const redisOk = h.redis === 'OK' || h.redis === 'connected';
        svcMap.redis = { status: redisOk ? 'up' : h.redis ? 'down' : 'unknown', label: 'Redis' };
      }
      setServiceHealthMap(svcMap);
      // Extract last sync times from /health/stats
      const stats = statsRes.data;
      if (stats?.lastSyncTimes) {
        setLastSyncTimes(stats.lastSyncTimes);
      }
    }).finally(() => setSystemInfoLoading(false));
  }, []);

  const getConfigValue = (key: string): string => {
    if (changes[key] !== undefined) return changes[key];
    const found = configs.find((c) => c.key === key);
    if (found) return found.value;
    return LDAP_DEFAULTS[key]?.value || '';
  };

  const EXTRA_DESCRIPTIONS: Record<string, string> = {
    'smtp.enabled': 'Activer/désactiver l\'envoi d\'emails. Quand désactivé, aucune notification email ne sera envoyée.',
    'smtp_host': 'Adresse du serveur SMTP (ex: smtp.omnitech-security.fr)',
    'smtp_port': 'Port du serveur SMTP (25, 465 ou 587)',
    'smtp_from': 'Adresse email d\'expédition (ex: intranet@omnitech-security.fr)',
    'smtp_user': 'Nom d\'utilisateur SMTP (laisser vide si pas d\'authentification)',
    'smtp_password': 'Mot de passe SMTP',
  };

  const getConfigDescription = (key: string): string => {
    const found = configs.find((c) => c.key === key);
    if (found?.description) return found.description;
    return LDAP_DEFAULTS[key]?.description || EXTRA_DESCRIPTIONS[key] || '';
  };

  const validateField = (key: string, value: string): string | null => {
    if (key === 'ldap.url' && value && !value.startsWith('ldap://') && !value.startsWith('ldaps://')) {
      return 'L\'URL doit commencer par ldap:// ou ldaps://';
    }
    if (key === 'smtp_port' && value && (isNaN(Number(value)) || Number(value) < 1 || Number(value) > 65535)) {
      return 'Le port doit être un nombre entre 1 et 65535';
    }
    return null;
  };

  const handleChange = (key: string, value: string) => {
    setChanges((prev) => ({ ...prev, [key]: value }));
    const error = validateField(key, value);
    setValidationErrors((prev) => {
      const next = { ...prev };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
  };

  const hasValidationErrors = Object.keys(validationErrors).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(changes).map(([key, value]) =>
          api.patch(`/config/${key}`, { value }),
        ),
      );
      toast.success('Configuration sauvegardée avec succès');
      setChanges({});
      setEditingPasswords({});
      fetchConfig();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleInitLdapConfig = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(LDAP_DEFAULTS).map(([key, def]) => {
          const existing = configs.find((c) => c.key === key);
          if (!existing) {
            return api.patch(`/config/${key}`, { value: def.value });
          }
          return Promise.resolve();
        }),
      );
      toast.success('Configuration LDAPS initialisée');
      fetchConfig();
    } catch {
      toast.error('Erreur d\'initialisation');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Generic integration definitions
  // ---------------------------------------------------------------------------

  interface IntegrationDef {
    id: string;
    label: string;
    description: string;
    icon: React.ElementType;
    fields: { key: string; label: string; type: 'text' | 'password'; placeholder: string }[];
    testEndpoint: string;
    testLabel: string;
  }

  const INTEGRATION_DEFS: IntegrationDef[] = [
    {
      id: 'knowbe4',
      label: 'KnowBe4',
      description: 'Plateforme de sensibilisation à la sécurité : synchronisation des campagnes et certificats de formation',
      icon: ShieldCheck,
      fields: [
        { key: 'knowbe4_api_url', label: 'URL de l\'API KnowBe4', type: 'text', placeholder: 'https://api.events.knowbe4.com' },
        { key: 'knowbe4_api_token', label: 'Token API KnowBe4', type: 'password', placeholder: 'Votre token API KnowBe4' },
      ],
      testEndpoint: '/knowbe4/account',
      testLabel: 'Tester la connexion',
    },
  ];

  const handleTestIntegration = async (def: IntegrationDef) => {
    setIntegrationTesting((prev) => ({ ...prev, [def.id]: true }));
    setIntegrationTestResults((prev) => ({ ...prev, [def.id]: null }));
    try {
      const { data } = await api.get(def.testEndpoint);
      const name = data?.name || data?.account || '';
      setIntegrationTestResults((prev) => ({
        ...prev,
        [def.id]: { success: true, message: name ? `Connecté : ${name}` : 'Connexion réussie' },
      }));
      toast.success(`${def.label} : connexion réussie`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Connexion échouée';
      setIntegrationTestResults((prev) => ({
        ...prev,
        [def.id]: { success: false, message },
      }));
      toast.error(`${def.label} : ${message}`);
    } finally {
      setIntegrationTesting((prev) => ({ ...prev, [def.id]: false }));
    }
  };

  const handleSaveIntegration = async (def: IntegrationDef) => {
    setSaving(true);
    try {
      await Promise.all(
        def.fields
          .filter((f) => changes[f.key] !== undefined)
          .map((f) => api.patch(`/config/${f.key}`, { value: changes[f.key] })),
      );
      toast.success(`${def.label} : configuration sauvegardée`);
      const updatedChanges = { ...changes };
      def.fields.forEach((f) => delete updatedChanges[f.key]);
      setChanges(updatedChanges);
      fetchConfig();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Erreur lors de la sauvegarde';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const ldapEnabled = getConfigValue('ldap.enabled') === 'true';
  const hasLdapConfig = configs.some((c) => c.key.startsWith('ldap.'));

  const tabs = Object.entries(CONFIG_GROUPS).map(([id, group]) => ({
    id,
    label: group.label,
  }));

  const currentGroup = CONFIG_GROUPS[activeTab];
  const isPasswordField = (key: string) =>
    key.includes('password') || key.includes('secret') || key.includes('api_key');

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="config" />
      <PageHeader
        title={t('nav.config')}
        subtitle="Paramètres système de l'intranet OMNITECH"
        icon={Settings}
        hub="admin"
        actions={
          Object.keys(changes).length > 0 ? (
            <Button onClick={() => setShowSaveConfirm(true)} loading={saving} disabled={hasValidationErrors}>
              <Save className="h-4 w-4" />
              Sauvegarder ({Object.keys(changes).length} modification{Object.keys(changes).length > 1 ? 's' : ''})
            </Button>
          ) : undefined
        }
      />

      {/* System info card */}
      <Card className="shadow-sm rounded-xl animate-fade-in-up">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">Informations système</h2>
          </div>
        </CardHeader>
        <CardContent>
          {systemInfoLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : systemInfo ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Version</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.version || 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Base de données</p>
                <div className="flex items-center gap-1.5">
                  {systemInfo.database === 'OK' || systemInfo.database === 'connected' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.database || 'N/A'}</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Redis</p>
                <div className="flex items-center gap-1.5">
                  {systemInfo.redis === 'OK' || systemInfo.redis === 'connected' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.redis || 'N/A'}</p>
                </div>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Utilisateurs</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.totalUsers ?? 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Documents</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.totalDocuments ?? 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Uptime</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.uptime || 'N/A'}</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">Mémoire</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{systemInfo.memoryUsage || 'N/A'}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Bannières prioritaires */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">Bannières prioritaires</h2>
          </div>
        </CardHeader>
        <CardContent>
          {/* Create form */}
          <div className="mb-6 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase">Nouvelle bannière</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input
                label="Titre"
                value={newBanner.title}
                onChange={(e) => setNewBanner((p) => ({ ...p, title: e.target.value }))}
                placeholder="Titre de la bannière"
              />
              <Input
                label="Message"
                value={newBanner.message}
                onChange={(e) => setNewBanner((p) => ({ ...p, message: e.target.value }))}
                placeholder="Contenu du message"
              />
              <div>
                <label className="block text-xs font-semibold text-seal-gray-500 dark:text-slate-400 mb-1.5">Niveau</label>
                <select
                  aria-label="Niveau de la bannière"
                  className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-seal-navy dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  value={newBanner.level}
                  onChange={(e) => setNewBanner((p) => ({ ...p, level: e.target.value }))}
                >
                  <option value="P1">P1 - Critique (rouge)</option>
                  <option value="P2">P2 - Avertissement (ambre)</option>
                  <option value="P3">P3 - Information (bleu)</option>
                </select>
              </div>
              <Input
                label="Expiration (optionnel)"
                type="datetime-local"
                value={newBanner.expiresAt}
                onChange={(e) => setNewBanner((p) => ({ ...p, expiresAt: e.target.value }))}
              />
            </div>
            <Button size="sm" onClick={handleCreateBanner} loading={creatingBanner}>
              <Plus className="h-4 w-4" />
              Créer la bannière
            </Button>
          </div>

          {/* List */}
          {bannersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : banners.length === 0 ? (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-4">Aucune bannière</p>
          ) : (
            <div className="space-y-2">
              {banners.map((b) => {
                const levelColors: Record<string, string> = {
                  P1: 'border-red-400 bg-red-50 dark:bg-red-900/20',
                  P2: 'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
                  P3: 'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
                };
                return (
                  <div key={b.id} className={`flex items-center gap-3 rounded-lg border p-3 ${levelColors[b.level] || levelColors.P3}`}>
                    <Badge variant={b.level === 'P1' ? 'error' : b.level === 'P2' ? 'warning' : 'success'}>
                      {b.level}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">{b.title}</p>
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 truncate">{b.message}</p>
                    </div>
                    {!b.isActive && (
                      <Badge variant="draft">Inactive</Badge>
                    )}
                    {b.expiresAt && (
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                        Exp: {new Date(b.expiresAt).toLocaleDateString('fr-FR')}
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleBanner(b.id, b.isActive)}
                      className="text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition-colors"
                      title={b.isActive ? 'Désactiver' : 'Activer'}
                      aria-label={b.isActive ? 'Désactiver le bandeau' : 'Activer le bandeau'}
                    >
                      {b.isActive ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5" />}
                    </button>
                    <button
                      onClick={() => handleDeleteBanner(b.id)}
                      className="text-seal-gray-500 hover:text-red-500 transition-colors"
                      title="Supprimer"
                      aria-label="Supprimer le bandeau"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meilisearch */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-seal-navy dark:text-blue-400" />
            <h2 className="text-sm font-semibold text-seal-navy dark:text-white">Meilisearch</h2>
            {meiliStats && (
              <Badge variant={meiliStats.available ? 'success' : 'error'}>
                {meiliStats.available ? 'Connecté' : 'Hors ligne'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-4">
            Moteur de recherche federee pour l&apos;intranet. Indexe les documents, tickets, wiki et actualites.
          </p>

          {/* Stats */}
          {meiliLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : meiliStats?.available ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {Object.entries(meiliStats.indexes).map(([name, count]) => (
                <div key={name} className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
                  <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-1">
                    {name === 'wiki' ? 'Wiki' : name === 'documents' ? 'Documents' : name === 'news' ? 'Actualites' : name === 'tickets' ? 'Tickets' : name}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Database className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      {count >= 0 ? count : 'N/A'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : meiliStats && !meiliStats.available ? (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
              {meiliStats.error || 'Meilisearch non disponible'}
            </div>
          ) : null}

          {/* Reindex result */}
          {reindexResult && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400">
              <p className="font-semibold mb-1">Réindexation terminée</p>
              <div className="flex gap-3">
                <span>{reindexResult.wiki} wiki</span>
                <span>{reindexResult.documents} documents</span>
                <span>{reindexResult.news} actualites</span>
                <span>{reindexResult.tickets} tickets</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleReindex}
              loading={reindexing}
              disabled={reindexing}
            >
              <RefreshCw className={`h-4 w-4${reindexing ? ' animate-spin' : ''}`} />
              Reindexer tout
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchMeiliStats}
              disabled={meiliLoading}
            >
              <RefreshCw className={`h-4 w-4${meiliLoading ? ' animate-spin' : ''}`} />
              Rafraichir les stats
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="animate-fade-in-up">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <CardContent>
          {/* Section description + health indicator */}
          {currentGroup && (
            <div className="mb-6 flex items-start justify-between gap-4 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 p-4">
              <div className="flex items-start gap-3">
                <currentGroup.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-seal-navy dark:text-white">{currentGroup.label}</h3>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{currentGroup.description}</p>
                </div>
              </div>
              {currentGroup.healthKey && serviceHealthMap[currentGroup.healthKey] && (() => {
                const svc = serviceHealthMap[currentGroup.healthKey]!;
                return (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex-shrink-0 ${
                  svc.status === 'up'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : svc.status === 'down'
                      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                }`}>
                  {svc.status === 'up' ? (
                    <><CheckCircle2 className="h-3 w-3" /> Connecté</>
                  ) : svc.status === 'down' ? (
                    <><XCircle className="h-3 w-3" /> Hors ligne</>
                  ) : (
                    <><RefreshCw className="h-3 w-3" /> Inconnu</>
                  )}
                </span>);
              })()}
            </div>
          )}
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {/* SMTP test button */}
              {activeTab === 'smtp' && (
                <div className="mb-6 rounded-lg border-2 border-seal-navy/20 bg-seal-navy/5 dark:bg-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className="h-6 w-6 text-seal-navy dark:text-white" />
                      <div>
                        <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Configuration SMTP</h3>
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                          Paramètres du serveur de messagerie pour l&apos;envoi de notifications par email
                        </p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={async () => {
                      try {
                        const { data } = await api.post('/config/test-smtp');
                        if (data.success) toast.success(data.message);
                        else toast.error(data.message);
                      } catch { toast.error('Erreur de test SMTP'); }
                    }}>
                      <Mail className="h-4 w-4" />
                      Tester SMTP
                    </Button>
                  </div>
                </div>
              )}

              {/* Integrations & API — generic blocks */}
              {activeTab === 'integrations' && (
                <div className="space-y-6 mb-6">
                  {INTEGRATION_DEFS.map((def) => {
                    const testResult = integrationTestResults[def.id];
                    const testing = integrationTesting[def.id] ?? false;
                    const hasFieldChanges = def.fields.some((f) => changes[f.key] !== undefined);

                    return (
                      <div key={def.id} className="rounded-lg border-2 border-seal-navy/20 bg-seal-navy/5 dark:bg-slate-800 p-5 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <def.icon className="h-6 w-6 text-seal-navy dark:text-white" />
                            <div>
                              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">{def.label}</h3>
                              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{def.description}</p>
                            </div>
                          </div>
                          {testResult && (
                            <Badge variant={testResult.success ? 'success' : 'error'}>
                              {testResult.success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {testResult.success ? 'Connecté' : 'Erreur'}
                            </Badge>
                          )}
                        </div>

                        {/* Fields */}
                        <div className="space-y-3">
                          {def.fields.map((field) => {
                            const currentValue = changes[field.key] ?? getConfigValue(field.key);
                            const isPassword = field.type === 'password';
                            const passwordVisible = showPasswords[field.key] ?? false;
                            const isMasked = isPassword && !editingPasswords[field.key] && currentValue === '********';

                            if (isMasked) {
                              return (
                                <div key={field.key} className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-900">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs font-semibold text-seal-navy dark:text-white">{field.label}</p>
                                      <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 font-mono tracking-widest">********</p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setEditingPasswords((prev) => ({ ...prev, [field.key]: true }));
                                        handleChange(field.key, '');
                                      }}
                                    >
                                      <PenLine className="h-3.5 w-3.5" />
                                      Modifier
                                    </Button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div key={field.key} className={changes[field.key] !== undefined ? 'ring-2 ring-primary/30 rounded-lg' : ''}>
                                <label className="block text-xs font-semibold text-seal-navy dark:text-white mb-1">{field.label}</label>
                                <div className="relative">
                                  <Input
                                    type={isPassword && !passwordVisible ? 'password' : 'text'}
                                    value={currentValue}
                                    onChange={(e) => handleChange(field.key, e.target.value)}
                                    placeholder={field.placeholder}
                                  />
                                  {isPassword && (
                                    <button
                                      type="button"
                                      onClick={() => setShowPasswords((prev) => ({ ...prev, [field.key]: !passwordVisible }))}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition-colors"
                                      title={passwordVisible ? 'Masquer' : 'Afficher'}
                                    >
                                      {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Test result detail */}
                        {testResult && (
                          <div className={`flex items-start gap-2 rounded-md px-3 py-2 border text-xs ${
                            testResult.success
                              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                          }`}>
                            {testResult.success ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                            <p className="font-semibold">{testResult.message}</p>
                            <button onClick={() => setIntegrationTestResults((prev) => ({ ...prev, [def.id]: null }))} className="ml-auto flex-shrink-0">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleTestIntegration(def)}
                            loading={testing}
                            disabled={testing}
                          >
                            <RefreshCw className={`h-4 w-4${testing ? ' animate-spin' : ''}`} />
                            {def.testLabel}
                          </Button>
                          {hasFieldChanges && (
                            <Button
                              size="sm"
                              onClick={() => handleSaveIntegration(def)}
                              loading={saving}
                            >
                              <Save className="h-4 w-4" />
                              Sauvegarder
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* LDAP specific header */}
              {activeTab === 'ldap' && (
                <div className="mb-6 rounded-lg border-2 border-seal-navy/20 bg-seal-navy/5 dark:bg-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="h-6 w-6 text-seal-navy dark:text-white" />
                      <div>
                        <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                          Authentification LDAP Active Directory
                        </h3>
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                          {ldapEnabled
                            ? 'LDAPS est actif — les utilisateurs s\'authentifient via Active Directory avec fallback local'
                            : 'LDAPS est désactivé — authentification locale uniquement'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ldapEnabled ? (
                        <Badge variant="approved">
                          <CheckCircle2 className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="draft">
                          <XCircle className="h-3 w-3" />
                          Désactivé
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Last LDAP sync time — always shown */}
                  <div className="mt-3 flex items-center gap-2 rounded-md bg-white/60 dark:bg-slate-700/50 px-3 py-2 border border-gray-200 dark:border-slate-600">
                    <RefreshCw className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400" />
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                      Dernière synchronisation LDAP :{' '}
                      <span className="font-semibold text-seal-navy dark:text-white">
                        {lastSyncTimes?.ldap
                          ? new Date(lastSyncTimes.ldap).toLocaleString('fr-FR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })
                          : 'Aucune synchronisation enregistrée'}
                      </span>
                    </span>
                  </div>

                  {/* Inline LDAP test connection result */}
                  {ldapTestResult && (
                    <div className={`mt-2 flex items-start gap-2 rounded-md px-3 py-2 border text-xs ${
                      ldapTestResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
                    }`}>
                      {ldapTestResult.success ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{ldapTestResult.message}</p>
                        {ldapTestResult.details && (
                          <div className="mt-1 text-[10px] opacity-80">
                            {typeof ldapTestResult.details === 'string' ? (
                              <pre className="whitespace-pre-wrap font-mono">{ldapTestResult.details}</pre>
                            ) : (
                              <>
                                {ldapTestResult.details.url && <span>Serveur : {ldapTestResult.details.url}</span>}
                                {ldapTestResult.details.duration && <span className="ml-3">Latence : {ldapTestResult.details.duration}ms</span>}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button onClick={() => setLdapTestResult(null)} className="ml-auto flex-shrink-0"><X className="h-3 w-3" /></button>
                    </div>
                  )}

                  {/* Inline sync result summary */}
                  {ldapSyncResult && (
                    <div className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-400">
                      <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Résultat de la synchronisation</p>
                        <div className="flex gap-3 mt-1">
                          <span>{ldapSyncResult.created ?? 0} créé(s)</span>
                          <span>{ldapSyncResult.updated ?? 0} mis à jour</span>
                          <span>{ldapSyncResult.deactivated ?? 0} désactivé(s)</span>
                          {(ldapSyncResult.errors ?? 0) > 0 && <span className="text-red-600 font-semibold">{ldapSyncResult.errors} erreur(s)</span>}
                        </div>
                      </div>
                      <button onClick={() => setLdapSyncResult(null)} className="ml-auto flex-shrink-0"><X className="h-3 w-3" /></button>
                    </div>
                  )}
                  {!hasLdapConfig && (
                    <Button
                      variant="secondary"
                      className="mt-3"
                      onClick={handleInitLdapConfig}
                      loading={saving}
                    >
                      <Server className="h-4 w-4" />
                      Initialiser la configuration LDAPS
                    </Button>
                  )}

                  {/* LDAP Test buttons */}
                  {hasLdapConfig && (
                    <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-seal-navy/10">
                      <Button
                        variant="primary"
                        loading={testingLdap}
                        onClick={async () => {
                          setTestingLdap(true);
                          setLdapTestResult(null);
                          try {
                            const { data } = await api.post('/ldap/test-connection');
                            setLdapTestResult(data);
                            if (data.success) {
                              toast.success(data.message);
                            } else {
                              toast.error(data.message);
                            }
                          } catch { toast.error('Erreur de test'); setLdapTestResult({ success: false, message: 'Erreur de connexion au serveur' }); }
                          finally { setTestingLdap(false); }
                        }}
                        className={`px-6 ${ldapTestResult ? (ldapTestResult.success ? 'ring-2 ring-[#006233]/40' : 'ring-2 ring-[#892034]/40') : ''}`}
                      >
                        {ldapTestResult ? (
                          ldapTestResult.success ? <CheckCircle2 className="h-4 w-4 text-white" /> : <XCircle className="h-4 w-4 text-white" />
                        ) : (
                          <Server className="h-4 w-4" />
                        )}
                        Tester la connexion LDAPS
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            const { data } = await api.get('/ldap/diagnostic');
                            setLdapTestResult({
                              success: data.ready,
                              message: data.ready ? 'Configuration LDAP valide' : `${data.issues.length} problème(s) détecté(s)`,
                              details: [
                                ...data.issues.map((i: string) => `❌ ${i}`),
                                ...(data.recommendations || []).map((r: string) => `→ ${r}`),
                              ].join('\n'),
                            });
                            if (data.ready) {
                              toast.success('Diagnostic OK : configuration LDAP valide');
                            } else {
                              toast.error(`${data.issues.length} problème(s) — voir détails`);
                            }
                          } catch {
                            toast.error('Erreur lors du diagnostic');
                          }
                        }}
                      >
                        <Server className="h-4 w-4" />
                        Diagnostic complet
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowLdapTest(showLdapTest === 'auth' ? null : 'auth')}>
                        Tester un compte utilisateur
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowLdapTest(showLdapTest === 'sync' ? null : 'sync')}>
                        Synchroniser un utilisateur
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={syncingAll}
                        onClick={() => setShowSyncAllConfirm(true)}
                      >
                        <RefreshCw className={`h-4 w-4${syncingAll ? ' animate-spin' : ''}`} />
                        {syncingAll ? 'Synchronisation en cours...' : 'Synchroniser TOUS les utilisateurs AD'}
                      </Button>
                    </div>
                  )}
                  {showLdapTest && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <div className="grid grid-cols-2 gap-2">
                        <input className="rounded border px-3 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                          placeholder="Email" aria-label="Email de test LDAP" value={ldapTestEmail} onChange={e => setLdapTestEmail(e.target.value)} />
                        <input type="password" className="rounded border px-3 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                          placeholder="Mot de passe" aria-label="Mot de passe de test LDAP" value={ldapTestPassword} onChange={e => setLdapTestPassword(e.target.value)} />
                      </div>
                      <Button size="sm" className="mt-2" onClick={async () => {
                        if (!ldapTestEmail || !ldapTestPassword) return;
                        try {
                          const endpoint = showLdapTest === 'auth' ? '/ldap/test-auth' : '/ldap/sync-user';
                          const { data } = await api.post(endpoint, { email: ldapTestEmail, password: ldapTestPassword });
                          toast.success(data.success ? data.message : data.message);
                        } catch { toast.error('Erreur'); }
                      }}>
                        {showLdapTest === 'auth' ? 'Tester' : 'Synchroniser'}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Config fields */}
              <div className="space-y-4">
                {currentGroup?.keys.map((key) => {
                  const value = getConfigValue(key);
                  const description = getConfigDescription(key);
                  const isChanged = changes[key] !== undefined;
                  const isToggle = key === 'ldap.enabled' || key === 'ldap.tls_reject_unauthorized' || key === 'smtp.enabled';

                  if (isToggle) {
                    return (
                      <div key={key} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                        <div>
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">{key}</p>
                          {description && <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{description}</p>}
                        </div>
                        <button
                          onClick={async () => {
                            const newVal = value === 'true' ? 'false' : 'true';
                            handleChange(key, newVal);
                            // Sauvegarde immédiate pour les toggles (UX : pas besoin de cliquer "Sauvegarder")
                            try {
                              await api.patch(`/config/${key}`, { value: newVal });
                              toast.success(`${key} : ${newVal === 'true' ? 'activé' : 'désactivé'}`);
                              // Retirer du changes puisque déjà sauvegardé
                              setChanges((prev) => { const next = { ...prev }; delete next[key]; return next; });
                              fetchConfig();
                            } catch {
                              toast.error(`Erreur de sauvegarde pour ${key}`);
                            }
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            (changes[key] ?? value) === 'true' ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              (changes[key] ?? value) === 'true' ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  }

                  const fieldError = validationErrors[key];
                  const isPassword = isPasswordField(key);
                  const currentValue = changes[key] ?? value;
                  const isMasked = isPassword && !editingPasswords[key] && currentValue === '********';

                  if (isMasked) {
                    return (
                      <div key={key} className="rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-seal-navy dark:text-white">{key}</p>
                            {description && <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">{description}</p>}
                            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 font-mono tracking-widest">••••••••</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingPasswords((prev) => ({ ...prev, [key]: true }));
                              handleChange(key, '');
                            }}
                          >
                            <PenLine className="h-3.5 w-3.5" />
                            Modifier le mot de passe
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={key} className={`${isChanged ? 'ring-2 ring-primary/30 rounded-lg' : ''} ${fieldError ? 'ring-2 ring-red-500/50 rounded-lg' : ''}`}>
                      <Input
                        label={key}
                        hint={description || undefined}
                        type={isPassword ? 'password' : 'text'}
                        value={currentValue}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={isPassword ? 'Saisir le nouveau mot de passe' : (LDAP_DEFAULTS[key]?.value || '')}
                        error={fieldError || undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>

        {Object.keys(changes).length > 0 && (
          <CardFooter>
            <div className="flex items-center justify-between">
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {Object.keys(changes).length} paramètre{Object.keys(changes).length > 1 ? 's' : ''} modifié{Object.keys(changes).length > 1 ? 's' : ''}
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setChanges({})}>
                  Annuler
                </Button>
                <Button onClick={() => setShowSaveConfirm(true)} loading={saving} disabled={hasValidationErrors}>
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Save confirmation dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 pt-[5vh] pb-[5vh]">
          <Card className="max-w-md w-full mx-4 max-h-[85vh] overflow-y-auto">
            <CardHeader><h3 className="font-semibold text-seal-navy dark:text-white">Confirmer les modifications</h3></CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                {Object.entries(changes).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-gray-100 dark:border-slate-700">
                    <span className="text-seal-gray-500 dark:text-slate-400 font-mono">{key}</span>
                    <span className="text-seal-navy dark:text-white font-semibold truncate ml-2 max-w-[200px]">
                      {key.includes('password') || key.includes('secret') || key.includes('api_key') ? '••••••••' : String(value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => { setShowSaveConfirm(false); handleSave(); }}>
                  Confirmer ({Object.keys(changes).length} modification{Object.keys(changes).length > 1 ? 's' : ''})
                </Button>
                <Button variant="outline" onClick={() => setShowSaveConfirm(false)}>Annuler</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Matrice des accès — EDITABLE */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-seal-navy dark:text-blue-400" />
                <h2 className="text-sm font-semibold text-seal-navy dark:text-white">Matrice des accès</h2>
              </div>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                Cliquez sur une cellule pour modifier les permissions par role et module
              </p>
            </div>
            <div className="flex items-center gap-2">
              {matrixDirty && (
                <>
                  <Button variant="outline" size="sm" onClick={handleResetMatrix}>
                    <RefreshCw className="h-3.5 w-3.5" /> Réinitialiser
                  </Button>
                  <Button size="sm" onClick={handleSaveMatrix} loading={matrixSaving}>
                    <Save className="h-3.5 w-3.5" /> Sauvegarder
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-gray-200 dark:border-slate-700">
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap">
                    Role
                  </th>
                  <th className="text-left py-2 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap min-w-[180px]">
                    Description
                  </th>
                  {ACCESS_MODULES.map((mod) => (
                    <th
                      key={mod}
                      className="px-2 py-2 font-semibold text-seal-navy dark:text-white text-center whitespace-nowrap group relative"
                    >
                      <span className="cursor-help border-b border-dotted border-seal-navy/30 dark:border-slate-500">
                        {mod}
                      </span>
                      {/* Tooltip on hover */}
                      <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 hidden group-hover:block w-52 pointer-events-none">
                        <div className="bg-seal-navy dark:bg-slate-900 text-white text-[10px] font-normal leading-snug rounded-lg px-3 py-2 shadow-lg text-left whitespace-normal">
                          <p className="font-semibold mb-0.5">{mod}</p>
                          <p className="opacity-80">{ACCESS_MODULE_DESCRIPTIONS[mod] || mod}</p>
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-seal-navy dark:bg-slate-900" />
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACCESS_ROLES.map((role, roleIdx) => {
                  const isAdminLevel = ADMIN_LEVEL_ROLES.has(role);
                  const isLastAdmin = isAdminLevel && !ADMIN_LEVEL_ROLES.has(ACCESS_ROLES[roleIdx + 1] || '');
                  return (
                    <tr
                      key={role}
                      className={`border-b transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                        isAdminLevel
                          ? 'bg-amber-50/40 dark:bg-amber-900/5 border-amber-100 dark:border-amber-900/20'
                          : 'border-gray-100 dark:border-slate-800'
                      } ${isLastAdmin ? 'border-b-2 border-b-amber-200 dark:border-b-amber-800/40' : ''}`}
                    >
                      <td className="py-2.5 pr-4 font-semibold text-seal-navy dark:text-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isAdminLevel && (
                            <Shield className="h-3 w-3 text-amber-500 flex-shrink-0" />
                          )}
                          <Badge
                            variant={
                              role === 'SUPER_ADMIN'
                                ? 'error'
                                : role === 'ADMIN'
                                  ? 'warning'
                                  : role === 'DIRECTION'
                                    ? 'primary'
                                    : role === 'REVIEWER'
                                      ? 'info'
                                      : 'navy'
                            }
                          >
                            {ACCESS_ROLE_LABELS[role]}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-[10px] text-seal-gray-500 dark:text-slate-400 leading-snug">
                        {ACCESS_ROLE_DESCRIPTIONS[role] || ''}
                      </td>
                      {ACCESS_MODULES.map((mod) => {
                        const hasAccess = editableMatrix[role]?.has(mod) ?? false;
                        return (
                          <td key={mod} className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleMatrixCell(role, mod)}
                              className="focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-full transition-transform hover:scale-110"
                              title={hasAccess ? `Retirer l'acces ${mod} pour ${ACCESS_ROLE_LABELS[role]}` : `Autoriser l'acces ${mod} pour ${ACCESS_ROLE_LABELS[role]}`}
                              aria-label={hasAccess ? `Retirer l'accès ${mod} pour ${ACCESS_ROLE_LABELS[role]}` : `Autoriser l'accès ${mod} pour ${ACCESS_ROLE_LABELS[role]}`}
                              aria-pressed={hasAccess}
                            >
                              {hasAccess ? (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-50 dark:bg-red-900/10">
                                  <X className="h-3.5 w-3.5 text-red-300 dark:text-red-500/50" />
                                </span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legende */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
            <h4 className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mb-2.5">Légende</h4>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                </span>
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">Accès autorisé (cliquer pour retirer)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 dark:bg-red-900/10">
                  <X className="h-3 w-3 text-red-300 dark:text-red-500/50" />
                </span>
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">Accès refusé (cliquer pour autoriser)</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">Niveau administrateur (lignes surlignees)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-400 border-b border-dotted border-seal-gray-500/30 cursor-help">Module</span>
                <span className="text-[11px] text-seal-gray-500 dark:text-slate-400">Survoler pour voir la description</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showSyncAllConfirm}
        onClose={() => setShowSyncAllConfirm(false)}
        onConfirm={async () => {
          setShowSyncAllConfirm(false);
          setSyncingAll(true);
          setLdapSyncResult(null);
          toast.info('Synchronisation en cours — cela peut prendre quelques minutes...');
          try {
            const { data } = await api.post('/ldap/sync-all', {}, { timeout: 120000 });
            if (data.success) {
              toast.success(data.message);
              setLdapSyncResult({ created: data.created, updated: data.updated, deactivated: data.deactivated, errors: data.errors, total: data.total });
            } else {
              toast.error(data.message);
            }
          } catch (err: any) {
            if (err.code === 'ECONNABORTED') {
              toast.error('Timeout — la synchronisation prend plus de temps que prévu. Vérifiez les logs.');
            } else if (err.response?.status === 403) {
              toast.error('Permissions insuffisantes — rôle ADMIN ou supérieur requis');
            } else {
              const msg = err.response?.data?.message || err.message || 'Erreur inconnue';
              const status = err.response?.status || '';
              toast.error(`Erreur de synchronisation${status ? ` (${status})` : ''} : ${msg}`);
            }
          } finally {
            setSyncingAll(false);
          }
        }}
        title="Synchroniser tous les utilisateurs AD"
        description="Cela va créer les nouveaux comptes AD en tant que COLLABORATEUR et mettre à jour les comptes existants (nom, rôle selon les groupes AD). Cette opération peut prendre quelques minutes."
        confirmLabel="Synchroniser"
        variant="primary"
      />

      {/* Sticky save bar */}
      {Object.keys(changes).length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-lg">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              <span className="font-semibold text-seal-navy dark:text-white">{Object.keys(changes).length}</span> paramètre{Object.keys(changes).length > 1 ? 's' : ''} modifié{Object.keys(changes).length > 1 ? 's' : ''} — pensez à sauvegarder
            </p>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setChanges({})}>
                Annuler
              </Button>
              <Button onClick={() => setShowSaveConfirm(true)} loading={saving} disabled={hasValidationErrors}>
                <Save className="h-4 w-4" />
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
