/**
 * Détection de plateforme côté navigateur — utilisée pour orchestrer le
 * flow de notifications push, en particulier sur Safari iOS qui exige que
 * la PWA soit installée à l'écran d'accueil avant de pouvoir demander la
 * permission Notifications.
 *
 * Toutes les fonctions sont safe à appeler en SSR (retournent des valeurs
 * neutres si `window`/`navigator` est absent).
 */

export type DetectedPlatform = 'ios' | 'macos' | 'android' | 'desktop' | 'unknown';

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean;
}

/**
 * Renvoie la plateforme courante. La détection iOS / iPadOS prend en compte
 * le quirk d'iPadOS 13+ qui rapporte "Macintosh" dans l'UA mais expose des
 * points tactiles (`maxTouchPoints > 1`).
 */
export function detectPlatform(ua?: string): DetectedPlatform {
  if (typeof window === 'undefined' && !ua) return 'unknown';
  const userAgent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!userAgent) return 'unknown';
  const lower = userAgent.toLowerCase();

  if (/iphone|ipod/.test(lower)) return 'ios';
  if (/ipad/.test(lower)) return 'ios';

  // iPadOS 13+ : "Macintosh" + Touch UI -> en réalité un iPad.
  const touchPoints =
    typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
      ? navigator.maxTouchPoints
      : 0;
  if (/macintosh|mac os x/.test(lower) && touchPoints > 1) return 'ios';

  if (/android/.test(lower)) return 'android';
  if (/macintosh|mac os x/.test(lower)) return 'macos';
  if (/windows|linux|cros/.test(lower)) return 'desktop';
  return 'unknown';
}

/**
 * Vrai si la page tourne en mode standalone (PWA installée à l'écran
 * d'accueil ou ouverte depuis le launcher). Utile pour Safari iOS qui
 * conditionne l'API Notifications à ce mode.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari historique expose `navigator.standalone`. On lit via le
  // global plutôt que via `window.navigator` pour être compatible avec
  // les environnements de test où `window` est stubbé sans `navigator`.
  if (typeof navigator !== 'undefined') {
    const nav = navigator as NavigatorWithStandalone;
    if (nav.standalone === true) return true;
  }
  // Tous les autres navigateurs (Chrome, Edge, Firefox, Safari macOS)
  // exposent `display-mode: standalone` via matchMedia.
  if (typeof window.matchMedia === 'function') {
    try {
      return window.matchMedia('(display-mode: standalone)').matches;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Vrai pour Safari iOS (iPhone / iPad / iPod). Détecte aussi les autres
 * navigateurs sur iOS, qui utilisent en fait WebKit en sous-couche et
 * partagent les mêmes contraintes (Apple impose WebKit côté iOS).
 */
export function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  return detectPlatform() === 'ios';
}

/**
 * Vrai si l'environnement courant supporte l'API Web Push standard
 * (ServiceWorker + PushManager + Notification). Ne tient pas compte du
 * fait que Safari iOS exige en plus que la PWA soit installée.
 */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Décrit le statut Web Push pour l'UI :
 *   - `unsupported`       : pas d'API Notifications du tout
 *   - `ios-needs-install` : iOS Safari, PWA non installée → install d'abord
 *   - `ready`             : navigateur compatible, on peut demander permission
 */
export type WebPushReadiness = 'unsupported' | 'ios-needs-install' | 'ready';

export function getWebPushReadiness(): WebPushReadiness {
  if (!isWebPushSupported()) {
    // iOS < 16.4 n'expose pas du tout l'API. On considère ça "unsupported"
    // côté UI : on guide quand même l'install PWA car ça reste utile, mais
    // on ne fait pas miroiter les notifications.
    if (isIosSafari() && !isStandalone()) return 'ios-needs-install';
    return 'unsupported';
  }
  if (isIosSafari() && !isStandalone()) return 'ios-needs-install';
  return 'ready';
}
