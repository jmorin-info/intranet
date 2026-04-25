import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...options,
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "A l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  if (hours < 24) return `Il y a ${hours}h`;
  if (days < 7) return `Il y a ${days}j`;
  return formatDate(d);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "...";
}

export function getInitials(
  firstName?: string | null,
  lastName?: string | null,
): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  const initials = `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  return initials || "?";
}

/**
 * Affichage user-facing du nom complet, avec fallback robustes pour les
 * comptes LDAP partiels (firstName/lastName manquants — fréquent sur les
 * comptes service ou imports incomplets). Ordre :
 *  1. "Prénom Nom" si les deux présents
 *  2. Le seul présent (firstName ou lastName)
 *  3. La partie locale de l'email (avant @)
 *  4. "(Sans nom)" en dernier recours
 */
export function formatUserName(user: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const f = (user.firstName ?? "").trim();
  const l = (user.lastName ?? "").trim();
  if (f && l) return `${f} ${l}`;
  if (f) return f;
  if (l) return l;
  const email = (user.email ?? "").trim();
  if (email) return email.split("@")[0] ?? email;
  return "(Sans nom)";
}
