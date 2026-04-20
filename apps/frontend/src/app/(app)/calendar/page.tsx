'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { Card, CardContent, Badge, Button, Dialog, Input, Textarea, Select } from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Newspaper,
  ShieldCheck,
  FileText,
  X,
  Plus,
  CalendarDays,
  MapPin,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CalendarEvent {
  id: string;
  title: string;
  date: string;          // ISO date string
  type: 'news' | 'compliance' | 'review' | 'event';
  href: string;
  color?: string;
  category?: string;
  location?: string;
  description?: string;
}

interface CustomCalendarEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  allDay: boolean;
  category: string;
  location?: string;
  departmentId?: string;
  color?: string;
  createdBy?: { id: string; firstName: string; lastName: string };
  department?: { id: string; name: string; code: string } | null;
}

interface DepartmentOption {
  id: string;
  name: string;
  code: string;
}

interface NewsPost {
  id: string;
  title: string;
  slug: string;
  publishedAt: string;
}

interface ComplianceTask {
  id: string;
  title: string;
  nextDueDate: string | null;
  status: string;
}

interface DocumentReview {
  id: string;
  title: string;
  nextReviewDate: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Returns array of Date objects for every day cell in a month view (includes leading/trailing days). */
function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // Monday-based week: 0=Mon ... 6=Sun
  const startDay = (first.getDay() + 6) % 7;
  const days: Date[] = [];
  // Leading days from previous month
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // Days of this month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to fill last row (always show complete weeks)
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - startDay - daysInMonth + 1));
  }
  return days;
}

/* ------------------------------------------------------------------ */
/*  Dot color config per event type                                    */
/* ------------------------------------------------------------------ */

const EVENT_CONFIG: Record<string, { dot: string; bg: string; icon: React.ElementType; label: string; badgeVariant: 'info' | 'error' | 'warning' | 'success' }> = {
  news:       { dot: 'bg-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20',   icon: Newspaper,    label: 'Actualité',           badgeVariant: 'info'    },
  compliance: { dot: 'bg-red-500',    bg: 'bg-red-50 dark:bg-red-900/20',     icon: ShieldCheck,   label: 'Conformité',          badgeVariant: 'error'   },
  review:     { dot: 'bg-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20', icon: FileText,      label: 'Revue documentaire',  badgeVariant: 'warning' },
  event:      { dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: CalendarDays, label: 'Événement',      badgeVariant: 'success' },
};

const CATEGORY_COLORS: Record<string, string> = {
  AUDIT: '#DC2626',       // red
  FORMATION: '#7C3AED',   // violet
  COMITE: '#7C3AED',      // violet
  REUNION: '#2563EB',     // blue
  MAINTENANCE: '#D97706', // amber
  GENERAL: '#6B7280',     // gray
};

/** Tailwind dot class per custom-event category */
const CATEGORY_DOT_CLASS: Record<string, string> = {
  AUDIT: 'bg-red-500',
  FORMATION: 'bg-violet-500',
  COMITE: 'bg-violet-500',
  REUNION: 'bg-blue-500',
  MAINTENANCE: 'bg-amber-500',
  GENERAL: 'bg-gray-400',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const EVENT_CATEGORIES = [
  { value: 'GENERAL', label: 'Général' },
  { value: 'AUDIT', label: 'Audit' },
  { value: 'FORMATION', label: 'Formation' },
  { value: 'COMITE', label: 'Comité' },
  { value: 'REUNION', label: 'Réunion' },
  { value: 'MAINTENANCE', label: 'Maintenance' },
];

export default function CalendarPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creationAttempted, setCreationAttempted] = useState(false);
  const [creating, setCreating] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [eventForm, setEventForm] = useState({
    title: '', description: '', startDate: '', endDate: '', category: 'GENERAL', allDay: false, location: '', departmentId: '',
  });

  const isReviewer = user && isRoleAtLeast(user.role, UserRole.REVIEWER);

  // Load departments
  useEffect(() => {
    api.get('/departments')
      .then((r) => {
        const data = Array.isArray(r.data) ? r.data : r.data?.data || [];
        setDepartments(data.map((d: any) => ({ id: d.id, name: d.name, code: d.code })));
      })
      .catch(() => setDepartments([]));
  }, []);

  /* ---- Data fetching ---- */
  const fetchAllEvents = useCallback(async () => {
    setLoading(true);
    try {
      const [newsRes, complianceRes, docsRes, calendarRes] = await Promise.allSettled([
        api.get('/news', { params: { limit: 200 } }),
        api.get('/compliance-tasks'),
        api.get('/documents', { params: { limit: 200 } }),
        api.get('/calendar/events', { params: { limit: 200 } }),
      ]);

      const items: CalendarEvent[] = [];

      // News articles
      if (newsRes.status === 'fulfilled') {
        const posts: NewsPost[] = newsRes.value.data?.data || newsRes.value.data || [];
        posts.forEach((p) => {
          if (p.publishedAt) {
            items.push({
              id: `news-${p.id}`,
              title: p.title,
              date: p.publishedAt,
              type: 'news',
              href: `/news/${p.slug || p.id}`,
            });
          }
        });
      }

      // Compliance tasks
      if (complianceRes.status === 'fulfilled') {
        const tasks: ComplianceTask[] = complianceRes.value.data?.data || complianceRes.value.data || [];
        tasks.forEach((task) => {
          if (task.nextDueDate) {
            items.push({
              id: `compliance-${task.id}`,
              title: task.title,
              date: task.nextDueDate,
              type: 'compliance',
              href: '/admin/compliance-tasks',
            });
          }
        });
      }

      // Document reviews
      if (docsRes.status === 'fulfilled') {
        const docs: DocumentReview[] = docsRes.value.data?.data || docsRes.value.data || [];
        docs.forEach((doc) => {
          if (doc.nextReviewDate) {
            items.push({
              id: `review-${doc.id}`,
              title: doc.title,
              date: doc.nextReviewDate,
              type: 'review',
              href: `/documents/${doc.id}`,
            });
          }
        });
      }

      // Custom calendar events
      if (calendarRes.status === 'fulfilled') {
        const customEvents: CustomCalendarEvent[] = calendarRes.value.data?.data || calendarRes.value.data || [];
        customEvents.forEach((ev) => {
          items.push({
            id: `event-${ev.id}`,
            title: ev.title,
            date: ev.startDate,
            type: 'event',
            href: '#',
            color: ev.color || CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.GENERAL,
            category: ev.category,
            location: ev.location,
            description: ev.description,
          });
        });
      }

      setEvents(items);
    } catch {
      console.warn('Calendar: failed to load events');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllEvents();
  }, [fetchAllEvents]);

  const handleCreateEvent = async () => {
    setCreationAttempted(true);
    if (!eventForm.title || !eventForm.startDate) {
      toast.error('Le titre et la date de début sont requis');
      return;
    }
    setCreating(true);
    try {
      const payload: Record<string, unknown> = {
        title: eventForm.title,
        startDate: new Date(eventForm.startDate).toISOString(),
        category: eventForm.category,
        allDay: eventForm.allDay,
      };
      if (eventForm.description) payload.description = eventForm.description;
      if (eventForm.endDate) payload.endDate = new Date(eventForm.endDate).toISOString();
      if (eventForm.location) payload.location = eventForm.location;
      if (eventForm.departmentId) payload.departmentId = eventForm.departmentId;

      await api.post('/calendar/events', payload);
      toast.success('Événement créé');
      setShowCreate(false);
      setCreationAttempted(false);
      setEventForm({ title: '', description: '', startDate: '', endDate: '', category: 'GENERAL', allDay: false, location: '', departmentId: '' });
      fetchAllEvents();
    } catch (err) {
      toast.error((err as any)?.response?.data?.message || (err as any)?.message || 'Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  };

  /* ---- Derived data ---- */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((ev) => {
      const key = toDateKey(new Date(ev.date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return map;
  }, [events]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  const selectedEvents = useMemo(() => {
    if (!selectedDate) return [];
    const evts = eventsByDate.get(toDateKey(selectedDate)) || [];
    // Sort by time (earliest first); events without a parseable time go last
    return [...evts].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return ta - tb;
    });
  }, [selectedDate, eventsByDate]);

  /* ---- Navigation ---- */
  const prevMonth = useCallback(() => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }, [month]);

  const nextMonth = useCallback(() => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }, [month]);

  const goToday = useCallback(() => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(today);
  }, [today]);

  /* ---- Render ---- */
  return (
    <div className="max-w-6xl mx-auto animate-fade-in-up">
      <PageHeader
        title={t('calendar.title')}
        subtitle={t('calendar.subtitle')}
        icon={CalendarIcon}
        hub="monEspace"
        actions={
          <>
            <div className="hidden md:flex items-center gap-3 mr-2 text-xs text-taupe dark:text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-blue-500 inline-block" /> {t('calendar.legendNews')}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500 inline-block" /> {t('calendar.legendCompliance')}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500 inline-block" /> {t('calendar.legendReview')}</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" /> Événement</span>
            </div>
            {isReviewer && (
              <Button onClick={() => { setShowCreate(true); if (selectedDate) { setEventForm(f => ({ ...f, startDate: toDateKey(selectedDate) })); } }}>
                <Plus className="h-4 w-4" /> Créer un événement
              </Button>
            )}
          </>
        }
      />
      <div className="flex items-center justify-end mb-6 gap-2">
        <button
          onClick={goToday}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-slate-600 text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition"
        >
          {t('calendar.today')}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Calendar grid */}
        <div className="flex-1">
          <Card>
            <CardContent className="p-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                  aria-label={t('calendar.prevMonth')}
                >
                  <ChevronLeft className="h-5 w-5 text-navy dark:text-white" />
                </button>
                <h2 className="text-lg font-medium text-navy dark:text-white">
                  {MONTHS_FR[month]} {year}
                </h2>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                  aria-label={t('calendar.nextMonth')}
                >
                  <ChevronRight className="h-5 w-5 text-navy dark:text-white" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS_FR.map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-taupe dark:text-slate-400 py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              {loading ? (
                <div className="grid grid-cols-7 gap-px">
                  {Array.from({ length: 35 }).map((_, i) => (
                    <div key={i} className="h-20 animate-pulse bg-gray-50 dark:bg-slate-800 rounded" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-px bg-gray-100 dark:bg-slate-700 rounded-lg overflow-hidden">
                  {calendarDays.map((day, idx) => {
                    const key = toDateKey(day);
                    const dayEvents = eventsByDate.get(key) || [];
                    const isCurrentMonth = day.getMonth() === month;
                    const isToday = isSameDay(day, today);
                    const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedDate(day)}
                        className={[
                          'relative h-20 p-1.5 text-left transition-colors',
                          'bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700',
                          !isCurrentMonth && 'opacity-40',
                          isSelected && 'ring-2 ring-primary ring-inset',
                        ].filter(Boolean).join(' ')}
                      >
                        <span
                          className={[
                            'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
                            isToday
                              ? 'bg-primary text-white font-medium'
                              : 'text-navy dark:text-white',
                          ].filter(Boolean).join(' ')}
                        >
                          {day.getDate()}
                        </span>
                        {/* Event dots — one per system type + one per custom-event category */}
                        {dayEvents.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {/* System event types (news, compliance, review) */}
                            {(['news', 'compliance', 'review'] as const)
                              .filter((type) => dayEvents.some((e) => e.type === type))
                              .map((type) => {
                                const count = dayEvents.filter((e) => e.type === type).length;
                                return (
                                  <span
                                    key={type}
                                    className={`h-2 w-2 rounded-full ${EVENT_CONFIG[type]?.dot}`}
                                    title={`${count} ${EVENT_CONFIG[type]?.label}`}
                                  />
                                );
                              })}
                            {/* Custom events — one dot per unique category with category color */}
                            {(() => {
                              const customEvts = dayEvents.filter((e) => e.type === 'event');
                              const cats = [...new Set(customEvts.map((e) => e.category || 'GENERAL'))];
                              return cats.map((cat) => {
                                const count = customEvts.filter((e) => (e.category || 'GENERAL') === cat).length;
                                const dotClass = CATEGORY_DOT_CLASS[cat] || 'bg-gray-400';
                                const catLabel = EVENT_CATEGORIES.find((c) => c.value === cat)?.label || cat;
                                return (
                                  <span
                                    key={`event-${cat}`}
                                    className={`h-2 w-2 rounded-full ${dotClass}`}
                                    title={`${count} ${catLabel}`}
                                  />
                                );
                              });
                            })()}
                          </div>
                        )}
                        {dayEvents.length > 0 && (
                          <span className="absolute bottom-1 right-1.5 text-[9px] font-medium text-taupe dark:text-slate-500">
                            {dayEvents.length}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Mobile legend */}
              <div className="flex md:hidden items-center justify-center gap-4 mt-4 text-[10px] text-taupe dark:text-slate-400">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500 inline-block" /> {t('calendar.legendNews')}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" /> {t('calendar.legendCompliance')}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500 inline-block" /> {t('calendar.legendReview')}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Événement</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: selected day events */}
        <div className="hidden md:block w-80 flex-shrink-0">
          <Card className="sticky top-24">
            <CardContent className="p-4">
              {selectedDate ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-medium text-navy dark:text-white">
                      {formatDate(selectedDate)}
                    </h3>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                      aria-label={t('calendar.close')}
                    >
                      <X className="h-4 w-4 text-taupe" />
                    </button>
                  </div>

                  {selectedEvents.length === 0 ? (
                    <div className="py-6 text-center animate-fade-in-up">
                      <CalendarIcon className="h-8 w-8 text-taupe/20 mx-auto mb-2" />
                      <p className="text-sm text-taupe dark:text-slate-400 mb-3">
                        {t('calendar.noEvents')}
                      </p>
                      {isReviewer && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setShowCreate(true); setEventForm(f => ({ ...f, startDate: toDateKey(selectedDate!) })); }}
                        >
                          <Plus className="h-3.5 w-3.5" /> Créer un événement
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map((ev) => {
                        const config = EVENT_CONFIG[ev.type] || EVENT_CONFIG.news;
                        const Icon = config!.icon;
                        const catColor = ev.type === 'event' ? (CATEGORY_COLORS[ev.category || 'GENERAL'] || CATEGORY_COLORS.GENERAL) : undefined;
                        const iconColor = ev.type === 'news' ? 'text-blue-500' : ev.type === 'compliance' ? 'text-red-500' : ev.type === 'event' ? 'text-emerald-500' : 'text-amber-500';
                        const evTime = (() => { try { const d = new Date(ev.date); const h = d.getHours(); const m = d.getMinutes(); return (h === 0 && m === 0) ? null : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; } catch { return null; } })();
                        const inner = (
                          <div
                            className={`flex items-start gap-2.5 rounded-lg p-2.5 transition hover:ring-1 hover:ring-primary/30 ${config!.bg}`}
                            style={{ borderLeft: `3px solid ${catColor || (ev.color ? ev.color : 'transparent')}` }}
                          >
                            <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                {evTime && (
                                  <span className="text-[10px] font-semibold text-primary tabular-nums">{evTime}</span>
                                )}
                                <p className="text-sm font-medium text-navy dark:text-white truncate">{ev.title}</p>
                              </div>
                              {ev.location && (
                                <p className="text-[10px] text-taupe dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3" />{ev.location}
                                </p>
                              )}
                              <Badge variant={config!.badgeVariant} className="mt-1 text-[10px]">
                                {ev.type === 'event' && ev.category ? EVENT_CATEGORIES.find(c => c.value === ev.category)?.label || ev.category : config!.label}
                              </Badge>
                            </div>
                          </div>
                        );
                        return ev.type === 'event' ? (
                          <div key={ev.id}>{inner}</div>
                        ) : (
                          <Link key={ev.id} href={ev.href}>{inner}</Link>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-8 text-center">
                  <CalendarIcon className="h-10 w-10 text-taupe/20 mx-auto mb-3" />
                  <p className="text-sm text-taupe dark:text-slate-400">{t('calendar.selectDay')}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile: selected day events (shown below calendar) */}
      {selectedDate && (
        <div className="md:hidden mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-navy dark:text-white">
                  {formatDate(selectedDate)}
                </h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition"
                  aria-label={t('calendar.close')}
                >
                  <X className="h-4 w-4 text-taupe" />
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-taupe dark:text-slate-400 py-4 text-center">
                  {t('calendar.noEvents')}
                </p>
              ) : (
              <div className="space-y-2">
                {selectedEvents.map((ev) => {
                  const config = EVENT_CONFIG[ev.type] || EVENT_CONFIG.news;
                  const Icon = config!.icon;
                  const catColor = ev.type === 'event' ? (CATEGORY_COLORS[ev.category || 'GENERAL'] || CATEGORY_COLORS.GENERAL) : undefined;
                  const iconColor = ev.type === 'news' ? 'text-blue-500' : ev.type === 'compliance' ? 'text-red-500' : ev.type === 'event' ? 'text-emerald-500' : 'text-amber-500';
                  const evTime = (() => { try { const d = new Date(ev.date); const h = d.getHours(); const m = d.getMinutes(); return (h === 0 && m === 0) ? null : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; } catch { return null; } })();
                  const inner = (
                    <div
                      className={`flex items-start gap-2.5 rounded-lg p-2.5 transition hover:ring-1 hover:ring-primary/30 ${config!.bg}`}
                      style={{ borderLeft: `3px solid ${catColor || (ev.color ? ev.color : 'transparent')}` }}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {evTime && (
                            <span className="text-[10px] font-semibold text-primary tabular-nums">{evTime}</span>
                          )}
                          <p className="text-sm font-medium text-navy dark:text-white truncate">{ev.title}</p>
                        </div>
                        {ev.location && (
                          <p className="text-[10px] text-taupe dark:text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3" />{ev.location}
                          </p>
                        )}
                        <Badge variant={config!.badgeVariant} className="mt-1 text-[10px]">
                          {ev.type === 'event' && ev.category ? EVENT_CATEGORIES.find(c => c.value === ev.category)?.label || ev.category : config!.label}
                        </Badge>
                      </div>
                    </div>
                  );
                  return ev.type === 'event' ? (
                    <div key={ev.id}>{inner}</div>
                  ) : (
                    <Link key={ev.id} href={ev.href}>{inner}</Link>
                  );
                })}
              </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create event modal */}
      <Dialog open={showCreate} onClose={() => { setShowCreate(false); setCreationAttempted(false); setEventForm({ title: '', description: '', startDate: '', endDate: '', category: 'GENERAL', allDay: false, location: '', departmentId: '' }); }} title={t('calendar.newEvent')} description={t('calendar.newEvent.description')}>
        <div className="space-y-4" onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const tag = (e.target as HTMLElement).tagName;
          const isTextarea = tag === 'TEXTAREA';
          if (isTextarea && !(e.ctrlKey || e.metaKey)) return;
          e.preventDefault();
          handleCreateEvent();
        }}>
          <Input label={t('calendar.form.title')} value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} placeholder={t('calendar.form.titlePh')} error={creationAttempted && !eventForm.title ? 'Titre requis' : undefined} aria-label={t('calendar.form.title')} />
          <Textarea label={t('calendar.form.description')} value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder={t('calendar.form.descriptionPh')} rows={3} aria-label={t('calendar.form.description')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label={t('calendar.form.startDate')} type={eventForm.allDay ? 'date' : 'datetime-local'} value={eventForm.startDate} onChange={(e) => setEventForm({ ...eventForm, startDate: e.target.value })} error={creationAttempted && !eventForm.startDate ? 'Date requise' : undefined} aria-label={t('calendar.form.startDate')} />
            <Input label={t('calendar.form.endDate')} type={eventForm.allDay ? 'date' : 'datetime-local'} value={eventForm.endDate} onChange={(e) => setEventForm({ ...eventForm, endDate: e.target.value })} aria-label={t('calendar.form.endDate')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label={t('calendar.form.category')} options={EVENT_CATEGORIES.map(c => ({ value: c.value, label: c.label }))} value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })} aria-label={t('calendar.form.category')} />
            <Input label={t('calendar.form.location')} value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder={t('calendar.form.locationPh')} aria-label={t('calendar.form.location')} />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-navy dark:text-white cursor-pointer">
              <input type="checkbox" checked={eventForm.allDay} onChange={(e) => setEventForm({ ...eventForm, allDay: e.target.checked })} className="rounded border-gray-300 dark:border-slate-600 text-primary focus:ring-primary" />
              {t('calendar.form.allDay')}
            </label>
          </div>
          {departments.length > 0 && (
            <Select label={t('calendar.form.department')} options={[{ value: '', label: t('calendar.form.allDepartments') }, ...departments.map(d => ({ value: d.id, label: d.name }))]} value={eventForm.departmentId} onChange={(e) => setEventForm({ ...eventForm, departmentId: e.target.value })} />
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => { setShowCreate(false); setCreationAttempted(false); setEventForm({ title: '', description: '', startDate: '', endDate: '', category: 'GENERAL', allDay: false, location: '', departmentId: '' }); }}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateEvent} loading={creating}>{t('common.create')}</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
