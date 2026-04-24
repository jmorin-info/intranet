'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { features } from '@/lib/features';
import { useTranslation } from '@/lib/i18n';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import { Card, Button } from '@omnitech/ui';
import {
  Bot, Send, User, Ticket, ExternalLink, Copy, Check,
  Search, HelpCircle, KeyRound, Shield, Monitor,
  MessageSquare, Wifi, Wrench, BookOpen, ChevronDown, ChevronUp, Trash2,
  ThumbsUp, ThumbsDown, Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { getInitials } from '@/lib/utils';
import {
  detectIntent,
  getContextualSuggestions,
  loadHistory,
  saveHistory,
  clearHistory,
  normalizeRagScore,
  confidenceLabel,
  type SerializedMessage,
} from './helpdesk-chat-utils';

interface KBArticle {
  keywords: string[];
  question: string;
  answer: string;
  actions?: Array<{ label: string; href?: string; action?: string }>;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: Array<{ label: string; href?: string; action?: string }>;
  suggestions?: string[];
  ragScore?: number;
  source?: 'kb' | 'rag' | 'intent' | 'fallback';
}

const quickActions = [
  {
    label: 'Créer un ticket',
    icon: Ticket,
    href: '/tickets?create=true',
    color: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20',
    iconColor: 'text-blue-500',
  },
  {
    label: 'Réinitialiser mot de passe',
    icon: KeyRound,
    href: '/tickets?create=true&category=password_reset',
    color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20',
    iconColor: 'text-amber-500',
  },
  {
    label: 'Demander accès VPN',
    icon: Shield,
    href: '/tickets?create=true&category=vpn_access',
    color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20',
    iconColor: 'text-emerald-500',
  },
  {
    label: 'Problème matériel',
    icon: Monitor,
    href: '/tickets?create=true&category=hardware',
    color: 'bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/20',
    iconColor: 'text-red-500',
  },
];

const faqCategories: Record<string, { icon: typeof HelpCircle; color: string }> = {
  default: { icon: HelpCircle, color: 'border-l-blue-500' },
  reseau: { icon: Wifi, color: 'border-l-emerald-500' },
  materiel: { icon: Wrench, color: 'border-l-amber-500' },
  logiciel: { icon: BookOpen, color: 'border-l-purple-500' },
};

export function HelpdeskChat() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const userInitials = user ? getInitials(user.firstName || '', user.lastName || '') : 'U';
  const [knowledgeBase, setKnowledgeBase] = useState<KBArticle[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllFaq, setShowAllFaq] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    api.get('/helpdesk/kb').then(({ data }) => setKnowledgeBase(Array.isArray(data) ? data : data?.data || [])).catch((err) => logger.error(err, { component: 'HelpdeskChat', context: 'load kb' }));
  }, []);

  function findBestMatch(query: string, kb: KBArticle[]): { answer: string; confidence: number; question: string; actions?: Array<{ label: string; href?: string; action?: string }> } | null {
    if (!query.trim() || kb.length === 0) return null;

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return null;

    let bestMatch: { article: KBArticle; score: number } | null = null;

    for (const article of kb) {
      let score = 0;
      const allKeywords = (article.keywords || []).map(k => k.toLowerCase());

      for (const word of queryWords) {
        if (allKeywords.some(k => k === word)) score += 10;
        else if (allKeywords.some(k => k.includes(word) || word.includes(k))) score += 5;
        else if (article.question.toLowerCase().includes(word)) score += 2;
        else if (article.answer.toLowerCase().includes(word)) score += 1;
      }

      const normalizedScore = score / queryWords.length;

      if (!bestMatch || normalizedScore > bestMatch.score) {
        bestMatch = { article, score: normalizedScore };
      }
    }

    if (bestMatch && bestMatch.score >= 3) {
      const confidence = Math.min(100, Math.round(bestMatch.score * 10));
      return { answer: bestMatch.article.answer, confidence, question: bestMatch.article.question, actions: bestMatch.article.actions };
    }

    return null;
  }

  function getFollowUpSuggestions(query: string, kb: KBArticle[]): string[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    return kb
      .filter(a => a.question.toLowerCase() !== query.toLowerCase())
      .filter(a => queryWords.some(w => a.keywords.some(k => k.toLowerCase().includes(w)) || a.question.toLowerCase().includes(w)))
      .slice(0, 3)
      .map(a => a.question);
  }

  async function findAnswer(query: string): Promise<Message> {
    // ----- 1. Intent detection (priority) -----
    const intent = detectIntent(query);
    if (intent && intent.terminal) {
      return {
        role: 'assistant',
        content: intent.response,
        timestamp: new Date(),
        actions: intent.actions,
        suggestions: intent.suggestions,
        source: 'intent',
      };
    }

    // ----- 2. Local KB match -----
    const result = findBestMatch(query, knowledgeBase);
    if (result) {
      const confLabel = result.confidence >= 80 ? 'Confiance elevee' : result.confidence >= 50 ? 'Confiance moyenne' : 'Suggestion';
      // Contextual follow-ups first, then KB-based
      const followUps = getContextualSuggestions(query);
      const kbFollowUps = getFollowUpSuggestions(query, knowledgeBase);
      const allSuggestions = [...new Set([...followUps, ...kbFollowUps])].slice(0, 3);

      // Merge intent suggestions if we had a non-terminal intent
      const intentSuggestions = intent ? intent.suggestions : [];
      const mergedSuggestions = [...new Set([...allSuggestions, ...intentSuggestions])].slice(0, 3);

      return {
        role: 'assistant',
        content: `**${result.question}**\n\n${result.answer}\n\n_${confLabel} (${result.confidence}%)_`,
        timestamp: new Date(),
        actions: result.actions,
        suggestions: mergedSuggestions.length > 0 ? mergedSuggestions : knowledgeBase.filter(a => a.question !== result.question).slice(0, 2).map(a => a.question),
        source: 'kb',
      };
    }

    // ----- 3. RAG search (preferred over /ai/search) -----
    if (features.ai) {
      try {
        const { data: ragData } = await api.post('/rag/ask', { question: query });
        if (ragData.sources && ragData.sources.length > 0) {
          const score = normalizeRagScore(ragData.sources);
          const ragActions: Array<{ label: string; href?: string }> = [];

          // Build source links from RAG results
          for (const src of ragData.sources.slice(0, 5) as Array<{ sourceType: string; sourceId: string; snippet: string; score: number }>) {
            const typeLabel: Record<string, string> = { DOCUMENT: 'Document', WIKI: 'Wiki', PROCEDURE: 'Procedure', RUNBOOK: 'Runbook', FAQ: 'FAQ' };
            const label = typeLabel[src.sourceType] || src.sourceType;
            let href: string | undefined;
            if (src.sourceType === 'DOCUMENT') href = `/documents/${src.sourceId}`;
            else if (src.sourceType === 'WIKI') href = `/wiki/${src.sourceId}`;
            if (href) {
              ragActions.push({ label: `${label} — ${src.snippet.substring(0, 60)}...`, href });
            }
          }
          ragActions.push({ label: 'Créer un ticket IT', href: '/tickets?create=true' });

          const contextSuggestions = getContextualSuggestions(query);
          const intentSugs = intent ? intent.suggestions : [];
          const suggestions = [...new Set([...contextSuggestions, ...intentSugs])].slice(0, 3);

          return {
            role: 'assistant',
            content: ragData.answer,
            timestamp: new Date(),
            actions: ragActions,
            suggestions: suggestions.length > 0 ? suggestions : knowledgeBase.slice(0, 3).map(a => a.question),
            ragScore: score,
            source: 'rag',
          };
        }
      } catch {
        // RAG failed, fall through to AI search
      }

      // ----- 4. Fallback: /ai/search -----
      try {
        const { data: aiData } = await api.get('/ai/search', { params: { q: query } });
        const aiActions: Array<{ label: string; href?: string }> = [];
        if (aiData.documents?.length > 0) {
          aiData.documents.slice(0, 2).forEach((doc: { id: string; title: string }) => {
            aiActions.push({ label: `${doc.title}`, href: `/documents/${doc.id}` });
          });
        }
        if (aiData.wiki?.length > 0) {
          aiData.wiki.slice(0, 2).forEach((page: { title: string }) => {
            aiActions.push({ label: `${page.title}`, href: `/wiki?search=${encodeURIComponent(page.title)}` });
          });
        }
        if (aiData.tickets?.length > 0) {
          aiData.tickets.slice(0, 2).forEach((ticket: { id: string; reference: string; title: string }) => {
            aiActions.push({ label: `${ticket.reference} -- ${ticket.title}`, href: `/tickets/${ticket.id}` });
          });
        }
        if (aiActions.length > 0) {
          aiActions.push({ label: 'Créer un ticket IT', href: '/tickets?create=true' });
          const sourceCount = [aiData.documents?.length > 0, aiData.wiki?.length > 0, aiData.tickets?.length > 0].filter(Boolean).length;
          return {
            role: 'assistant',
            content: `Je n'ai pas trouve de reponse exacte dans la base de connaissances, mais j'ai trouve ces ressources qui pourraient vous aider (${sourceCount} source${sourceCount > 1 ? 's' : ''} consultee${sourceCount > 1 ? 's' : ''}) :`,
            timestamp: new Date(),
            actions: aiActions,
            suggestions: aiData.suggestions?.length > 0 ? aiData.suggestions : knowledgeBase.slice(0, 3).map(a => a.question),
            source: 'fallback',
          };
        }
      } catch {
        // AI search failed, fall through to default
      }
    }

    // ----- 5. Nothing found -----
    const suggestions = knowledgeBase.slice(0, 3).map(a => a.question);
    const suggestionsText = suggestions.length > 0
      ? `\n\nVoici quelques questions frequentes qui pourraient vous aider :\n${suggestions.map((q, i) => `  ${i + 1}. ${q}`).join('\n')}`
      : '';

    return {
      role: 'assistant',
      content: `Je n'ai pas trouvé de réponse précise à votre question dans ma base de connaissances.${suggestionsText}\n\nSi votre problème persiste, je vous recommande de **créer un ticket IT** pour obtenir une assistance personnalisée de l'équipe support.`,
      timestamp: new Date(),
      actions: [
        { label: 'Créer un ticket IT', href: '/tickets' },
        { label: 'Consulter le wiki', href: '/wiki' },
        { label: t('helpdesk.fallbackSelfService'), href: '/helpdesk?tab=selfservice' },
      ],
      suggestions: knowledgeBase.slice(0, 3).map(a => a.question),
      source: 'fallback',
    };
  }

  // Restore conversation from localStorage on mount
  const [messages, setMessages] = useState<Message[]>(() => {
    const stored = loadHistory();
    if (stored.length > 0) {
      return stored.map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
    }
    return [{ role: 'assistant', content: t('helpdesk.greeting'), timestamp: new Date() }];
  });
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copied, setCopied] = useState(false);
  // feedback: maps message index -> 'helpful' | 'unhelpful'
  const [feedback, setFeedback] = useState<Record<number, 'helpful' | 'unhelpful'>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    const serialized: SerializedMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
      actions: m.actions,
      suggestions: m.suggestions,
      ragScore: m.ragScore,
      source: m.source,
    }));
    saveHistory(serialized);
  }, [messages]);

  const handleFeedback = (msgIndex: number, value: 'helpful' | 'unhelpful') => {
    setFeedback(prev => ({ ...prev, [msgIndex]: value }));
    if (value === 'helpful') {
      toast.success('Merci pour votre retour !');
    } else {
      toast('Désolé que la réponse n\'ait pas été utile. Vous pouvez créer un ticket pour obtenir de l\'aide.');
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: 'user', content: input.trim(), timestamp: new Date() };
    const query = input.trim();
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    setShowChat(true);
    setTimeout(async () => {
      const answer = await findAnswer(query);
      setMessages(prev => [...prev, answer]);
      setIsTyping(false);
    }, 500);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const handleExportConversation = () => {
    const text = messages
      .map((m) => `[${formatTime(m.timestamp)}] ${m.role === 'user' ? 'Moi' : 'Assistant IT'}: ${m.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Conversation copiée dans le presse-papiers');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCreateTicket = () => {
    const lastMessage = messages.filter(m => m.role === 'user').pop();
    const subject = lastMessage?.content?.substring(0, 100) || '';
    router.push(`/tickets?create=true&subject=${encodeURIComponent(subject)}`);
  };

  const handleClearConversation = () => {
    setMessages([{ role: 'assistant', content: t('helpdesk.greeting'), timestamp: new Date() }]);
    clearHistory();
    setFeedback({});
    toast.success('Conversation reinitialisee');
  };

  const handleFaqClick = (article: KBArticle) => {
    setInput(article.question);
    setShowChat(true);
    // Auto-send the question
    const userMsg: Message = { role: 'user', content: article.question, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    setTimeout(async () => {
      const answer = await findAnswer(article.question);
      setMessages(prev => [...prev, answer]);
      setIsTyping(false);
    }, 500);
    setInput('');
  };

  // Filter FAQ based on search
  const filteredFaq = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return knowledgeBase;
    return knowledgeBase.filter(article =>
      article.question.toLowerCase().includes(q) ||
      article.keywords.some(k => k.toLowerCase().includes(q))
    );
  }, [knowledgeBase, searchQuery]);

  const displayedFaq = useMemo(
    () => (showAllFaq ? filteredFaq : filteredFaq.slice(0, 6)),
    [showAllFaq, filteredFaq],
  );

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-seal-gray-500 dark:text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && searchQuery.trim()) {
              setInput(searchQuery);
              handleSend();
              setSearchQuery('');
            }
          }}
          placeholder="Rechercher dans la base de connaissances..."
          className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-12 pr-4 py-3.5 text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 dark:placeholder:text-slate-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-sm"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-3 uppercase tracking-wide">Actions rapides</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={`flex flex-col items-center gap-2 rounded-xl border border-gray-100 dark:border-slate-700 p-4 text-center transition-all duration-200 ${action.color} hover:shadow-md`}
            >
              <action.icon className={`h-6 w-6 ${action.iconColor}`} />
              <span className="text-xs font-semibold">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      {filteredFaq.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-seal-navy dark:text-white mb-3 uppercase tracking-wide">
            Questions fréquentes
            <span className="ml-2 text-xs font-normal text-seal-gray-500 dark:text-slate-400">
              ({filteredFaq.length} article{filteredFaq.length > 1 ? 's' : ''})
            </span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedFaq.map((article, i) => (
              <button
                key={i}
                onClick={() => handleFaqClick(article)}
                className="text-left p-4 rounded-xl bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 hover:border-primary/30 hover:shadow-md transition-all duration-200 group"
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition">
                    <HelpCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-seal-navy dark:text-white line-clamp-2">{article.question}</p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{article.answer.substring(0, 100)}...</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
          {filteredFaq.length > 6 && (
            <div className="text-center mt-3">
              <button
                onClick={() => setShowAllFaq(!showAllFaq)}
                className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition"
              >
                {showAllFaq ? (
                  <>Voir moins <ChevronUp className="h-4 w-4" /></>
                ) : (
                  <>Voir les {filteredFaq.length - 6} autres questions <ChevronDown className="h-4 w-4" /></>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat Section */}
      <div>
        {!showChat ? (
          <button
            onClick={() => setShowChat(true)}
            className="w-full"
          >
            <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <div className="bg-gradient-to-r from-[#004469] to-[#003352] rounded-t-xl px-4 py-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">Assistant IT OMNITECH</p>
                  <p className="text-[10px] text-white/50">Cliquez pour ouvrir le chat — Base de connaissances : {knowledgeBase.length} articles</p>
                </div>
                <MessageSquare className="h-5 w-5 text-white/40 ml-auto" />
              </div>
            </Card>
          </button>
        ) : (
          <Card className="overflow-hidden">
            {/* Chat header */}
            <div className="bg-gradient-to-r from-[#004469] to-[#003352] rounded-t-xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Assistant IT OMNITECH</p>
                  <p className="text-[10px] text-white/50">En ligne — Base de connaissances : {knowledgeBase.length} articles</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages.length > 1 && (
                  <>
                    <button
                      onClick={handleExportConversation}
                      className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition"
                      title="Copier la conversation"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copié' : 'Exporter'}
                    </button>
                    <button
                      onClick={handleClearConversation}
                      className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500/40 transition"
                      title="Effacer la conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Effacer
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowChat(false)}
                  className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  Réduire
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="h-[500px] overflow-y-auto p-6 space-y-4 bg-gray-50 dark:bg-slate-900">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`} style={msg.role === 'assistant' && i > 0 ? { animation: 'helpdeskSlideIn 0.4s ease-out' } : undefined}>
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className="max-w-[80%] space-y-2">
                    <div className={`rounded-xl p-3 ${msg.role === 'user' ? 'bg-primary text-white' : 'bg-[#f0f7fb] dark:bg-slate-800/80 border border-[#004469]/10 dark:border-slate-700'}`}>
                      {/* RAG confidence badge */}
                      {msg.source === 'rag' && msg.ragScore != null && (
                        <div className="flex items-center gap-1.5 mb-2">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${confidenceLabel(msg.ragScore).color}`}>
                            {confidenceLabel(msg.ragScore).text} ({msg.ragScore}%)
                          </span>
                          <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">Source : base de connaissances</span>
                        </div>
                      )}
                      <p className={`text-sm whitespace-pre-wrap ${msg.role === 'assistant' ? 'text-seal-navy dark:text-white' : ''}`}>{msg.content}</p>
                      {msg.actions && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {msg.actions.map((a, j) => a.href ? (
                            a.href.startsWith('http') ? (
                              <a key={j} href={a.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20">
                                {a.label} <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <a key={j} href={a.href} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20">
                                {a.label}
                              </a>
                            )
                          ) : null)}
                        </div>
                      )}
                      <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-white/50' : 'text-seal-gray-500/70 dark:text-slate-500'}`}>{formatTime(msg.timestamp)}</p>
                    </div>
                    {/* Suggested follow-up questions */}
                    {msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && (
                      <div className="space-y-1.5" style={{ animation: 'helpdeskSlideIn 0.5s ease-out 0.2s both' }}>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 font-medium uppercase tracking-wide">Questions similaires</p>
                        {msg.suggestions.map((sq, si) => (
                          <button
                            key={si}
                            onClick={() => {
                              const userMsg: Message = { role: 'user', content: sq, timestamp: new Date() };
                              setMessages(prev => [...prev, userMsg]);
                              setIsTyping(true);
                              setTimeout(async () => {
                                const answer = await findAnswer(sq);
                                setMessages(prev => [...prev, answer]);
                                setIsTyping(false);
                              }, 500);
                            }}
                            className="block w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 text-xs text-seal-navy dark:text-white hover:border-primary/30 hover:bg-primary/5 transition-all duration-200"
                          >
                            {sq}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* "Was this helpful?" feedback — shown on assistant messages after the first greeting */}
                    {msg.role === 'assistant' && i > 0 && (
                      <div className="flex items-center gap-2 pt-1" style={{ animation: 'helpdeskSlideIn 0.5s ease-out 0.3s both' }}>
                        {feedback[i] ? (
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 italic">
                            {feedback[i] === 'helpful' ? 'Merci pour votre retour !' : 'Retour enregistré — pensez à créer un ticket si nécessaire.'}
                          </p>
                        ) : (
                          <>
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 font-medium">Cette réponse vous a aidé ?</p>
                            <button
                              onClick={() => handleFeedback(i, 'helpful')}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition"
                              title="Oui, c'était utile"
                            >
                              <ThumbsUp className="h-3 w-3" /> Oui
                            </button>
                            <button
                              onClick={() => handleFeedback(i, 'unhelpful')}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                              title="Non, pas utile"
                            >
                              <ThumbsDown className="h-3 w-3" /> Non
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-full bg-[#004469] flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-[11px] font-semibold text-white">{userInitials}</span>
                    </div>
                  )}
                </div>
              ))}
              {messages.length <= 1 && knowledgeBase.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center mb-3">Questions fréquentes :</p>
                  {knowledgeBase.slice(0, 5).map((article, i) => (
                    <button key={i}
                      onClick={() => { setInput(article.question); }}
                      className="w-full text-left p-2 rounded-lg bg-gray-50 dark:bg-slate-800 hover:bg-primary/5 transition text-xs text-seal-navy dark:text-white">
                      {article.question}
                    </button>
                  ))}
                </div>
              )}
              {isTyping && (
                <div className="flex gap-1 px-4 py-2">
                  <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl px-4 py-3 flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-seal-gray-400/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 rounded-full bg-seal-gray-400/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 rounded-full bg-seal-gray-400/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input + Create ticket */}
            <div className="p-4 border-t border-gray-200 dark:border-slate-700 space-y-2">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder={t('helpdesk.placeholder')}
                  rows={2}
                  autoFocus
                  className="flex-1 rounded-xl border border-gray-300 dark:border-slate-600 px-4 py-3 text-sm bg-white dark:bg-slate-800 text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none shadow-sm transition-all duration-200"
                />
                <Button onClick={handleSend} disabled={!input.trim()} className="h-[52px] px-5 rounded-xl shadow-sm">
                  <Send className="h-4 w-4" />
                  <span className="ml-1.5 font-medium">Envoyer</span>
                </Button>
              </div>
              {messages.length > 1 && (
                <Button variant="outline" size="sm" className="w-full" onClick={handleCreateTicket}>
                  <Ticket className="h-3 w-3" /> {t('helpdesk.createTicket')}
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
