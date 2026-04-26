"use client";

import { create } from "zustand";
import { UserRole } from "@omnitech/shared";
import { api } from "@/lib/api";

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
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string;
  } | null;
  subordinates?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl?: string;
  }[];
  canManageMedia?: boolean;
  /** Preferred UI language, mirrored from User.locale. */
  locale?: "fr" | "en";
  /** First-login welcome tour — timestamp of completion, null = not done. */
  onboardingCompletedAt?: string | null;
  /** Dashboard welcome checklist dismissal timestamp. */
  welcomeChecklistDismissedAt?: string | null;
  /**
   * Mode humour Noa — opt-in par utilisateur (cf. profile + admin/users).
   * Sans effet si le feature flag global `feature.humor.noa` est OFF.
   */
  noaEnabled?: boolean;
}

/**
 * Push the server-side locale into the UI store if (and only if) it differs
 * from what's already in localStorage. Runs inside a dynamic import to avoid
 * a circular dep between auth-store and ui-store at module init time.
 */
function hydrateLocaleFromUser(raw: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const serverLocale = raw.locale as string | undefined | null;
  if (serverLocale !== "fr" && serverLocale !== "en") return;
  // Toujours écrire le cookie NEXT_LOCALE au login : pour next-intl côté
  // RSC. setLocale() écrit aussi le cookie, mais on bypasse l'API call si
  // la valeur est déjà en sync (skipRemote: true).
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `NEXT_LOCALE=${serverLocale}; Max-Age=${oneYear}; Path=/; SameSite=Lax`;
  const current = localStorage.getItem("locale");
  if (current === serverLocale) return;
  // Lazy require to dodge circular deps
  import("@/stores/ui-store")
    .then(({ useUIStore }) => {
      useUIStore.getState().setLocale(serverLocale, { skipRemote: true });
    })
    .catch(() => {});
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
  const locale =
    raw.locale === "fr" || raw.locale === "en"
      ? (raw.locale as "fr" | "en")
      : undefined;
  return {
    id: raw.id as string,
    email: raw.email as string,
    firstName: raw.firstName as string,
    lastName: raw.lastName as string,
    role: raw.role as UserRole,
    departmentId: raw.departmentId as string | undefined,
    departmentName: (raw.department as Record<string, unknown>)?.name as
      | string
      | undefined,
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
    manager: raw.manager as AuthUser["manager"],
    subordinates: raw.subordinates as AuthUser["subordinates"],
    canManageMedia: raw.canManageMedia as boolean | undefined,
    locale,
    onboardingCompletedAt:
      (raw.onboardingCompletedAt as string | null | undefined) ?? null,
    welcomeChecklistDismissedAt:
      (raw.welcomeChecklistDismissedAt as string | null | undefined) ?? null,
    noaEnabled: Boolean(raw.noaEnabled),
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string, mfaCode?: string) => {
    const body: Record<string, string> = { email, password };
    if (mfaCode) body.mfaCode = mfaCode;
    const { data } = await api.post("/auth/login", body);
    if (data.mfaRequired) {
      throw Object.assign(new Error("MFA_REQUIRED"), {
        mfaRequired: true,
        email: data.email,
      });
    }
    // ANSSI A.5.34 / OWASP A05 — accessToken vit désormais en cookie httpOnly
    // posé par le backend ; on ne le persiste plus en localStorage (anti-XSS).
    // refreshToken est aussi en cookie httpOnly (déjà migré, ANSSI R16).
    // Flag prestataire who needs MFA setup (will be redirected by auth provider)
    if (data.mfaSetupRequired) {
      localStorage.setItem("mfaSetupRequired", "true");
    }
    hydrateLocaleFromUser(data.user as Record<string, unknown>);
    set({ user: mapUser(data.user), isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      // Both accessToken and refreshToken cookies are sent automatically and
      // cleared server-side by the backend.
      await api.post("/auth/logout", {});
    } catch {
      // ignore logout errors
    }
    // Cleanup rétrocompat — supprime le legacy localStorage des sessions
    // précédentes (avant migration cookie). N'a aucun effet sur les sessions
    // post-migration (la clé est déjà absente).
    localStorage.removeItem("accessToken");
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchMe: async () => {
    try {
      // Le JWT est désormais dans un cookie httpOnly envoyé automatiquement
      // (axios `withCredentials: true`). On ne pré-vérifie plus la présence
      // d'un token côté JS — on laisse le backend trancher via /auth/me.
      // Si pas de cookie valide, on récupère 401 et on tombe dans le catch.
      const { data } = await api.get("/auth/me");
      hydrateLocaleFromUser(data as Record<string, unknown>);
      set({ user: mapUser(data), isAuthenticated: true, isLoading: false });
    } catch (err: unknown) {
      // Cleanup rétrocompat du legacy localStorage en cas d'auth fail.
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401 || status === 403) {
        localStorage.removeItem("accessToken");
      }
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => {
    set({ user, isAuthenticated: !!user, isLoading: false });
  },
}));
