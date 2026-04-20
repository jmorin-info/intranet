import { create } from 'zustand';

interface FocusModeState {
  mode: 'NORMAL' | 'FOCUS';
  toggle: () => void;
  activate: () => void;
  deactivate: () => void;
}

export const useFocusModeStore = create<FocusModeState>((set) => ({
  mode: 'NORMAL',
  toggle: () => set((s) => ({ mode: s.mode === 'NORMAL' ? 'FOCUS' : 'NORMAL' })),
  activate: () => set({ mode: 'FOCUS' }),
  deactivate: () => set({ mode: 'NORMAL' }),
}));
