import { create } from 'zustand';

/**
 * Chatbot store — étendu pour les Features Polish (Mission "10 features").
 *
 * Nouveautés vs. version initiale :
 *   - `queryId`  → relier un message assistant à RagQueryLog (feedback)
 *   - `sources`  → citations RAG par message
 *   - `aborted`  → flag affichage "Génération arrêtée"
 *   - actions   → updateMessage, removeAfter, regenerateLast
 *   - search    → terme de recherche dans l'historique (Feature 9)
 */

export interface ChatCitation {
  sourceType: string;
  sourceId: string;
  title?: string;
  score: number;
  chunkIndex?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: { page?: string; module?: string };
  /** ID RagQueryLog côté backend pour feedback (assistant only). */
  queryId?: string;
  /** Citations RAG (assistant only). */
  sources?: ChatCitation[];
  /** Flag "génération interrompue par l'utilisateur". */
  aborted?: boolean;
  /** Indique que le message a été régénéré (compteur). */
  regenerateCount?: number;
}

interface ChatbotState {
  open: boolean;
  messages: ChatMessage[];
  loading: boolean;
  /** Flag streaming actif (pour bouton stop). */
  streaming: boolean;
  /** Recherche live dans l'historique (Feature 9). */
  searchTerm: string;

  toggle: () => void;
  close: () => void;
  addMessage: (msg: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  removeAfter: (messageId: string) => void;
  setLoading: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  setSearchTerm: (v: string) => void;
  clearHistory: () => void;
}

const STORAGE_KEY = 'omnitech:chatbot:history';

function loadHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistHistory(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    // Keep last 50 messages
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
  } catch {
    /* storage full */
  }
}

export const useChatbotStore = create<ChatbotState>((set, get) => ({
  open: false,
  messages: loadHistory(),
  loading: false,
  streaming: false,
  searchTerm: '',
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
  addMessage: (msg) => {
    const next = [...get().messages, msg];
    persistHistory(next);
    set({ messages: next });
  },
  updateMessage: (id, patch) => {
    const next = get().messages.map((m) => (m.id === id ? { ...m, ...patch } : m));
    persistHistory(next);
    set({ messages: next });
  },
  removeAfter: (messageId) => {
    const idx = get().messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const next = get().messages.slice(0, idx + 1);
    persistHistory(next);
    set({ messages: next });
  },
  setLoading: (v) => set({ loading: v }),
  setStreaming: (v) => set({ streaming: v }),
  setSearchTerm: (v) => set({ searchTerm: v }),
  clearHistory: () => {
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    set({ messages: [], searchTerm: '' });
  },
}));
