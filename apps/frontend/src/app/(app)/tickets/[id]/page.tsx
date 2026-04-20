'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, Button, Badge, Textarea, Select, Skeleton, Dialog, Input,
} from '@omnitech/ui';
import { formatDateTime, getInitials, formatRelativeTime } from '@/lib/utils';
import { MentionTextarea } from '@/components/ui/mention-textarea';
import { EntityBreadcrumb } from '@/components/ui/entity-breadcrumb';
import { eventBus, createEvent } from '@/lib/events';
import {
  ArrowLeft, Send, Clock, CheckCircle2, Circle, User, Timer, Star, ShieldCheck, Printer, Settings,
  Sparkles, BookOpen, ChevronDown,
} from 'lucide-react';

function getSlaRemaining(ticket: { priority: string; createdAt: string; status: string }) {
  if (!['OPEN', 'IN_PROGRESS'].includes(ticket.status)) return null;
  const thresholds: Record<string, number> = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 };
  const limitHours = thresholds[ticket.priority] || 48;
  const elapsed = (Date.now() - new Date(ticket.createdAt).getTime()) / 3600000;
  const remaining = limitHours - elapsed;
  const percent = Math.min(100, Math.max(0, (elapsed / limitHours) * 100));
  if (remaining <= 0) return { text: 'SLA dépassé', color: 'text-red-500', barColor: 'bg-red-500', urgent: true, percent: 100 };
  if (remaining <= 1) return { text: `${Math.round(remaining * 60)} min restantes`, color: 'text-red-500', barColor: 'bg-red-500', urgent: true, percent };
  if (remaining <= limitHours * 0.25) return { text: `${remaining.toFixed(1)}h restantes`, color: 'text-amber-500', barColor: 'bg-amber-500', urgent: false, percent };
  return { text: `${remaining.toFixed(1)}h restantes`, color: 'text-emerald-500', barColor: 'bg-emerald-500', urgent: false, percent };
}

function getTicketAge(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days} jour${days > 1 ? 's' : ''}`;
}

const priorityBorderColor: Record<string, string> = {
  CRITICAL: 'border-l-4 border-l-red-500',
  HIGH: 'border-l-4 border-l-amber-500',
  MEDIUM: 'border-l-4 border-l-blue-500',
  LOW: 'border-l-4 border-l-gray-300',
};

const statusTimelineIcons: Record<string, React.ElementType> = {
  OPEN: Circle,
  IN_PROGRESS: Clock,
  WAITING: Timer,
  RESOLVED: CheckCircle2,
  CLOSED: CheckCircle2,
};

// Deterministic pastel color for a tag string (cycles through a fixed palette)
const TAG_COLORS_DETAIL = [
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
];
function tagColorDetail(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) & 0xffff;
  return TAG_COLORS_DETAIL[hash % TAG_COLORS_DETAIL.length]!;
}

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

/** Filter visible tags (exclude check: and field: prefixes). */
function visibleTagsDetail(tags: string[]): string[] {
  return tags.filter(t => !t.startsWith('check:') && !t.startsWith('field:'));
}

/** Extract a field value from tags. */
function getFieldValueDetail(tags: string[], fieldId: string): string {
  const prefix = `field:${fieldId}:`;
  const tag = tags.find(t => t.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : '';
}

interface TicketDetail {
  id: string;
  reference: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  creator: { id: string; firstName: string; lastName: string; email: string };
  assignee: { id: string; firstName: string; lastName: string } | null;
  comments: Array<{
    id: string;
    content: string;
    isInternal: boolean;
    createdAt: string;
    author: { id: string; firstName: string; lastName: string; role: string };
  }>;
}

const priorityColor: Record<string, string> = {
  LOW: 'navy', MEDIUM: 'info', HIGH: 'warning', CRITICAL: 'error',
};
const statusColor: Record<string, string> = {
  OPEN: 'info', IN_PROGRESS: 'warning', WAITING: 'draft', RESOLVED: 'approved', CLOSED: 'archived',
};

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { t } = useTranslation();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [isInternalComment, setIsInternalComment] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const commentsEndRef = React.useRef<HTMLDivElement>(null);
  const [satisfactionRating, setSatisfactionRating] = useState(0);
  const [satisfactionHover, setSatisfactionHover] = useState(0);
  const [satisfactionComment, setSatisfactionComment] = useState('');
  const [satisfactionSent, setSatisfactionSent] = useState(false);
  const [satisfactionSending, setSatisfactionSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiSuggestionLoading, setAiSuggestionLoading] = useState(false);
  const [deployLabels, setDeployLabels] = useState<DeploymentLabels | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbDraft, setKbDraft] = useState<{ title: string; slug: string; content: string; category: string; visibility: string; ownerDepartmentId?: string } | null>(null);
  const [kbTitle, setKbTitle] = useState('');
  const [kbContent, setKbContent] = useState('');
  const [kbPublishing, setKbPublishing] = useState(false);

  // Inline status dropdown
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInlineStatusChange = useCallback(async (nextStatus: string) => {
    if (!ticket || nextStatus === ticket.status) return;
    const prev = ticket.status;
    // Optimistic UI + event
    setTicket({ ...ticket, status: nextStatus });
    setNewStatus(nextStatus);
    setStatusDropdownOpen(false);
    eventBus.emit(createEvent('STATUS_CHANGED', 'TICKET', ticket.id, {
      from: prev, to: nextStatus, optimistic: true, label: `${ticket.reference} → ${nextStatus}`,
    }));
    try {
      await api.patch(`/tickets/${ticket.id}`, { status: nextStatus });
      toast.success('Statut mis à jour');
      eventBus.emit(createEvent('STATUS_CHANGED', 'TICKET', ticket.id, {
        from: prev, to: nextStatus, optimistic: false,
      }));
      const { data } = await api.get(`/tickets/${ticket.id}`);
      setTicket(data);
      setNewStatus(data.status);
    } catch {
      setTicket(t => t ? { ...t, status: prev } : t);
      setNewStatus(prev);
      eventBus.emit(createEvent('ROLLBACK', 'TICKET', ticket.id, {
        from: nextStatus, to: prev, optimistic: false,
      }));
      toast.error('Erreur de mise a jour');
    }
  }, [ticket]);

  const handleAiSuggest = async () => {
    if (!ticket) return;
    setAiSuggestionLoading(true);
    try {
      const { data } = await api.get(`/rag/tickets/${ticket.id}/ai-suggest`, { timeout: 120_000 });
      setAiSuggestion(data.suggestion);
    } catch {
      setAiSuggestion('IA non disponible actuellement.');
    } finally {
      setAiSuggestionLoading(false);
    }
  };

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  // Load deployment labels for checklist
  useEffect(() => {
    api.get('/tickets/labels')
      .then((r) => setDeployLabels(r.data as DeploymentLabels))
      .catch(() => setDeployLabels(null));
  }, []);

  const hasChecklist = ticket?.tags?.some(t => t.startsWith('check:') || t.startsWith('field:') || t === 'deploiement');

  const handleChecklistToggle = async (checkId: string, currentlyChecked: boolean) => {
    if (!ticket || !isAdmin) return;
    const tag = `check:${checkId}`;
    let newTags: string[];
    if (currentlyChecked) {
      newTags = ticket.tags.filter(t => t !== tag);
    } else {
      newTags = [...ticket.tags, tag];
    }
    try {
      await api.patch(`/tickets/${ticket.id}`, { tags: newTags });
      setTicket({ ...ticket, tags: newTags });
    } catch {
      toast.error('Erreur checklist');
    }
  };

  const priorityLabel: Record<string, string> = {
    LOW: t('tickets.priority.low'), MEDIUM: t('tickets.priority.medium'), HIGH: t('tickets.priority.high'), CRITICAL: t('tickets.priority.critical'),
  };
  const statusLabel: Record<string, string> = {
    OPEN: t('tickets.status.open'), IN_PROGRESS: t('tickets.status.inProgress'), WAITING: t('tickets.status.waiting'), RESOLVED: t('tickets.status.resolved'), CLOSED: t('tickets.status.closed'),
  };

  useEffect(() => {
    if (!id) return;
    api.get(`/tickets/${id}`)
      .then(({ data }) => { setTicket(data); setNewStatus(data.status); })
      .catch(() => { toast.error(t('tickets.detail.notFound')); router.push('/tickets'); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  // Auto-refresh every 30 seconds to pick up new comments from other users
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      api.get(`/tickets/${id}`)
        .then(({ data }) => { setTicket(data); })
        .catch(() => {/* silently ignore background refresh errors */});
    }, 30000);
    return () => clearInterval(interval);
  }, [id]);

  const handleComment = async () => {
    if (!comment.trim() || !ticket) return;
    setSending(true);
    eventBus.emit(createEvent('COMMENTED', 'TICKET', ticket.id, { optimistic: true }));
    try {
      await api.post(`/tickets/${ticket.id}/comments`, { content: comment, isInternal: isInternalComment });
      toast.success(t('tickets.detail.commentSuccess'));
      setComment('');
      const { data } = await api.get(`/tickets/${ticket.id}`);
      setTicket(data);
      // Auto-scroll to bottom after new comment
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch { toast.error(t('tickets.detail.commentError')); }
    finally { setSending(false); }
  };

  const handleStatusChange = async () => {
    if (!ticket || newStatus === ticket.status) return;
    try {
      await api.patch(`/tickets/${ticket.id}`, { status: newStatus });
      toast.success(t('tickets.detail.statusSuccess'));
      const { data } = await api.get(`/tickets/${ticket.id}`);
      setTicket(data);
    } catch { toast.error(t('tickets.detail.statusError')); }
  };

  const handleSatisfactionSubmit = async () => {
    if (!ticket || satisfactionRating === 0) return;
    setSatisfactionSending(true);
    try {
      const feedbackText = `[Satisfaction: ${satisfactionRating}/5]${satisfactionComment ? ` ${satisfactionComment}` : ''}`;
      await api.post(`/tickets/${ticket.id}/comments`, { content: feedbackText });
      setSatisfactionSent(true);
      toast.success('Avis enregistre');
    } catch {
      toast.error('Erreur d\'envoi');
    } finally {
      setSatisfactionSending(false);
    }
  };

  if (loading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 rounded-card" /></div>;
  }
  if (!ticket) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <EntityBreadcrumb module="Tickets" href="/tickets" current={ticket.reference} />

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.back()} className="mt-1 rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-primary" aria-label="Retour à la liste des tickets">
          <ArrowLeft className="h-5 w-5 text-seal-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-sm font-semibold text-navy dark:text-blue-300">{ticket.reference}</span>
            {/* Inline status dropdown — single click to change */}
            <div ref={statusDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => isAdmin && setStatusDropdownOpen(o => !o)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition ${isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-primary/30' : 'cursor-default'}`}
                style={{
                  backgroundColor: ticket.status === 'OPEN' ? '#dbeafe' : ticket.status === 'IN_PROGRESS' ? '#fef3c7' : ticket.status === 'WAITING' ? '#f3f4f6' : ticket.status === 'RESOLVED' ? '#d1fae5' : '#f3f4f6',
                  color: ticket.status === 'OPEN' ? '#1d4ed8' : ticket.status === 'IN_PROGRESS' ? '#b45309' : ticket.status === 'WAITING' ? '#6b7280' : ticket.status === 'RESOLVED' ? '#047857' : '#6b7280',
                }}
              >
                {ticket.status === 'OPEN' && <Circle className="h-3 w-3" />}
                {ticket.status === 'IN_PROGRESS' && <Clock className="h-3 w-3" />}
                {ticket.status === 'WAITING' && <Timer className="h-3 w-3" />}
                {(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && <CheckCircle2 className="h-3 w-3" />}
                {statusLabel[ticket.status] || ticket.status}
                {isAdmin && <ChevronDown className={`h-3 w-3 ml-0.5 transition-transform ${statusDropdownOpen ? 'rotate-180' : ''}`} />}
              </button>
              {statusDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 w-44 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 animate-fade-in-up">
                  {(['OPEN', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const).map(s => {
                    const active = ticket.status === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleInlineStatusChange(s)}
                        disabled={active}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition hover:bg-gray-50 dark:hover:bg-slate-800 ${active ? 'font-semibold bg-gray-50 dark:bg-slate-800' : ''}`}
                      >
                        {s === 'OPEN' && <Circle className="h-3.5 w-3.5 text-blue-500" />}
                        {s === 'IN_PROGRESS' && <Clock className="h-3.5 w-3.5 text-amber-500" />}
                        {s === 'WAITING' && <Timer className="h-3.5 w-3.5 text-gray-400" />}
                        {s === 'RESOLVED' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {s === 'CLOSED' && <CheckCircle2 className="h-3.5 w-3.5 text-gray-400" />}
                        <span className="text-navy dark:text-white">{statusLabel[s] || s}</span>
                        {active && <CheckCircle2 className="h-3 w-3 ml-auto text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Badge variant={priorityColor[ticket.priority] as 'info' | 'warning' | 'error'}>{priorityLabel[ticket.priority] || ticket.priority}</Badge>
            <Badge variant="navy">{ticket.category}</Badge>
            {ticket.tags && visibleTagsDetail(ticket.tags).map(tag => {
              const customColor = deployLabels?.labelColors?.[tag];
              return customColor ? (
                <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: customColor }}>{tag}</span>
              ) : (
                <span key={tag} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagColorDetail(tag)}`}>{tag}</span>
              );
            })}
          </div>
          <h1 className="text-xl font-medium text-navy dark:text-white mt-1">{ticket.title}</h1>
          {/* Ticket age */}
          <div className="flex items-center gap-3 mt-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-navy dark:text-white">
              <Clock className="h-3 w-3 text-seal-gray-500" />
              Créé il y a {getTicketAge(ticket.createdAt)}
            </span>
          </div>
          {/* SLA countdown with progress bar */}
          {(() => {
            const sla = getSlaRemaining(ticket);
            if (!sla) return null;
            return (
              <div className="mt-2 space-y-1">
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${sla.color}`}>
                  <Timer className={`h-3.5 w-3.5 ${sla.urgent ? 'animate-pulse' : ''}`} />
                  <span>{sla.text}</span>
                  {sla.urgent && <span className="ml-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">Urgent</span>}
                </div>
                <div className="h-1.5 w-full max-w-xs rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${sla.barColor}`}
                    style={{ width: `${sla.percent}%` }}
                  />
                </div>
              </div>
            );
          })()}
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
            {t('tickets.detail.createdBy')} {ticket.creator.firstName} {ticket.creator.lastName} — {formatDateTime(ticket.createdAt)}
          </p>
          <div className="mt-2 no-print">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Imprimer
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <Card className={priorityBorderColor[ticket.priority] || ''}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy dark:text-white">{t('tickets.detail.description')}</h3>
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAiSuggest}
                    disabled={aiSuggestionLoading}
                    className="no-print"
                  >
                    <Sparkles className={`h-3.5 w-3.5 ${aiSuggestionLoading ? 'animate-spin' : ''}`} />
                    {aiSuggestionLoading ? 'Analyse...' : 'Suggestion IA'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{ticket.description}</p>
              {aiSuggestion && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-primary">Suggestion IA</span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{aiSuggestion}</p>
                  <button
                    onClick={() => setComment(aiSuggestion)}
                    className="mt-2 text-xs text-primary hover:underline font-medium"
                  >
                    Utiliser comme reponse
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status Timeline */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-navy dark:text-white">Historique du statut</h3>
            </CardHeader>
            <CardContent>
              <div className="relative pl-6 space-y-4">
                {/* Created */}
                <div className="relative flex items-start gap-3">
                  <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Circle className="h-3 w-3 text-blue-500" />
                  </div>
                  <div className="border-l-2 border-gray-200 dark:border-slate-600 absolute -left-[14px] top-5 bottom-0 h-full" />
                  <div>
                    <p className="text-sm font-semibold text-navy dark:text-white">Ticket créé</p>
                    <p className="text-[10px] text-seal-gray-500">{formatDateTime(ticket.createdAt)} — {ticket.creator.firstName} {ticket.creator.lastName}</p>
                  </div>
                </div>
                {/* Current status */}
                {ticket.status !== 'OPEN' && (
                  <div className="relative flex items-start gap-3">
                    <div className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                      ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
                    }`}>
                      {(() => { const StIcon = statusTimelineIcons[ticket.status] || Circle; return <StIcon className={`h-3 w-3 ${ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'text-emerald-500' : 'text-amber-500'}`} />; })()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy dark:text-white">{statusLabel[ticket.status] || ticket.status}</p>
                      <p className="text-[10px] text-seal-gray-500">{formatDateTime(ticket.updatedAt)}{ticket.assignee ? ` — ${ticket.assignee.firstName} ${ticket.assignee.lastName}` : ''}</p>
                    </div>
                  </div>
                )}
                {/* Resolved */}
                {ticket.resolvedAt && (
                  <div className="relative flex items-start gap-3">
                    <div className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy dark:text-white">Résolu</p>
                      <p className="text-[10px] text-seal-gray-500">{formatDateTime(ticket.resolvedAt)}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Satisfaction micro-survey (shown when resolved/closed and user is ticket creator) */}
          {(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && user && ticket.creator.id === user.id && (
            <Card className="border-l-4 border-l-emerald-400">
              <CardContent className="py-4">
                {satisfactionSent ? (
                  <div className="text-center py-3">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-navy dark:text-white">Merci pour votre retour !</p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">Votre évaluation nous aide à améliorer le service.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      <h3 className="text-sm font-semibold text-navy dark:text-white">Évaluez la résolution</h3>
                    </div>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3">Comment évaluez-vous la prise en charge de votre ticket ?</p>
                    <div className="flex items-center gap-1 mb-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSatisfactionRating(star)}
                          onMouseEnter={() => setSatisfactionHover(star)}
                          onMouseLeave={() => setSatisfactionHover(0)}
                          className="p-0.5 transition-transform hover:scale-110"
                        >
                          <Star
                            className={`h-6 w-6 transition ${
                              star <= (satisfactionHover || satisfactionRating)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-gray-300 dark:text-slate-600'
                            }`}
                          />
                        </button>
                      ))}
                      {satisfactionRating > 0 && (
                        <span className="text-xs text-seal-gray-500 dark:text-slate-400 ml-2">
                          {satisfactionRating}/5
                        </span>
                      )}
                    </div>
                    <Textarea
                      placeholder="Commentaire optionnel..."
                      value={satisfactionComment}
                      onChange={(e) => setSatisfactionComment(e.target.value)}
                      className="mb-3 text-sm"
                    />
                    <Button
                      size="sm"
                      onClick={handleSatisfactionSubmit}
                      loading={satisfactionSending}
                      disabled={satisfactionRating === 0}
                    >
                      Envoyer mon avis
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Conversation */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  Conversation ({ticket.comments.length})
                </h3>
                <div className="flex items-center gap-3">
                  {isAdmin && ticket.comments.filter(c => c.isInternal).length > 0 && (
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                      {ticket.comments.filter(c => c.isInternal).length} note(s) interne(s)
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Actualisation automatique
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Messages area with chat-like scroll */}
              <div className="max-h-[500px] overflow-y-auto p-4 space-y-1 scroll-smooth">
                {ticket.comments.length === 0 && (
                  <div className="text-center py-8">
                    <Send className="h-8 w-8 text-seal-gray-500/20 mx-auto mb-2" />
                    <p className="text-sm text-seal-gray-500 dark:text-slate-400">{t('tickets.detail.noComments')}</p>
                    <p className="text-xs text-seal-gray-500/60 dark:text-slate-500 mt-1">Démarrez la conversation ci-dessous</p>
                  </div>
                )}
                {ticket.comments
                  .filter(c => !c.isInternal || isAdmin) // Hide internal notes from non-admins
                  .map((c, idx) => {
                  const isMe = user && c.author.id === user.id;
                  const prevComment = idx > 0 ? ticket.comments[idx - 1] : null;
                  const sameAuthor = prevComment && prevComment.author.id === c.author.id;
                  const timeDiff = prevComment ? (new Date(c.createdAt).getTime() - new Date(prevComment.createdAt).getTime()) / 60000 : Infinity;
                  const showHeader = !sameAuthor || timeDiff > 5;

                  return (
                    <div key={c.id} className={`${showHeader ? (idx > 0 ? 'mt-4' : '') : 'mt-0.5'}`}>
                      {showHeader && (
                        <div className={`flex items-center gap-2 mb-1 ${isMe ? 'justify-end' : ''}`}>
                          {!isMe && (
                            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ${
                              c.isInternal
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-amber-300 dark:ring-amber-700'
                                : c.author.role === 'ADMIN' || c.author.role === 'SUPER_ADMIN'
                                  ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300 ring-primary/40'
                                  : c.author.role === 'SYSTEM'
                                    ? 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-slate-400 ring-gray-300 dark:ring-slate-600'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 ring-blue-200 dark:ring-blue-800'
                            }`}>
                              {c.author.role === 'SYSTEM' ? <Settings className="h-3.5 w-3.5" /> : c.author.role === 'ADMIN' || c.author.role === 'SUPER_ADMIN' ? <ShieldCheck className="h-3.5 w-3.5" /> : getInitials(c.author.firstName, c.author.lastName)}
                            </div>
                          )}
                          {isMe && (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold bg-primary/20 text-primary ring-2 ring-primary/30">
                              <User className="h-3.5 w-3.5" />
                            </div>
                          )}
                          <span className="text-[11px] font-semibold text-navy dark:text-white">
                            {isMe ? 'Vous' : `${c.author.firstName} ${c.author.lastName}`}
                          </span>
                          {c.author.role && !isMe && (
                            <span className={`text-[9px] rounded-full px-1.5 py-0.5 font-semibold ${
                              c.author.role === 'ADMIN' || c.author.role === 'SUPER_ADMIN'
                                ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-blue-300'
                                : c.author.role === 'SYSTEM'
                                  ? 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                                  : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500'
                            }`}>{c.author.role === 'ADMIN' || c.author.role === 'SUPER_ADMIN' ? 'Admin' : c.author.role}</span>
                          )}
                          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500" title={formatDateTime(c.createdAt)}>{formatRelativeTime(c.createdAt)}</span>
                          {c.isInternal && <Badge variant="warning" className="text-[9px] py-0">Interne</Badge>}
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                          c.isInternal
                            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                            : isMe
                              ? 'bg-primary text-white rounded-br-md'
                              : 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 rounded-bl-md'
                        }`}>
                          <p className="whitespace-pre-wrap">{c.content}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={commentsEndRef} />
              </div>

              {/* Compose bar */}
              <div className="border-t border-gray-100 dark:border-slate-700 p-3 no-print">
                {/* Internal toggle for admins */}
                {isAdmin && (
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setIsInternalComment(!isInternalComment)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        isInternalComment
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-gray-100 text-seal-gray-500 dark:bg-slate-700 dark:text-slate-400 hover:bg-gray-200'
                      }`}
                    >
                      {isInternalComment ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {isInternalComment ? 'Note interne (invisible pour le créateur)' : 'Réponse publique'}
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <MentionTextarea
                      value={comment}
                      onChange={setComment}
                      placeholder={isInternalComment ? 'Note interne... (@ pour mentionner)' : t('tickets.detail.addComment')}
                      rows={2}
                      className={`w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-primary ${isInternalComment ? 'border-amber-300 dark:border-amber-700' : 'border-gray-200 dark:border-slate-700'}`}
                      onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleComment(); } }}
                    />
                  </div>
                  <Button
                    onClick={handleComment}
                    loading={sending}
                    disabled={!comment.trim()}
                    className="flex-shrink-0"
                    size="sm"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-seal-gray-500/60 dark:text-slate-600 mt-1">Entrée pour envoyer · Shift+Entrée pour un retour à la ligne</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Info */}
          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-navy dark:text-white">{t('tickets.detail.info')}</h3></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-seal-gray-500">{t('tickets.detail.creator')}</span>
                <span className="font-semibold text-navy dark:text-white">{ticket.creator.firstName} {ticket.creator.lastName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-seal-gray-500">{t('tickets.detail.assignee')}</span>
                <span className="font-semibold text-navy dark:text-white">{ticket.assignee ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}` : t('tickets.detail.unassigned')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-seal-gray-500">{t('tickets.detail.createdAt')}</span>
                <span className="text-navy dark:text-white">{formatDateTime(ticket.createdAt)}</span>
              </div>
              {ticket.resolvedAt && (
                <div className="flex justify-between">
                  <span className="text-seal-gray-500">{t('tickets.detail.resolvedAt')}</span>
                  <span className="text-navy dark:text-white">{formatDateTime(ticket.resolvedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deployment checklist (interactive) */}
          {hasChecklist && deployLabels && (
            <Card className="border-l-4 border-l-teal-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-teal-600" />
                    Checklist deploiement
                  </h3>
                  <span className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 tabular-nums">
                    {ticket.tags.filter(t => t.startsWith('check:')).length}/{deployLabels.deployment.checklist.length}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${ticket.tags.filter(t => t.startsWith('check:')).length === deployLabels.deployment.checklist.length ? 'bg-emerald-500' : 'bg-teal-500'}`}
                    style={{ width: `${Math.round((ticket.tags.filter(t => t.startsWith('check:')).length / deployLabels.deployment.checklist.length) * 100)}%` }}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {deployLabels.deployment.checklist.map((item) => {
                  const checked = ticket.tags.includes(`check:${item.id}`);
                  return (
                    <label key={item.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${isAdmin ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800' : ''} ${checked ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleChecklistToggle(item.id, checked)}
                        disabled={!isAdmin}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span className={`text-xs ${checked ? 'text-emerald-700 dark:text-emerald-400 line-through' : 'text-navy dark:text-white'}`}>{item.label}</span>
                    </label>
                  );
                })}
                {/* Custom fields display */}
                {deployLabels.deployment.fields.some(f => getFieldValueDetail(ticket.tags, f.id)) && (
                  <div className="pt-2 mt-2 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
                    {deployLabels.deployment.fields.map((field) => {
                      const val = getFieldValueDetail(ticket.tags, field.id);
                      if (!val) return null;
                      return (
                        <div key={field.id} className="flex justify-between text-xs">
                          <span className="text-seal-gray-500 dark:text-slate-400">{field.label}</span>
                          <span className="font-semibold text-navy dark:text-white font-mono">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Admin actions */}
          {isAdmin && !ticket.assignee && (
            <Card className="no-print border-l-4 border-l-primary">
              <CardContent className="py-3">
                <Button size="sm" className="w-full" onClick={async () => {
                  try {
                    await api.patch(`/tickets/${ticket.id}`, { assigneeId: user?.id });
                    toast.success('Ticket assigne');
                    const { data } = await api.get(`/tickets/${ticket.id}`);
                    setTicket(data);
                  } catch { toast.error('Erreur d\'assignation'); }
                }}>
                  M&apos;assigner ce ticket
                </Button>
              </CardContent>
            </Card>
          )}
          {isAdmin && (
            <Card className="no-print border-l-4 border-l-amber-400">
              <CardHeader><h3 className="text-sm font-semibold text-navy dark:text-white flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />{t('tickets.detail.actions')}</h3></CardHeader>
              <CardContent className="space-y-3">
                <Select
                  label={t('tickets.detail.statusLabel')}
                  options={[
                    { value: 'OPEN', label: t('tickets.status.open') },
                    { value: 'IN_PROGRESS', label: t('tickets.status.inProgress') },
                    { value: 'WAITING', label: t('tickets.status.waiting') },
                    { value: 'RESOLVED', label: t('tickets.status.resolved') },
                    { value: 'CLOSED', label: t('tickets.status.closed') },
                  ]}
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                />
                <Button className="w-full" onClick={handleStatusChange} disabled={newStatus === ticket.status}>
                  {t('tickets.detail.update')}
                </Button>
                {['RESOLVED', 'CLOSED'].includes(ticket.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    disabled={kbLoading}
                    loading={kbLoading}
                    onClick={async () => {
                      setKbLoading(true);
                      try {
                        const { data: draft } = await api.post(`/tickets/${ticket.id}/generate-kb`);
                        setKbDraft(draft);
                        setKbTitle(draft.title);
                        setKbContent(draft.content);
                      } catch (err: any) {
                        toast.error('Erreur generation KB');
                      } finally {
                        setKbLoading(false);
                      }
                    }}
                  >
                    <BookOpen className="h-4 w-4" /> Créer article KB
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      {/* KB Preview Dialog */}
      <Dialog open={!!kbDraft} onClose={() => setKbDraft(null)} title="Aperçu article KB">
        <div className="space-y-4">
          <Input label="Titre" value={kbTitle} onChange={(e) => setKbTitle(e.target.value)} required />
          <Textarea label="Contenu (HTML)" value={kbContent} onChange={(e) => setKbContent(e.target.value)} rows={12} className="font-mono text-xs" />
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">Catégorie : {kbDraft?.category} · Visibilité : {kbDraft?.visibility}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setKbDraft(null)}>Annuler</Button>
            <Button
              size="sm"
              loading={kbPublishing}
              disabled={kbPublishing || !kbTitle.trim()}
              onClick={async () => {
                if (!kbDraft) return;
                setKbPublishing(true);
                try {
                  const { data: created } = await api.post('/wiki', {
                    title: kbTitle,
                    slug: kbDraft.slug,
                    content: kbContent,
                    category: kbDraft.category,
                    visibility: kbDraft.visibility,
                    ownerDepartmentId: kbDraft.ownerDepartmentId,
                    isPublished: true,
                  });
                  setKbDraft(null);
                  toast.success(`Article KB créé`, {
                    action: { label: 'Voir l\'article', onClick: () => router.push(`/wiki/${created.id}`) },
                  });
                } catch (err: any) {
                  toast.error('Erreur de publication');
                } finally {
                  setKbPublishing(false);
                }
              }}
            >
              <BookOpen className="h-4 w-4" /> Publier
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
