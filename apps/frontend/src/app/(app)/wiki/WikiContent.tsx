'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Badge,
  SearchInput,
  EmptyState,
  Button,
  Dialog,
  Input,
  Select,
  ConfirmDialog,
} from '@omnitech/ui';
import {
  BookOpen,
  Plus,
  Edit,
  Save,
  ArrowLeft,
  Filter,
  User,
  Clock,
  Trash2,
  Link2,
  ImageIcon,
  Settings,
  X,
  Lock,
  History,
  RotateCcw,
  Share2,
  Users,
  Shield,
  Code,
  FileText,
  HelpCircle,
  GraduationCap,
  Briefcase,
  Maximize2,
  Minimize2,
  Printer,
  Type,
  ChevronRight,
  Home,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  Star,
  ArrowRight,
  CheckCircle2,
  LayoutGrid,
  FolderOpen,
  ChevronDown,
  Check,
  Copy,
  Search,
  Undo2,
  Redo2,
  Minus,
  Quote,
  Table,
  Highlighter,
  Palette,
  CodeSquare,
  Paperclip,
  Eye,
  Clipboard,
  FileSpreadsheet,
  FileImage,
  Sparkles,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';
import { formatRelativeTime } from '@/lib/utils';
import DOMPurify from 'dompurify';
import { BookmarkButton } from '@/components/bookmark-button';
import { WikiOutline, extractOutline } from '@/components/wiki/wiki-outline';
import { WikiBacklinks } from '@/components/wiki/wiki-backlinks';
import { CategoryDndView } from '@/components/wiki/category-dnd-view';
import {
  WikiSlashMenu,
  useSlashMenu,
  type SlashCommand,
} from '@/components/wiki/wiki-slash-menu';
import { RichTextEditor } from '@/components/editor/rich-text-editor';

type WikiVisibility = 'PRIVATE' | 'DEPARTMENT' | 'ROLE' | 'PUBLIC';

interface WikiPage {
  id: string;
  title: string;
  slug: string;
  content?: string;
  category: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  author: { id: string; firstName: string; lastName: string };
  visibility?: WikiVisibility;
  ownerDepartmentId?: string | null;
  allowedRoles?: string[];
  collaborators?: string[];
  editLockUserId?: string | null;
  editLockExpiresAt?: string | null;
}

interface WikiVersion {
  id: string;
  title: string;
  authorId: string;
  changeLog: string | null;
  createdAt: string;
  author?: { id: string; firstName: string; lastName: string } | null;
}

interface LockStatus {
  locked?: boolean;
  success?: boolean;
  expiresAt?: string;
  by?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
}

const CATEGORY_ALL = 'Tous';
const SCOPE_ALL = 'all';
const SCOPE_MINE = 'mine';
type ScopeFilter = typeof SCOPE_ALL | typeof SCOPE_MINE;

const VISIBILITY_LABELS: Record<WikiVisibility, string> = {
  PRIVATE: '\uD83D\uDD12 Priv\u00e9',
  DEPARTMENT: '\uD83C\uDFE2 D\u00e9partement',
  ROLE: '\uD83D\uDC65 R\u00f4le',
  PUBLIC: '\uD83C\uDF10 Public',
};

const VISIBILITY_DESCRIPTIONS: Record<WikiVisibility, string> = {
  PRIVATE: 'Visible uniquement par moi',
  DEPARTMENT: 'Mon d\u00e9partement uniquement',
  ROLE: 'Certains r\u00f4les s\u00e9lectionn\u00e9s',
  PUBLIC: 'Tous les utilisateurs de l\u0027entreprise',
};

const VISIBILITY_BADGE: Record<WikiVisibility, 'navy' | 'draft' | 'success' | 'warning'> = {
  PRIVATE: 'draft',
  DEPARTMENT: 'navy',
  ROLE: 'warning',
  PUBLIC: 'success',
};

const ALL_ROLES = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'DIRECTION', label: 'Direction' },
  { value: 'REVIEWER', label: 'Réviseur' },
  { value: 'COLLABORATEUR', label: 'Collaborateur' },
  { value: 'AUDITEUR', label: 'Auditeur' },
  { value: 'PRESTATAIRE', label: 'Prestataire' },
] as const;

interface DirectoryUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

// --- Wiki page templates for first-time empty state ---
interface WikiTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
  icon: React.ElementType;
  content: string;
}

const WIKI_TEMPLATES: WikiTemplate[] = [
  {
    id: 'getting-started',
    title: 'Guide de démarrage',
    description: 'Documentez les premières étapes d\'un nouvel arrivant ou utilisateur.',
    category: 'Onboarding',
    icon: GraduationCap,
    content: `<h2>Bienvenue</h2><p>Présentez brièvement le contexte et l'objectif de ce guide.</p><h2>Prérequis</h2><ul><li>Compte utilisateur actif</li><li>Accès au VPN</li></ul><h2>Étapes</h2><ol><li>Première action</li><li>Deuxième action</li><li>Troisième action</li></ol><h2>Pour aller plus loin</h2><p>Listez les liens utiles.</p>`,
  },
  {
    id: 'procedure',
    title: 'Procédure interne',
    description: 'Décrivez une procédure métier étape par étape.',
    category: 'Procédures',
    icon: Briefcase,
    content: `<h2>Objet</h2><p>Décrivez l'objectif de la procédure.</p><h2>Champ d'application</h2><p>Qui est concerné et dans quelles situations.</p><h2>Étapes détaillées</h2><ol><li>Étape 1 — description</li><li>Étape 2 — description</li></ol><h2>Points de contrôle</h2><ul><li>Critère 1</li><li>Critère 2</li></ul><h2>Références</h2><p>Documents associés, normes ISO, etc.</p>`,
  },
  {
    id: 'faq',
    title: 'FAQ',
    description: 'Regroupez les questions fréquemment posées et leurs réponses.',
    category: 'FAQ',
    icon: HelpCircle,
    content: `<h2>Question 1 ?</h2><p>Réponse détaillée à la première question.</p><h2>Question 2 ?</h2><p>Réponse détaillée à la deuxième question.</p><h2>Question 3 ?</h2><p>Réponse détaillée à la troisième question.</p>`,
  },
  {
    id: 'glossary',
    title: 'Glossaire',
    description: 'Définissez les termes, acronymes et concepts clés.',
    category: 'Référence',
    icon: BookOpen,
    content: `<h2>A</h2><p><strong>Acronyme</strong> — définition claire du terme.</p><h2>B</h2><p><strong>Terme</strong> — définition du terme.</p><h2>C</h2><p><strong>Concept</strong> — explication du concept.</p>`,
  },
];

// --- Category icon mapping ---
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  onboarding: GraduationCap,
  procédures: Briefcase,
  procedures: Briefcase,
  faq: HelpCircle,
  référence: BookOpen,
  reference: BookOpen,
  sécurité: Shield,
  securite: Shield,
  security: Shield,
  rh: Users,
  tech: Code,
  technique: Code,
  dev: Code,
  développement: Code,
  documentation: FileText,
};

function getCategoryIcon(category: string | null | undefined): React.ElementType {
  if (!category) return BookOpen;
  return CATEGORY_ICONS[category.toLowerCase()] ?? BookOpen;
}

/** Infer import source from category name (Caramel / Notion / null). */
function getImportSource(category: string | null | undefined): 'Caramel' | 'Notion' | null {
  if (!category) return null;
  const lower = category.toLowerCase();
  if (lower.includes('admin sys') || lower.includes('notes')) return 'Notion';
  if (lower.includes('clients') || lower.includes('téléphonie') || lower.includes('telephonie')) return 'Caramel';
  return null;
}

const CATEGORY_COLORS = [
  '#F9964A', // seal-orange
  '#296DC1', // seal-blue
  '#006233', // seal-green
  '#892034', // seal-bordeaux
  '#6b7280', // gray
  '#0a2540', // navy
];

function getCategoryColor(category: string | null | undefined): string {
  if (!category) return CATEGORY_COLORS[0]!;
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) | 0;
  return CATEGORY_COLORS[Math.abs(hash) % CATEGORY_COLORS.length]!;
}

function computeReadingTime(html: string): number {
  const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = plain ? plain.split(' ').length : 0;
  return Math.max(1, Math.round(words / 200));
}

function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

type ReadingSize = 'sm' | 'md' | 'lg';
type ListViewMode = 'grid' | 'category';

/** Highlight search term in text by wrapping matches in <mark> */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  if (parts.length <= 1) return text;
  return parts.map((part, i) =>
    regex.test(part)
      ? React.createElement('mark', { key: i, className: 'bg-yellow-200 dark:bg-yellow-700/50 text-inherit rounded-sm px-0.5' }, part)
      : part,
  );
}

/** Compute fuzzy relevance score for search suggestions */
function searchScore(title: string, query: string, content?: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  // Check individual words
  const words = q.split(/\s+/);
  let score = 0;
  for (const w of words) {
    if (t.includes(w)) score += 30;
  }
  // Also match content
  if (score === 0 && content) {
    const plain = stripHtml(content).toLowerCase();
    if (plain.includes(q)) score = 40;
    else {
      for (const w of words) {
        if (plain.includes(w)) score += 15;
      }
    }
  }
  return score;
}

export function WikiContent({ onCount }: { onCount?: (count: number) => void } = {}) {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(CATEGORY_ALL);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>(SCOPE_ALL);
  const [sortBy, setSortBy] = useState<'recent' | 'alpha'>('recent');
  const [viewingPage, setViewingPage] = useState<WikiPage | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePersonal, setShowCreatePersonal] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editingPage, setEditingPage] = useState<WikiPage | null>(null);
  const [formData, setFormData] = useState<{
    title: string;
    slug: string;
    category: string;
    content: string;
    visibility: WikiVisibility;
  }>({
    title: '',
    slug: '',
    category: '',
    content: '',
    visibility: 'PUBLIC',
  });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WikiPage | null>(null);
  const [lockStatus, setLockStatus] = useState<LockStatus | null>(null);
  const [lockedByOther, setLockedByOther] = useState<LockStatus['by'] | null>(null);
  const lockRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<WikiVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<WikiVersion | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [shareData, setShareData] = useState<{
    visibility: WikiVisibility;
    collaborators: string[];
    allowedRoles: string[];
  }>({ visibility: 'PUBLIC', collaborators: [], allowedRoles: [] });
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [collabSearch, setCollabSearch] = useState('');
  const [collabResults, setCollabResults] = useState<DirectoryUser[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [collabSelected, setCollabSelected] = useState<DirectoryUser[]>([]);

  // Mention state for @ mentions in editor
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResults, setMentionResults] = useState<DirectoryUser[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [managedCategories, setManagedCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [listViewMode, setListViewMode] = useState<ListViewMode>('grid');
  const [expandedAccordions, setExpandedAccordions] = useState<Record<string, boolean>>({});
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);
  const [meiliResults, setMeiliResults] = useState<Array<{ id: string; title: string; slug: string; content?: string; category?: string | null; _formatted?: { title?: string; content?: string } }>>([]);
  const [meiliLoading, setMeiliLoading] = useState(false);
  const meiliTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Recently viewed articles (localStorage-backed, max 6)
  const RECENT_KEY = 'omnitech:wiki-recent';
  const [recentlyViewed, setRecentlyViewed] = useState<Array<{ id: string; title: string; slug: string }>>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecentlyViewed(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    if (!viewingPage) return;
    setRecentlyViewed(prev => {
      const filtered = prev.filter(r => r.id !== viewingPage.id);
      const next = [{ id: viewingPage.id, title: viewingPage.title, slug: (viewingPage as any).slug || '' }, ...filtered].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [viewingPage?.id]);

  // Editor enhanced toolbar state
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showTableInsert, setShowTableInsert] = useState(false);
  const savedSelectionRef = useRef<Range | null>(null);

  const EDITOR_COLORS = [
    { label: 'Noir', value: '#000000' },
    { label: 'Rouge', value: '#cc0000' },
    { label: 'Orange', value: '#F9964A' },
    { label: 'Bleu', value: '#296DC1' },
    { label: 'Vert', value: '#006233' },
    { label: 'Bordeaux', value: '#892034' },
    { label: 'Violet', value: '#7c3aed' },
    { label: 'Gris', value: '#6b7280' },
  ] as const;

  const HIGHLIGHT_COLORS = [
    { label: 'Jaune', value: '#fef08a' },
    { label: 'Vert', value: '#bbf7d0' },
    { label: 'Bleu', value: '#bfdbfe' },
    { label: 'Rose', value: '#fecdd3' },
    { label: 'Orange', value: '#fed7aa' },
    { label: 'Violet', value: '#ddd6fe' },
    { label: 'Gris', value: '#e5e7eb' },
    { label: 'Aucun', value: 'transparent' },
  ] as const;

  /** Save current selection so we can restore it after interacting with toolbar */
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  /** Restore saved selection */
  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && savedSelectionRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  }, []);

  /** Execute a command on the editor and sync content */
  const execCmd = useCallback((command: string, value?: string) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand(command, false, value ?? '');
    if (editorRef.current) {
      setFormData((f) => ({ ...f, content: editorRef.current!.innerHTML }));
    }
  }, [restoreSelection]);

  /** Insert arbitrary HTML at cursor */
  const insertHtmlAtCursor = useCallback((html: string) => {
    restoreSelection();
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    if (editorRef.current) {
      setFormData((f) => ({ ...f, content: editorRef.current!.innerHTML }));
    }
  }, [restoreSelection]);

  /** Handle image file drop or paste into editor */
  const handleEditorDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    e.stopPropagation();
    // Upload via attachment endpoint if editing an existing page
    const pageId = editingPage?.id;
    if (pageId) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const { data } = await api.post(`/wiki/${pageId}/attachments`, fd);
        const url = data?.url || data?.path;
        if (url && editorRef.current) {
          editorRef.current.focus();
          document.execCommand('insertHTML', false, `<img src="${url}" alt="${file.name}" style="max-width:100%;" />`);
          setFormData((f) => ({ ...f, content: editorRef.current!.innerHTML }));
        }
        toast.success('Image uploadée');
      } catch {
        toast.error("Impossible d'uploader l'image");
      }
    } else {
      // For new pages, read as data URL
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result && editorRef.current) {
          editorRef.current.focus();
          document.execCommand('insertHTML', false, `<img src="${reader.result as string}" alt="${file.name}" style="max-width:100%;" />`);
          setFormData((f) => ({ ...f, content: editorRef.current!.innerHTML }));
        }
      };
      reader.readAsDataURL(file);
    }
  }, [editingPage]);

  const handleEditorDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
    }
  }, []);

  /** Toggle editor fullscreen overlay */
  const toggleEditorFullscreen = useCallback(() => {
    setIsEditorFullscreen((prev) => !prev);
  }, []);

  // Word count derived from editor content
  const editorPlainText = formData.content.replace(/<[^>]+>/g, '');
  const editorWordCount = editorPlainText.split(/\s+/).filter(Boolean).length;

  // --- Reading experience state ---
  const [readingSize, setReadingSize] = useState<ReadingSize>('md');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [feedbackState, setFeedbackState] = useState<Record<string, 'up' | 'down' | null>>({});
  const [feedbackCounts, setFeedbackCounts] = useState<Record<string, { up: number; down: number }>>({});
  const [wikiQuestion, setWikiQuestion] = useState('');
  const [wikiAnswer, setWikiAnswer] = useState<string | null>(null);
  const [wikiAnswerLoading, setWikiAnswerLoading] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);

  // Hydrate persistence
  useEffect(() => {
    try {
      const size = localStorage.getItem('wiki:reading-size');
      if (size === 'sm' || size === 'md' || size === 'lg') setReadingSize(size);
      const favs = localStorage.getItem('wiki:favorites');
      if (favs) setFavorites(JSON.parse(favs));
      const fb = localStorage.getItem('wiki:feedback');
      if (fb) setFeedbackState(JSON.parse(fb));
      const fbc = localStorage.getItem('wiki:feedback-counts');
      if (fbc) setFeedbackCounts(JSON.parse(fbc));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem('wiki:reading-size', readingSize); } catch { /* noop */ }
  }, [readingSize]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    setIsFullscreen((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('wiki-fullscreen', next);
      }
      return next;
    });
  };

  // Keyboard shortcut F for fullscreen (only while viewing a page)
  useEffect(() => {
    if (!viewingPage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingPage]);

  // Cleanup fullscreen on unmount / leave detail
  useEffect(() => {
    if (!viewingPage && typeof document !== 'undefined') {
      document.body.classList.remove('wiki-fullscreen');
      setIsFullscreen(false);
    }
  }, [viewingPage]);

  // Reading progress (scroll spy is handled by the WikiOutline component)
  useEffect(() => {
    if (!viewingPage) return;
    const onScroll = () => {
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = el.scrollHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const pct = total > 0 ? (scrolled / total) * 100 : 0;
      setReadingProgress(Math.max(0, Math.min(100, pct)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [viewingPage]);

  const toggleFavorite = (pageId: string) => {
    setFavorites((prev) => {
      const next = { ...prev, [pageId]: !prev[pageId] };
      try { localStorage.setItem('wiki:favorites', JSON.stringify(next)); } catch { /* noop */ }
      toast.success(next[pageId] ? 'Ajouté aux favoris' : 'Retiré des favoris');
      return next;
    });
  };

  const submitFeedback = async (pageId: string, vote: 'up' | 'down') => {
    // Try backend, fallback to localStorage
    try {
      await api.post(`/wiki/${pageId}/feedback`, { vote });
    } catch {
      /* backend endpoint may not exist — fallback silent */
    }
    setFeedbackState((prev) => {
      const next = { ...prev, [pageId]: vote };
      try { localStorage.setItem('wiki:feedback', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    setFeedbackCounts((prev) => {
      const existing = prev[pageId] ?? { up: 0, down: 0 };
      const next = {
        ...prev,
        [pageId]: {
          up: existing.up + (vote === 'up' ? 1 : 0),
          down: existing.down + (vote === 'down' ? 1 : 0),
        },
      };
      try { localStorage.setItem('wiki:feedback-counts', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
    toast.success('Merci pour votre retour');
  };

  // (scroll-to-heading handled internally by WikiOutline component)

  const copyShareLink = async () => {
    if (!viewingPage) return;
    const url = `https://intranet.omnitech-security.fr/wiki/${viewingPage.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Lien copi\u00e9');
    } catch {
      toast.error('Impossible de copier le lien');
    }
  };

  const reportError = () => {
    if (!viewingPage) return;
    const subject = encodeURIComponent(`[Wiki] Erreur dans la page: ${viewingPage.title}`);
    const body = encodeURIComponent(`Bonjour,\n\nJ'ai identifi\u00e9 un probl\u00e8me sur la page suivante :\nhttps://intranet.omnitech-security.fr/wiki/${viewingPage.slug}\n\nDescription du probl\u00e8me :\n\n`);
    window.location.href = `mailto:support@omnitech-security.com?subject=${subject}&body=${body}`;
  };

  const applyTemplate = (tpl: WikiTemplate) => {
    setFormData({
      title: tpl.title,
      slug: tpl.id,
      category: tpl.category,
      content: tpl.content,
      visibility: 'PUBLIC',
    });
    if (isAdmin) setShowCreate(true);
    else setShowCreatePersonal(true);
  };

  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const isSuperAdmin = user && user.role === UserRole.SUPER_ADMIN;

  const fetchPages = async () => {
    try {
      const { data } = await api.get('/wiki');
      const list = Array.isArray(data) ? data : data?.data || [];
      setPages(list);
      onCount?.(list.length);
    } catch {
      toast.error(t('wiki.fetchError'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = (visibility: WikiVisibility = 'PUBLIC') => {
    setFormData({ title: '', slug: '', category: '', content: '', visibility });
  };

  useEffect(() => {
    fetchPages();
  }, []);

  // Load admin-managed category list from backend config
  useEffect(() => {
    if (!isAdmin) return;
    api.get('/config/wiki/categories').then(r => {
      try {
        const parsed = JSON.parse(r.data?.value || '[]');
        if (Array.isArray(parsed)) setManagedCategories(parsed);
      } catch { /* ignore */ }
    }).catch(() => { /* key may not exist yet */ });
  }, [isAdmin]);

  const saveManagedCategories = async (cats: string[]) => {
    try {
      await api.post('/config/wiki/categories', { value: JSON.stringify(cats) });
      setManagedCategories(cats);
    } catch {
      toast.error('Impossible de sauvegarder les catégories');
    }
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    pages.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    // Also include admin-managed categories even if no page uses them yet
    managedCategories.forEach(c => cats.add(c));
    return [CATEGORY_ALL, ...Array.from(cats).sort()];
  }, [pages, managedCategories]);

  const filtered = useMemo(() => {
    return pages.filter((p) => {
      const lowerSearch = search.toLowerCase();
      const matchesSearch =
        !search ||
        p.title.toLowerCase().includes(lowerSearch) ||
        p.category?.toLowerCase().includes(lowerSearch) ||
        stripHtml(p.content).toLowerCase().includes(lowerSearch);
      const matchesCategory =
        categoryFilter === CATEGORY_ALL ||
        p.category?.toLowerCase() === categoryFilter.toLowerCase();
      const matchesScope =
        scopeFilter === SCOPE_ALL ||
        (scopeFilter === SCOPE_MINE && user?.id && p.author.id === user.id);
      return matchesSearch && matchesCategory && matchesScope;
    });
  }, [pages, search, categoryFilter, scopeFilter, user?.id]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortBy === 'alpha') return arr.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    // 'recent' — newest first
    return arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filtered, sortBy]);

  const isNewArticle = (createdAt: string): boolean => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return new Date(createdAt).getTime() > sevenDaysAgo;
  };

  const myPagesCount = useMemo(
    () => (user?.id ? pages.filter((p) => p.author.id === user.id).length : 0),
    [pages, user?.id],
  );

  /** Top 3 search suggestions based on title relevance */
  const searchSuggestions = useMemo(() => {
    if (!search || search.length < 2) return [];
    return pages
      .map((p) => ({ page: p, score: searchScore(p.title, search, p.content) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((r) => r.page);
  }, [pages, search]);

  /** Category counts map */
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    pages.forEach((p) => {
      const cat = p.category || 'Sans catégorie';
      map[cat] = (map[cat] || 0) + 1;
    });
    return map;
  }, [pages]);

  /** Pages grouped by category for accordion view */
  const groupedByCategory = useMemo(() => {
    const map: Record<string, WikiPage[]> = {};
    sorted.forEach((p) => {
      const cat = p.category || 'Sans catégorie';
      if (!map[cat]) map[cat] = [];
      map[cat]!.push(p);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b, 'fr'));
  }, [sorted]);

  // Close search suggestions on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleAccordion = useCallback((cat: string) => {
    setExpandedAccordions((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const copyArticleLink = useCallback(async () => {
    if (!viewingPage) return;
    const url = `https://intranet.omnitech-security.fr/wiki/${viewingPage.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier le lien');
    }
  }, [viewingPage]);

  // --- Zen mode toggle ---
  const toggleZenMode = useCallback(() => {
    setZenMode((prev) => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.body.classList.toggle('wiki-zen-mode', next);
      }
      return next;
    });
  }, []);

  // Cleanup zen mode on unmount / leave detail
  useEffect(() => {
    if (!viewingPage && typeof document !== 'undefined') {
      document.body.classList.remove('wiki-zen-mode');
      setZenMode(false);
    }
  }, [viewingPage]);

  // Keyboard shortcut Z for zen mode
  useEffect(() => {
    if (!viewingPage) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        toggleZenMode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewingPage, toggleZenMode]);

  // --- Copy all content ---
  const copyAllContent = useCallback(async () => {
    if (!viewingPage?.content) return;
    const plain = viewingPage.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    try {
      await navigator.clipboard.writeText(plain);
      setContentCopied(true);
      toast.success('Contenu copié dans le presse-papiers');
      setTimeout(() => setContentCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier le contenu');
    }
  }, [viewingPage]);

  // --- Meilisearch wiki search ---
  const searchMeili = useCallback(async (query: string) => {
    if (query.length < 2) { setMeiliResults([]); return; }
    setMeiliLoading(true);
    try {
      const { data } = await api.get(`/search/meili?q=${encodeURIComponent(query)}&type=wiki`);
      const hits = Array.isArray(data?.hits) ? data.hits : Array.isArray(data) ? data : [];
      setMeiliResults(hits);
    } catch {
      // Meilisearch endpoint may not be available — fallback silently
      setMeiliResults([]);
    } finally {
      setMeiliLoading(false);
    }
  }, []);

  // --- Collaborator search for share dialog ---
  const searchCollaborators = useCallback(async (query: string) => {
    if (query.length < 2) { setCollabResults([]); return; }
    setCollabLoading(true);
    try {
      const { data } = await api.get(`/users/directory?search=${encodeURIComponent(query)}`);
      const users: DirectoryUser[] = Array.isArray(data) ? data : data?.data || [];
      setCollabResults(users);
    } catch {
      setCollabResults([]);
    } finally {
      setCollabLoading(false);
    }
  }, []);

  // Debounced collaborator search
  const collabSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCollabSearchChange = useCallback((value: string) => {
    setCollabSearch(value);
    if (collabSearchTimerRef.current) clearTimeout(collabSearchTimerRef.current);
    collabSearchTimerRef.current = setTimeout(() => searchCollaborators(value), 300);
  }, [searchCollaborators]);

  // --- @Mention search for editor ---
  const searchMentions = useCallback(async (query: string) => {
    if (query.length < 1) { setMentionResults([]); setShowMentionDropdown(false); return; }
    setMentionLoading(true);
    try {
      const { data } = await api.get(`/users/directory?search=${encodeURIComponent(query)}`);
      const users: DirectoryUser[] = Array.isArray(data) ? data : data?.data || [];
      setMentionResults(users.slice(0, 8));
      setShowMentionDropdown(users.length > 0);
      setMentionIndex(0);
    } catch {
      setMentionResults([]);
      setShowMentionDropdown(false);
    } finally {
      setMentionLoading(false);
    }
  }, []);

  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const insertMention = useCallback((mentionUser: DirectoryUser) => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Find the @query text to replace
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) return;
    const text = textNode.textContent || '';
    const cursorPos = range.startOffset;
    // Search backward for @
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') { atPos = i; break; }
      if (text[i] === ' ' || text[i] === '\n') break;
    }
    if (atPos < 0) return;
    // Replace @query with mention link
    const before = text.slice(0, atPos);
    const after = text.slice(cursorPos);
    const fullName = `${mentionUser.firstName} ${mentionUser.lastName}`;
    const parent = textNode.parentNode;
    if (!parent) return;
    // Create fragments
    const frag = document.createDocumentFragment();
    if (before) frag.appendChild(document.createTextNode(before));
    const link = document.createElement('a');
    link.href = `/profile/${mentionUser.id}`;
    link.textContent = `@${fullName}`;
    link.className = 'mention-link text-primary font-semibold hover:underline';
    link.contentEditable = 'false';
    frag.appendChild(link);
    const spaceAfter = document.createTextNode('\u00A0' + after);
    frag.appendChild(spaceAfter);
    parent.replaceChild(frag, textNode);
    // Move cursor after the space
    const newRange = document.createRange();
    newRange.setStart(spaceAfter, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
    // Sync content
    setFormData((f) => ({ ...f, content: editorRef.current!.innerHTML }));
    setShowMentionDropdown(false);
    setMentionQuery('');
  }, []);

  // Track content in a ref to avoid re-renders that reset the cursor
  const editorContentRef = useRef(formData.content);
  const editorInitializedRef = useRef(false);

  /**
   * Replace the `/query` trigger (inside the current text node) with the
   * HTML snippet coming from a slash command. Keeps cursor placement sane
   * and synchronises the editor content state.
   */
  const insertSlashCommand = useCallback((cmd: SlashCommand, query: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    // Locate and remove the `/query` trigger in the current selection's
    // text node. We use the live selection rather than the trigger ref to
    // avoid stale references if React re-rendered the tree.
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      const caret = range.startOffset;
      const text = node.textContent ?? '';
      const triggerLen = query.length + 1; // `/` + query
      const start = Math.max(0, caret - triggerLen);
      if (text.slice(start, caret) === `/${query}`) {
        node.textContent = text.slice(0, start) + text.slice(caret);
        const newRange = document.createRange();
        newRange.setStart(node, start);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }

    editor.focus();
    document.execCommand('insertHTML', false, cmd.html);
    editorContentRef.current = editor.innerHTML;
    setFormData((f) => ({ ...f, content: editor.innerHTML }));
  }, []);

  const slashMenu = useSlashMenu({ editorRef, onInsert: insertSlashCommand });

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Slash menu navigation / selection takes precedence when it's open.
    if (slashMenu.onKeyDown(e)) return;

    // Mention dropdown navigation
    if (showMentionDropdown && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionResults.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (mentionResults[mentionIndex]) {
          e.preventDefault();
          insertMention(mentionResults[mentionIndex]);
          return;
        }
      } else if (e.key === 'Escape') {
        setShowMentionDropdown(false);
        return;
      }
    }

    // Ctrl+Shift+1/2/3 => H1/H2/H3
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      const tag = `H${e.key}`;
      document.execCommand('formatBlock', false, tag);
      return;
    }

    // Ctrl+K => insert link
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      saveSelection();
      setLinkUrl('');
      setLinkText('');
      setShowLinkDialog(true);
      return;
    }

    // Escape to exit editor fullscreen
    if (e.key === 'Escape' && isEditorFullscreen) {
      setIsEditorFullscreen(false);
    }
  }, [slashMenu, showMentionDropdown, mentionResults, mentionIndex, insertMention, saveSelection, isEditorFullscreen]);

  // Initialize editor content when form opens (without dangerouslySetInnerHTML)
  useEffect(() => {
    if ((showCreate || showCreatePersonal || showEdit) && editorRef.current) {
      if (!editorInitializedRef.current) {
        editorRef.current.innerHTML = formData.content;
        editorContentRef.current = formData.content;
        editorInitializedRef.current = true;
      }
    } else {
      editorInitializedRef.current = false;
    }
  }, [showCreate, showCreatePersonal, showEdit, formData.content]);

  const handleEditorInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const html = (e.target as HTMLDivElement).innerHTML;
    editorContentRef.current = html;
    // Detect `/` slash-command trigger (non-blocking — it co-exists with @mentions)
    slashMenu.onInput();
    // Detect @mention
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) {
      setShowMentionDropdown(false);
      return;
    }
    const text = textNode.textContent || '';
    const cursorPos = range.startOffset;
    // Search backward for @
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
      if (text[i] === '@') { atPos = i; break; }
      if (text[i] === ' ' || text[i] === '\n') break;
    }
    if (atPos >= 0) {
      const query = text.slice(atPos + 1, cursorPos);
      setMentionQuery(query);
      if (mentionTimerRef.current) clearTimeout(mentionTimerRef.current);
      mentionTimerRef.current = setTimeout(() => searchMentions(query), 250);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery('');
    }
  }, [searchMentions, slashMenu]);

  const handleViewPage = async (slug: string) => {
    try {
      const { data } = await api.get(`/wiki/${slug}`);
      setViewingPage(data);
      setWikiQuestion('');
      setWikiAnswer(null);
    } catch {
      toast.error(t('wiki.fetchError'));
    }
  };

  const handleCreate = async (personal = false) => {
    const currentContent = editorContentRef.current || formData.content;
    if (!formData.title || !formData.slug || !currentContent) {
      toast.error(t('wiki.requiredFields'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: formData.title,
        slug: formData.slug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        category: formData.category || undefined,
        content: currentContent,
        visibility: formData.visibility,
      };
      await api.post(personal ? '/wiki/personal' : '/wiki', payload);
      toast.success(t('wiki.created'));
      if (personal) setShowCreatePersonal(false);
      else setShowCreate(false);
      resetForm();
      await fetchPages();
    } catch {
      toast.error(t('wiki.createError'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Try to grab the edit lock. Returns true when the current user can edit.
   */
  const tryAcquireLock = async (pageId: string): Promise<boolean> => {
    try {
      const { data } = await api.post<LockStatus>(`/wiki/${pageId}/lock`);
      if (data.locked) {
        setLockedByOther(data.by ?? null);
        setLockStatus(data);
        toast.error(
          data.by
            ? `Page verrouillée par ${data.by.firstName ?? ''} ${data.by.lastName ?? ''}`.trim()
            : 'Page verrouillée',
        );
        return false;
      }
      setLockedByOther(null);
      setLockStatus(data);
      return true;
    } catch {
      toast.error(t('wiki.updateError'));
      return false;
    }
  };

  const releaseLock = async (pageId: string) => {
    try {
      await api.delete(`/wiki/${pageId}/lock`);
    } catch {
      /* silent: lock may have already expired */
    }
    if (lockRefreshRef.current) {
      clearInterval(lockRefreshRef.current);
      lockRefreshRef.current = null;
    }
    setLockStatus(null);
    setLockedByOther(null);
  };

  const handleOpenEdit = async (page: WikiPage) => {
    const ok = await tryAcquireLock(page.id);
    if (!ok) return;
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      category: page.category || '',
      content: page.content || '',
      visibility: (page.visibility as WikiVisibility) || 'PUBLIC',
    });
    setShowEdit(true);

    // Refresh the lock every 60s while the editor is open so the TTL does
    // not expire mid-edit.
    if (lockRefreshRef.current) clearInterval(lockRefreshRef.current);
    lockRefreshRef.current = setInterval(() => {
      api.post(`/wiki/${page.id}/lock`).catch(() => {});
    }, 60_000);
  };

  const handleUpdate = async () => {
    if (!editingPage) return;
    setSaving(true);
    try {
      const newSlug = formData.slug
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
      await api.patch(`/wiki/${editingPage.id}`, {
        title: formData.title,
        slug: newSlug,
        category: formData.category || undefined,
        content: editorContentRef.current || formData.content,
      });
      toast.success(t('wiki.updated'));
      await releaseLock(editingPage.id);
      setShowEdit(false);
      setEditingPage(null);
      resetForm();
      // If we were viewing this page, refresh it
      if (viewingPage?.id === editingPage.id) {
        const { data } = await api.get(`/wiki/${newSlug}`);
        setViewingPage(data);
      }
      await fetchPages();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        toast.error('Page verrouillée par un autre utilisateur');
      } else {
        toast.error(t('wiki.updateError'));
      }
    } finally {
      setSaving(false);
    }
  };

  const closeEditDialog = async () => {
    if (editingPage) {
      await releaseLock(editingPage.id);
    }
    setShowEdit(false);
    setEditingPage(null);
    resetForm();
  };

  // Cleanup on unmount — release the lock if still held.
  useEffect(() => {
    return () => {
      if (lockRefreshRef.current) {
        clearInterval(lockRefreshRef.current);
        lockRefreshRef.current = null;
      }
      if (editingPage) {
        api.delete(`/wiki/${editingPage.id}/lock`).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Version history & restore ---
  const openHistory = async (page: WikiPage) => {
    setShowHistory(true);
    setLoadingVersions(true);
    try {
      const { data } = await api.get(`/wiki/${page.id}/versions`);
      setVersions(data.items || []);
    } catch {
      toast.error(t('wiki.fetchError'));
    } finally {
      setLoadingVersions(false);
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget || !viewingPage) return;
    try {
      const { data } = await api.post(
        `/wiki/${viewingPage.id}/versions/${restoreTarget.id}/restore`,
      );
      toast.success('Version restaurée');
      setViewingPage(data);
      setRestoreTarget(null);
      setShowHistory(false);
      await fetchPages();
    } catch {
      toast.error(t('wiki.updateError'));
    }
  };

  // --- Sharing ---
  const openShare = (page: WikiPage) => {
    setShareData({
      visibility: (page.visibility as WikiVisibility) || 'PUBLIC',
      collaborators: page.collaborators || [],
      allowedRoles: page.allowedRoles || [],
    });
    setCollabSelected([]);
    setCollabSearch('');
    setCollabResults([]);
    setShareLinkCopied(false);
    setShowShare(true);
  };

  const saveShare = async () => {
    if (!viewingPage) return;
    try {
      const collaboratorIds = [
        ...shareData.collaborators,
        ...collabSelected.map((u) => u.id),
      ].filter((id, i, arr) => arr.indexOf(id) === i);
      const payload: Record<string, unknown> = {
        visibility: shareData.visibility,
        collaborators: collaboratorIds,
      };
      if (shareData.visibility === 'ROLE') {
        payload.allowedRoles = shareData.allowedRoles;
      }
      const { data } = await api.patch(`/wiki/${viewingPage.id}/share`, payload);
      setViewingPage((prev) => (prev ? { ...prev, ...data } : prev));
      toast.success('Partage mis \u00e0 jour');
      setShowShare(false);
      await fetchPages();
    } catch {
      toast.error(t('wiki.updateError'));
    }
  };

  const copyShareDialogLink = async () => {
    if (!viewingPage) return;
    const url = `https://intranet.omnitech-security.fr/wiki/${viewingPage.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier le lien');
    }
  };

  const handleDelete = async (page: WikiPage) => {
    setDeleteTarget(page);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/wiki/${deleteTarget.id}`);
      toast.success(t('wiki.deleted'));
      if (viewingPage?.id === deleteTarget.id) setViewingPage(null);
      await fetchPages();
    } catch {
      toast.error(t('wiki.deleteError'));
    } finally {
      setDeleteTarget(null);
    }
  };

  function renderHistoryDialog() {
    return (
      <Dialog
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="Historique des versions"
      >
        <div className="space-y-3">
          {loadingVersions ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-lg shimmer"
                />
              ))}
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-6">
              Aucune version antérieure pour cette page.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-[60vh] overflow-y-auto">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 py-3"
                >
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <History className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white truncate">
                      {v.title}
                    </p>
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                      {v.author
                        ? `${v.author.firstName} ${v.author.lastName} — `
                        : ''}
                      {new Date(v.createdAt).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {v.changeLog && (
                      <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 italic truncate">
                        {v.changeLog}
                      </p>
                    )}
                  </div>
                  {(isAdmin ||
                    (user && viewingPage?.author.id === user.id)) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRestoreTarget(v)}
                    >
                      <RotateCcw className="h-3 w-3" /> Restaurer
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowHistory(false)}>
              Fermer
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={!!restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onConfirm={confirmRestore}
          title="Restaurer cette version"
          description="Le contenu actuel sera sauvegardé comme nouvelle version avant la restauration. Continuer ?"
        />
      </Dialog>
    );
  }

  function renderShareDialog() {
    return (
      <Dialog
        open={showShare}
        onClose={() => setShowShare(false)}
        title="Partager la page"
      >
        <div className="space-y-4">
          {/* Visibility toggle */}
          <div className="space-y-2">
            <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
              Visibilit\u00e9
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['PRIVATE', 'DEPARTMENT', 'ROLE', 'PUBLIC'] as const).map((vis) => (
                <button
                  key={vis}
                  type="button"
                  onClick={() =>
                    setShareData((s) => ({ ...s, visibility: vis }))
                  }
                  className={`flex items-start gap-2 rounded-lg border p-3 text-left transition-all ${
                    shareData.visibility === vis
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-gray-200 dark:border-slate-700 hover:border-primary/40'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-seal-navy dark:text-white">
                      {VISIBILITY_LABELS[vis]}
                    </p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5">
                      {VISIBILITY_DESCRIPTIONS[vis]}
                    </p>
                  </div>
                  {shareData.visibility === vis && (
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Role checkboxes (when ROLE visibility) */}
          {shareData.visibility === 'ROLE' && (
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                R\u00f4les autoris\u00e9s
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_ROLES.map((role) => (
                  <label
                    key={role.value}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-all text-xs ${
                      shareData.allowedRoles.includes(role.value)
                        ? 'border-primary bg-primary/5 text-primary font-semibold'
                        : 'border-gray-200 dark:border-slate-700 text-seal-gray-500 dark:text-slate-400 hover:border-primary/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={shareData.allowedRoles.includes(role.value)}
                      onChange={(e) => {
                        setShareData((s) => ({
                          ...s,
                          allowedRoles: e.target.checked
                            ? [...s.allowedRoles, role.value]
                            : s.allowedRoles.filter((r) => r !== role.value),
                        }));
                      }}
                      className="sr-only"
                    />
                    <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      shareData.allowedRoles.includes(role.value)
                        ? 'bg-primary border-primary'
                        : 'border-gray-300 dark:border-slate-600'
                    }`}>
                      {shareData.allowedRoles.includes(role.value) && (
                        <Check className="h-3 w-3 text-white" />
                      )}
                    </div>
                    {role.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Collaborator search (when PRIVATE) */}
          {shareData.visibility === 'PRIVATE' && (
            <div className="space-y-2">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">
                Collaborateurs
              </label>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                Ces utilisateurs pourront voir et modifier la page.
              </p>
              {/* Selected collaborators chips */}
              {collabSelected.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {collabSelected.map((u) => (
                    <span
                      key={u.id}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium"
                    >
                      {u.firstName} {u.lastName}
                      <button
                        type="button"
                        onClick={() =>
                          setCollabSelected((prev) =>
                            prev.filter((p) => p.id !== u.id),
                          )
                        }
                        className="hover:text-red-500 transition-colors"
                        aria-label={`Retirer ${u.firstName} ${u.lastName}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Search input */}
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2">
                  <Search className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-500 flex-shrink-0" />
                  <input
                    type="text"
                    value={collabSearch}
                    onChange={(e) => handleCollabSearchChange(e.target.value)}
                    placeholder="Rechercher un utilisateur..."
                    className="flex-1 bg-transparent text-sm text-seal-navy dark:text-white outline-none placeholder:text-seal-gray-500 dark:placeholder:text-slate-500"
                  />
                  {collabLoading && (
                    <div className="h-3.5 w-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  )}
                </div>
                {/* Results dropdown */}
                {collabResults.length > 0 && collabSearch.length >= 2 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl max-h-40 overflow-y-auto">
                    {collabResults
                      .filter(
                        (u) =>
                          !collabSelected.some((s) => s.id === u.id) &&
                          !shareData.collaborators.includes(u.id),
                      )
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setCollabSelected((prev) => [...prev, u]);
                            setCollabSearch('');
                            setCollabResults([]);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <span className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                            {u.firstName[0]}{u.lastName[0]}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-seal-navy dark:text-white truncate">
                              {u.firstName} {u.lastName}
                            </p>
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                              {u.email}
                            </p>
                          </div>
                          <Plus className="h-3 w-3 text-primary flex-shrink-0" />
                        </button>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Copy link button */}
          <button
            type="button"
            onClick={copyShareDialogLink}
            className={`w-full flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
              shareLinkCopied
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
                : 'border-gray-200 dark:border-slate-700 text-seal-navy dark:text-white hover:border-primary/40 hover:bg-primary/5'
            }`}
          >
            {shareLinkCopied ? (
              <>
                <Check className="h-4 w-4 text-emerald-500 animate-[scale-in_0.2s_ease-out]" />
                Lien copi\u00e9 !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copier le lien de partage
              </>
            )}
          </button>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowShare(false)}>
              {t('wiki.cancel')}
            </Button>
            <Button onClick={saveShare}>
              <Save className="h-4 w-4" /> Enregistrer
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  function renderFormDialog(mode: 'edit' | 'create' | 'createPersonal') {
    const isEdit = mode === 'edit';
    const isPersonal = mode === 'createPersonal';
    const open = isEdit ? showEdit : isPersonal ? showCreatePersonal : showCreate;
    const title = isEdit
      ? t('wiki.editPage')
      : isPersonal
      ? 'Nouvelle page personnelle'
      : t('wiki.newPage');
    const onCloseDialog = async () => {
      if (isEdit) {
        await closeEditDialog();
        return;
      }
      if (isPersonal) setShowCreatePersonal(false);
      else setShowCreate(false);
      resetForm();
    };
    return (
      <Dialog open={open} onClose={onCloseDialog} title={title} className="!max-w-4xl">
        <div className="space-y-3 max-h-[75vh] overflow-y-auto px-1" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); isPersonal ? handleCreate(true) : handleCreate(false); } }}>
          <Input
            label={t('wiki.titleLabel')}
            value={formData.title}
            onChange={(e) =>
              setFormData((f) => ({
                ...f,
                title: e.target.value,
                ...(!isEdit && !f.slug
                  ? {
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/\s+/g, '-')
                        .replace(/[^a-z0-9-]/g, ''),
                    }
                  : {}),
              }))
            }
            placeholder={t('wiki.titlePlaceholder')}
            autoFocus
          />
          <Input
            label={t('wiki.slugLabel')}
            value={formData.slug}
            onChange={(e) =>
              setFormData((f) => ({ ...f, slug: e.target.value }))
            }
            placeholder="mon-article"
          />
          <div className="space-y-1">
            <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">{t('wiki.categoryLabel')}</label>
            <input
              list="wiki-category-list"
              value={formData.category}
              onChange={(e) => setFormData((f) => ({ ...f, category: e.target.value }))}
              placeholder={t('wiki.categoryPlaceholder')}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <datalist id="wiki-category-list">
              {categories.filter(c => c !== CATEGORY_ALL).map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <Select
            label="Visibilité"
            value={formData.visibility}
            onChange={(e) =>
              setFormData((f) => ({
                ...f,
                visibility: e.target.value as WikiVisibility,
              }))
            }
            options={[
              { value: 'PRIVATE', label: 'Privé (moi uniquement)' },
              { value: 'DEPARTMENT', label: 'Mon département' },
              { value: 'PUBLIC', label: 'Public (toute l\'entreprise)' },
            ]}
          />
          {isEdit && lockStatus?.expiresAt && !lockedByOther && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              <Lock className="h-3.5 w-3.5" />
              <span>
                Vous avez acquis le verrou d&apos;édition — expire à{' '}
                {new Date(lockStatus.expiresAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
          <div className={`space-y-1 ${isEditorFullscreen ? 'fixed inset-0 z-50 bg-white dark:bg-slate-900 p-6 flex flex-col' : ''}`}>
            <div className="flex items-center justify-between">
              <label className="block text-[13px] font-semibold text-seal-navy dark:text-white">{t('wiki.contentLabel')}</label>
              <div className="flex items-center gap-2">
                <button type="button" title={isEditorFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                  aria-label={isEditorFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                  onClick={toggleEditorFullscreen}
                  className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
                >
                  {isEditorFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {/* Shared RichTextEditor — unified with news/tickets (B/I/H2/H3/UL/OL/Quote/Code + image).
                Stockage : HTML (via onChange) → formData.content + editorContentRef pour save. */}
            <RichTextEditor
              value={formData.content}
              onChange={(html) => {
                editorContentRef.current = html;
                setFormData((f) => ({ ...f, content: html }));
              }}
              onImageButton={() => { saveSelection(); setImgUrl(''); setImgAlt(''); setShowImageDialog(true); }}
              minHeight={isEditorFullscreen ? 400 : 220}
              placeholder={t('wiki.contentLabel')}
              ariaLabel={t('wiki.contentLabel')}
              className={isEditorFullscreen ? 'flex-1 flex flex-col' : ''}
            />
            {/* Word & character count */}
            <div className="flex justify-end items-center mt-1">
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                {editorWordCount} mot{editorWordCount !== 1 ? 's' : ''} {'•'} {editorPlainText.length} car.
              </span>
            </div>
          </div>
          {/* Legacy toolbar + mention/slash UI remplacé par RichTextEditor partagé.
              Bloc ci-dessous conservé en dead-code minimal pour ne pas casser les refs — si tu
              lis ce commentaire, c'est safe à supprimer plus tard. */}
          {false && (
            <div className="hidden">
            {/* WYSIWYG toolbar — sticky */}
            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-1 border border-b-0 border-gray-300 dark:border-slate-600 rounded-t-lg p-2 bg-gray-50 dark:bg-slate-800" onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}>
              {/* Undo / Redo */}
              <button type="button" title="Annuler (Ctrl+Z)" aria-label="Annuler (Ctrl+Z)" onClick={() => execCmd('undo')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button type="button" title="Rétablir (Ctrl+Y)" aria-label="Rétablir (Ctrl+Y)" onClick={() => execCmd('redo')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white">
                <Redo2 className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Headings */}
              {(['H1', 'H2', 'H3'] as const).map((h) => (
                <button key={h} type="button" title={`Titre ${h} (Ctrl+Shift+${h[1]})`}
                  aria-label={`Titre ${h} (Ctrl+Shift+${h[1]})`}
                  onClick={() => execCmd('formatBlock', h)}
                  className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white font-semibold"
                >{h}</button>
              ))}
              <button type="button" title="Normal" onClick={() => execCmd('formatBlock', 'P')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white">P</button>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Bold / Italic / Underline / Strikethrough */}
              <button type="button" title="Gras (Ctrl+B)" onClick={() => execCmd('bold')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white font-bold">B</button>
              <button type="button" title="Italique (Ctrl+I)" onClick={() => execCmd('italic')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white italic">I</button>
              <button type="button" title="Souligné (Ctrl+U)" onClick={() => execCmd('underline')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white underline">U</button>
              <button type="button" title="Barré" onClick={() => execCmd('strikeThrough')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white line-through">S</button>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Text color */}
              <div className="relative">
                <button type="button" title="Couleur du texte"
                  aria-label="Couleur du texte"
                  onClick={() => { setShowColorPicker((v) => !v); setShowHighlightPicker(false); setShowTableInsert(false); }}
                  className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white flex items-center gap-0.5"
                >
                  <Palette className="h-3.5 w-3.5" />
                </button>
                {showColorPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl p-2 grid grid-cols-4 gap-1 z-30" onMouseDown={(e) => e.stopPropagation()}>
                    {EDITOR_COLORS.map((c) => (
                      <button key={c.value} type="button" title={c.label}
                        onClick={() => { execCmd('foreColor', c.value); setShowColorPicker(false); }}
                        className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Highlight */}
              <div className="relative">
                <button type="button" title="Surligneur"
                  onClick={() => { setShowHighlightPicker((v) => !v); setShowColorPicker(false); setShowTableInsert(false); }}
                  className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white flex items-center gap-0.5"
                >
                  <Highlighter className="h-3.5 w-3.5" />
                </button>
                {showHighlightPicker && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl p-2 grid grid-cols-4 gap-1 z-30" onMouseDown={(e) => e.stopPropagation()}>
                    {HIGHLIGHT_COLORS.map((c) => (
                      <button key={c.value} type="button" title={c.label}
                        onClick={() => { execCmd('hiliteColor', c.value); setShowHighlightPicker(false); }}
                        className="w-6 h-6 rounded border border-gray-200 dark:border-slate-600 hover:scale-110 transition-transform"
                        style={{ backgroundColor: c.value === 'transparent' ? '#f3f4f6' : c.value }}
                      >{c.value === 'transparent' ? <X className="h-3 w-3 mx-auto text-gray-400 dark:text-slate-500" /> : null}</button>
                    ))}
                  </div>
                )}
              </div>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Lists */}
              <button type="button" title="Liste à puces" aria-label="Liste à puces" onClick={() => execCmd('insertUnorderedList')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white font-semibold">{'\u2022'}</button>
              <button type="button" title="Liste numérotée" onClick={() => execCmd('insertOrderedList')} className="px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white font-semibold">1.</button>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Blockquote */}
              <button type="button" title="Citation" aria-label="Citation" onClick={() => execCmd('formatBlock', 'BLOCKQUOTE')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white">
                <Quote className="h-3.5 w-3.5" />
              </button>

              {/* Code inline */}
              <button type="button" title="Code inline" aria-label="Code inline"
                onClick={() => {
                  const sel = window.getSelection();
                  const text = sel?.toString() || 'code';
                  insertHtmlAtCursor(`<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.875em;">${text}</code>&nbsp;`);
                }}
                className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
              >
                <Code className="h-3.5 w-3.5" />
              </button>

              {/* Code block */}
              <button type="button" title="Bloc de code" aria-label="Bloc de code"
                onClick={() => {
                  const sel = window.getSelection();
                  const text = sel?.toString() || '// code';
                  insertHtmlAtCursor(`<pre style="background:#1e293b;color:#e2e8f0;padding:12px 16px;border-radius:8px;font-family:monospace;font-size:0.875em;overflow-x:auto;"><code>${text}</code></pre><p><br></p>`);
                }}
                className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
              >
                <CodeSquare className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Link */}
              <button type="button" title="Ajouter un lien (Ctrl+K)" aria-label="Ajouter un lien (Ctrl+K)"
                onClick={() => { saveSelection(); setLinkUrl(''); setLinkText(''); setShowLinkDialog(true); }}
                className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white flex items-center gap-1"
              >
                <Link2 className="h-3.5 w-3.5" />
              </button>

              {/* Image */}
              <button type="button" title="Ajouter une image" aria-label="Ajouter une image"
                onClick={() => { saveSelection(); setImgUrl(''); setImgAlt(''); setShowImageDialog(true); }}
                className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white flex items-center gap-1"
              >
                <ImageIcon className="h-3.5 w-3.5" />
              </button>

              {/* Table */}
              <div className="relative">
                <button type="button" title="Insérer un tableau" aria-label="Insérer un tableau"
                  onClick={() => { setShowTableInsert((v) => !v); setShowColorPicker(false); setShowHighlightPicker(false); }}
                  className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white"
                >
                  <Table className="h-3.5 w-3.5" />
                </button>
                {showTableInsert && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl p-3 z-30 w-48" onMouseDown={(e) => e.stopPropagation()}>
                    <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 mb-2">Insérer un tableau 3x3</p>
                    <button type="button"
                      onClick={() => {
                        const html = `<table style="border-collapse:collapse;width:100%;margin:8px 0;"><thead><tr>${'<th style="border:1px solid #d1d5db;padding:8px 12px;background:#f3f4f6;text-align:left;font-weight:600;">En-tête</th>'.repeat(3)}</tr></thead><tbody>${Array.from({ length: 2 }, () => `<tr>${'<td style="border:1px solid #d1d5db;padding:8px 12px;">Cellule</td>'.repeat(3)}</tr>`).join('')}</tbody></table><p><br></p>`;
                        insertHtmlAtCursor(html);
                        setShowTableInsert(false);
                      }}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-seal-navy dark:text-white flex items-center gap-2"
                    >
                      <Table className="h-3.5 w-3.5 text-seal-gray-500" /> Tableau 3x3
                    </button>
                  </div>
                )}
              </div>

              {/* Horizontal rule */}
              <button type="button" title="Séparateur horizontal" aria-label="Séparateur horizontal" onClick={() => execCmd('insertHorizontalRule')} className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="w-px h-5 bg-gray-300 dark:bg-slate-600 mx-1" />

              {/* Fullscreen */}
              <button type="button" title={isEditorFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                aria-label={isEditorFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
                onClick={toggleEditorFullscreen}
                className="px-1.5 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white ml-auto"
              >
                {isEditorFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
            {/* Editable area with @mention support + drag & drop */}
            <div className={`relative ${isEditorFullscreen ? 'flex-1' : ''}`}>
              <div
                ref={editorRef}
                contentEditable
                className={`w-full rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-4 py-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 prose prose-sm dark:prose-invert max-w-none overflow-y-auto ${isEditorFullscreen ? 'h-full' : 'min-h-[200px] max-h-[60vh]'}`}
                onInput={handleEditorInput}
                onKeyDown={handleEditorKeyDown}
                onDrop={handleEditorDrop}
                onDragOver={handleEditorDragOver}
                onBlur={saveSelection}
                suppressContentEditableWarning
              />
              {/* @Mention dropdown */}
              {showMentionDropdown && mentionResults.length > 0 && (
                <div
                  ref={mentionDropdownRef}
                  className="absolute z-50 left-4 bottom-4 w-72 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl max-h-52 overflow-y-auto"
                >
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 border-b border-gray-100 dark:border-slate-700 flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Mentionner un utilisateur
                  </div>
                  {mentionResults.map((mu, idx) => (
                    <button
                      key={mu.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(mu);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                        idx === mentionIndex
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {mu.firstName[0]}{mu.lastName[0]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-seal-navy dark:text-white truncate">
                          {mu.firstName} {mu.lastName}
                        </p>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                          {mu.email}
                        </p>
                      </div>
                    </button>
                  ))}
                  {mentionLoading && (
                    <div className="px-3 py-2 text-center">
                      <div className="h-3.5 w-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                    </div>
                  )}
                </div>
              )}
              {/* Slash command menu (Notion-style) */}
              <WikiSlashMenu state={slashMenu.state} onSelect={slashMenu.select} />
            </div>
            {/* Word & character count */}
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px] text-seal-gray-500/60 dark:text-slate-600">
                Glissez une image pour l&apos;insérer {'\u2022'} Ctrl+K lien {'\u2022'} Ctrl+Shift+1/2/3 titres {'\u2022'} / commandes
              </span>
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                {editorWordCount} mot{editorWordCount !== 1 ? 's' : ''} {'\u2022'} {editorPlainText.length} car.
              </span>
            </div>
          </div>
          )}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={onCloseDialog}>
              {t('wiki.cancel')}
            </Button>
            <Button
              onClick={
                isEdit
                  ? handleUpdate
                  : isPersonal
                  ? () => handleCreate(true)
                  : () => handleCreate(false)
              }
              loading={saving}
            >
              <Save className="h-4 w-4" />{' '}
              {isEdit ? t('wiki.save') : t('wiki.create')}
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  // Detail view of a single wiki page
  if (viewingPage) {
    const isOwner = user && viewingPage.author.id === user.id;
    const canEditPage =
      isAdmin ||
      isOwner ||
      (user && (viewingPage.collaborators ?? []).includes(user.id));
    const pageVisibility = (viewingPage.visibility as WikiVisibility) || 'PUBLIC';
    const lockActive =
      viewingPage.editLockUserId &&
      viewingPage.editLockExpiresAt &&
      new Date(viewingPage.editLockExpiresAt).getTime() > Date.now() &&
      viewingPage.editLockUserId !== user?.id;

    // Align sanitization with news reader: preserve id attributes (anchors for ToC)
    // and explicitly allow pre/code tags (fix du rendu des blocs de code).
    const rawHtml = DOMPurify.sanitize(viewingPage.content || '', {
      ADD_ATTR: ['id'],
      ADD_TAGS: ['pre', 'code'],
    });
    const { html: withIds, entries: tocEntries } = extractOutline(rawHtml);

    const readingTime = computeReadingTime(viewingPage.content || '');
    const categoryColor = getCategoryColor(viewingPage.category);
    const CategoryIcon = getCategoryIcon(viewingPage.category);
    const isFavorite = !!favorites[viewingPage.id];
    const currentFeedback = feedbackState[viewingPage.id] ?? null;
    const counts = feedbackCounts[viewingPage.id] ?? { up: 0, down: 0 };

    const sameCategory = pages
      .filter((p) => p.id !== viewingPage.id && p.category && p.category === viewingPage.category)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);
    // Fallback to recent articles when no same-category articles exist
    const related = sameCategory.length > 0
      ? sameCategory
      : pages
          .filter((p) => p.id !== viewingPage.id)
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 3);
    const relatedLabel = sameCategory.length > 0 ? 'Articles liés' : 'Articles récents';

    // Previous / Next navigation within category
    const categoryPages = pages
      .filter((p) => p.category && p.category === viewingPage.category)
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    const currentIdx = categoryPages.findIndex((p) => p.id === viewingPage.id);
    const prevPage = currentIdx > 0 ? (categoryPages[currentIdx - 1] ?? null) : null;
    const nextPage = currentIdx >= 0 && currentIdx < categoryPages.length - 1 ? (categoryPages[currentIdx + 1] ?? null) : null;

    return (
      <>
        {/* Reading progress bar */}
        <div
          className="wiki-reading-progress"
          style={{ width: `${readingProgress}%` }}
          aria-hidden="true"
        />

        <div className="space-y-5">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-seal-gray-500 dark:text-slate-400" aria-label="Breadcrumb">
            <button
              onClick={() => setViewingPage(null)}
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <Home className="h-3 w-3" /> Wiki
            </button>
            {viewingPage.category && (
              <>
                <ChevronRight className="h-3 w-3" />
                <button
                  onClick={() => {
                    setViewingPage(null);
                    setCategoryFilter(viewingPage.category!);
                  }}
                  className="hover:text-primary transition-colors"
                >
                  {viewingPage.category}
                </button>
              </>
            )}
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold text-seal-navy dark:text-white truncate max-w-[40ch]">{viewingPage.title}</span>
          </nav>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setViewingPage(null)}>
              <ArrowLeft className="h-4 w-4" /> {t('wiki.backToList')}
            </Button>
            <div className="flex items-center gap-2">
              {/* Reading size controls */}
              <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
                <Type className="h-3.5 w-3.5 text-seal-gray-500 dark:text-slate-400 mx-1.5" />
                {(['sm', 'md', 'lg'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setReadingSize(s)}
                    className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors ${
                      readingSize === s
                        ? 'bg-primary/10 text-primary'
                        : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
                    }`}
                    title={`Taille ${s === 'sm' ? 'petite' : s === 'md' ? 'moyenne' : 'grande'}`}
                  >
                    A
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={copyAllContent}
                title="Copier tout le contenu"
              >
                {contentCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Clipboard className="h-4 w-4" />}
              </Button>
              <Button
                variant={zenMode ? 'primary' : 'outline'}
                size="sm"
                onClick={toggleZenMode}
                title="Mode lecture zen (Z)"
              >
                <Eye className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
                title="Mode plein écran (F)"
                aria-label={isFullscreen ? 'Quitter le mode plein écran' : 'Activer le mode plein écran'}
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {lockActive && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <Lock className="h-3.5 w-3.5" />
              <span>
                Cette page est en cours d&apos;édition — verrou actif jusqu&apos;à{' '}
                {new Date(viewingPage.editLockExpiresAt!).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}

          <div className={`flex gap-6 ${zenMode ? 'justify-center' : ''}`}>
            {/* Main article column */}
            <article className={`flex-1 min-w-0 ${zenMode ? 'max-w-3xl' : ''}`}>
              <div className={zenMode ? '' : 'max-w-3xl mx-auto'}>
              {/* Title + metadata header (Notion-like) */}
              <header className="mb-10">
                {/* Category chip row */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {viewingPage.category && (
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{
                        color: categoryColor,
                        background: `${categoryColor}15`,
                      }}
                    >
                      <CategoryIcon className="h-3 w-3" />
                      {viewingPage.category}
                    </span>
                  )}
                  <Badge variant={VISIBILITY_BADGE[pageVisibility]}>
                    {VISIBILITY_LABELS[pageVisibility]}
                  </Badge>
                  {viewingPage.isPublished && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle2 className="h-3 w-3" /> Document officiel
                    </span>
                  )}
                  {(viewingPage.collaborators?.length ?? 0) > 0 && (
                    <Badge variant="info">
                      <Users className="h-3 w-3" />
                      {viewingPage.collaborators?.length} collaborateur
                      {(viewingPage.collaborators?.length ?? 0) > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <div className="flex items-start gap-3 mb-5">
                  <h1 className="text-[38px] leading-[1.15] font-semibold text-seal-navy dark:text-white tracking-tight flex-1 min-w-0">
                    {viewingPage.title}
                  </h1>
                  <BookmarkButton
                    type="wiki"
                    id={viewingPage.id}
                    title={viewingPage.title}
                    href={`/wiki?page=${viewingPage.slug || viewingPage.id}`}
                  />
                </div>

                {/* Metadata + action toolbar (merged into one sticky-friendly bar) */}
                <div className="flex items-center justify-between flex-wrap gap-3 pb-5 border-b border-gray-200 dark:border-slate-700">
                  <div className="flex items-center gap-4 flex-wrap text-[12.5px] text-seal-gray-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-6 w-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">
                        {viewingPage.author.firstName[0]}
                        {viewingPage.author.lastName[0]}
                      </span>
                      <span className="text-seal-navy dark:text-white font-medium">
                        {viewingPage.author.firstName} {viewingPage.author.lastName}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeTime(viewingPage.updatedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {readingTime} min
                    </span>
                  </div>

                  {/* Actions toolbar (compact, right-aligned) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => openHistory(viewingPage)} title="Historique">
                      <History className="h-4 w-4" />
                    </Button>
                    {(isAdmin || isOwner) && (
                      <Button variant="ghost" size="sm" onClick={() => openShare(viewingPage)} title="Partager">
                        <Share2 className="h-4 w-4" />
                      </Button>
                    )}
                    {canEditPage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenEdit(viewingPage)}
                        disabled={!!lockActive}
                      >
                        <Edit className="h-4 w-4" /> {t('wiki.edit')}
                      </Button>
                    )}
                    {(isSuperAdmin || isOwner) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(viewingPage)}
                        className="text-red-500 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </header>

              {/* Article body */}
              <div
                ref={articleRef}
                className={`prose-reading wiki-content reading-size-${readingSize}`}
                dangerouslySetInnerHTML={{ __html: withIds }}
              />

              {/* Visual divider between content and supplementary sections */}
              <hr className="mt-12 mb-0 border-0 border-t border-gray-200 dark:border-slate-700" />

              {/* Pièces jointes — positioned before feedback for visibility */}
              {(() => {
                const attachments: Array<{name: string; url: string; size: number; mimeType: string; uploadedAt: string}> = (() => {
                  try { return JSON.parse((viewingPage as any).attachments || '[]'); } catch { return []; }
                })();
                const canEditAtt = user && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN' || user.id === viewingPage.author?.id);
                const fmtSize = (b: number) => { if (b < 1024) return `${b} o`; if (b < 1048576) return `${(b/1024).toFixed(1)} Ko`; return `${(b/1048576).toFixed(1)} Mo`; };
                const attachIconForMime = (m: string): { Icon: React.ElementType; color: string } => {
                  if (m.includes('pdf')) return { Icon: FileText, color: 'text-red-500' };
                  if (m.startsWith('image/')) return { Icon: FileImage, color: 'text-emerald-500' };
                  if (m.includes('word') || m.includes('document')) return { Icon: FileText, color: 'text-blue-500' };
                  if (m.includes('sheet') || m.includes('excel')) return { Icon: FileSpreadsheet, color: 'text-green-600' };
                  if (m.includes('presentation') || m.includes('powerpoint')) return { Icon: FileText, color: 'text-orange-500' };
                  if (m.includes('zip') || m.includes('archive')) return { Icon: FolderOpen, color: 'text-amber-500' };
                  return { Icon: Paperclip, color: 'text-seal-gray-500 dark:text-slate-400' };
                };
                return (
                  <section className="mt-10 pt-8 border-t border-gray-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                        <Paperclip className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
                        Pièces jointes {attachments.length > 0 && <span className="text-xs font-normal text-seal-gray-500 dark:text-slate-500">({attachments.length})</span>}
                      </h2>
                      {canEditAtt && (
                        <Button variant="outline" size="sm" className="relative">
                          <Paperclip className="h-4 w-4" /> Ajouter un fichier
                          <input
                            type="file"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const fd = new FormData();
                              fd.append('file', file);
                              try {
                                await api.post(`/wiki/${viewingPage.id}/attachments`, fd);
                                toast.success(`${file.name} ajouté`);
                                fetchPages();
                                const { data } = await api.get(`/wiki/${viewingPage.slug}`);
                                setViewingPage(data);
                              } catch { toast.error('Échec upload'); }
                              e.target.value = '';
                            }}
                          />
                        </Button>
                      )}
                    </div>
                    {attachments.length === 0 ? (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-500 italic">Aucune pièce jointe.</p>
                    ) : (
                      <div className="space-y-2">
                        {attachments.map((att, i) => {
                          const { Icon: AttIcon, color: attColor } = attachIconForMime(att.mimeType);
                          return (
                            <div key={i} className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 px-3 py-2 card-hover">
                              <div className={`h-8 w-8 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 ${attColor}`}>
                                <AttIcon className="h-4 w-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-seal-navy dark:text-white hover:text-primary truncate block">{att.name}</a>
                                <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">{fmtSize(att.size)} — {new Date(att.uploadedAt).toLocaleDateString('fr-FR')}</p>
                              </div>
                              <a href={att.url} download className="text-xs text-primary hover:underline flex-shrink-0">Télécharger</a>
                              {canEditAtt && (
                                <button
                                  type="button"
                                  className="text-xs text-red-500 hover:text-red-700 flex-shrink-0"
                                  onClick={async () => {
                                    if (!confirm(`Supprimer ${att.name} ?`)) return;
                                    try {
                                      const fname = att.url.split('/').pop();
                                      await api.delete(`/wiki/${viewingPage.id}/attachments/${fname}`);
                                      toast.success('Fichier supprimé');
                                      const { data } = await api.get(`/wiki/${viewingPage.slug}`);
                                      setViewingPage(data);
                                    } catch { toast.error('Erreur suppression'); }
                                  }}
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })()}

              {/* Feedback block */}
              <div className="mt-10 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gradient-to-br from-gray-50 to-white dark:from-slate-900 dark:to-slate-900/60 p-6 text-center">
                <p className="text-sm font-semibold text-seal-navy dark:text-white mb-3">
                  Cet article vous a été utile ?
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => submitFeedback(viewingPage.id, 'up')}
                    disabled={currentFeedback !== null}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      currentFeedback === 'up'
                        ? 'bg-emerald-500 text-white border-emerald-500'
                        : 'bg-white dark:bg-slate-800 text-seal-navy dark:text-white border-gray-200 dark:border-slate-700 hover:border-emerald-300 hover:text-emerald-600'
                    } disabled:cursor-not-allowed`}
                  >
                    <ThumbsUp className="h-4 w-4" /> Oui {counts.up > 0 && `(${counts.up})`}
                  </button>
                  <button
                    onClick={() => submitFeedback(viewingPage.id, 'down')}
                    disabled={currentFeedback !== null}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                      currentFeedback === 'down'
                        ? 'bg-red-500 text-white border-red-500'
                        : 'bg-white dark:bg-slate-800 text-seal-navy dark:text-white border-gray-200 dark:border-slate-700 hover:border-red-300 hover:text-red-600'
                    } disabled:cursor-not-allowed`}
                  >
                    <ThumbsDown className="h-4 w-4" /> Non {counts.down > 0 && `(${counts.down})`}
                  </button>
                </div>
                {currentFeedback && (
                  <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 mt-3">Merci pour votre retour</p>
                )}
              </div>

              {/* Ask AI about this article */}
              <div className="mt-10 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Poser une question sur cet article</h3>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={wikiQuestion}
                    onChange={(e) => setWikiQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && wikiQuestion.trim().length >= 2 && !wikiAnswerLoading) {
                        setWikiAnswerLoading(true);
                        setWikiAnswer(null);
                        api.post(`/rag/wiki/${viewingPage.id}/ask`, { question: wikiQuestion.trim() }, { timeout: 120_000 })
                          .then(({ data }) => setWikiAnswer(data.answer))
                          .catch(() => setWikiAnswer('IA non disponible actuellement.'))
                          .finally(() => setWikiAnswerLoading(false));
                      }
                    }}
                    placeholder="Ex : Quelle est la procedure pour..."
                    className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <Button
                    size="sm"
                    disabled={wikiQuestion.trim().length < 2 || wikiAnswerLoading}
                    onClick={() => {
                      if (wikiQuestion.trim().length < 2) return;
                      setWikiAnswerLoading(true);
                      setWikiAnswer(null);
                      api.post(`/rag/wiki/${viewingPage.id}/ask`, { question: wikiQuestion.trim() }, { timeout: 120_000 })
                        .then(({ data }) => setWikiAnswer(data.answer))
                        .catch(() => setWikiAnswer('IA non disponible actuellement.'))
                        .finally(() => setWikiAnswerLoading(false));
                    }}
                  >
                    <Send className={`h-4 w-4 ${wikiAnswerLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                {wikiAnswerLoading && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" />
                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="ml-1">Analyse en cours...</span>
                  </div>
                )}
                {wikiAnswer && !wikiAnswerLoading && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 dark:bg-primary/10 p-3">
                    <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{wikiAnswer}</p>
                  </div>
                )}
              </div>

              {/* Backlinks — "Cité dans N articles" */}
              <WikiBacklinks
                pageId={viewingPage.id}
                onNavigate={(slug) => handleViewPage(slug)}
              />

              {/* Related / recent articles */}
              {related.length > 0 && (
                <section className="mt-10">
                  <h2 className="text-[11px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-3">
                    {relatedLabel}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {related.map((p) => {
                      const excerpt = stripHtml(p.content).slice(0, 120);
                      return (
                        <button
                          key={p.id}
                          onClick={() => handleViewPage(p.slug)}
                          className="text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-primary/40 hover:shadow-md transition-all group"
                        >
                          <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary line-clamp-2 mb-1.5">
                            {p.title}
                          </p>
                          {excerpt && (
                            <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 line-clamp-2 leading-relaxed mb-2">
                              {excerpt}{stripHtml(p.content).length > 120 ? '…' : ''}
                            </p>
                          )}
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-2">
                            <span>{p.author.firstName} {p.author.lastName}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(p.updatedAt)}</span>
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Previous / Next navigation */}
              {(prevPage || nextPage) && (
                <nav className="mt-10 flex items-stretch gap-3" aria-label="Navigation séquentielle">
                  {prevPage ? (
                    <button
                      onClick={() => handleViewPage(prevPage.slug)}
                      className="flex-1 text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-primary/40 hover:shadow-md transition-all group"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 flex items-center gap-1">
                        <ArrowLeft className="h-3 w-3" /> Précédent
                      </span>
                      <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary mt-1 line-clamp-1">
                        {prevPage.title}
                      </p>
                    </button>
                  ) : (
                    <div className="flex-1" />
                  )}
                  {nextPage ? (
                    <button
                      onClick={() => handleViewPage(nextPage.slug)}
                      className="flex-1 text-right rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-primary/40 hover:shadow-md transition-all group"
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 flex items-center gap-1 justify-end">
                        Suivant <ArrowRight className="h-3 w-3" />
                      </span>
                      <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary mt-1 line-clamp-1">
                        {nextPage.title}
                      </p>
                    </button>
                  ) : (
                    <div className="flex-1" />
                  )}
                </nav>
              )}
              </div>
            </article>

            {/* Sticky outline (>= 1280px) + mobile drawer fallback */}
            {!zenMode && (
              <WikiOutline entries={tocEntries} articleRef={articleRef} />
            )}

            {/* Right column: floating actions (visible from lg upwards) */}
            <aside className={`hidden lg:block w-60 flex-shrink-0 ${zenMode ? '!hidden' : ''}`}>
              <div className="sticky top-20 space-y-4">
                {/* Actions bar */}
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 flex flex-col">
                  <button
                    onClick={copyArticleLink}
                    className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-all ${
                      linkCopied
                        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/5'
                    }`}
                  >
                    {linkCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-500 animate-[scale-in_0.2s_ease-out]" /> Lien copié !
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copier le lien
                      </>
                    )}
                  </button>
                  <button
                    onClick={copyAllContent}
                    className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-all ${
                      contentCopied
                        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                        : 'text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/5'
                    }`}
                  >
                    {contentCopied ? (
                      <><Check className="h-3.5 w-3.5 text-emerald-500" /> Contenu copié !</>
                    ) : (
                      <><Clipboard className="h-3.5 w-3.5" /> Copier le contenu</>
                    )}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
                  </button>
                  <button
                    onClick={() => toggleFavorite(viewingPage.id)}
                    className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors ${
                      isFavorite
                        ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                        : 'text-seal-gray-500 dark:text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                    }`}
                  >
                    <Star className={`h-3.5 w-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                    {isFavorite ? 'Favori' : 'Marquer favori'}
                  </button>
                  <button
                    onClick={reportError}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  >
                    <AlertCircle className="h-3.5 w-3.5" /> Signaler une erreur
                  </button>
                </div>
              </div>
            </aside>
          </div>
        </div>

        {/* Edit dialog (from detail view) */}
        {renderFormDialog('edit')}

        {renderHistoryDialog()}
        {renderShareDialog()}

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          title={t('wiki.confirmDeleteTitle') || 'Supprimer la page'}
          description={t('wiki.confirmDelete')}
          variant="danger"
        />
      </>
    );
  }

  // List view
  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> {t('wiki.newPage')}
            </Button>
          )}
          <Button
            variant={isAdmin ? 'outline' : 'primary'}
            onClick={() => {
              resetForm('PRIVATE');
              setShowCreatePersonal(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nouvelle page personnelle
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowManageCategories(true)}>
              <Settings className="h-4 w-4" /> Catégories
            </Button>
          )}
        </div>
      </div>

      {/* Recently viewed articles */}
      {!viewingPage && recentlyViewed.length > 0 && !search && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 flex-shrink-0">Récents</span>
          {recentlyViewed.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                const found = pages.find(p => p.id === r.id);
                if (found) setViewingPage(found);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-seal-navy dark:text-white hover:bg-primary/10 hover:text-primary transition-colors truncate max-w-[200px] flex-shrink-0"
            >
              <Clock className="h-3 w-3 text-seal-gray-500 dark:text-slate-500 flex-shrink-0" />
              {r.title}
            </button>
          ))}
        </div>
      )}

      {/* Total article count */}
      {!loading && pages.length > 0 && (
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 font-medium">
          <span className="text-seal-navy dark:text-white font-semibold">{pages.length}</span> article{pages.length !== 1 ? 's' : ''}
          {search && sorted.length !== pages.length && (
            <span> — <span className="text-seal-navy dark:text-white font-semibold">{sorted.length}</span> résultat{sorted.length !== 1 ? 's' : ''}</span>
          )}
        </p>
      )}

      <div className="flex items-center gap-3">
        <div ref={searchContainerRef} className="relative flex-1">
          <SearchInput
            value={search}
            onChange={(val: string) => {
              setSearch(val);
              setShowSearchSuggestions(val.length >= 2);
              // Trigger Meilisearch with debounce
              if (meiliTimerRef.current) clearTimeout(meiliTimerRef.current);
              if (val.length >= 2) {
                meiliTimerRef.current = setTimeout(() => searchMeili(val), 300);
              } else {
                setMeiliResults([]);
              }
            }}
            onFocus={() => { if (search.length >= 2) setShowSearchSuggestions(true); }}
            placeholder={t('wiki.searchPlaceholder')}
            className="flex-1 w-full"
          />
          {/* Search suggestions dropdown — Meilisearch results preferred when available */}
          {showSearchSuggestions && (meiliResults.length > 0 || searchSuggestions.length > 0) && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 border-b border-gray-100 dark:border-slate-700 flex items-center gap-1.5">
                <Search className="h-3 w-3" /> {meiliResults.length > 0 ? 'Résultats' : 'Suggestions'}
                {meiliLoading && <span className="ml-1 animate-pulse">...</span>}
              </div>
              {(meiliResults.length > 0 ? meiliResults.slice(0, 5) : searchSuggestions).map((p) => {
                const formatted = '_formatted' in p ? (p as (typeof meiliResults)[number])._formatted : undefined;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setShowSearchSuggestions(false);
                      handleViewPage(p.slug);
                    }}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-3 border-b last:border-b-0 border-gray-50 dark:border-slate-800"
                  >
                    <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {formatted?.title ? (
                        <p
                          className="text-sm font-medium text-seal-navy dark:text-white truncate [&>em]:bg-yellow-200 [&>em]:dark:bg-yellow-700/50 [&>em]:not-italic [&>em]:rounded-sm [&>em]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formatted.title) }}
                        />
                      ) : (
                        <p className="text-sm font-medium text-seal-navy dark:text-white truncate">
                          {highlightText(p.title, search)}
                        </p>
                      )}
                      {formatted?.content ? (
                        <p
                          className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate mt-0.5 [&>em]:bg-yellow-200 [&>em]:dark:bg-yellow-700/50 [&>em]:not-italic [&>em]:rounded-sm [&>em]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(stripHtml(formatted.content).slice(0, 150)) }}
                        />
                      ) : (() => {
                        const plain = stripHtml(p.content);
                        const lIdx = plain.toLowerCase().indexOf(search.toLowerCase());
                        if (lIdx >= 0) {
                          const start = Math.max(0, lIdx - 40);
                          const end = Math.min(plain.length, lIdx + search.length + 80);
                          const snippet = (start > 0 ? '...' : '') + plain.slice(start, end) + (end < plain.length ? '...' : '');
                          return (
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate mt-0.5">
                              {highlightText(snippet, search)}
                            </p>
                          );
                        }
                        return p.category ? (
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">{p.category}</p>
                        ) : null;
                      })()}
                    </div>
                    <ChevronRight className="h-3 w-3 text-seal-gray-500 dark:text-slate-500 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <Select
          options={[
            { value: 'recent', label: 'Plus récents' },
            { value: 'alpha', label: 'Alphabétique' },
          ]}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'recent' | 'alpha')}
          className="w-44"
        />
        {/* View mode toggle */}
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
          <button
            onClick={() => setListViewMode('grid')}
            className={`p-1.5 rounded transition-colors ${
              listViewMode === 'grid'
                ? 'bg-primary/10 text-primary'
                : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
            }`}
            title="Vue grille"
            aria-label="Vue grille"
            aria-pressed={listViewMode === 'grid'}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setListViewMode('category')}
            className={`p-1.5 rounded transition-colors ${
              listViewMode === 'category'
                ? 'bg-primary/10 text-primary'
                : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white'
            }`}
            title="Vue par catégorie"
            aria-label="Vue par catégorie"
            aria-pressed={listViewMode === 'category'}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scope tabs: all vs mine */}
      <div className="flex items-center gap-0.5 border-b-2 border-gray-200 dark:border-slate-700">
        <button
          onClick={() => setScopeFilter(SCOPE_ALL)}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all duration-200 -mb-[2px] rounded-t-lg ${
            scopeFilter === SCOPE_ALL
              ? 'border-b-2 border-primary text-primary font-medium bg-primary/5 dark:bg-primary/10'
              : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="h-4 w-4" /> Toutes les pages
        </button>
        <button
          onClick={() => setScopeFilter(SCOPE_MINE)}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all duration-200 -mb-[2px] rounded-t-lg ${
            scopeFilter === SCOPE_MINE
              ? 'border-b-2 border-primary text-primary font-medium bg-primary/5 dark:bg-primary/10'
              : 'text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <User className="h-4 w-4" /> Mes pages
          {myPagesCount > 0 && (
            <span
              className={`ml-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                scopeFilter === SCOPE_MINE
                  ? 'bg-primary/15 text-primary'
                  : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-400'
              }`}
            >
              {myPagesCount}
            </span>
          )}
        </button>
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex gap-6">
        {/* Category sidebar tree */}
        <aside className="hidden md:block w-56 flex-shrink-0">
          <div className="sticky top-20 space-y-2">
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-2 px-2 flex items-center gap-1.5">
                <Filter className="h-3 w-3" /> Catégories
              </p>
              <nav className="space-y-0.5">
                {/* All categories button */}
                <button
                  onClick={() => setCategoryFilter(CATEGORY_ALL)}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs font-medium rounded-lg transition-all ${
                    categoryFilter === CATEGORY_ALL
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white'
                  }`}
                >
                  <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1 text-left truncate">Toutes les catégories</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    categoryFilter === CATEGORY_ALL
                      ? 'bg-primary/20 text-primary'
                      : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-500'
                  }`}>
                    {pages.length}
                  </span>
                </button>
                {/* Individual categories — group "Admin SYS" children */}
                {(() => {
                  const ADMIN_SYS_PREFIX = 'Admin SYS';
                  const allCats = categories.filter((c) => c !== CATEGORY_ALL);
                  const adminSysChildren = allCats.filter((c) => c.startsWith(ADMIN_SYS_PREFIX + ' '));
                  const otherCats = allCats.filter((c) => !adminSysChildren.includes(c));

                  const renderCatButton = (cat: string, indent = false) => {
                    const count = categoryCounts[cat] ?? 0;
                    const Icon = getCategoryIcon(cat);
                    const color = getCategoryColor(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`w-full flex items-center gap-2 py-2 text-xs font-medium rounded-lg transition-all ${
                          indent ? 'px-5' : 'px-2.5'
                        } ${
                          categoryFilter === cat
                            ? 'font-semibold'
                            : 'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white'
                        }`}
                        style={categoryFilter === cat ? { backgroundColor: `${color}15`, color } : undefined}
                      >
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="flex-1 text-left truncate">{indent ? cat.replace(ADMIN_SYS_PREFIX + ' — ', '') : cat}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          categoryFilter === cat
                            ? 'bg-white/30'
                            : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-500'
                        }`} style={categoryFilter === cat ? { color } : undefined}>
                          {count}
                        </span>
                      </button>
                    );
                  };

                  const result: React.ReactNode[] = [];
                  let adminSysInserted = false;

                  for (const cat of otherCats) {
                    // Insert the Admin SYS group at the alphabetical position of the first child
                    if (!adminSysInserted && adminSysChildren.length > 0 && cat.localeCompare(ADMIN_SYS_PREFIX, 'fr') > 0) {
                      adminSysInserted = true;
                      const parentCount = adminSysChildren.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0);
                      result.push(
                        <div key="__admin-sys-group" className="mt-1 mb-0.5">
                          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                            <Code className="h-3 w-3 flex-shrink-0" />
                            <span className="flex-1 text-left">{ADMIN_SYS_PREFIX}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-500">
                              {parentCount}
                            </span>
                          </div>
                          {adminSysChildren.map((c) => renderCatButton(c, true))}
                        </div>,
                      );
                    }
                    result.push(renderCatButton(cat));
                  }
                  // If Admin SYS group was never inserted (all cats come before it alphabetically)
                  if (!adminSysInserted && adminSysChildren.length > 0) {
                    const parentCount = adminSysChildren.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0);
                    result.push(
                      <div key="__admin-sys-group" className="mt-1 mb-0.5">
                        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                          <Code className="h-3 w-3 flex-shrink-0" />
                          <span className="flex-1 text-left">{ADMIN_SYS_PREFIX}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-500">
                            {parentCount}
                          </span>
                        </div>
                        {adminSysChildren.map((c) => renderCatButton(c, true))}
                      </div>,
                    );
                  }
                  return result;
                })()}
              </nav>
            </div>

            {/* Popular pages quick links */}
            {!loading && pages.length > 0 && (
              <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-2 px-2 flex items-center gap-1.5">
                  <Star className="h-3 w-3" /> Pages populaires
                </p>
                <div className="space-y-0.5">
                  {[...pages]
                    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
                    .slice(0, 3)
                    .map((page) => (
                      <button
                        key={page.id}
                        onClick={() => handleViewPage(page.slug)}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors group"
                      >
                        <p className="text-xs font-medium text-seal-navy dark:text-white truncate group-hover:text-primary transition-colors">
                          {page.title}
                        </p>
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="h-2.5 w-2.5" />
                          {formatRelativeTime(page.updatedAt)}
                        </p>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Mobile category pills (visible on small screens) */}
          <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-3 scrollbar-thin">
            <Filter className="h-4 w-4 text-seal-gray-500 dark:text-slate-400 flex-shrink-0" />
            {categories.map((cat) => {
              const count = cat === CATEGORY_ALL ? pages.length : (categoryCounts[cat] ?? 0);
              const Icon = cat === CATEGORY_ALL ? BookOpen : getCategoryIcon(cat);
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-full transition-all duration-200 whitespace-nowrap flex-shrink-0 shadow-sm ${
                    categoryFilter === cat
                      ? 'bg-[#004469] text-white shadow-md'
                      : 'bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 border border-gray-200 dark:border-slate-700 hover:border-[#004469]/40 hover:text-[#004469] dark:hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cat}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    categoryFilter === cat
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg shimmer" />
                <div className="h-4 w-2/3 rounded shimmer" />
              </div>
              <div className="h-3 w-full rounded shimmer" />
              <div className="h-3 w-5/6 rounded shimmer" />
              <div className="flex gap-2 pt-1">
                <div className="h-5 w-14 rounded-full shimmer" />
                <div className="h-5 w-16 rounded-full shimmer" />
              </div>
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="space-y-5">
          <EmptyState
            type="documents"
            title={pages.length === 0 ? t('wiki.empty') : 'Aucune page ne correspond \u00e0 vos crit\u00e8res'}
            description={pages.length === 0 ? t('wiki.emptyDescription') : 'Essayez d\u2019\u00e9largir votre recherche ou de s\u00e9lectionner une autre cat\u00e9gorie.'}
          />
          {pages.length === 0 && (
            <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-seal-navy dark:text-white mb-1">
                  Démarrer à partir d&apos;un modèle
                </h3>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Choisissez un modèle pré-rempli pour créer votre première page rapidement.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {WIKI_TEMPLATES.map((tpl) => {
                  const Icon = tpl.icon;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className="text-left rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:border-primary/40 hover:shadow-md transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white group-hover:text-primary transition-colors">
                            {tpl.title}
                          </p>
                          <p className="text-[11px] text-seal-gray-500 dark:text-slate-500 leading-relaxed mt-0.5">
                            {tpl.description}
                          </p>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary mt-2">
                            Utiliser ce modèle <ArrowRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : listViewMode === 'grid' ? (
        /* ===== GRID VIEW ===== Notion-like responsive cards */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((page) => {
            const isOwner = user && page.author.id === user.id;
            const canEditPage =
              isAdmin ||
              isOwner ||
              (user && (page.collaborators ?? []).includes(user.id));
            const pageVisibility =
              (page.visibility as WikiVisibility) || 'PUBLIC';
            const lockActive =
              page.editLockUserId &&
              page.editLockExpiresAt &&
              new Date(page.editLockExpiresAt).getTime() > Date.now() &&
              page.editLockUserId !== user?.id;
            const catColor = getCategoryColor(page.category);
            const CardCatIcon = getCategoryIcon(page.category);
            const excerpt = page.content ? stripHtml(page.content) : '';
            return (
              <article
                key={page.id}
                onClick={() => handleViewPage(page.slug)}
                className="stagger-item group relative flex flex-col cursor-pointer rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-[#F9964A]/60 focus-within:border-[#F9964A]/60"
              >
                {/* Top color band (category accent) */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: catColor }}
                />

                <div className="flex-1 p-5 pt-6">
                  {/* Header: icon + title */}
                  <div className="flex items-start gap-3">
                    <div
                      className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105"
                      style={{ background: `${catColor}18`, color: catColor }}
                    >
                      <CardCatIcon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[15px] font-semibold leading-snug text-seal-navy dark:text-white line-clamp-2 group-hover:text-[#F9964A] transition-colors">
                        {highlightText(page.title, search)}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-seal-gray-500 dark:text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="h-4 w-4 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[8px] font-bold">
                            {page.author.firstName[0]}{page.author.lastName[0]}
                          </span>
                          <span className="truncate max-w-[8rem]">
                            {page.author.firstName} {page.author.lastName}
                          </span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(page.updatedAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Excerpt — 2 lines */}
                  {excerpt && (
                    <p className="text-[12.5px] leading-relaxed text-seal-gray-500 dark:text-slate-400 mt-3 line-clamp-2">
                      {highlightText(
                        excerpt.slice(0, 160) + (excerpt.length > 160 ? '…' : ''),
                        search,
                      )}
                    </p>
                  )}

                  {/* Badges row (tags / visibility / status) */}
                  <div className="flex items-center gap-1.5 mt-4 flex-wrap">
                    {page.category && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ color: catColor, background: `${catColor}15` }}
                      >
                        {page.category}
                      </span>
                    )}
                    {(() => {
                      const src = getImportSource(page.category);
                      return src ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium tracking-wide ${
                          src === 'Notion'
                            ? 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
                            : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                        }`}>
                          {src}
                        </span>
                      ) : null;
                    })()}
                    <Badge variant={VISIBILITY_BADGE[pageVisibility]}>
                      {VISIBILITY_LABELS[pageVisibility]}
                    </Badge>
                    {isNewArticle(page.createdAt) && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F9964A]/15 text-[#c46714] border border-[#F9964A]/30 dark:bg-[#F9964A]/20 dark:text-[#FBC078] dark:border-[#F9964A]/40">
                        Nouveau
                      </span>
                    )}
                    {lockActive && (
                      <Badge variant="warning">
                        <Lock className="h-3 w-3" /> Verrouillée
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Footer action bar */}
                {canEditPage && (
                  <div className="flex items-center gap-2 px-5 py-2 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEdit(page);
                      }}
                      disabled={!!lockActive}
                    >
                      <Edit className="h-3 w-3" /> {t('wiki.edit')}
                    </Button>
                    {(isSuperAdmin || isOwner) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(page);
                        }}
                        className="text-red-500 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        /* ===== CATEGORY ACCORDION VIEW avec drag-and-drop =====
           Les articles peuvent être déplacés entre catégories en les glissant
           via le handle (GripVertical). Le drop sur une autre section déclenche
           un PATCH /wiki/:id { category }. Nécessite droit d'édition. */
        <CategoryDndView
          groupedByCategory={groupedByCategory}
          expandedAccordions={expandedAccordions}
          toggleAccordion={toggleAccordion}
          onViewPage={handleViewPage}
          canEdit={(page) => {
            const isOwner = user && page.author && ('id' in page.author) && (page.author as { id: string }).id === user.id;
            return Boolean(isAdmin || isOwner);
          }}
          formatRelativeTime={formatRelativeTime}
          getCategoryColor={getCategoryColor}
          getCategoryIcon={getCategoryIcon}
          highlightText={highlightText}
          search={search}
          onMoveArticle={async (articleId, targetCategory) => {
            // Backend accepte category='' pour remettre à null
            await api.patch(`/wiki/${articleId}`, { category: targetCategory || null });
            // Recharger la liste pour refléter le changement
            await fetchPages();
          }}
        />
      )}
        </div>
      </div>

      {/* Create dialog (admin) */}
      {renderFormDialog('create')}

      {/* Create personal page dialog */}
      {renderFormDialog('createPersonal')}

      {/* Edit dialog (from list view) */}
      {!viewingPage && renderFormDialog('edit')}

      {/* History & share dialogs */}
      {renderHistoryDialog()}
      {renderShareDialog()}

      {/* Insert link dialog */}
      <Dialog open={showLinkDialog} onClose={() => setShowLinkDialog(false)} title="Ajouter un lien">
        <div className="space-y-3">
          <Input
            label="URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
          />
          <Input
            label="Texte du lien"
            value={linkText}
            onChange={(e) => setLinkText(e.target.value)}
            placeholder="Texte a afficher"
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowLinkDialog(false)}>Annuler</Button>
            <Button onClick={() => {
              if (!linkUrl) return;
              if (editorRef.current) {
                editorRef.current.focus();
                const text = linkText || linkUrl;
                document.execCommand('insertHTML', false, `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`);
                setFormData((f) => ({ ...f, content: editorRef.current!.innerHTML }));
              }
              setShowLinkDialog(false);
            }}>Inserer</Button>
          </div>
        </div>
      </Dialog>

      {/* Insert image dialog */}
      <Dialog open={showImageDialog} onClose={() => setShowImageDialog(false)} title="Ajouter une image">
        <div className="space-y-3">
          <Input
            label="URL de l'image"
            value={imgUrl}
            onChange={(e) => setImgUrl(e.target.value)}
            placeholder="https://..."
          />
          <Input
            label="Texte alternatif"
            value={imgAlt}
            onChange={(e) => setImgAlt(e.target.value)}
            placeholder="Description de l'image"
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowImageDialog(false)}>Annuler</Button>
            <Button onClick={() => {
              if (!imgUrl) return;
              // Append <img> to current content. RichTextEditor re-sync l'innerHTML
              // quand l'éditeur n'est pas focus (on vient de fermer le dialog).
              const safeAlt = (imgAlt || 'image').replace(/"/g, '&quot;');
              const safeUrl = imgUrl.replace(/"/g, '&quot;');
              const imgHtml = `<p><img src="${safeUrl}" alt="${safeAlt}" style="max-width:100%;" /></p>`;
              const next = (editorContentRef.current || formData.content || '') + imgHtml;
              editorContentRef.current = next;
              setFormData((f) => ({ ...f, content: next }));
              setShowImageDialog(false);
            }}>Inserer</Button>
          </div>
        </div>
      </Dialog>

      {/* Manage categories dialog */}
      <Dialog
        open={showManageCategories}
        onClose={() => { setShowManageCategories(false); setNewCategoryInput(''); }}
        title="Gérer les catégories Wiki"
      >
        <div className="space-y-4">
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Ajoutez des catégories prédéfinies. Elles apparaîtront dans le filtre et en suggestion lors de la création/édition de pages.
          </p>
          {/* Add new category */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newCategoryInput}
              onChange={(e) => setNewCategoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCategoryInput.trim()) {
                  const trimmed = newCategoryInput.trim();
                  if (!managedCategories.includes(trimmed)) {
                    const updated = [...managedCategories, trimmed].sort();
                    saveManagedCategories(updated);
                  }
                  setNewCategoryInput('');
                }
              }}
              placeholder="Nouvelle catégorie…"
              className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button
              size="sm"
              onClick={() => {
                const trimmed = newCategoryInput.trim();
                if (!trimmed) return;
                if (!managedCategories.includes(trimmed)) {
                  const updated = [...managedCategories, trimmed].sort();
                  saveManagedCategories(updated);
                }
                setNewCategoryInput('');
              }}
            >
              <Plus className="h-4 w-4" /> Ajouter
            </Button>
          </div>
          {/* Existing categories */}
          {categories.filter(c => c !== CATEGORY_ALL).length === 0 ? (
            <p className="text-xs text-center text-seal-gray-500 dark:text-slate-500 py-4">Aucune catégorie pour l'instant</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.filter(c => c !== CATEGORY_ALL).map(cat => {
                const isManaged = managedCategories.includes(cat);
                const pageCount = pages.filter(p => p.category === cat).length;
                return (
                  <div key={cat} className="flex items-center justify-between rounded-lg px-3 py-2 bg-gray-50 dark:bg-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-seal-navy dark:text-white">{cat}</span>
                      <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">{pageCount} page{pageCount !== 1 ? 's' : ''}</span>
                      {!isManaged && <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 italic">depuis les pages</span>}
                    </div>
                    {isManaged && (
                      <button
                        onClick={() => {
                          const updated = managedCategories.filter(c => c !== cat);
                          saveManagedCategories(updated);
                        }}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition-colors"
                        title="Supprimer cette catégorie"
                        aria-label="Supprimer cette catégorie"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => { setShowManageCategories(false); setNewCategoryInput(''); }}>
              Fermer
            </Button>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t('wiki.confirmDeleteTitle') || 'Supprimer la page'}
        description={t('wiki.confirmDelete')}
        variant="danger"
      />
    </div>
  );
}
