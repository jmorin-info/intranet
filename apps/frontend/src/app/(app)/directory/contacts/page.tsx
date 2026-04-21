'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card,
  CardContent,
  Badge,
  SearchInput,
  Select,
  Button,
  Input,
  EmptyState,
} from '@omnitech/ui';
import {
  Users,
  Mail,
  Phone,
  Building2,
  PhoneCall,
  Plus,
  X,
  GitBranchPlus,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';

const CONTACT_AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  'bg-orange-500', 'bg-pink-500', 'bg-lime-600', 'bg-fuchsia-500',
];

function getContactAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CONTACT_AVATAR_COLORS[Math.abs(hash) % CONTACT_AVATAR_COLORS.length] || 'bg-blue-500';
}

interface ExternalContact {
  name: string;
  company: string;
  role: string;
  email: string;
  phone: string;
  onCall: boolean;
  /** Number of certificates associated with this contact. */
  certificates?: number;
}

const DEFAULT_CONTACTS: ExternalContact[] = [
  { name: 'Zakaria TEGUIA', company: 'CHEOPS Technology', role: 'Responsable MSP', email: 'z.teguia@cheops.fr', phone: '', onCall: true, certificates: 2 },
  { name: 'Support CHEOPS', company: 'CHEOPS Technology', role: 'Support N1/N2', email: 'support@cheops.fr', phone: '', onCall: false, certificates: 1 },
  { name: 'ESET Support', company: 'ESET', role: 'Support antivirus', email: '', phone: '', onCall: false, certificates: 0 },
  { name: 'Fortinet TAC', company: 'Fortinet', role: 'Support FortiGate', email: 'tac@fortinet.com', phone: '', onCall: false, certificates: 3 },
];

const STORAGE_KEY = 'omnitech_custom_contacts';

function getStoredContacts(): ExternalContact[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveStoredContacts(contacts: ExternalContact[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(contacts));
}

export default function ExternalContactsPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [customContacts, setCustomContacts] = useState<ExternalContact[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState<ExternalContact>({ name: '', company: '', role: '', email: '', phone: '', onCall: false });

  useEffect(() => {
    setCustomContacts(getStoredContacts());
  }, []);

  const allContacts = useMemo(() => [...DEFAULT_CONTACTS, ...customContacts], [customContacts]);

  const companies = useMemo(() => {
    const set = new Set(allContacts.map((c) => c.company));
    return Array.from(set)
      .sort()
      .map((c) => ({ value: c, label: c }));
  }, [allContacts]);

  const filtered = useMemo(() => {
    return allContacts.filter((c) => {
      if (companyFilter && c.company !== companyFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${c.name} ${c.company} ${c.role} ${c.email}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [search, companyFilter, allContacts]);

  const handleAddContact = () => {
    if (!newContact.name.trim() || !newContact.company.trim()) {
      toast.error('Le nom et l\'entreprise sont requis');
      return;
    }
    const updated = [...customContacts, newContact];
    setCustomContacts(updated);
    saveStoredContacts(updated);
    setNewContact({ name: '', company: '', role: '', email: '', phone: '', onCall: false });
    setShowAddForm(false);
    toast.success('Contact ajouté');
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <PageHeader
        title={t('directory.contacts.title')}
        subtitle={t('directory.contacts.subtitle')}
        icon={Users}
        hub="work"
        actions={
          <div className="flex items-center gap-3">
            <Badge className="bg-primary/10 text-primary dark:bg-primary/20">
              {filtered.length} contact{filtered.length > 1 ? 's' : ''}
            </Badge>
            {isAdmin && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4" /> Ajouter un contact
              </Button>
            )}
          </div>
        }
      />

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-slate-700">
        <Link
          href="/directory"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
        >
          <Users className="h-4 w-4" />
          Annuaire
        </Link>
        <Link
          href="/directory/organigramme"
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white border-b-2 border-transparent hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
        >
          <GitBranchPlus className="h-4 w-4" />
          Organigramme
        </Link>
        <div className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-primary border-b-2 border-primary">
          <ExternalLink className="h-4 w-4" />
          Contacts externes
        </div>
      </div>

      {/* Add contact dialog */}
      {showAddForm && (
        <Card className="border-2 border-primary">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Nouveau contact externe</h3>
              <button onClick={() => setShowAddForm(false)} className="text-seal-gray-500 hover:text-seal-navy dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input label="Nom *" value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} placeholder="Prénom NOM" />
              <Input label="Entreprise *" value={newContact.company} onChange={e => setNewContact(c => ({ ...c, company: e.target.value }))} placeholder="Ex: CHEOPS Technology" />
              <Input label="Rôle" value={newContact.role} onChange={e => setNewContact(c => ({ ...c, role: e.target.value }))} placeholder="Ex: Support N1" />
              <Input label="Email" value={newContact.email} onChange={e => setNewContact(c => ({ ...c, email: e.target.value }))} placeholder="contact@example.com" />
              <Input label="Téléphone" value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} placeholder="+33 1 23 45 67 89" />
              <div className="flex items-center gap-2 self-end pb-1">
                <input type="checkbox" id="onCall" checked={newContact.onCall} onChange={e => setNewContact(c => ({ ...c, onCall: e.target.checked }))} className="rounded border-gray-300" />
                <label htmlFor="onCall" className="text-xs font-semibold text-seal-navy dark:text-white">Astreinte</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4 pt-3 border-t border-gray-100 dark:border-slate-700">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>Annuler</Button>
              <Button onClick={handleAddContact}>Ajouter</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Rechercher un contact, entreprise..."
              />
            </div>
            <div className="w-full md:w-56">
              <Select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                options={companies}
                placeholder="Toutes les entreprises"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contacts grid */}
      {filtered.length === 0 ? (
        <EmptyState
          type="users"
          title="Aucun contact trouvé"
          description="Essayez de modifier vos filtres de recherche."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((contact) => {
            const initials = contact.name
              .split(' ')
              .map((w) => w.charAt(0))
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const colorClass = getContactAvatarColor(contact.name);
            return (
              <Card
                key={`${contact.name}-${contact.company}`}
                className="hover:shadow-lg transition-shadow duration-200 dark:hover:shadow-slate-900/50"
              >
                <CardContent className="p-6">
                  <div className="flex flex-col items-center text-center gap-3">
                    {/* Avatar with on-call indicator */}
                    <div className="relative">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-medium ${colorClass}`}>
                        {initials}
                      </div>
                      {contact.onCall && (
                        <span
                          className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm"
                          title="On-call / Astreinte"
                        >
                          <PhoneCall className="h-3 w-3" />
                        </span>
                      )}
                    </div>

                    {/* Name */}
                    <h3 className="font-semibold text-seal-navy dark:text-white text-sm leading-tight">
                      {contact.name}
                    </h3>

                    {/* On-call badge */}
                    {contact.onCall && (
                      <Badge variant="success" className="text-[10px]">
                        Astreinte
                      </Badge>
                    )}

                    {/* Role */}
                    {contact.role && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                        {contact.role}
                      </p>
                    )}

                    {/* Company */}
                    <div className="flex items-center gap-1.5 text-xs text-seal-gray-500 dark:text-slate-400">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{contact.company}</span>
                    </div>

                    {/* Certificates badge */}
                    {(contact.certificates ?? 0) > 0 && (
                      <Link
                        href={`/admin/certificates?person=${encodeURIComponent(contact.name)}`}
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {contact.certificates} certificat{(contact.certificates ?? 0) > 1 ? 's' : ''}
                      </Link>
                    )}

                    {/* Email */}
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate max-w-full"
                        title={contact.email}
                      >
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </a>
                    )}

                    {/* Phone */}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="flex items-center gap-1.5 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-primary"
                      >
                        <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>{contact.phone}</span>
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
