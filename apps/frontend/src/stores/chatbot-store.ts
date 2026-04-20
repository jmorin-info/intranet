import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  context?: { page?: string; module?: string };
}

interface ChatbotState {
  open: boolean;
  messages: ChatMessage[];
  loading: boolean;
  toggle: () => void;
  close: () => void;
  addMessage: (msg: ChatMessage) => void;
  setLoading: (v: boolean) => void;
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
  } catch { /* storage full */ }
}

export const useChatbotStore = create<ChatbotState>((set, get) => ({
  open: false,
  messages: loadHistory(),
  loading: false,
  toggle: () => set(s => ({ open: !s.open })),
  close: () => set({ open: false }),
  addMessage: (msg) => {
    const next = [...get().messages, msg];
    persistHistory(next);
    set({ messages: next });
  },
  setLoading: (v) => set({ loading: v }),
  clearHistory: () => {
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    set({ messages: [] });
  },
}));
