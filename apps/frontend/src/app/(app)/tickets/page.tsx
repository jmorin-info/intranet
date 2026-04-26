'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { TicketSpacesHub } from './TicketSpacesHub';
import { api } from '@/lib/api';
import { features } from '@/lib/features';
import { logger } from '@/lib/logger';
import { NoaLoading } from '@/lib/noa/loading';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n';
import { useDebounce } from '@/hooks/use-debounce';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { toast } from 'sonner';
import { noaToast } from '@/lib/noa/toast';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, Button, Badge, DataTable, SearchInput, Select, Dialog, Input, Textarea, EmptyState, StatusBadge,
} from '@omnitech/ui';
import type { Column } from '@omnitech/ui';
import { formatRelativeTime } from '@/lib/utils';
import { Plus, Ticket, AlertTriangle, Clock, CheckCircle2, Circle, GripVertical, User, TrendingUp, TrendingDown, ShieldCheck, Sparkles, Shield, Link2, CheckSquare, Square, MinusSquare, UserPlus, Copy, Check, ChevronDown, ChevronUp, FileText, HelpCircle, Info, Settings, Lock, Bug, Cpu, Wifi, RefreshCw, Headset, ToggleLeft, ToggleRight, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { SmartFilter } from '@/lib/smart-filter';
import { PageHeader } from '@/components/layout/page-header';
import { ExportButton } from '@/components/ui/export-button';
import { eventBus, createEvent, useEntityEvents } from '@/lib/events';
import { useAISuggestions } from '@/lib/ai-ux';
import { AISuggestionBar } from '@/components/ai/ai-suggestion-bar';
import { useAIOrchestrator } from '@/lib/ai-orchestrator';
import { AIOrchestratedLayout } from '@/components/ai/ai-orchestrated-layout';
import { useUIEmphasis } from '@/lib/ui-os/execution';
import { ticketCreateSchema } from '@/lib/validation/schemas';

const BulkActionsBar = dynamic(
  () => import('@/components/ui/bulk-actions-bar').then(m => ({ default: m.BulkActionsBar })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
const SavedFiltersBar = dynamic(
  () => import('@/components/ui/saved-filters-bar').then(m => ({ default: m.SavedFiltersBar })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
const SmartFilterBar = dynamic(
  () => import('@/components/ui/smart-filter-bar'),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);
// RichTextEditor — uniquement mounté dans la modale de création (showCreate=true).
// Lazy pour éviter de payer le coût toolbar/contentEditable au First Load.
const RichTextEditor = dynamic(
  () => import('@/components/editor/rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
  { ssr: false, loading: () => <div className="shimmer h-40 rounded-lg" /> },
);

// --- Animated counter hook ---------------------------------------------------
function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * target);
      setValue(current);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

// --- Template icon mapping ---------------------------------------------------
const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  INCIDENT: <Bug className="h-5 w-5 text-red-600 dark:text-red-400" />,
  SECURITY: <Shield className="h-5 w-5 text-seal-bordeaux dark:text-red-300" />,
  HARDWARE: <Cpu className="h-5 w-5 text-[#c68200]" />,
  SOFTWARE: <Settings className="h-5 w-5 text-primary" />,
  NETWORK: <Wifi className="h-5 w-5 text-blue-500" />,
  ACCESS: <Lock className="h-5 w-5 text-[#70916a]" />,
  REQUEST: <FileText className="h-5 w-5 text-seal-navy dark:text-sky-300" />,
  OTHER: <HelpCircle className="h-5 w-5 text-seal-gray-500" />,
};

interface ChecklistItem { id: string; label: string }
interface CustomField { id: string; label: string; type: string }
interface DeploymentLabels {
  deployment: {
    types: string[];
    checklist: ChecklistItem[];
    fields: CustomField[];
  };
  labelColors?: Record<string, string>;
}

interface TicketItem {
  id: string;
  reference: string;
  title: string;
  description?: string;
  category: string;
  priority: string;
  status: string;
  tags: string[];
  createdAt: string;
  creator: { firstName: string; lastName: string };
  assignee: { firstName: string; lastName: string } | null;
  department?: { id: string; name: string; code: string } | null;
  space?: { id: string; name: string; slug: string; color?: string | null; icon?: string | null } | null;
  _count: { comments: number };
}

/** Extract checklist progress from tags (check:* prefixed). */
function getChecklistProgress(tags: string[], totalItems: number): { checked: number; total: number } | null {
  const checked = tags.filter(t => t.startsWith('check:')).length;
  if (checked === 0 && !tags.some(t => t.startsWith('field:') || t === 'deploiement')) return null;
  return { checked, total: totalItems };
}

/** Extract a field value from tags. */
function getFieldValue(tags: string[], fieldId: string): string {
  const prefix = `field:${fieldId}:`;
  const tag = tags.find(t => t.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : '';
}

/** Filter visible tags (exclude check: and field: prefixes). */
function visibleTags(tags: string[]): string[] {
  return tags.filter(t => !t.startsWith('check:') && !t.startsWith('field:'));
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

// --- Request type visual cards for creation dialog ---
interface RequestTypeOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: string;
  tags: string[];
}

const REQUEST_TYPES: RequestTypeOption[] = [
  { id: 'support-it', label: 'Support IT', description: 'Panne, accès, logiciel, réseau', icon: <Headset className="h-6 w-6 text-blue-500" />, category: 'INCIDENT', tags: [] },
  { id: 'deploiement', label: 'Déploiement matériel', description: 'Installation, configuration poste', icon: <Cpu className="h-6 w-6 text-teal-600" />, category: 'HARDWARE', tags: ['deploiement'] },
  { id: 'rma', label: 'RMA', description: 'Retour matériel, échange, garantie', icon: <RefreshCw className="h-6 w-6 text-amber-500" />, category: 'HARDWARE', tags: ['rma'] },
  { id: 'projet-interne', label: 'Projet interne', description: 'Projet transverse, évolution SI', icon: <Settings className="h-6 w-6 text-purple-500" />, category: 'REQUEST', tags: ['redmine:projet-interne-informatique'] },
  { id: 'autre', label: 'Autre', description: 'Demande libre', icon: <HelpCircle className="h-6 w-6 text-seal-gray-500" />, category: 'OTHER', tags: [] },
];

const CATEGORY_ASSIGNEES: Record<string, string> = {
  SECURITY: 'RSSI (jmorin@omnitech-security.fr)',
  NETWORK: 'Équipe réseau',
  HARDWARE: 'Support IT',
  SOFTWARE: 'Support IT',
  ACCESS: 'Administrateur AD',
};

const CATEGORY_HINTS: Record<string, string> = {
  INCIDENT: 'Décrivez le problème, depuis quand il se produit, et l\'impact sur votre travail.',
  HARDWARE: 'Précisez le type de matériel, le numéro de série si possible, et le lieu.',
  SOFTWARE: 'Indiquez le nom du logiciel, la version, et le message d\'erreur exact.',
  NETWORK: 'Décrivez le problème réseau, votre localisation, et si d\'autres collègues sont impactés.',
  ACCESS: 'Précisez le système ou l\'application concernée et le type d\'accès demandé.',
  SECURITY: 'Décrivez l\'incident de sécurité avec le maximum de détails. Ne partagez pas de mots de passe.',
  REQUEST: 'Décrivez votre demande et la date souhaitée de réalisation.',
  OTHER: 'Décrivez votre besoin le plus précisément possible.',
};

function getTicketAgeDays(createdAt: string): number {
  return (Date.now() - new Date(createdAt).getTime()) / 86400000;
}

function ticketAgeColor(days: number): string {
  if (days < 1) return 'text-emerald-600 dark:text-emerald-400';
  if (days <= 3) return 'text-blue-600 dark:text-blue-400';
  if (days <= 7) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function ticketAgeBgColor(days: number): string {
  if (days < 1) return 'bg-emerald-50 dark:bg-emerald-900/20';
  if (days <= 3) return 'bg-blue-50 dark:bg-blue-900/20';
  if (days <= 7) return 'bg-amber-50 dark:bg-amber-900/20';
  return 'bg-red-50 dark:bg-red-900/20';
}

function formatAge(createdAt: string): string {
  const days = getTicketAgeDays(createdAt);
  if (days < 1) {
    const hours = Math.floor(days * 24);
    return hours <= 0 ? '< 1h' : `${hours}h`;
  }
  return `${Math.floor(days)}j`;
}

// Deterministic pastel color for a tag string (cycles through a fixed palette)
const TAG_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
];

function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_COLORS[hash % TAG_COLORS.length]!;
}

// --- Source tabs for Redmine segmentation -----------------------------------
type SourceTab = 'all' | 'support-it' | 'deploiements' | 'rma' | 'projets-internes';

const SOURCE_TABS: { key: SourceTab; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'support-it', label: 'Support IT' },
  { key: 'deploiements', label: 'Deploiements' },
  { key: 'rma', label: 'RMA' },
  { key: 'projets-internes', label: 'Projets internes' },
];

function isRedmineTicket(ticket: TicketItem): boolean {
  return ticket.reference.startsWith('RDM-');
}

function matchesSourceTab(ticket: TicketItem, tab: SourceTab): boolean {
  switch (tab) {
    case 'all':
      return true;
    case 'support-it':
      return !ticket.tags.some((t) => t.startsWith('redmine:'));
    case 'deploiements':
      return ticket.tags.includes('deploiement');
    case 'rma':
      return ticket.tags.includes('rma');
    case 'projets-internes':
      return ticket.tags.includes('redmine:projet-interne-informatique');
  }
}

function extractClientFromTags(tags: string[]): string | null {
  const tag = tags.find((t) => t.startsWith('client:'));
  return tag ? tag.slice('client:'.length) : null;
}

function extractSnFromDescription(description: string | undefined | null): string | null {
  if (!description) return null;
  // SN is often in a table row like <td>SN</td><td>VALUE</td> or plain text "SN: VALUE"
  const htmlMatch = description.match(/S\/?N\s*[:=<\s/td>]*?(?:<td>|:\s*)([A-Z0-9][\w-]{3,})/i);
  if (htmlMatch?.[1]) return htmlMatch[1];
  const plainMatch = description.match(/\bS\/?N\s*[:=]\s*([A-Z0-9][\w-]{3,})/i);
  return plainMatch?.[1] ?? null;
}

function categoryBadgeVariant(cat: string): 'error' | 'warning' | 'info' | 'navy' | 'primary' | 'success' {
  switch (cat) {
    case 'INCIDENT': return 'error';
    case 'SECURITY': return 'error';
    case 'HARDWARE': return 'warning';
    case 'SOFTWARE': return 'info';
    case 'NETWORK': return 'primary';
    case 'ACCESS': return 'success';
    case 'REQUEST': return 'navy';
    default: return 'navy';
  }
}

function getSlaStatus(ticket: { priority: string; createdAt: string; status: string }) {
  if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status)) return null;
  const hours = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
  const thresholds: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 };
  const limit = thresholds[ticket.priority] || 48;
  if (hours > limit) return 'exceeded';
  if (hours > limit * 0.75) return 'warning';
  return 'ok';
}

/** Returns 0..1 progress (consumed time / SLA limit). >1 means exceeded. */
function getSlaProgress(ticket: { priority: string; createdAt: string; status: string }): number | null {
  if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status)) return null;
  const hours = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
  const thresholds: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 };
  const limit = thresholds[ticket.priority] || 48;
  return Math.min(hours / limit, 1.15); // cap at 115% for visual
}

export default function TicketsPage() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { t } = useTranslation();
  const aiSuggestions = useAISuggestions('tickets');
  const orchestration = useAIOrchestrator('TICKETS');
  const uiEmphasis = useUIEmphasis();
  const [tickets, setTickets] = useState<{ data: TicketItem[]; meta: { total: number; page: number; totalPages: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [showClosed, setShowClosed] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const searchParams = useSearchParams();
  // Auto-open create dialog when ?create=true is in the URL (linked from helpdesk, dashboard, header)
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      setShowCreate(true);
    }
  }, [searchParams]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM', tagsInput: '', departmentId: '' });
  // Validation errors côté formulaire de création (zod)
  const [createErrors, setCreateErrors] = useState<Partial<Record<'title' | 'description' | 'category' | 'priority', string>>>({});
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  const [myTicketsOnly, setMyTicketsOnly] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('all');
  const [clientFilter, setClientFilter] = useState('');

  const applySmartFilter = useCallback((f: SmartFilter) => {
    const statusMap: Record<string, string> = {
      open: 'OPEN', in_progress: 'IN_PROGRESS', closed: 'CLOSED',
      pending: 'WAITING', resolved: 'RESOLVED',
    };
    const priorityMap: Record<string, string> = {
      critical: 'CRITICAL', high: 'HIGH', medium: 'MEDIUM', low: 'LOW',
    };
    if (f.status) setStatusFilter(statusMap[f.status] ?? '');
    else setStatusFilter('');
    if (f.priority) setPriorityFilter(priorityMap[f.priority] ?? '');
    else setPriorityFilter('');
    setMyTicketsOnly(f.mine);
    setPage(1);
  }, []);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [adminUsers, setAdminUsers] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  // 'ALL' = no filter, 'MINE' = user's own department, or a specific dept id.
  const [departmentFilter, setDepartmentFilter] = useState<string>('');
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [aiAnalysis, setAiAnalysis] = useState<{ suggestedPriority: string; relatedTickets: any[]; keywordsDetected: string[]; riskLevel: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [bulkAssigneeId, setBulkAssigneeId] = useState('');
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; label: string; category: string; priority: string; titleTemplate: string; descriptionTemplate: string; tags: string[] }>>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [requestType, setRequestType] = useState<string>('');
  // Deployment labels / checklist / custom fields
  const [deployLabels, setDeployLabels] = useState<DeploymentLabels | null>(null);
  const [checklistState, setChecklistState] = useState<Record<string, boolean>>({});
  const [customFieldsState, setCustomFieldsState] = useState<Record<string, string>>({});

  // Smart search suggestions for ticket creation
  const [titleSuggestions, setTitleSuggestions] = useState<{ tickets: any[]; wiki: any[] } | null>(null);
  const [titleSuggestionsLoading, setTitleSuggestionsLoading] = useState(false);
  const [titleSuggestionsOpen, setTitleSuggestionsOpen] = useState(true);
  const debouncedTitle = useDebounce(form.title, 300);

  // ── Multi-space state ──────────────────────────────────────────────
  const [spaces, setSpaces] = useState<Array<{ id: string; name: string; slug: string; color?: string | null; icon?: string | null; isDefault: boolean; _count: { tickets: number } }>>([]);
  // L'espace actif est lu depuis ?space=<slug> dans l'URL. Si absent on
  // affiche le hub de sélection (cf. TicketSpacesHub) avant d'entrer dans
  // la vue liste. Feedback user 2026-04-20 : "le choix de l'espace doit
  // apparaître en amont de l'espace de ticketing".
  const [activeSpaceSlug, setActiveSpaceSlug] = useState<string>('');

  // Debounced AI ticket analysis when title+description change in the create form (guarded)
  useEffect(() => {
    if (!features.ai) return;
    if (!showCreate) { setAiAnalysis(null); return; }
    if (form.title.length < 5 && form.description.length < 10) { setAiAnalysis(null); return; }
    if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = setTimeout(async () => {
      setAiLoading(true);
      try {
        const { data } = await api.post('/ai/analyze-ticket', { title: form.title, description: form.description, category: form.category });
        setAiAnalysis(data);
      } catch { setAiAnalysis(null); }
      finally { setAiLoading(false); }
    }, 800);
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
  }, [form.title, form.description, form.category, showCreate]);

  // Debounced smart search for title suggestions (KB articles + similar tickets)
  useEffect(() => {
    if (!showCreate || debouncedTitle.length < 5) {
      setTitleSuggestions(null);
      return;
    }
    let cancelled = false;
    setTitleSuggestionsLoading(true);
    api.get('/ai/search', { params: { q: debouncedTitle } })
      .then(({ data }) => {
        if (cancelled) return;
        const sugTickets = (data.tickets || []).slice(0, 3);
        const sugWiki = [...(data.wiki || []), ...(data.kb || [])].slice(0, 2);
        if (sugTickets.length === 0 && sugWiki.length === 0) {
          setTitleSuggestions(null);
        } else {
          setTitleSuggestions({ tickets: sugTickets, wiki: sugWiki });
          setTitleSuggestionsOpen(true);
        }
      })
      .catch(() => { if (!cancelled) setTitleSuggestions(null); })
      .finally(() => { if (!cancelled) setTitleSuggestionsLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedTitle, showCreate]);

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const isReviewer = user && isRoleAtLeast(user.role, UserRole.REVIEWER);

  useEffect(() => {
    if (isAdmin) {
      api.get('/tickets/analytics').then(r => setAnalytics(r.data)).catch((err) => logger.error(err, { page: 'tickets', context: 'analytics' }));
      api.get('/users', { params: { limit: 100 } }).then(r => {
        const data = r.data?.data || r.data || [];
        setAdminUsers(data.map((u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName })));
      }).catch((err) => logger.error(err, { page: 'tickets', context: 'admin users' }));
    }
  }, [isAdmin]);

  // Load ticket templates
  useEffect(() => {
    api.get('/tickets/templates')
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : [];
        setTemplates(data);
      })
      .catch(() => setTemplates([]));
  }, []);

  // Load deployment labels / checklist / custom fields
  useEffect(() => {
    api.get('/tickets/labels')
      .then((r) => setDeployLabels(r.data as DeploymentLabels))
      .catch(() => setDeployLabels(null));
  }, []);

  // Determine if deployment panel should show in the create dialog
  const showDeployPanel = form.category === 'HARDWARE' || form.tagsInput.toLowerCase().includes('deploiement') || requestType === 'deploiement';

  // Reset checklist/fields when dialog opens or category changes
  useEffect(() => {
    if (!showCreate) {
      setChecklistState({});
      setCustomFieldsState({});
    }
  }, [showCreate]);

  // Load ticket spaces list (pour le switcher d'en-tête et le hub)
  useEffect(() => {
    api.get('/tickets/spaces')
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : [];
        setSpaces(data);
      })
      .catch(() => setSpaces([]));
  }, []);

  // Sync activeSpaceSlug ↔ query param ?space=... Si absent → hub.
  useEffect(() => {
    const qp = searchParams.get('space');
    if (qp && qp !== activeSpaceSlug) {
      setActiveSpaceSlug(qp);
    } else if (!qp && activeSpaceSlug) {
      setActiveSpaceSlug('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Helper pour changer d'espace via le switcher (réécrit l'URL)
  const switchSpace = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (slug) params.set('space', slug);
      else params.delete('space');
      const query = params.toString();
      router.push(query ? `/tickets?${query}` : '/tickets');
      setPage(1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, searchParams],
  );

  // Load departments (for the filter + create form). Falls back to [] on 403/404.
  useEffect(() => {
    api.get('/departments')
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : r.data?.data || [];
        setDepartments(
          data.map((d: any) => ({ id: d.id, name: d.name, code: d.code })),
        );
      })
      .catch(() => setDepartments([]));
  }, []);

  // Pre-select the user's department in the create form.
  useEffect(() => {
    if (user?.departmentId && !form.departmentId) {
      setForm((f) => ({ ...f, departmentId: user.departmentId! }));
    }
  }, [user?.departmentId, form.departmentId]);

  // Set default department filter: admins/reviewers see all, others see "Mon departement".
  useEffect(() => {
    if (!user) return;
    if (isReviewer) {
      setDepartmentFilter('');
    } else if (user.departmentId) {
      setDepartmentFilter(user.departmentId);
    }
  }, [user, isReviewer]);

  // Fetch per-status counts for filter pills (single groupBy query instead of 5 separate calls)
  const refreshStatusCounts = useCallback(() => {
    const params: Record<string, string> = {};
    if (myTicketsOnly && user?.id) params.userId = user.id;
    api.get('/tickets/status-counts', { params })
      .then(r => setStatusCounts(r.data || {}))
      .catch(() => setStatusCounts({}));
  }, [myTicketsOnly, user?.id]);
  useEffect(() => { refreshStatusCounts(); }, [refreshStatusCounts]);

  // --- Derived: filtered tickets by source tab + client ---
  const filteredTickets = useMemo(() => {
    const raw = tickets?.data || [];
    let result = raw.filter((t) => matchesSourceTab(t, sourceTab));
    if (!showClosed && statusFilter !== 'CLOSED') {
      result = result.filter((t) => t.status !== 'CLOSED');
    }
    if (clientFilter) {
      result = result.filter((t) => extractClientFromTags(t.tags) === clientFilter);
    }
    return result;
  }, [tickets?.data, sourceTab, clientFilter, showClosed, statusFilter]);

  // Tab counters (computed on full data set, not the filtered one)
  const tabCounts = useMemo(() => {
    const all = tickets?.data || [];
    const counts: Record<SourceTab, number> = {
      all: all.length,
      'support-it': all.filter((t) => matchesSourceTab(t, 'support-it')).length,
      deploiements: all.filter((t) => matchesSourceTab(t, 'deploiements')).length,
      rma: all.filter((t) => matchesSourceTab(t, 'rma')).length,
      'projets-internes': all.filter((t) => matchesSourceTab(t, 'projets-internes')).length,
    };
    return counts;
  }, [tickets?.data]);

  // Contextual stats for the active source tab
  const contextualStats = useMemo(() => {
    const open = filteredTickets.filter((t) => t.status === 'OPEN').length;
    const inProgress = filteredTickets.filter((t) => t.status === 'IN_PROGRESS').length;
    const resolved = filteredTickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length;
    return { open, inProgress, resolved };
  }, [filteredTickets]);

  // Unique client list for the client filter dropdown
  const clientOptions = useMemo(() => {
    const all = tickets?.data || [];
    const clients = new Set<string>();
    for (const t of all) {
      const c = extractClientFromTags(t.tags);
      if (c) clients.add(c);
    }
    return Array.from(clients).sort();
  }, [tickets?.data]);

  // Client-side sort state
  const [ticketSortField, setTicketSortField] = useState<string>('createdAt');
  const [ticketSortOrder, setTicketSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleTicketSort = useCallback((key: string) => {
    setTicketSortOrder((prev) => (ticketSortField === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
    setTicketSortField(key);
  }, [ticketSortField]);

  const sortedFilteredTickets = useMemo(() => {
    return [...filteredTickets].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';
      switch (ticketSortField) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'priority': {
          const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          aVal = order[a.priority] ?? 9;
          bVal = order[b.priority] ?? 9;
          break;
        }
        case 'status': {
          const order: Record<string, number> = { OPEN: 0, IN_PROGRESS: 1, WAITING: 2, RESOLVED: 3, CLOSED: 4 };
          aVal = order[a.status] ?? 9;
          bVal = order[b.status] ?? 9;
          break;
        }
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'creator':
          aVal = `${a.creator.lastName} ${a.creator.firstName}`.toLowerCase();
          bVal = `${b.creator.lastName} ${b.creator.firstName}`.toLowerCase();
          break;
        case 'assignee':
          aVal = a.assignee ? `${a.assignee.lastName} ${a.assignee.firstName}`.toLowerCase() : '';
          bVal = b.assignee ? `${b.assignee.lastName} ${b.assignee.firstName}`.toLowerCase() : '';
          break;
        default:
          aVal = String((a as unknown as Record<string, unknown>)[ticketSortField] ?? '');
          bVal = String((b as unknown as Record<string, unknown>)[ticketSortField] ?? '');
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return ticketSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { sensitivity: 'base' });
      return ticketSortOrder === 'asc' ? cmp : -cmp;
    });
  }, [filteredTickets, ticketSortField, ticketSortOrder]);

  const categoryLabel = (cat: string): string => {
    const labels: Record<string, string> = {
      INCIDENT: t('tickets.category.incident'), REQUEST: t('tickets.category.request'), ACCESS: t('tickets.category.access'),
      HARDWARE: t('tickets.category.hardware'), SOFTWARE: t('tickets.category.software'), NETWORK: t('tickets.category.network'),
      SECURITY: t('tickets.category.security'), OTHER: t('tickets.category.other'),
    };
    return labels[cat] || cat;
  };

  const priorityBadge = (p: string) => {
    switch (p) {
      case 'CRITICAL': return <Badge variant="error">{t('tickets.priority.critical')}</Badge>;
      case 'HIGH': return <Badge variant="warning">{t('tickets.priority.high')}</Badge>;
      case 'MEDIUM': return <Badge variant="info">{t('tickets.priority.medium')}</Badge>;
      default: return <Badge variant="navy">{t('tickets.priority.low')}</Badge>;
    }
  };

  const slaBadge = (ticket: TicketItem) => {
    if (isRedmineTicket(ticket)) return null;
    const sla = getSlaStatus(ticket);
    if (!sla) return null;
    if (sla === 'exceeded') return <Badge variant="error"><AlertTriangle className="h-3 w-3" /> SLA depasse</Badge>;
    if (sla === 'warning') return <Badge variant="warning"><Clock className="h-3 w-3" /> {t('tickets.sla.warning')}</Badge>;
    return null;
  };

  const slaRemainingLabel = (ticket: TicketItem): React.ReactNode => {
    if (isRedmineTicket(ticket)) return null;
    if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status)) return null;
    const thresholds: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 };
    const limitHours = thresholds[ticket.priority] || 48;
    const elapsed = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
    const remaining = limitHours - elapsed;
    if (remaining <= 0) {
      return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400"><AlertTriangle className="h-3 w-3 animate-pulse" />dépassé</span>;
    }
    const color = remaining <= 1 ? 'text-red-600 dark:text-red-400' : remaining <= limitHours * 0.25 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
    const label = remaining < 1 ? `${Math.round(remaining * 60)}min` : `${remaining.toFixed(1)}h`;
    return <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${color}`}><Clock className="h-3 w-3" />{label}</span>;
  };

  const statusBadge = (s: string) => <StatusBadge status={s} />;

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (assigneeFilter) params.assigneeId = assigneeFilter;
      if (departmentFilter) params.departmentId = departmentFilter;
      if (myTicketsOnly && user?.id) params.userId = user.id;
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (activeSpaceSlug) params.spaceSlug = activeSpaceSlug;
      const { data } = await api.get('/tickets', { params });
      setTickets(data);
    } catch (err) { logger.error(err, { page: 'tickets', context: 'load list' }); setFetchError(true); } finally { setLoading(false); }
  }, [page, statusFilter, priorityFilter, categoryFilter, assigneeFilter, departmentFilter, myTicketsOnly, user?.id, debouncedSearch, activeSpaceSlug]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  const refetchAll = useCallback(() => { fetchTickets(); refreshStatusCounts(); }, [fetchTickets, refreshStatusCounts]);
  useRefetchOnFocus(refetchAll);

  // Event bus: auto-refresh list when ticket mutations happen elsewhere (detail page, other tab)
  useEntityEvents('TICKET', (event) => {
    if (event.metadata?.optimistic) return; // skip optimistic, wait for confirmed
    if (['CREATED', 'STATUS_CHANGED', 'DELETED', 'ASSIGNED'].includes(event.type)) {
      refetchAll();
    }
  });

  // Phase 13: Auto-focus search when AI detects search intent
  useEffect(() => {
    if (uiEmphasis.searchFocus) {
      const input = document.querySelector<HTMLInputElement>('input[placeholder*="Rechercher"]');
      input?.focus();
    }
  }, [uiEmphasis.searchFocus]);

  // Clear selection when data changes
  useEffect(() => { setSelectedIds(new Set()); }, [tickets?.data]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (sortedFilteredTickets.length === 0) return;
    if (selectedIds.size === sortedFilteredTickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedFilteredTickets.map(t => t.id)));
    }
  };

  const handleBulkStatusChange = async () => {
    if (!bulkNewStatus || selectedIds.size === 0) return;
    try {
      const { data } = await api.post<{ updated: number }>('/tickets/bulk/status', {
        ids: Array.from(selectedIds),
        status: bulkNewStatus,
      });
      toast.success(`Statut mis à jour sur ${data.updated} ticket${data.updated > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      setShowBulkStatus(false);
      setBulkNewStatus('');
      fetchTickets();
      refreshStatusCounts();
    } catch (err) {
      toast.error('Erreur de mise à jour');
    }
  };

  const handleBulkAssign = async () => {
    if (!bulkAssigneeId || selectedIds.size === 0) return;
    try {
      const { data } = await api.post<{ updated: number }>('/tickets/bulk/assign', {
        ids: Array.from(selectedIds),
        assigneeId: bulkAssigneeId,
      });
      toast.success(`${data.updated} ticket${data.updated > 1 ? 's assignés' : ' assigné'}`);
      setSelectedIds(new Set());
      setShowBulkAssign(false);
      setBulkAssigneeId('');
      fetchTickets();
      refreshStatusCounts();
    } catch (err) {
      toast.error("Erreur d'assignation");
    }
  };

  const handleCreate = async () => {
    // Validation zod avant submit — affiche les erreurs par champ
    const parsed = ticketCreateSchema.safeParse({
      title: form.title,
      description: form.description,
      category: form.category,
      priority: (form.priority || '').toLowerCase(),
    });
    if (!parsed.success) {
      const next: typeof createErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof next;
        if (key && !next[key]) next[key] = issue.message;
      }
      setCreateErrors(next);
      toast.error(t('tickets.create.required'));
      return;
    }
    setCreateErrors({});
    setCreating(true);
    try {
      const tags = form.tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
      // Append checklist tags (check:*) for checked items
      if (showDeployPanel && deployLabels) {
        for (const [checkId, checked] of Object.entries(checklistState)) {
          if (checked) tags.push(`check:${checkId}`);
        }
        // Append custom field tags (field:id:value)
        for (const [fieldId, value] of Object.entries(customFieldsState)) {
          if (value.trim()) tags.push(`field:${fieldId}:${value.trim()}`);
        }
      }
      const payload: Record<string, unknown> = {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        tags,
      };
      if (form.departmentId) payload.departmentId = form.departmentId;
      const { data: created } = await api.post('/tickets', payload);
      noaToast.success(t('tickets.create.success'));
      if (created?.id) {
        eventBus.emit(createEvent('CREATED', 'TICKET', created.id, {
          label: `${created.reference || 'Ticket'} cree`,
        }));
      }
      setShowCreate(false);
      if (created?.id) router.push(`/tickets/${created.id}`);
      setChecklistState({});
      setCustomFieldsState({});
      setForm({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM', tagsInput: '', departmentId: user?.departmentId || '' });
      fetchTickets();
      refreshStatusCounts();
    } catch { toast.error(t('tickets.create.error')); } finally { setCreating(false); }
  };

  const allSelected = sortedFilteredTickets.length > 0 && selectedIds.size === sortedFilteredTickets.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const columns: Column<TicketItem>[] = [
    ...(isAdmin ? [{
      key: 'select' ,
      header: '',
      className: 'w-10',
      render: (ticket: TicketItem) => (
        <button
          onClick={(e) => { e.stopPropagation(); toggleSelect(ticket.id); }}
          className="flex items-center justify-center p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={selectedIds.has(ticket.id) ? 'Désélectionner' : 'Sélectionner'}
        >
          {selectedIds.has(ticket.id) ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : (
            <Square className="h-4 w-4 text-seal-gray-500/40 dark:text-slate-500" />
          )}
        </button>
      ),
    }] : []),
    { key: 'reference', header: t('tickets.column.ref'), className: 'w-28', render: (ticket) => (
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs font-semibold text-seal-navy dark:text-white">{ticket.reference}</span>
        {isRedmineTicket(ticket) && (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400">Redmine</span>
        )}
      </div>
    ) },
    { key: 'title', header: t('tickets.column.title'), sortable: true, render: (t) => <span className="text-sm font-semibold text-seal-navy dark:text-white truncate max-w-xs block">{t.title}</span> },
    { key: 'category', header: t('tickets.column.category'), render: (t) => <Badge variant={categoryBadgeVariant(t.category)}>{categoryLabel(t.category)}</Badge> },
    { key: 'tags' , header: 'Labels', render: (t) => {
      const visible = visibleTags(t.tags);
      const checkTotal = deployLabels?.deployment?.checklist?.length ?? 12;
      const progress = getChecklistProgress(t.tags, checkTotal);
      return (
        <div className="flex flex-col gap-1">
          {visible.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {visible.slice(0, 3).map(tag => {
                const customColor = deployLabels?.labelColors?.[tag];
                return customColor ? (
                  <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: customColor }}>{tag}</span>
                ) : (
                  <span key={tag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagColor(tag)}`}>{tag}</span>
                );
              })}
              {visible.length > 3 && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400">+{visible.length - 3}</span>}
            </div>
          )}
          {progress && (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-16 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${progress.checked === progress.total ? 'bg-emerald-500' : progress.checked > 0 ? 'bg-primary' : 'bg-gray-300'}`} style={{ width: `${Math.round((progress.checked / progress.total) * 100)}%` }} />
              </div>
              <span className={`text-[10px] font-semibold tabular-nums ${progress.checked === progress.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-seal-gray-500 dark:text-slate-400'}`}>{progress.checked}/{progress.total}</span>
            </div>
          )}
          {visible.length === 0 && !progress && <span className="text-seal-gray-500/40 dark:text-slate-600 text-xs">—</span>}
        </div>
      );
    }},
    ...(sourceTab === 'deploiements' ? [
      { key: 'client', header: 'Client', className: 'w-36', render: (ticket: TicketItem) => {
        const client = extractClientFromTags(ticket.tags);
        return client ? <span className="text-xs font-medium text-seal-navy dark:text-white">{client}</span> : <span className="text-seal-gray-500/40 dark:text-slate-600 text-xs">--</span>;
      }},
      { key: 'sn', header: 'SN', className: 'w-32', render: (ticket: TicketItem) => {
        const sn = extractSnFromDescription(ticket.description);
        return sn ? <span className="font-mono text-xs text-seal-navy dark:text-white">{sn}</span> : <span className="text-seal-gray-500/40 dark:text-slate-600 text-xs">--</span>;
      }},
    ] : []),
    { key: 'priority', header: t('tickets.column.priority'), sortable: true, render: (t) => priorityBadge(t.priority) },
    { key: 'status', header: t('tickets.column.status'), sortable: true, render: (t) => <div className="flex items-center gap-1.5">{statusBadge(t.status)}{slaBadge(t)}</div> },
    { key: 'sla', header: 'SLA', className: 'w-20', render: (t) => slaRemainingLabel(t) ?? <span className="text-seal-gray-500/40 dark:text-slate-600 text-xs">--</span> },
    { key: 'creator', header: t('tickets.column.creator'), sortable: true, render: (t) => <span className="text-xs text-seal-gray-500 dark:text-slate-400">{t.creator.firstName} {t.creator.lastName}</span> },
    { key: 'assignee', header: t('tickets.column.assignee'), sortable: true, render: (t) => t.assignee ? <span className="text-xs text-seal-gray-500 dark:text-slate-400">{t.assignee.firstName} {t.assignee.lastName}</span> : <span className="text-xs text-seal-gray-500 dark:text-slate-500">—</span> },
    { key: 'createdAt', header: t('tickets.column.date'), sortable: true, render: (t) => <span className="text-xs text-seal-gray-500 dark:text-slate-400">{formatRelativeTime(t.createdAt)}</span> },
    { key: 'age' , header: 'Âge', className: 'w-16', render: (t) => {
      const days = getTicketAgeDays(t.createdAt);
      return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ticketAgeColor(days)} ${ticketAgeBgColor(days)}`}>
          <Clock className="h-3 w-3" />
          {formatAge(t.createdAt)}
        </span>
      );
    }},
    { key: 'actions' , header: '', className: 'w-24', render: (ticket) => (
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* Quick status change */}
        <div className="relative">
          <button
            title="Changer le statut"
            aria-label={`Changer le statut du ticket ${ticket.reference}`}
            onClick={(e) => { e.stopPropagation(); const el = e.currentTarget.nextElementSibling as HTMLElement; if (el) el.classList.toggle('hidden'); }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <div className="hidden absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
            {['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'].filter(s => s !== ticket.status).map(s => (
              <button
                key={s}
                onClick={async (e) => {
                  e.stopPropagation();
                  (e.currentTarget.parentElement as HTMLElement)?.classList.add('hidden');
                  try {
                    await api.patch(`/tickets/${ticket.id}`, { status: s });
                    toast.success(`Statut mis à jour`);
                    fetchTickets();
                  } catch { toast.error('Erreur'); }
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800 transition"
              >
                {statusBadge(s)}
              </button>
            ))}
          </div>
        </div>
        {/* Assign to me */}
        {user && (!ticket.assignee || ticket.assignee.firstName !== user.firstName) && (
          <button
            title="M'assigner ce ticket"
            aria-label={`M'assigner le ticket ${ticket.reference}`}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await api.patch(`/tickets/${ticket.id}`, { assigneeId: user.id });
                toast.success('Ticket assigné');
                fetchTickets();
              } catch { toast.error('Erreur'); }
            }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-seal-gray-500 hover:text-primary transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Copy reference */}
        <button
          title="Copier la référence"
          aria-label={`Copier la référence ${ticket.reference}`}
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(ticket.reference);
            setCopiedRef(ticket.reference);
            toast.success(`${ticket.reference} copié`);
            setTimeout(() => setCopiedRef(null), 2000);
          }}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-seal-gray-500 hover:text-seal-navy dark:hover:text-white transition"
        >
          {copiedRef === ticket.reference ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    )},
  ];

  // Si aucun espace actif dans l'URL (?space=<slug>), on affiche le hub
  // de sélection AVANT d'entrer dans la liste des tickets. Choix produit
  // demandé par l'user 2026-04-20 : "le choix de l'espace doit apparaître
  // en amont". La nav redirige vers /tickets?space=<slug> qui rebascule
  // sur la vue liste.
  if (!activeSpaceSlug) {
    return (
      <AIOrchestratedLayout module="TICKETS" hints={orchestration.hints}>
        <TicketSpacesHub />
      </AIOrchestratedLayout>
    );
  }

  return (
    <AIOrchestratedLayout module="TICKETS" hints={orchestration.hints}>
    <div className="space-y-6">
      <PageHeader
        title={t('tickets.title')}
        subtitle={t('tickets.subtitle')}
        icon={Ticket}
        hub="monEspace"
        actions={
          <>
            <div className="flex items-center gap-1 border rounded-lg p-0.5 dark:border-slate-700" role="tablist" aria-label="Mode d'affichage">
              <button onClick={() => setViewMode('table')} role="tab" aria-selected={viewMode === 'table'} aria-label="Vue tableau"
                className={`px-3 py-1.5 text-xs rounded font-semibold transition focus-visible:ring-2 focus-visible:ring-primary ${viewMode === 'table' ? 'bg-primary text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                Tableau
              </button>
              <button onClick={() => setViewMode('kanban')} role="tab" aria-selected={viewMode === 'kanban'} aria-label="Vue Kanban"
                className={`px-3 py-1.5 text-xs rounded font-semibold transition focus-visible:ring-2 focus-visible:ring-primary ${viewMode === 'kanban' ? 'bg-primary text-white' : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                Kanban
              </button>
            </div>
            <ExportButton
              filename="tickets"
              rows={(tickets?.data || []) as unknown as Array<Record<string, unknown>>}
              columns={[
                { header: 'ID', accessor: 'id' },
                { header: 'Titre', accessor: 'title' },
                { header: 'Statut', accessor: 'status' },
                { header: 'Priorité', accessor: 'priority' },
                { header: 'Catégorie', accessor: 'category' },
                { header: 'Créé le', accessor: (r: any) => r?.createdAt || '' },
                { header: 'MAJ', accessor: (r: any) => r?.updatedAt || '' },
                { header: 'Assigné à', accessor: (r: any) => r?.assignedTo?.email || '' },
              ]}
            />
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> {t('tickets.new')}
            </Button>
          </>
        }
      />

      {/* Space switcher — mono-vue : un seul espace visible à la fois.
          Le bouton '← Changer d'espace' retourne au hub de sélection. */}
      {spaces.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <button
            type="button"
            onClick={() => switchSpace('')}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-seal-gray-500 hover:text-seal-orange transition"
            title="Retour à la sélection d'espace"
          >
            ← Changer
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-seal-gray-500">
              Espace actif
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap flex-1">
            {spaces.map((space) => {
              const active = activeSpaceSlug === space.slug;
              return (
                <button
                  key={space.id}
                  onClick={() => switchSpace(space.slug)}
                  className={`px-3 py-1.5 text-xs rounded-full font-semibold transition-all flex items-center gap-1.5 ${
                    active
                      ? 'text-white shadow-sm'
                      : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700'
                  }`}
                  style={
                    active && space.color
                      ? { backgroundColor: space.color }
                      : active
                        ? { backgroundColor: '#004469' }
                        : undefined
                  }
                  title={space.name}
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: active ? 'rgba(255,255,255,0.9)' : space.color ?? '#837274' }}
                  />
                  {space.name}
                  <span className={`opacity-60 tabular-nums ${active ? 'text-white/80' : ''}`}>
                    ({space._count.tickets})
                  </span>
                </button>
              );
            })}
          </div>
          {spaces.length > 0 && (
            <Link
              href="/admin/ticket-spaces"
              className="flex-shrink-0 text-[11px] text-seal-gray-400 hover:text-seal-navy dark:hover:text-white underline decoration-dotted underline-offset-2"
            >
              Gérer les espaces
            </Link>
          )}
        </div>
      )}

      {/* Source tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {SOURCE_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setSourceTab(key); setClientFilter(''); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary inline-flex items-center gap-2 ${
              sourceTab === key
                ? 'bg-primary text-white shadow-sm'
                : 'bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
            }`}
          >
            {label}
            <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-semibold leading-none px-1.5 py-0.5 min-w-[20px] ${
              sourceTab === key ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400'
            }`}>
              {tabCounts[key]}
            </span>
          </button>
        ))}
        {/* Client quick filter (when clients exist) */}
        {clientOptions.length > 0 && (
          <Select
            options={[
              { value: '', label: 'Tous les clients' },
              ...clientOptions.map((c) => ({ value: c, label: c })),
            ]}
            value={clientFilter}
            onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            className="w-48 ml-auto"
          />
        )}
      </div>

      {/* Contextual stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="shadow-sm rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <Circle className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">Ouverts</p>
              <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">{contextualStats.open}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">En cours</p>
              <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">{contextualStats.inProgress}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">Resolus / Fermes</p>
              <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">{contextualStats.resolved}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isAdmin && analytics && <AnimatedStatsCards analytics={analytics} />}

      <Card className="shadow-sm rounded-xl">
        <CardContent className="space-y-3 p-4">
          <div className="flex gap-3 flex-wrap">
            <SearchInput
              value={searchQuery}
              onChange={(val) => { setSearchQuery(val); setPage(1); }}
              placeholder={t('tickets.searchPlaceholder') || 'Rechercher un ticket...'}
              className="flex-1 min-w-[200px]"
            />
            {departments.length > 0 && (
              <Select
                options={[
                  { value: '', label: isReviewer ? 'Tous les départements' : 'Mon département' },
                  // ★ Mon département en raccourci, on l'exclut ensuite de la liste pour éviter le doublon de key
                  ...(isReviewer && user?.departmentId
                    ? [{ value: user.departmentId, label: '★ Mon département' }]
                    : []),
                  ...departments
                    .filter((d) => !(isReviewer && user?.departmentId === d.id))
                    .map((d) => ({ value: d.id, label: d.name })),
                ]}
                placeholder="Département..."
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
                className="w-56"
              />
            )}
            {isAdmin && (
              <Select
                options={adminUsers.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
                placeholder="Assigné à..."
                value={assigneeFilter}
                onChange={(e) => { setAssigneeFilter(e.target.value); setPage(1); }}
                className="w-52"
              />
            )}
          </div>
          {/* Smart Filter Bar — langage naturel FR */}
          <SmartFilterBar
            onFilter={applySmartFilter}
            placeholder="Essayez : mes tickets ouverts cette semaine critiques"
          />
          {/* Status filter pills with counts */}
          <div className="flex gap-1.5 items-center flex-wrap">
            <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mr-1">Statut</span>
            {([
              { value: '', label: 'Tous' },
              { value: 'OPEN', label: t('tickets.status.open') },
              { value: 'IN_PROGRESS', label: t('tickets.status.inProgress') },
              { value: 'WAITING', label: t('tickets.status.waiting') },
              { value: 'RESOLVED', label: t('tickets.status.resolved') },
              ...(showClosed ? [{ value: 'CLOSED' as const, label: t('tickets.status.closed') }] : []),
            ] as const).map(({ value, label }) => {
              const count = value ? (statusCounts[value] ?? null) : null;
              return (
                <button
                  key={value}
                  onClick={() => { setStatusFilter(value); setPage(1); }}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary inline-flex items-center gap-1 ${statusFilter === value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
                >
                  {label}
                  {count !== null && (
                    <span className={`inline-flex items-center justify-center rounded-full text-[10px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] ${statusFilter === value ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-600 text-seal-gray-500 dark:text-slate-300'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => { setShowClosed(!showClosed); if (!showClosed && statusFilter === 'CLOSED') setStatusFilter('OPEN'); }}
              className={`ml-2 rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${showClosed ? 'bg-seal-navy/10 dark:bg-slate-600 text-seal-navy dark:text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'}`}
              title="Afficher / masquer les tickets fermés"
            >
              {showClosed ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
              Tickets fermés
            </button>
          </div>
          <div className="flex gap-1.5 items-center flex-wrap">
            <button
              onClick={() => { setMyTicketsOnly(!myTicketsOnly); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${myTicketsOnly ? 'bg-seal-navy text-white dark:bg-primary' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
            >
              <User className="h-3 w-3" />
              Mes tickets
            </button>
            <span className="text-gray-300 dark:text-slate-600">|</span>
            {(['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
              <button key={p} onClick={() => { setPriorityFilter(p); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${priorityFilter === p ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}>
                {!p && t('tickets.priority.toutes')}{p === 'CRITICAL' && `${t('tickets.priority.critical')} \u{1F534}`}{p === 'HIGH' && `${t('tickets.priority.high')} \u{1F7E0}`}{p === 'MEDIUM' && `${t('tickets.priority.medium')} \u{1F535}`}{p === 'LOW' && `${t('tickets.priority.low')} \u26AA`}
              </button>
            ))}
          </div>
          {/* Category filter chips */}
          <div className="flex gap-1.5 items-center flex-wrap">
            <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mr-1">Catégorie</span>
            <button
              onClick={() => { setCategoryFilter(''); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${!categoryFilter ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
            >
              Toutes
            </button>
            {(['INCIDENT', 'REQUEST', 'ACCESS', 'HARDWARE', 'SOFTWARE', 'NETWORK', 'SECURITY'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => { setCategoryFilter(categoryFilter === cat ? '' : cat); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${categoryFilter === cat ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 hover:bg-gray-200'}`}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI suggestions */}
      <AISuggestionBar suggestions={aiSuggestions} />

      {/* Saved filters bar */}
      <SavedFiltersBar
        module="tickets"
        currentFilters={{
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          category: categoryFilter || undefined,
          assignee: assigneeFilter || undefined,
          department: departmentFilter || undefined,
          myTicketsOnly: myTicketsOnly || undefined,
          search: searchQuery || undefined,
        }}
        onApplyFilter={(saved) => {
          setStatusFilter(saved.status || '');
          setPriorityFilter(saved.priority || '');
          setCategoryFilter(saved.category || '');
          setAssigneeFilter(saved.assignee || '');
          setDepartmentFilter(saved.department || '');
          setMyTicketsOnly(!!saved.myTicketsOnly);
          setSearchQuery(saved.search || '');
          setPage(1);
        }}
      />

      {/* Select all header for tickets */}
      {isAdmin && sortedFilteredTickets.length > 0 && viewMode === 'table' && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-2 p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition text-xs text-seal-gray-500 dark:text-slate-400 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {allSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-primary" />
            ) : someSelected ? (
              <MinusSquare className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Square className="h-3.5 w-3.5 text-seal-gray-500/40 dark:text-slate-500" />
            )}
            {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
          {selectedIds.size > 0 && (
            <span className="text-xs text-primary font-semibold">({selectedIds.size}/{sortedFilteredTickets.length})</span>
          )}
        </div>
      )}

      {fetchError && !loading && (
        <Card className="border-l-4 border-l-red-400">
          <CardContent className="py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">Impossible de charger les tickets.</p>
            <Button variant="outline" className="mt-3" onClick={fetchTickets}><RefreshCw className="h-4 w-4 mr-1" /> Réessayer</Button>
          </CardContent>
        </Card>
      )}

      {viewMode === 'table' && !fetchError && (
        <>
        {/* Mobile: cards layout (< md) */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-seal-gray-500">
              Chargement…
            </div>
          ) : sortedFilteredTickets.length === 0 ? (
            <div className="rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-seal-gray-500">
              <Ticket className="mx-auto mb-2 h-8 w-8 opacity-50" />
              {t('tickets.empty')}
            </div>
          ) : (
            sortedFilteredTickets.map((ticket) => {
              const sla = getSlaStatus(ticket);
              return (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="w-full text-left rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors min-h-[88px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-mono text-seal-gray-500 dark:text-slate-500">
                      {ticket.reference}
                    </span>
                    <StatusBadge status={ticket.status as any} />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-seal-navy dark:text-white line-clamp-2">
                    {ticket.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant={categoryBadgeVariant(ticket.category)}>
                      {categoryLabel(ticket.category)}
                    </Badge>
                    <Badge
                      variant={
                        ticket.priority === 'URGENT' || ticket.priority === 'HIGH'
                          ? 'error'
                          : ticket.priority === 'MEDIUM'
                          ? 'warning'
                          : 'navy'
                      }
                    >
                      {ticket.priority}
                    </Badge>
                    {sla && (
                      <span className="text-[10px] font-medium text-amber-600">{sla}</span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-seal-gray-500 dark:text-slate-400">
                    <span className="truncate">
                      {ticket.assignee
                        ? `Assigné: ${ticket.assignee.firstName} ${ticket.assignee.lastName.charAt(0)}.`
                        : 'Non assigné'}
                    </span>
                    <span className="flex-shrink-0">{formatRelativeTime(ticket.createdAt)}</span>
                  </div>
                </button>
              );
            })
          )}
          {tickets && tickets.meta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="min-h-[44px]"
              >
                Précédent
              </Button>
              <span className="text-xs text-seal-gray-500">
                {page} / {tickets.meta.totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= tickets.meta.totalPages}
                onClick={() => setPage(page + 1)}
                className="min-h-[44px]"
              >
                Suivant
              </Button>
            </div>
          )}
        </div>

        {/* Desktop: full DataTable (>= md) */}
        <div className="hidden md:block overflow-x-auto scrollbar-thin">
        {!loading && tickets?.data?.length === 0 && !statusFilter && !priorityFilter && !categoryFilter && !assigneeFilter && !myTicketsOnly && !searchQuery ? (
          <EmptyState
            type="tickets"
            title="Aucun ticket en cours"
            description="Les tickets centralisent vos demandes IT et incidents : panne, demande d'accès, installation logicielle, signalement de sécurité. Créez-en un pour solliciter le support et suivre sa résolution."
            action={
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> {t('tickets.new')}
              </Button>
            }
          />
        ) : !loading && sortedFilteredTickets.length === 0 && (statusFilter || priorityFilter || categoryFilter || assigneeFilter || myTicketsOnly || searchQuery) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Ticket className="h-12 w-12 text-seal-gray-500 dark:text-slate-500 mb-4" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-4">{t('tickets.empty')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatusFilter('');
                setPriorityFilter('');
                setCategoryFilter('');
                setAssigneeFilter('');
                setMyTicketsOnly(false);
                setSearchQuery('');
              }}
            >
              <X className="h-4 w-4" /> Réinitialiser les filtres
            </Button>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={sortedFilteredTickets}
            keyExtractor={(t) => t.id}
            loading={loading}
            sortBy={ticketSortField}
            sortOrder={ticketSortOrder}
            onSort={handleTicketSort}
            page={page}
            totalPages={tickets?.meta.totalPages || 1}
            total={filteredTickets.length}
            onPageChange={setPage}
            onRowClick={(t) => router.push(`/tickets/${t.id}`)}
            emptyMessage={t('tickets.empty')}
            emptyIcon={<Ticket className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />}
          />
        )}
        </div>
        </>
      )}

      {viewMode === 'kanban' && !fetchError && (
        <KanbanBoard
          tickets={sortedFilteredTickets}
          isAdmin={!!isAdmin}
          getSlaStatus={getSlaStatus}
          categoryBadgeVariant={categoryBadgeVariant}
          categoryLabel={categoryLabel}
          onStatusChange={async (ticketId, newStatus) => {
            try {
              await api.patch(`/tickets/${ticketId}`, { status: newStatus });
              toast.success('Statut mis à jour');
              fetchTickets();
            } catch { toast.error('Erreur de mise a jour'); }
          }}
          onCardClick={(id) => router.push(`/tickets/${id}`)}
        />
      )}

      <Dialog open={showCreate} onClose={() => { setShowCreate(false); setSelectedTemplate(''); setRequestType(''); setForm({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM', tagsInput: '', departmentId: user?.departmentId || '' }); }} title={t('tickets.create.title')} description={t('tickets.create.description')}>
        <div className="space-y-4">
          {/* Type de demande — cartes visuelles */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-seal-navy dark:text-white">Type de demande</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {REQUEST_TYPES.map((rt) => (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => {
                    setRequestType(rt.id);
                    const existingTags = form.tagsInput.split(',').map(t => t.trim()).filter(Boolean);
                    // Remove old request-type tags
                    const cleanTags = existingTags.filter(t => !REQUEST_TYPES.some(r => r.tags.includes(t)));
                    const newTags = [...cleanTags, ...rt.tags].filter(Boolean);
                    setForm((f) => ({
                      ...f,
                      category: rt.category,
                      tagsInput: newTags.join(', '),
                    }));
                  }}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-all duration-200 ${
                    requestType === rt.id
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30 shadow-sm'
                      : 'border-gray-200 dark:border-slate-700 hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    requestType === rt.id ? 'bg-primary/10' : 'bg-gray-100 dark:bg-slate-700'
                  }`}>
                    {rt.icon}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-seal-navy dark:text-white">{rt.label}</p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 leading-tight">{rt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          {templates.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-seal-navy dark:text-white">Template</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplate('');
                    setForm((f) => ({ ...f, title: '', description: '', category: 'OTHER', priority: 'MEDIUM', tagsInput: '' }));
                  }}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all duration-200 ${
                    !selectedTemplate
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                      : 'border-gray-200 dark:border-slate-700 hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <FileText className="h-4 w-4 text-seal-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-seal-navy dark:text-white truncate">Vide</p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 truncate">Ticket libre</p>
                  </div>
                </button>
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplate(tpl.id);
                      setForm((f) => ({
                        ...f,
                        title: tpl.titleTemplate,
                        description: tpl.descriptionTemplate,
                        category: tpl.category,
                        priority: tpl.priority,
                        tagsInput: tpl.tags.join(', '),
                      }));
                    }}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all duration-200 ${
                      selectedTemplate === tpl.id
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                        : 'border-gray-200 dark:border-slate-700 hover:border-primary/40 hover:bg-gray-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="h-8 w-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                      {TEMPLATE_ICONS[tpl.category] || TEMPLATE_ICONS['OTHER']}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-seal-navy dark:text-white truncate">{tpl.label}</p>
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 truncate">{categoryLabel(tpl.category)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <Input label={t('tickets.create.titleLabel')} value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (createErrors.title) setCreateErrors((p) => ({ ...p, title: undefined })); }} placeholder={t('tickets.create.titlePlaceholder')} required autoFocus aria-invalid={!!createErrors.title} onKeyDown={(e: React.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCreate(); } }} />
          {createErrors.title && (
            <p className="text-red-500 text-xs mt-1">{createErrors.title}</p>
          )}
          {/* Smart suggestions based on title */}
          {titleSuggestionsLoading && (
            <div className="flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400 animate-pulse">
              <Sparkles className="h-3.5 w-3.5 animate-spin" />
              Recherche de suggestions...
            </div>
          )}
          {titleSuggestions && !titleSuggestionsLoading && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
              <button
                type="button"
                onClick={() => setTitleSuggestionsOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-seal-navy dark:text-white hover:bg-blue-100/50 dark:hover:bg-blue-800/20 transition"
              >
                <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                Articles et tickets similaires
                {titleSuggestionsOpen ? <ChevronUp className="h-3.5 w-3.5 ml-auto text-seal-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 ml-auto text-seal-gray-500" />}
              </button>
              {titleSuggestionsOpen && (
                <div className="px-3 pb-2.5 space-y-1.5">
                  {titleSuggestions.tickets.length > 0 && (
                    <div className="space-y-1">
                      {titleSuggestions.tickets.map((tk: any) => (
                        <a
                          key={tk.id}
                          href={`/tickets/${tk.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-blue-100 dark:hover:bg-blue-800/30 transition group"
                        >
                          <Ticket className="h-3 w-3 text-seal-gray-500 group-hover:text-primary flex-shrink-0" />
                          <span className="font-mono text-[10px] text-seal-gray-500 dark:text-slate-400 flex-shrink-0">{tk.reference}</span>
                          <span className="text-seal-navy dark:text-white truncate">{tk.title}</span>
                          <Badge
                            variant={tk.status === 'RESOLVED' || tk.status === 'CLOSED' ? 'approved' : tk.status === 'IN_PROGRESS' ? 'warning' : 'info'}
                            className="text-[8px] ml-auto flex-shrink-0"
                          >
                            {tk.status}
                          </Badge>
                        </a>
                      ))}
                    </div>
                  )}
                  {titleSuggestions.wiki.length > 0 && (
                    <div className="space-y-1">
                      {titleSuggestions.wiki.map((article: any) => (
                        <a
                          key={article.id}
                          href={`/wiki?slug=${article.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-blue-100 dark:hover:bg-blue-800/30 transition group"
                        >
                          <FileText className="h-3 w-3 text-seal-gray-500 group-hover:text-primary flex-shrink-0" />
                          <span className="text-seal-navy dark:text-white truncate">{article.title}</span>
                          <Link2 className="h-3 w-3 text-seal-gray-500 ml-auto flex-shrink-0" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="space-y-1">
            <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
              {t('tickets.create.descriptionLabel')}
              <span className="text-red-500 ml-0.5">*</span>
            </label>
            <RichTextEditor
              value={form.description}
              onChange={(html) => { setForm({ ...form, description: html }); if (createErrors.description) setCreateErrors((p) => ({ ...p, description: undefined })); }}
              placeholder={t('tickets.create.descriptionPlaceholder')}
              minHeight={150}
              ariaLabel={t('tickets.create.descriptionLabel')}
            />
            {createErrors.description && (
              <p className="text-red-500 text-xs mt-1">{createErrors.description}</p>
            )}
          </div>
          {/* Category-based template hint */}
          {form.category && CATEGORY_HINTS[form.category] && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/15 px-3 py-2.5">
              <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">{CATEGORY_HINTS[form.category]}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Select label={t('tickets.create.categoryLabel')} options={[
                { value: 'INCIDENT', label: `🔴 ${t('tickets.category.incident')}` }, { value: 'REQUEST', label: `📋 ${t('tickets.category.request')}` },
                { value: 'ACCESS', label: `🔑 ${t('tickets.category.access')}` }, { value: 'HARDWARE', label: `🖥️ ${t('tickets.category.hardware')}` },
                { value: 'SOFTWARE', label: `💿 ${t('tickets.category.software')}` }, { value: 'NETWORK', label: `🌐 ${t('tickets.category.network')}` },
                { value: 'SECURITY', label: `🛡️ ${t('tickets.category.security')}` }, { value: 'OTHER', label: `📎 ${t('tickets.category.other')}` },
              ]} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              {form.category && CATEGORY_ASSIGNEES[form.category] && (
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                  💡 Assignation suggérée : <span className="font-semibold text-seal-navy dark:text-white">{CATEGORY_ASSIGNEES[form.category]}</span>
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Select label={t('tickets.create.priorityLabel')} options={[
                { value: 'LOW', label: t('tickets.priority.low') }, { value: 'MEDIUM', label: t('tickets.priority.medium') },
                { value: 'HIGH', label: t('tickets.priority.high') }, { value: 'CRITICAL', label: t('tickets.priority.critical') },
              ]} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
              {/* SLA Preview */}
              {form.priority && (
                <div className={`mt-1.5 rounded-lg border px-3 py-2 flex items-center gap-2 transition-all duration-200 ${
                  form.priority === 'CRITICAL' ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/10' :
                  form.priority === 'HIGH' ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10' :
                  form.priority === 'MEDIUM' ? 'border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/10' :
                  'border-gray-200 bg-gray-50/50 dark:border-slate-700 dark:bg-slate-800/50'
                }`}>
                  {form.priority === 'CRITICAL' && <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />}
                  {form.priority === 'HIGH' && <Clock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                  {form.priority === 'MEDIUM' && <Clock className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
                  {form.priority === 'LOW' && <Clock className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500 flex-shrink-0" />}
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 font-medium">SLA</p>
                    <p className={`text-xs font-medium ${
                      form.priority === 'CRITICAL' ? 'text-red-600 dark:text-red-400' :
                      form.priority === 'HIGH' ? 'text-amber-600 dark:text-amber-400' :
                      form.priority === 'MEDIUM' ? 'text-blue-600 dark:text-blue-400' :
                      'text-gray-600 dark:text-gray-400'
                    }`}>
                      {form.priority === 'CRITICAL' && 'Resolution sous 4h'}
                      {form.priority === 'HIGH' && 'Resolution sous 8h'}
                      {form.priority === 'MEDIUM' && 'Resolution sous 24h'}
                      {form.priority === 'LOW' && 'Resolution sous 48h'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Department routing */}
          {departments.length > 0 && (
            <Select
              label="Département responsable"
              options={[
                { value: '', label: '— Auto (mon département) —' },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            />
          )}
          {/* Tags / Labels input */}
          <div className="space-y-1">
            <Input
              label="Labels / Tags"
              value={form.tagsInput}
              onChange={(e) => setForm({ ...form, tagsInput: e.target.value })}
              placeholder="urgent, reseau, vpn (séparés par des virgules)"
            />
            {form.tagsInput.trim() && (
              <div className="flex flex-wrap gap-1 mt-1">
                {form.tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).map(tag => (
                  <span key={tag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagColor(tag)}`}>{tag}</span>
                ))}
              </div>
            )}
          </div>
          {/* Deployment checklist + custom fields */}
          {showDeployPanel && deployLabels && (
            <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                <span className="text-sm font-semibold text-seal-navy dark:text-white">Checklist deploiement</span>
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 ml-auto">
                  {Object.values(checklistState).filter(Boolean).length}/{deployLabels.deployment.checklist.length} coches
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {deployLabels.deployment.checklist.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={!!checklistState[item.id]}
                      onChange={(e) => setChecklistState(prev => ({ ...prev, [item.id]: e.target.checked }))}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-xs text-seal-navy dark:text-white group-hover:text-primary transition">{item.label}</span>
                  </label>
                ))}
              </div>
              {/* Custom fields */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-teal-200/60 dark:border-teal-800/60">
                {deployLabels.deployment.fields.map((field) => (
                  <Input
                    key={field.id}
                    label={field.label}
                    value={customFieldsState[field.id] || ''}
                    onChange={(e) => setCustomFieldsState(prev => ({ ...prev, [field.id]: e.target.value }))}
                    placeholder={field.label}
                  />
                ))}
              </div>
              {/* Type selector */}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-teal-200/60 dark:border-teal-800/60">
                <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 uppercase mr-1 self-center">Type</span>
                {deployLabels.deployment.types.map((dtype) => {
                  const active = form.tagsInput.toLowerCase().includes(dtype.toLowerCase());
                  return (
                    <button
                      key={dtype}
                      type="button"
                      onClick={() => {
                        const currentTags = form.tagsInput.split(',').map(t => t.trim()).filter(Boolean);
                        const lower = dtype.toLowerCase();
                        if (currentTags.map(t => t.toLowerCase()).includes(lower)) {
                          setForm({ ...form, tagsInput: currentTags.filter(t => t.toLowerCase() !== lower).join(', ') });
                        } else {
                          setForm({ ...form, tagsInput: [...currentTags, dtype].join(', ') });
                        }
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${active ? 'bg-teal-600 text-white' : 'bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:border-teal-400'}`}
                    >
                      {dtype}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* AI Analysis Panel */}
          {(aiLoading || aiAnalysis) && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-3 space-y-2 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-2">
                <Sparkles className={`h-4 w-4 text-primary ${aiLoading ? 'animate-spin' : ''}`} />
                <span className="text-xs font-semibold text-seal-navy dark:text-white">Analyse IA</span>
                {aiLoading && <span className="text-[10px] text-seal-gray-500 animate-pulse">Analyse en cours...</span>}
              </div>
              {aiAnalysis && !aiLoading && (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400">Priorité suggérée :</span>
                    <Badge variant={aiAnalysis.suggestedPriority === 'CRITICAL' ? 'error' : aiAnalysis.suggestedPriority === 'HIGH' ? 'warning' : aiAnalysis.suggestedPriority === 'MEDIUM' ? 'info' : 'navy'}>
                      {aiAnalysis.suggestedPriority}
                    </Badge>
                    {aiAnalysis.suggestedPriority !== form.priority && (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, priority: aiAnalysis.suggestedPriority })}
                        className="text-[10px] font-semibold text-primary hover:text-primary/80 underline transition"
                      >
                        Appliquer
                      </button>
                    )}
                    <span className="ml-auto text-[10px] text-seal-gray-500 dark:text-slate-400">Risque :</span>
                    <Badge variant={aiAnalysis.riskLevel === 'critical' ? 'error' : aiAnalysis.riskLevel === 'high' ? 'warning' : aiAnalysis.riskLevel === 'medium' ? 'info' : 'navy'}>
                      {aiAnalysis.riskLevel === 'critical' ? 'Critique' : aiAnalysis.riskLevel === 'high' ? 'Élevé' : aiAnalysis.riskLevel === 'medium' ? 'Moyen' : 'Faible'}
                    </Badge>
                  </div>
                  {aiAnalysis.keywordsDetected.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Shield className="h-3 w-3 text-red-500" />
                      <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">Mots-clés sécurité :</span>
                      {aiAnalysis.keywordsDetected.map((kw: string) => (
                        <Badge key={kw} variant="error" className="text-[9px]">{kw}</Badge>
                      ))}
                    </div>
                  )}
                  {aiAnalysis.relatedTickets.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 flex items-center gap-1 mb-1">
                        <Link2 className="h-3 w-3" /> Tickets similaires ({aiAnalysis.relatedTickets.length})
                      </p>
                      <div className="space-y-0.5">
                        {aiAnalysis.relatedTickets.slice(0, 3).map((rt: any) => (
                          <div key={rt.id} className="flex items-center gap-2 text-[10px]">
                            <span className="font-mono font-semibold text-seal-navy dark:text-white">{rt.reference}</span>
                            <span className="text-seal-gray-500 dark:text-slate-400 truncate">{rt.title}</span>
                            <Badge variant={rt.status === 'RESOLVED' || rt.status === 'CLOSED' ? 'approved' : 'warning'} className="text-[8px] ml-auto">{rt.status}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => { setShowCreate(false); setSelectedTemplate(''); setRequestType(''); setForm({ title: '', description: '', category: 'OTHER', priority: 'MEDIUM', tagsInput: '', departmentId: user?.departmentId || '' }); }}>{t('common.cancel')}</Button>
            <Button onClick={handleCreate} loading={creating} disabled={creating}>
              {creating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? 'Création…' : t('tickets.create.submit')}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Bulk actions bar */}
      {isAdmin && viewMode === 'table' && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          actions={[
            { label: 'Changer le statut', icon: CheckCircle2, onClick: () => setShowBulkStatus(true) },
            { label: 'Assigner a...', icon: UserPlus, onClick: () => setShowBulkAssign(true) },
          ]}
        />
      )}

      {/* Bulk status change dialog */}
      <Dialog open={showBulkStatus} onClose={() => { setShowBulkStatus(false); setBulkNewStatus(''); }} title="Changer le statut" description={`Changer le statut de ${selectedIds.size} ticket(s)`}>
        <div className="space-y-4">
          <Select
            label="Nouveau statut"
            options={[
              { value: 'OPEN', label: t('tickets.status.open') },
              { value: 'IN_PROGRESS', label: t('tickets.status.inProgress') },
              { value: 'WAITING', label: t('tickets.status.waiting') },
              { value: 'RESOLVED', label: t('tickets.status.resolved') },
              { value: 'CLOSED', label: t('tickets.status.closed') },
            ]}
            placeholder="Choisir un statut..."
            value={bulkNewStatus}
            onChange={(e) => setBulkNewStatus(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => { setShowBulkStatus(false); setBulkNewStatus(''); }}>{t('common.cancel')}</Button>
            <Button onClick={handleBulkStatusChange} disabled={!bulkNewStatus}>Appliquer</Button>
          </div>
        </div>
      </Dialog>

      {/* Bulk assign dialog */}
      <Dialog open={showBulkAssign} onClose={() => { setShowBulkAssign(false); setBulkAssigneeId(''); }} title="Assigner les tickets" description={`Assigner ${selectedIds.size} ticket(s) a un utilisateur`}>
        <div className="space-y-4">
          <Select
            label="Assigner a"
            options={adminUsers.map(u => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }))}
            placeholder="Choisir un utilisateur..."
            value={bulkAssigneeId}
            onChange={(e) => setBulkAssigneeId(e.target.value)}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => { setShowBulkAssign(false); setBulkAssigneeId(''); }}>{t('common.cancel')}</Button>
            <Button onClick={handleBulkAssign} disabled={!bulkAssigneeId}>Assigner</Button>
          </div>
        </div>
      </Dialog>
    </div>
    </AIOrchestratedLayout>
  );
}

/* ─────── Kanban Board with HTML5 Drag & Drop ─────── */

interface KanbanBoardProps {
  tickets: TicketItem[];
  isAdmin: boolean;
  getSlaStatus: (t: { priority: string; createdAt: string; status: string }) => string | null;
  categoryBadgeVariant: (cat: string) => 'error' | 'warning' | 'info' | 'navy' | 'primary' | 'success';
  categoryLabel: (cat: string) => string;
  onStatusChange: (ticketId: string, newStatus: string) => Promise<void>;
  onCardClick: (id: string) => void;
}

const KANBAN_COLUMNS = [
  { status: 'OPEN', label: 'Ouvert', color: 'border-t-blue-500', dropBg: 'bg-blue-50 dark:bg-blue-900/20', wipLimit: 0 },
  { status: 'IN_PROGRESS', label: 'En cours', color: 'border-t-amber-500', dropBg: 'bg-amber-50 dark:bg-amber-900/20', wipLimit: 5 },
  { status: 'WAITING', label: 'En attente', color: 'border-t-purple-500', dropBg: 'bg-purple-50 dark:bg-purple-900/20', wipLimit: 0 },
  { status: 'RESOLVED', label: 'Résolu', color: 'border-t-emerald-500', dropBg: 'bg-emerald-50 dark:bg-emerald-900/20', wipLimit: 0 },
];

const PRIORITY_CARD_BORDER: Record<string, string> = {
  CRITICAL: 'border-l-[3px] border-l-red-500',
  HIGH: 'border-l-[3px] border-l-amber-500',
  MEDIUM: 'border-l-[3px] border-l-blue-400',
  LOW: 'border-l-[3px] border-l-gray-300 dark:border-l-slate-600',
};

/* ─────── Animated Stats Cards ─────── */

function AnimatedStatsCards({ analytics }: { analytics: any }) {
  const open = useCountUp(analytics?.openTickets ?? 0);
  const inProgress = useCountUp(analytics?.inProgressTickets ?? 0);
  const resolved = useCountUp(analytics?.resolvedThisWeek ?? 0);
  const avgResolution = useCountUp(analytics?.avgResolutionHours ?? 0);

  const cards = [
    {
      label: 'Ouverts',
      value: open,
      suffix: '',
      icon: <AlertTriangle className="h-5 w-5 text-[#cc0000]" />,
      bg: 'bg-[#cc0000]/10',
      trend: analytics?.openTrend,
    },
    {
      label: 'En cours',
      value: inProgress,
      suffix: '',
      icon: <Clock className="h-5 w-5 text-[#c68200]" />,
      bg: 'bg-[#c68200]/10',
      trend: analytics?.inProgressTrend,
    },
    {
      label: 'Résolus (7j)',
      value: resolved,
      suffix: '',
      icon: <CheckCircle2 className="h-5 w-5 text-[#70916a]" />,
      bg: 'bg-[#70916a]/15',
      trend: analytics?.resolvedTrend,
    },
    {
      label: 'Résolution moy.',
      value: avgResolution,
      suffix: 'h',
      icon: <TrendingUp className="h-5 w-5 text-primary" />,
      bg: 'bg-primary/10',
      trend: analytics?.avgResolutionTrend,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className="shadow-sm rounded-xl">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
              {c.icon}
            </div>
            <div>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">{c.label}</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-2xl font-medium text-seal-navy dark:text-white tabular-nums">
                  {c.value}{c.suffix}
                </p>
                {c.trend != null && c.trend !== 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${c.trend > 0 ? 'text-[#cc0000]' : 'text-[#70916a]'}`}>
                    {c.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {c.trend > 0 ? '+' : ''}{c.trend}%
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function KanbanBoard({ tickets, isAdmin, getSlaStatus, categoryBadgeVariant, categoryLabel, onStatusChange, onCardClick }: KanbanBoardProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [showSwimlanes, setShowSwimlanes] = useState(false);

  // Get unique categories for swimlanes
  const categories = useMemo(() => {
    const cats = new Set(tickets.map(t => t.category));
    return Array.from(cats).sort();
  }, [tickets]);

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    if (!isAdmin) { e.preventDefault(); return; }
    setDraggedId(ticketId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticketId);
    // Make drag image semi-transparent
    const el = e.currentTarget as HTMLElement;
    requestAnimationFrame(() => { if (el) el.style.opacity = '0.4'; });
  };

  const handleDragEnd = (e: React.DragEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el) el.style.opacity = '1';
    setDraggedId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(status);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDropTarget(null);
    const ticketId = e.dataTransfer.getData('text/plain');
    if (!ticketId) return;

    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;

    setMoving(ticketId);
    await onStatusChange(ticketId, newStatus);
    setMoving(null);
    setDraggedId(null);
  };

  const renderKanbanCard = (ticket: TicketItem) => {
    const isRedmine = isRedmineTicket(ticket);
    const sla = isRedmine ? null : getSlaStatus(ticket);
    const slaProgress = isRedmine ? null : getSlaProgress(ticket);
    const isDragged = draggedId === ticket.id;
    const isBeingMoved = moving === ticket.id;
    const commentCount = ticket._count?.comments || 0;

    // SLA bar color
    const slaBarColor = sla === 'exceeded' ? 'bg-red-500' : sla === 'warning' ? 'bg-amber-400' : 'bg-emerald-500';

    return (
      <div
        key={ticket.id}
        draggable={isAdmin}
        onDragStart={(e) => handleDragStart(e, ticket.id)}
        onDragEnd={handleDragEnd}
        onClick={() => { if (!isDragged) onCardClick(ticket.id); }}
        className={`bg-white dark:bg-slate-900 rounded-xl p-3 shadow-sm border border-gray-100 dark:border-slate-700 group transition-all duration-200 ${
          PRIORITY_CARD_BORDER[ticket.priority] || ''
        } ${isDragged ? 'opacity-40 scale-95' : 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer'
        } ${isBeingMoved ? 'animate-pulse' : ''} ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* Header: small priority dot + reference */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            {isAdmin && (
              <GripVertical className="h-3 w-3 text-seal-gray-500/30 group-hover:text-seal-gray-500/60 flex-shrink-0" />
            )}
            <span
              className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                ticket.priority === 'CRITICAL' ? 'bg-[#cc0000]' : ticket.priority === 'HIGH' ? 'bg-[#c68200]' : ticket.priority === 'MEDIUM' ? 'bg-blue-400' : 'bg-gray-300 dark:bg-slate-600'
              }`}
              title={ticket.priority}
            />
            <span className="text-[9px] font-medium text-seal-gray-500/70 dark:text-slate-500 uppercase tracking-wide">{ticket.priority}</span>
          </div>
          <span className="text-[10px] text-seal-gray-500 font-mono">{ticket.reference}</span>
        </div>

        {/* Title */}
        <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-2 group-hover:text-primary transition-colors duration-200">
          {ticket.title}
        </p>

        {/* SLA progress bar */}
        {slaProgress !== null && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[9px] font-medium text-seal-gray-500/70 dark:text-slate-500">SLA</span>
              {sla === 'exceeded' && (
                <span className="text-[9px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" /> Dépassé
                </span>
              )}
            </div>
            <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${slaBarColor}`}
                style={{ width: `${Math.min(slaProgress * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Tags: category */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <Badge variant={categoryBadgeVariant(ticket.category)} className="text-[9px]">
            {categoryLabel(ticket.category)}
          </Badge>
        </div>
        {/* Custom labels/tags */}
        {ticket.tags && ticket.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            {ticket.tags.slice(0, 4).map(tag => (
              <span key={tag} className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${tagColor(tag)}`}>{tag}</span>
            ))}
            {ticket.tags.length > 4 && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400">+{ticket.tags.length - 4}</span>
            )}
          </div>
        )}

        {/* Footer: assignee avatar + age + comments */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50 dark:border-slate-700/50">
          <div className="flex items-center gap-1.5 min-w-0">
            {ticket.assignee ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-[8px] font-semibold ring-1 ring-primary/20 flex-shrink-0" title={`${ticket.assignee.firstName} ${ticket.assignee.lastName}`}>
                  {ticket.assignee.firstName[0]}{ticket.assignee.lastName[0]}
                </span>
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 truncate">{ticket.assignee.firstName} {ticket.assignee.lastName[0]}.</span>
              </div>
            ) : (
              <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 italic">Non assigné</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-seal-gray-500 dark:text-slate-400" title={`${commentCount} commentaire(s)`}>
                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                {commentCount}
              </span>
            )}
            <span className={`text-[10px] font-semibold ${ticketAgeColor(getTicketAgeDays(ticket.createdAt))}`}>
              {formatAge(ticket.createdAt)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderColumn = (col: typeof KANBAN_COLUMNS[number], columnTickets: TicketItem[]) => {
    const isOver = dropTarget === col.status && draggedId !== null;
    const draggedTicket = draggedId ? tickets.find(t => t.id === draggedId) : null;
    const isDraggedFromHere = draggedTicket?.status === col.status;
    const isOverWip = col.wipLimit > 0 && columnTickets.length >= col.wipLimit;

    return (
      <div
        key={col.status}
        onDragOver={(e) => handleDragOver(e, col.status)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, col.status)}
        className={`rounded-lg border-t-4 ${col.color} p-3 min-h-[200px] transition-all duration-200 ${
          isOver && !isDraggedFromHere
            ? `${col.dropBg} ring-2 ring-primary/30 scale-[1.01]`
            : 'bg-gray-50 dark:bg-slate-800/50'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">{col.label}</h3>
          <div className="flex items-center gap-1.5">
            <Badge variant={isOverWip ? 'error' : 'navy'}>{columnTickets.length}</Badge>
            {col.wipLimit > 0 && (
              <span className={`text-[9px] font-semibold ${isOverWip ? 'text-red-500' : 'text-seal-gray-500 dark:text-slate-400'}`}>
                / {col.wipLimit} WIP
              </span>
            )}
          </div>
        </div>

        {/* WIP limit warning */}
        {isOverWip && (
          <div className="flex items-center gap-1.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-2 py-1.5 mb-2">
            <AlertTriangle className="h-3 w-3 text-red-500" />
            <span className="text-[10px] text-red-600 dark:text-red-400 font-semibold">Limite WIP dépassée</span>
          </div>
        )}

        {/* Drop hint */}
        {isOver && !isDraggedFromHere && (
          <div className="border-2 border-dashed border-primary/40 rounded-lg p-3 mb-2 text-center">
            <p className="text-xs text-primary font-semibold">Déposer ici → {col.label}</p>
          </div>
        )}

        <div className="space-y-2">
          {columnTickets.map(renderKanbanCard)}
          {columnTickets.length === 0 && !isOver && (
            <NoaLoading
              category="loading"
              fallback="Aucun ticket dans cette colonne"
              className="text-xs text-seal-gray-500 dark:text-slate-500 text-center py-8"
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Kanban toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-seal-gray-500 dark:text-slate-400">
          <span>{tickets.length} tickets au total</span>
          <span className="text-seal-gray-500/40">|</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> {tickets.filter(t => getSlaStatus(t) === 'exceeded').length} SLA dépassés</span>
        </div>
        <button
          onClick={() => setShowSwimlanes(!showSwimlanes)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            showSwimlanes
              ? 'bg-primary/10 text-primary dark:bg-primary/20'
              : 'bg-gray-100 text-seal-gray-500 dark:bg-slate-700 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-600'
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          {showSwimlanes ? 'Swimlanes activées' : 'Activer swimlanes'}
        </button>
      </div>

      {/* Standard view (no swimlanes) */}
      {!showSwimlanes && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {KANBAN_COLUMNS.map(col => {
            const colTickets = tickets.filter(t => t.status === col.status);
            return renderColumn(col, colTickets);
          })}
        </div>
      )}

      {/* Swimlane view (grouped by category) */}
      {showSwimlanes && categories.map(cat => {
        const catTickets = tickets.filter(t => t.category === cat);
        if (catTickets.length === 0) return null;
        return (
          <div key={cat} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={categoryBadgeVariant(cat)}>{categoryLabel(cat)}</Badge>
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">{catTickets.length} ticket(s)</span>
              <div className="flex-1 border-t border-gray-200 dark:border-slate-700" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {KANBAN_COLUMNS.map(col => {
                const colTickets = catTickets.filter(t => t.status === col.status);
                return renderColumn(col, colTickets);
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
