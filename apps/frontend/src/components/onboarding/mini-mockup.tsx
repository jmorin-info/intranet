/**
 * Mini-mockups CSS pour le tour d'onboarding.
 *
 * Pas de screenshots externes à maintenir — chaque mockup est une petite
 * illustration en JSX/Tailwind qui évoque visuellement la feature présentée
 * sans chercher la ressemblance pixel-perfect. Dimensions contenues (~260x140)
 * pour tenir dans le modal.
 */
import React from 'react';
import {
  Search, MessageSquare, Inbox, Monitor, Shield, FileText, CheckCircle2,
  Clock, Lock, Tag, ChevronRight, Settings, Users, Send, Bell,
} from 'lucide-react';
import type { MockupKey } from './onboarding-steps';

interface MiniMockupProps {
  variant: MockupKey;
}

const frameClass =
  'relative w-full rounded-lg border border-gray-200 dark:border-slate-700 ' +
  'bg-gradient-to-br from-white to-gray-50 dark:from-slate-800 dark:to-slate-900 ' +
  'overflow-hidden shadow-sm';

export function MiniMockup({ variant }: MiniMockupProps) {
  switch (variant) {
    case 'sidebar-nav':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="flex h-full">
            {/* Rail */}
            <div className="w-8 bg-[#002640] flex flex-col items-center py-2 gap-1.5">
              <div className="h-5 w-5 rounded bg-[#F9964A]" />
              <div className="h-3 w-full" />
              <div className="h-4 w-4 rounded bg-white/30" />
              <div className="h-4 w-4 rounded bg-white/30" />
              <div className="h-4 w-4 rounded bg-[#F9964A]/80 ring-2 ring-[#F9964A]" />
              <div className="h-4 w-4 rounded bg-white/30" />
            </div>
            {/* Panel */}
            <div className="flex-1 p-2 space-y-1.5">
              <div className="h-2.5 w-2/3 rounded bg-gray-300 dark:bg-slate-600" />
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-2 w-5/6 rounded bg-[#F9964A]/40" />
              <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-2 w-4/6 rounded bg-gray-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      );

    case 'command-palette':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-x-6 top-3 bottom-3 rounded-lg bg-white dark:bg-slate-800 shadow-lg border border-gray-200 dark:border-slate-700 p-2">
            <div className="flex items-center gap-1.5 p-1.5 border-b border-gray-100 dark:border-slate-700">
              <Search className="h-3 w-3 text-gray-400 dark:text-slate-500" />
              <div className="h-1.5 w-20 rounded bg-gray-200 dark:bg-slate-600" />
              <kbd className="ml-auto text-[8px] px-1 py-0.5 rounded border border-gray-300 dark:border-slate-600 text-gray-500">⌘K</kbd>
            </div>
            <div className="mt-1.5 space-y-0.5">
              <div className="flex items-center gap-1.5 px-1.5 py-1 rounded bg-[#F9964A]/15">
                <FileText className="h-2.5 w-2.5 text-[#F9964A]" />
                <div className="h-1.5 flex-1 rounded bg-gray-300 dark:bg-slate-600" />
              </div>
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <Inbox className="h-2.5 w-2.5 text-gray-400 dark:text-slate-500" />
                <div className="h-1.5 w-3/4 rounded bg-gray-200 dark:bg-slate-700" />
              </div>
              <div className="flex items-center gap-1.5 px-1.5 py-1">
                <Users className="h-2.5 w-2.5 text-gray-400 dark:text-slate-500" />
                <div className="h-1.5 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
              </div>
            </div>
          </div>
        </div>
      );

    case 'chatbot':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 flex flex-col gap-1.5">
            <div className="flex justify-end">
              <div className="max-w-[70%] rounded-lg rounded-tr-sm bg-[#004469] px-2 py-1.5">
                <div className="h-1.5 w-20 rounded bg-white/80" />
                <div className="h-1.5 w-14 rounded bg-white/60 mt-1" />
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <div className="h-5 w-5 rounded-full bg-[#F9964A] flex items-center justify-center">
                <MessageSquare className="h-2.5 w-2.5 text-white" />
              </div>
              <div className="flex-1 rounded-lg rounded-tl-sm bg-gray-100 dark:bg-slate-700 px-2 py-1.5">
                <div className="h-1.5 w-full rounded bg-gray-300 dark:bg-slate-600" />
                <div className="h-1.5 w-5/6 rounded bg-gray-300 dark:bg-slate-600 mt-1" />
                <div className="h-1.5 w-2/3 rounded bg-gray-300 dark:bg-slate-600 mt-1" />
                <div className="mt-1.5 flex gap-1">
                  <span className="text-[7px] px-1 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600">📄 Wiki</span>
                  <span className="text-[7px] px-1 py-0.5 rounded-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-600">📄 Doc</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'profile-mfa':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-3 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[#004469] to-[#F9964A] flex items-center justify-center text-white font-semibold text-sm">
              JM
            </div>
            <div className="flex-1 space-y-1">
              <div className="h-2 w-32 rounded bg-gray-400 dark:bg-slate-500" />
              <div className="h-1.5 w-24 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="flex items-center gap-1 mt-1">
                <Lock className="h-2.5 w-2.5 text-emerald-500" />
                <span className="text-[8px] font-semibold text-emerald-600">MFA activé</span>
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500 ml-1" />
                <span className="text-[8px] font-semibold text-emerald-600">Charte signée</span>
              </div>
            </div>
          </div>
        </div>
      );

    case 'dashboard-widgets':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 grid grid-cols-3 grid-rows-2 gap-1.5">
            <div className="rounded bg-gradient-to-br from-[#F9964A]/20 to-[#F9964A]/5 p-1.5">
              <div className="h-1.5 w-1/2 rounded bg-gray-300 dark:bg-slate-600" />
              <div className="text-[10px] font-bold text-[#F9964A] mt-1">82%</div>
            </div>
            <div className="rounded bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 p-1.5">
              <div className="h-1.5 w-1/2 rounded bg-gray-300 dark:bg-slate-600" />
              <div className="text-[10px] font-bold text-emerald-600 mt-1">↑ 12</div>
            </div>
            <div className="rounded bg-gradient-to-br from-blue-500/20 to-blue-500/5 p-1.5">
              <div className="h-1.5 w-1/2 rounded bg-gray-300 dark:bg-slate-600" />
              <div className="text-[10px] font-bold text-blue-600 mt-1">34</div>
            </div>
            <div className="col-span-2 rounded bg-white dark:bg-slate-800 p-1.5 border border-gray-200 dark:border-slate-700">
              <div className="h-1.5 w-1/3 rounded bg-gray-300 dark:bg-slate-600 mb-1" />
              <div className="flex gap-0.5 items-end h-6">
                {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-[#004469]" style={{ height: `${h}%` }} />
                ))}
              </div>
            </div>
            <div className="rounded bg-gradient-to-br from-purple-500/20 to-purple-500/5 p-1.5">
              <div className="h-1.5 w-1/2 rounded bg-gray-300 dark:bg-slate-600" />
              <div className="text-[10px] font-bold text-purple-600 mt-1">4.7/5</div>
            </div>
          </div>
        </div>
      );

    case 'document-workflow':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-3 flex items-center justify-between">
            {['Brouillon', 'En revue', 'Validé', 'Publié'].map((label, i) => {
              const isDone = i < 2;
              const isCurrent = i === 2;
              return (
                <React.Fragment key={label}>
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={
                        'h-6 w-6 rounded-full flex items-center justify-center ' +
                        (isDone
                          ? 'bg-emerald-500'
                          : isCurrent
                          ? 'bg-[#F9964A] ring-4 ring-[#F9964A]/30'
                          : 'bg-gray-200 dark:bg-slate-700')
                      }
                    >
                      {isDone && <CheckCircle2 className="h-3 w-3 text-white" />}
                    </div>
                    <span className={`text-[9px] font-semibold ${isDone ? 'text-emerald-600' : isCurrent ? 'text-[#F9964A]' : 'text-gray-400 dark:text-slate-500'}`}>
                      {label}
                    </span>
                  </div>
                  {i < 3 && <div className="flex-1 h-0.5 mx-1 bg-gradient-to-r from-emerald-500 to-gray-200 dark:to-slate-700" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      );

    case 'ticket-hub':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 grid grid-cols-2 gap-1.5">
            {[
              { label: 'IT', color: 'bg-blue-500', icon: Monitor },
              { label: 'Sécurité', color: 'bg-red-500', icon: Shield },
              { label: 'Services G.', color: 'bg-emerald-500', icon: Inbox },
              { label: 'Général', color: 'bg-[#F9964A]', icon: Tag },
            ].map((space) => (
              <div key={space.label} className="rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-1.5 flex items-center gap-1.5">
                <div className={`h-6 w-6 rounded ${space.color} flex items-center justify-center flex-shrink-0`}>
                  <space.icon className="h-3 w-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-semibold text-gray-700 dark:text-white">{space.label}</div>
                  <div className="h-1 w-3/4 rounded bg-gray-200 dark:bg-slate-700 mt-0.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'ticket-space-config':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 space-y-1.5">
            <div className="flex items-center gap-1">
              <Settings className="h-2.5 w-2.5 text-gray-500 dark:text-slate-400" />
              <span className="text-[9px] font-semibold text-gray-700 dark:text-white">Catégories génériques</span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {['Incident', 'Demande', 'Accès', 'Matériel'].map((c, i) => (
                <div key={c} className={`text-[7px] px-1 py-0.5 rounded border text-center ${i < 3 ? 'border-[#F9964A] bg-[#F9964A]/10 text-[#F9964A]' : 'border-gray-200 dark:border-slate-700 text-gray-500'}`}>
                  {c}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[9px] font-semibold text-gray-700 dark:text-white">Catégories personnalisées</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <div className="text-[7px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 border border-blue-200 dark:border-blue-800">RMA</div>
              <div className="text-[7px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 border border-blue-200 dark:border-blue-800">Déploiement</div>
              <div className="text-[7px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 border border-blue-200 dark:border-blue-800">+ Ajouter</div>
            </div>
          </div>
        </div>
      );

    case 'wiki-editor':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 flex gap-1.5">
            <div className="w-1/4 space-y-1">
              <div className="h-1.5 w-full rounded bg-gray-300 dark:bg-slate-600" />
              <div className="h-1.5 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-1.5 w-4/6 rounded bg-[#F9964A]/60" />
              <div className="h-1.5 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-1.5 w-3/4 rounded bg-gray-200 dark:bg-slate-700" />
            </div>
            <div className="flex-1 bg-white dark:bg-slate-800 rounded p-1.5 space-y-1 border border-gray-200 dark:border-slate-700">
              <div className="h-2 w-3/4 rounded bg-gray-400 dark:bg-slate-500" />
              <div className="h-1.5 w-full rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-1.5 w-full rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-1.5 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
              <div className="h-1.5 w-full rounded bg-gray-200 dark:bg-slate-700" />
            </div>
          </div>
        </div>
      );

    case 'runbook-steps':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 space-y-1.5">
            {[
              { done: true, label: 'Vérifier la demande' },
              { done: true, label: 'Créer le compte AD' },
              { done: false, label: 'Configurer les groupes', active: true },
              { done: false, label: 'Créer la boîte mail' },
            ].map((step) => (
              <div key={step.label} className="flex items-center gap-1.5">
                <div className={`h-3 w-3 rounded border-2 flex-shrink-0 flex items-center justify-center ${step.done ? 'bg-emerald-500 border-emerald-500' : step.active ? 'border-[#F9964A] ring-2 ring-[#F9964A]/30' : 'border-gray-300 dark:border-slate-600'}`}>
                  {step.done && <CheckCircle2 className="h-2 w-2 text-white" />}
                </div>
                <div className={`h-1.5 flex-1 rounded ${step.done ? 'bg-emerald-100 dark:bg-emerald-900/30' : step.active ? 'bg-[#F9964A]/20' : 'bg-gray-200 dark:bg-slate-700'}`} />
              </div>
            ))}
            <div className="mt-1 h-1 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-[#F9964A] rounded-full" style={{ width: '50%' }} />
            </div>
          </div>
        </div>
      );

    case 'veille-feed':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 space-y-1">
            {[
              { sev: 'bg-red-500', source: 'CERT-FR', cve: 'CVE-2026-1234' },
              { sev: 'bg-amber-500', source: 'ANSSI', cve: null },
              { sev: 'bg-blue-500', source: 'CISA', cve: 'CVE-2026-4567' },
              { sev: 'bg-gray-400', source: 'BleepingC.', cve: null },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 p-1 rounded bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
                <div className={`h-1.5 w-1.5 rounded-full ${item.sev} flex-shrink-0`} />
                <div className="text-[8px] px-1 rounded bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300">{item.source}</div>
                <div className="h-1.5 flex-1 rounded bg-gray-200 dark:bg-slate-700" />
                {item.cve && <div className="text-[7px] text-red-500 font-mono">{item.cve}</div>}
              </div>
            ))}
          </div>
        </div>
      );

    case 'satisfaction-survey':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-3 space-y-1.5">
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-full rounded bg-gray-300 dark:bg-slate-600" />
            </div>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
            </div>
            <div className="flex items-center gap-0.5 mt-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <div key={s} className={`h-5 w-5 rounded ${s <= 4 ? 'bg-[#F9964A]' : 'bg-gray-200 dark:bg-slate-700'} flex items-center justify-center`}>
                  <span className="text-[10px] text-white">★</span>
                </div>
              ))}
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '78%' }} />
            </div>
            <div className="text-[8px] text-gray-500 dark:text-slate-400">78% très satisfaits</div>
          </div>
        </div>
      );

    case 'audit-log':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 space-y-1">
            {[
              { color: 'bg-blue-500', label: 'USER_CREATED' },
              { color: 'bg-emerald-500', label: 'DOC_APPROVED' },
              { color: 'bg-red-500', label: 'LOGIN_FAILED' },
              { color: 'bg-amber-500', label: 'ROLE_CHANGED' },
              { color: 'bg-blue-500', label: 'TICKET_CLOSED' },
            ].map((log, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[8px] font-mono">
                <Clock className="h-2 w-2 text-gray-400 dark:text-slate-500" />
                <span className="text-gray-500 dark:text-slate-400">10:3{i}</span>
                <span className={`px-1 rounded ${log.color} text-white`}>{log.label}</span>
                <div className="h-1 flex-1 rounded bg-gray-200 dark:bg-slate-700" />
              </div>
            ))}
          </div>
        </div>
      );

    case 'access-review':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 text-gray-500 dark:text-slate-400" />
                <span className="text-[9px] font-semibold">124 accès à revoir</span>
              </div>
              <span className="text-[8px] px-1 py-0.5 rounded bg-[#F9964A] text-white">T2 2026</span>
            </div>
            <div className="space-y-0.5">
              {[
                { action: 'Maintenu', color: 'text-emerald-600' },
                { action: 'Maintenu', color: 'text-emerald-600' },
                { action: 'Révoqué', color: 'text-red-500' },
                { action: 'En attente', color: 'text-amber-500' },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-1.5 p-1 rounded bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
                  <div className="h-3 w-3 rounded-full bg-gray-200 dark:bg-slate-600" />
                  <div className="h-1 flex-1 rounded bg-gray-200 dark:bg-slate-700" />
                  <span className={`text-[7px] font-semibold ${row.color}`}>{row.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'admin-hub':
      return (
        <div className={frameClass} style={{ aspectRatio: '16/9' }}>
          <div className="absolute inset-0 p-2 grid grid-cols-3 grid-rows-2 gap-1.5">
            {[
              { icon: Users, label: 'Users' },
              { icon: Inbox, label: 'Ticketing' },
              { icon: FileText, label: 'Docs' },
              { icon: Settings, label: 'Config' },
              { icon: Bell, label: 'Notifs' },
              { icon: Send, label: 'Sync' },
            ].map((tile, i) => (
              <div key={i} className="flex flex-col items-center justify-center gap-0.5 rounded bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-1">
                <tile.icon className="h-3 w-3 text-[#004469] dark:text-blue-400" />
                <span className="text-[8px] font-semibold text-gray-700 dark:text-slate-300">{tile.label}</span>
              </div>
            ))}
          </div>
        </div>
      );

    default:
      return null;
  }
}
