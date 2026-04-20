'use client';

/**
 * Page Chat — embed Rocket.Chat dans une iframe plein écran.
 *
 * Configuration :
 *   - NEXT_PUBLIC_CHAT_URL = https://chat.omnitech-security.fr
 *   - Rocket.Chat doit avoir l'embedding autorisé depuis intranet.omnitech-security.fr
 *     (Admin → Général → iFrame Integration → Enable)
 *
 * SSO :
 *   - Après configuration LDAP côté Rocket.Chat, les utilisateurs sont
 *     auto-provisionnés et peuvent se connecter avec leurs identifiants AD.
 *   - Option future : OAuth2 via l'intranet pour login transparent.
 */
import { useEffect, useState } from 'react';
import { MessageSquare, ExternalLink, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL || '';

export default function ChatPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'loading' | 'ready' | 'unconfigured' | 'unreachable'>('loading');

  useEffect(() => {
    if (!CHAT_URL) {
      setStatus('unconfigured');
      return;
    }
    // Vérifie si le serveur Rocket.Chat répond
    fetch(`${CHAT_URL}/api/info`, { mode: 'no-cors' })
      .then(() => setStatus('ready'))
      .catch(() => setStatus('unreachable'));
  }, []);

  if (status === 'unconfigured') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl text-seal-navy dark:text-white">{t('chat.title')}</h1>
        </div>
        <section aria-label={t('chat.notConfigured')} className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {t('chat.notConfigured')}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Définissez <code>NEXT_PUBLIC_CHAT_URL</code> dans le <code>.env</code> frontend (ex:{' '}
              <code>https://chat.omnitech-security.fr</code>) puis rebuild + restart.
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
              Déploiement Rocket.Chat : voir <code>infra/rocketchat-compose.yml</code>.
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (status === 'unreachable') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h2 className="text-2xl text-seal-navy dark:text-white">{t('chat.title')}</h2>
        </div>
        <section aria-label={t('chat.serverUnreachable')} className="rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 p-4 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">
              {t('chat.serverUnreachable')}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              Vérifiez que Rocket.Chat est démarré et accessible à l'adresse {CHAT_URL}.
            </p>
            <a
              href={CHAT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-red-700 dark:text-red-300 underline"
            >
              Tester directement <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] -mx-4 -my-2 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-seal-navy dark:text-white">{t('chat.title')}</h2>
          <span className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
            Rocket.Chat
          </span>
        </div>
        <a
          href={CHAT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-primary"
        >
          Ouvrir dans un nouvel onglet <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe
        src={CHAT_URL}
        title="Rocket.Chat"
        className="flex-1 w-full border-0 bg-white dark:bg-slate-900"
        allow="microphone; camera; clipboard-read; clipboard-write; display-capture; autoplay"
      />
    </div>
  );
}
