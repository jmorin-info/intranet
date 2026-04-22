'use client';

import { create } from 'zustand';
import { UserRole } from '@omnitech/shared';
import { api } from '@/lib/api';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  departmentId?: string;
  departmentName?: string;
  avatarUrl?: string;
  createdAt?: string;
  gdprConsentAt?: string;
  mfaEnabled?: boolean;
  phone?: string;
  location?: string;
  skills?: string;
  languages?: string;
  teamsLink?: string;
  jobTitle?: string;
  managerId?: string;
  manager?: { id: string; firstName: string; lastName: string; email: string; avatarUrl?: string } | null;
  subordinates?: { id: string; firstName: string; lastName: string; email: string; avatarUrl?: string }[];
  canManageMedia?: boolean;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, mfaCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

function mapUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: raw.id as string,
    email: raw.email as string,
    firstName: raw.firstName as string,
    lastName: raw.lastName as string,
    role: raw.role as UserRole,
    departmentId: raw.departmentId as string | undefined,
    departmentName: (raw.department as Record<string, unknown>)?.name as string | undefined,
    avatarUrl: raw.avatarUrl as string | undefined,
    createdAt: raw.createdAt as string | undefined,
    gdprConsentAt: raw.gdprConsentAt as string | undefined,
    mfaEnabled: raw.mfaEnabled as boolean | undefined,
    phone: raw.phone as string | undefined,
    location: raw.location as string | undefined,
    skills: raw.skills as string | undefined,
    languages: raw.languages as string | undefined,
    teamsLink: raw.teamsLink as string | undefined,
    jobTitle: raw.jobTitle as string | undefined,
    managerId: raw.managerId as string | undefined,
    manager: raw.manager as AuthUser['manager'],
    subordinates: raw.subordinates as AuthUser['subordinates'],
    canManageMedia: raw.canManageMedia as boolean | undefined,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string, mfaCode?: string) => {
    const body: Record<string, string> = { email, password };
    if (mfaCode) body.mfaCode = mfaCode;
    const { data } = await api.post('/auth/login', body);
    if (data.mfaRequired) {
      throw Object.assign(new Error('MFA_REQUIRED'), { mfaRequired: true, email: data.email });
    }
    localStorage.setItem('accessToken', data.accessToken);
    // refreshToken is now stored in a httpOnly cookie by the backend (ANSSI R16)
    // Flag prestataire who needs MFA setup (will be redirected by auth provider)
    if (data.mfaSetupRequired) {
      localStorage.setItem('mfaSetupRequired', 'true');
    }
    set({ user: mapUser(data.user), isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      // The refresh token cookie is sent automatically and cleared by the backend
      await api.post('/auth/logout', {});
    } catch {
      // ignore logout errors
    }
    localStorage.removeItem('accessToken');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchMe: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const { data } = await api.get('/auth/me');
      set({ user: mapUser(data), isAuthenticated: true, isLoading: false });
    } catch (err: unknown) {
      // Only clear the token on a definitive auth failure (401/403).
      // Network errors, aborts, or timeouts should NOT destroy a potentially valid token
      // — the user may simply be offline or the request was aborted by a page reload.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem('accessToken');
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user, isLoading: false });
  },
}));
