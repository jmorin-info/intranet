'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Card, CardContent, Button, Select } from '@omnitech/ui';
import { PageHeader } from '@/components/layout/page-header';
import {
  Bell,
  Mail,
  Smartphone,
  MonitorSmartphone,
  FileText,
  Ticket as TicketIcon,
  ShieldAlert,
  AtSign,
  Save,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';

type DigestFrequency = 'off' | 'daily' | 'weekly';

interface Preferences {
  email: {
    tickets: boolean;
    documents: boolean;
    incidents: boolean;
    mentions: boolean;
    digest: DigestFrequency;
  };
  inApp: {
    tickets: boolean;
    documents: boolean;
    incidents: boolean;
    mentions: boolean;
  };
  push: {
    tickets: boolean;
    incidents: boolean;
    mentions: boolean;
  };
}

const DEFAULT_PREFS: Preferences = {
  email: { tickets: true, documents: true, incidents: true, mentions: true, digest: 'daily' },
  inApp: { tickets: true, documents: true, incidents: true, mentions: true },
  push: { tickets: false, incidents: true, mentions: true },
};

type Category = 'tickets' | 'documents' | 'incidents' | 'mentions';

interface CategoryRow {
  key: Category;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  // which channels apply — documents never go to push
  channels: { inApp: boolean; email: boolean; push: boolean };
}

const CATEGORIES: CategoryRow[] = [
  {
    key: 'tickets',
    label: 'Tickets',
    description: 'Création, assignation, mises à jour, SLA',
    icon: TicketIcon,
    color: 'text-seal-blue',
    channels: { inApp: true, email: true, push: true },
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Revues, approbations, signatures, accusés de réception',
    icon: FileText,
    color: 'text-seal-orange',
    channels: { inApp: true, email: true, push: false },
  },
  {
    key: 'incidents',
    label: 'Incidents',
    description: 'Nouveaux incidents de sécurité, remédiations',
    icon: ShieldAlert,
    color: 'text-seal-bordeaux',
    channels: { inApp: true, email: true, push: true },
  },
  {
    key: 'mentions',
    label: 'Mentions',
    description: 'Quelqu’un vous mentionne dans un commentaire',
    icon: AtSign,
    color: 'text-seal-green',
    channels: { inApp: true, email: true, push: true },
  },
];

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${
        disabled
          ? 'bg-gray-200 dark:bg-slate-700 cursor-not-allowed opacity-50'
          : checked
            ? 'bg-primary'
            : 'bg-gray-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function NotificationPreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [initial, setInitial] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/notifications/preferences')
      .then(({ data }) => {
        const next: Preferences = {
          email: { ...DEFAULT_PREFS.email, ...(data?.email || {}) },
          inApp: { ...DEFAULT_PREFS.inApp, ...(data?.inApp || {}) },
          push: { ...DEFAULT_PREFS.push, ...(data?.push || {}) },
        };
        setPrefs(next);
        setInitial(next);
      })
      .catch((err) => {
        toast.error('Impossible de charger vos préférences');
        // Fall back to defaults so the UI is usable.
        setPrefs({ ...DEFAULT_PREFS });
        setInitial({ ...DEFAULT_PREFS });
        // eslint-disable-next-line no-console
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const dirty = useMemo(() => {
    if (!prefs || !initial) return false;
    return JSON.stringify(prefs) !== JSON.stringify(initial);
  }, [prefs, initial]);

  const updateChannel = (
    channel: 'email' | 'inApp' | 'push',
    key: Category,
    value: boolean,
  ) => {
    setPrefs((p) => {
      if (!p) return p;
      return { ...p, [channel]: { ...p[channel], [key]: value } };
    });
  };

  const setDigest = (value: DigestFrequency) => {
    setPrefs((p) => (p ? { ...p, email: { ...p.email, digest: value } } : p));
  };

  const handleSave = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const { data } = await api.put('/notifications/preferences', prefs);
      const next: Preferences = {
        email: { ...DEFAULT_PREFS.email, ...(data?.email || {}) },
        inApp: { ...DEFAULT_PREFS.inApp, ...(data?.inApp || {}) },
        push: { ...DEFAULT_PREFS.push, ...(data?.push || {}) },
      };
      setPrefs(next);
      setInitial(next);
      toast.success('Préférences enregistrées');
    } catch (err) {
      toast.error(
        (err as any)?.response?.data?.message ||
          (err as any)?.message ||
          'Erreur lors de l’enregistrement',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setPrefs({ ...DEFAULT_PREFS });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">
      <PageHeader
        title="Préférences de notifications"
        subtitle="Choisissez les canaux (e-mail, in-app, push) pour chaque type de notification"
        icon={Bell}
        hub="monEspace"
        actions={
          <>
            <Link href="/notifications">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4" />
                Retour
              </Button>
            </Link>
          </>
        }
      />

      {loading || !prefs ? (
        <Card>
          <CardContent>
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 py-3">
                  <div className="h-9 w-9 rounded-full shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/3 rounded shimmer" />
                    <div className="h-3 w-2/3 rounded shimmer" />
                  </div>
                  <div className="h-6 w-11 rounded-full shimmer" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: table 3 colonnes (In-app / Email / Push) */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-slate-700">
                    <th className="px-6 py-4 text-left text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wide">
                      Catégorie
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wide w-32">
                      <div className="inline-flex items-center gap-1.5">
                        <MonitorSmartphone className="h-3.5 w-3.5" /> In-app
                      </div>
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wide w-32">
                      <div className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> E-mail
                      </div>
                    </th>
                    <th className="px-4 py-4 text-center text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wide w-32">
                      <div className="inline-flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5" /> Push
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {CATEGORIES.map((row) => {
                    const Icon = row.icon;
                    return (
                      <tr key={row.key} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800 flex-shrink-0">
                              <Icon className={`h-4 w-4 ${row.color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-seal-navy dark:text-white">{row.label}</p>
                              <p className="text-xs text-seal-gray-500 dark:text-slate-400">{row.description}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex">
                            <Toggle
                              checked={prefs.inApp[row.key]}
                              onChange={(v) => updateChannel('inApp', row.key, v)}
                              disabled={!row.channels.inApp}
                              ariaLabel={`In-app ${row.label}`}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex">
                            <Toggle
                              checked={prefs.email[row.key]}
                              onChange={(v) => updateChannel('email', row.key, v)}
                              disabled={!row.channels.email}
                              ariaLabel={`E-mail ${row.label}`}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="inline-flex">
                            {row.channels.push ? (
                              <Toggle
                                checked={(prefs.push as any)[row.key] ?? false}
                                onChange={(v) => updateChannel('push', row.key, v)}
                                ariaLabel={`Push ${row.label}`}
                              />
                            ) : (
                              <span className="text-xs text-seal-gray-500/60 dark:text-slate-500">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Mobile: liste verticale par catégorie */}
          <div className="md:hidden space-y-3">
            {CATEGORIES.map((row) => {
              const Icon = row.icon;
              return (
                <Card key={row.key}>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800">
                        <Icon className={`h-4 w-4 ${row.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-seal-navy dark:text-white">{row.label}</p>
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400">{row.description}</p>
                      </div>
                    </div>
                    <div className="space-y-2 pl-12">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
                          <MonitorSmartphone className="h-3.5 w-3.5" /> In-app
                        </span>
                        <Toggle
                          checked={prefs.inApp[row.key]}
                          onChange={(v) => updateChannel('inApp', row.key, v)}
                          ariaLabel={`In-app ${row.label}`}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
                          <Mail className="h-3.5 w-3.5" /> E-mail
                        </span>
                        <Toggle
                          checked={prefs.email[row.key]}
                          onChange={(v) => updateChannel('email', row.key, v)}
                          ariaLabel={`E-mail ${row.label}`}
                        />
                      </div>
                      {row.channels.push && (
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
                            <Smartphone className="h-3.5 w-3.5" /> Push
                          </span>
                          <Toggle
                            checked={(prefs.push as any)[row.key] ?? false}
                            onChange={(v) => updateChannel('push', row.key, v)}
                            ariaLabel={`Push ${row.label}`}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Digest email */}
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-slate-800 flex-shrink-0">
                  <Mail className="h-4 w-4 text-seal-blue" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-seal-navy dark:text-white">Résumé par e-mail</p>
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3">
                    Recevez un récapitulatif groupé de vos notifications non lues.
                  </p>
                  <Select
                    options={[
                      { value: 'off', label: 'Désactivé' },
                      { value: 'daily', label: 'Quotidien (en semaine, 8h)' },
                      { value: 'weekly', label: 'Hebdomadaire (lundi matin)' },
                    ]}
                    value={prefs.email.digest}
                    onChange={(e) => setDigest(e.target.value as DigestFrequency)}
                    className="max-w-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pb-6">
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              <RotateCcw className="h-4 w-4" />
              Réinitialiser les valeurs par défaut
            </Button>
            <div className="flex items-center gap-3">
              {dirty && (
                <span className="text-xs text-seal-orange font-medium">Modifications non enregistrées</span>
              )}
              <Button onClick={handleSave} disabled={!dirty} loading={saving}>
                <Save className="h-4 w-4" />
                Enregistrer
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
