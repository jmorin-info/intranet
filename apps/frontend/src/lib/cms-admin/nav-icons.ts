/**
 * Registre d'icônes Lucide disponibles pour les items custom de la sidebar.
 *
 * Une whitelist explicite est nécessaire pour 2 raisons :
 *  1. Lucide expose ~1500 icônes — on n'en propose qu'une sélection cohérente
 *     avec la nav existante (sécurité, métier, admin) pour ne pas noyer l'UX.
 *  2. Tree-shaking : importer des composants nommés permet à Next.js de ne
 *     bundler que les icônes réellement déclarées ici.
 *
 * Utilisé :
 *  - par `components/layout/sidebar.tsx` pour rendre les items custom CMS,
 *  - par `lib/cms-admin/schemas.ts` comme énum du champ `iconKey` du bloc
 *    `nav.sidebar.custom_items`.
 */

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardList,
  Cog,
  Database,
  ExternalLink,
  FileText,
  FileType,
  GitBranch,
  Globe2,
  GraduationCap,
  HardDrive,
  Headset,
  Home,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link,
  MessageCircle,
  Newspaper,
  PenLine,
  Rss,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Ticket,
  User,
  UserCheck2,
  UserPlus,
  Users,
  Workflow,
  Wrench,
} from "lucide-react";

import type { EnumOption } from "./schemas-types";

// `satisfies` plutôt qu'annotation explicite : on conserve la précision du
// type littéral (chaque clé est connue de TS) tout en garantissant la
// conformité à `Record<string, LucideIcon>`. Permet à
// `NAV_ICON_REGISTRY[NavIconKey]` de renvoyer `LucideIcon` sans `| undefined`.
export const NAV_ICON_REGISTRY = {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Bell,
  BookMarked,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Camera,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardList,
  Cog,
  Database,
  ExternalLink,
  FileText,
  FileType,
  GitBranch,
  Globe2,
  GraduationCap,
  HardDrive,
  Headset,
  Home,
  Inbox,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link,
  MessageCircle,
  Newspaper,
  PenLine,
  Rss,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Star,
  Ticket,
  User,
  UserCheck2,
  UserPlus,
  Users,
  Workflow,
  Wrench,
} satisfies Record<string, LucideIcon>;

export type NavIconKey = keyof typeof NAV_ICON_REGISTRY;

export function isNavIconKey(value: string): value is NavIconKey {
  return value in NAV_ICON_REGISTRY;
}

/** Liste plate des icônes pour le select form-driven (triée alphabétique). */
export const NAV_ICON_OPTIONS: EnumOption[] = Object.keys(NAV_ICON_REGISTRY)
  .sort((a, b) => a.localeCompare(b))
  .map((k) => ({ value: k, label: k }));
