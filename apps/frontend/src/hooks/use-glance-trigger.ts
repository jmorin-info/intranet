"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useGlanceStore } from "@/stores/glance-store";
import { useUIStore } from "@/stores/ui-store";

/**
 * useGlanceTrigger — listener global pour déclencher Glance.
 *
 * Deux déclencheurs :
 *   1. **Alt+Clic** sur n'importe quel lien interne → ouvre Glance en mode
 *      normal (panneau flottant). Comportement historique conservé.
 *   2. **Auto** (sans Alt) : si la page courante (`pathname`) est épinglée
 *      par l'utilisateur (`sidebarPinned`) ET que le clic cible un lien
 *      interne pointant vers une autre racine de chemin, on ouvre la cible
 *      en Glance plutôt que de quitter la page épinglée.
 *
 * Ce comportement correspond aux "essential tabs" de Zen-Browser : une page
 * épinglée reste ouverte et toute navigation hors de cette page se fait en
 * surimpression (preview), pour ne pas perdre le contexte.
 *
 * Le hook s'enregistre **en capture phase** AVANT FocusMode pour intercepter
 * les clics sur <a> avant le focus-element. Il remplace l'ancien listener
 * inline dans `glance-overlay.tsx`.
 */

/** Renvoie le segment racine d'un pathname : `/wiki/abc/def` → `/wiki`. */
function rootSegment(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  const slash = pathname.indexOf("/", 1);
  return slash === -1 ? pathname : pathname.slice(0, slash);
}

/** Un `<a href>` interne : même origine, pas target=_blank, pas download.
 *  Renvoie l'URL relative absolue (pathname+search+hash) si c'est un lien
 *  intranet, sinon null.
 */
function resolveInternalHref(a: HTMLAnchorElement): string | null {
  if (!a.href) return null;
  if (a.target && a.target !== "_self") return null;
  if (a.hasAttribute("download")) return null;

  let url: URL;
  try {
    url = new URL(a.href, window.location.origin);
  } catch {
    return null;
  }

  if (url.origin !== window.location.origin) return null;
  if (url.pathname.startsWith("/api/")) return null;

  // Hash sur la même page → laisser le navigateur scroller
  const sameDoc =
    url.pathname === window.location.pathname &&
    url.search === window.location.search;
  if (sameDoc && url.hash) return null;

  return url.pathname + url.search + url.hash;
}

export function useGlanceTrigger(): void {
  const pathname = usePathname();
  const enabled = useGlanceStore((s) => s.enabled);
  const open = useGlanceStore((s) => s.open);
  const setEnabled = useGlanceStore((s) => s.setEnabled);
  const sidebarPinned = useUIStore((s) => s.sidebarPinned);

  // Si Glance est désactivé via le toggle profile, on enregistre quand même
  // un listener Alt+Clic sur les liens internes pour prévenir l'utilisateur :
  // sinon il presse Alt+Clic et rien ne se passe (pas même le mode focus,
  // qui skip les liens), il croit que la feature est buggée.
  useEffect(() => {
    if (enabled) return;
    let lastToastAt = 0;

    const onAltClickWhileDisabled = (e: MouseEvent) => {
      if (!e.altKey) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.button !== 0) return;
      const target = (e.target as HTMLElement | null)?.closest?.(
        "a",
      ) as HTMLAnchorElement | null;
      if (!target) return;
      const href = resolveInternalHref(target);
      if (!href) return;

      // Throttle : un toast max toutes les 5s
      const now = Date.now();
      if (now - lastToastAt < 5000) return;
      lastToastAt = now;

      e.preventDefault();
      e.stopImmediatePropagation();
      toast("Glance désactivé", {
        description:
          "Active la prévisualisation rapide depuis Profil → Préférences.",
        action: {
          label: "Activer",
          onClick: () => setEnabled(true),
        },
        duration: 5000,
      });
    };

    window.addEventListener("click", onAltClickWhileDisabled, { capture: true });
    return () =>
      window.removeEventListener("click", onAltClickWhileDisabled, {
        capture: true,
      } as EventListenerOptions);
  }, [enabled, setEnabled]);

  useEffect(() => {
    if (!enabled) return;

    // Pages épinglées « pin-équivalentes » : on compare au segment racine
    // pour qu'un pin sur `/dashboard` matche aussi `/dashboard/quelquechose`.
    const pinnedRoots = new Set(sidebarPinned.map(rootSegment));
    const currentRoot = pathname ? rootSegment(pathname) : null;
    const onPinnedPage = currentRoot ? pinnedRoots.has(currentRoot) : false;

    const onClick = (e: MouseEvent) => {
      // Ignore les modificateurs spéciaux (Ctrl/Meta/Shift) : l'utilisateur
      // veut probablement un nouvel onglet natif.
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.button !== 0) return;

      const target = (e.target as HTMLElement | null)?.closest?.(
        "a",
      ) as HTMLAnchorElement | null;
      if (!target) return;

      const href = resolveInternalHref(target);
      if (!href) return;

      // Cas 1 : Alt+Clic explicite → toujours Glance.
      if (e.altKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        open(href, { x: e.clientX, y: e.clientY });
        return;
      }

      // Cas 2 : auto-trigger sur page épinglée. On ne déclenche que si la
      // cible quitte le segment racine courant (sinon navigation interne au
      // hub épinglé, on laisse passer normalement).
      if (!onPinnedPage) return;
      const targetRoot = rootSegment(href);
      if (targetRoot === currentRoot) return;

      // Skip si l'élément a opt-out via data-attribute (ex: bouton « ouvrir
      // dans la même page »).
      if (target.hasAttribute("data-glance-skip")) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      open(href, { x: e.clientX, y: e.clientY });
    };

    window.addEventListener("click", onClick, { capture: true });
    return () =>
      window.removeEventListener("click", onClick, {
        capture: true,
      } as EventListenerOptions);
  }, [enabled, open, pathname, sidebarPinned]);
}
