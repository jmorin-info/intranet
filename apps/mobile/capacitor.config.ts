import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — OMNITECH Intranet
 *
 * Stratégie : "live URL mode" en prod (cf. docs/mobile/ARCHITECTURE.md).
 * - L'app native iOS / Android est une coquille WebView qui charge la PWA
 *   Next.js servie par https://intranet.omnitech-security.fr.
 * - Avantages : pas de breaking change Next.js (SSR + App Router conservés),
 *   mises à jour produit immédiates sans re-soumission App Store / Play Store
 *   pour la majorité des changements (seules les modifs natives requièrent
 *   un re-deploy binaire).
 * - Auth : les cookies httpOnly émis par /api/v1/auth/* fonctionnent
 *   nativement dans WKWebView (iOS) et WebView (Android) tant que le domaine
 *   reste cohérent (CORS + SameSite=Lax).
 *
 * En dev (server.url override via env) le bundler Next.js (`pnpm --filter
 * frontend dev`) est ciblé directement sur le réseau local — utile pour
 * tester un build natif sur device physique sans déployer.
 *
 * webDir : Capacitor exige un dossier "web build" même si on n'utilise pas
 * le mode static. On pointe vers `apps/frontend/public` qui contient au
 * minimum manifest.json + icons + offline.html — assez pour `cap sync` et
 * fallback hors ligne. Cf. docs/mobile/ARCHITECTURE.md §5 pour le détail.
 */

// `CAPACITOR_SERVER_URL` permet d'overrider l'URL chargée par la WebView
// (ex: `http://192.168.1.10:3001` quand on teste un build sur device en
// local, ou `https://intranet-staging.omnitech-security.fr` pour un build
// staging). Vide en prod = utilise la valeur par défaut ci-dessous.
const liveServerUrl =
  process.env.CAPACITOR_SERVER_URL || "https://intranet.omnitech-security.fr";

const config: CapacitorConfig = {
  appId: "fr.omnitechsecurity.intranet",
  appName: "OMNITECH Intranet",
  webDir: "../frontend/public",
  // Allow Capacitor to navigate to the live server. `androidScheme: 'https'`
  // forces the WebView to consider its origin HTTPS (required for cookies +
  // service-worker registration even when the underlying transport for
  // localhost dev is HTTP).
  server: {
    url: liveServerUrl,
    androidScheme: "https",
    iosScheme: "https",
    // Whitelist : limite les origines que la WebView peut charger.
    // Empêche un éventuel redirect vers un domaine externe de "casser"
    // l'expérience native (l'utilisateur sortirait de l'app sans le savoir).
    allowNavigation: [
      "intranet.omnitech-security.fr",
      "vaultwarden.omnitech-security.fr",
      // dev hosts — la résolution réseau locale est gérée par
      // CAPACITOR_SERVER_URL ; cette liste autorise simplement la nav.
      "localhost",
      "127.0.0.1",
      "192.168.*.*",
      "10.*.*.*",
    ],
  },
  ios: {
    // `always` = la WebView reserve la safe-area en haut + bas, évitant que
    // les éléments fixed (navbar, footer) passent sous le notch / home
    // indicator. Critique pour iPhone X+ et tous les iPad récents.
    contentInset: "always",
    // Désactive le zoom utilisateur sur les inputs (UX consistante avec
    // l'usage natif iOS — le double-tap-to-zoom embarque une latence).
    scrollEnabled: true,
    backgroundColor: "#F5F5F5",
    // Permet à la WebView de présenter des Web Push (iOS 16.4+) en plus
    // des push natifs APNs via @capacitor/push-notifications.
    limitsNavigationsToAppBoundDomains: false,
    // useSafeArea : false ici car on délègue le padding au layout web
    // (mieux contrôlé via env(safe-area-inset-*) en CSS).
  },
  android: {
    // `false` empêche le mix HTTP+HTTPS — protège contre un MITM passif sur
    // wifi public si l'app charge accidentellement une ressource HTTP.
    allowMixedContent: false,
    // `captureInput=true` : laisse les inputs natifs gérer le focus via
    // le clavier système (sinon on perd la sélection sur certains devices
    // Samsung One UI).
    captureInput: true,
    // `webContentsDebuggingEnabled` : Chrome inspect en debug uniquement.
    // Forcé à `false` en release via le build script Android.
    webContentsDebuggingEnabled: process.env.NODE_ENV !== "production",
    backgroundColor: "#F5F5F5",
  },
  plugins: {
    SplashScreen: {
      // Splash branded OMNITECH (cf. ../frontend/public/icon-512.png).
      // launchShowDuration : 2s = laisse le temps au login flow d'afficher
      // sans flash blanc, mais reste sous le seuil de 3s qui dégrade le
      // perçu utilisateur.
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: "#004469",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      // iOS : laisse le launchscreen.storyboard généré par @capacitor/assets
      // gérer l'apparence — meilleure cohérence avec les guidelines Apple.
      iosSpinnerStyle: "small",
      spinnerColor: "#F68D2E",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Couleur SEAL bleu (PANTONE 660C-derived) — cf. seal_charter.md
      backgroundColor: "#004469",
      style: "DARK",
      // overlaysWebView : false = la barre système est rendue PAR-DESSUS
      // la WebView avec son propre background. Plus simple à styler que
      // le mode "edge-to-edge".
      overlaysWebView: false,
    },
    PushNotifications: {
      // Sur iOS : presentationOptions = comportement quand l'app est au
      // foreground et qu'un push arrive. `badge` + `sound` + `alert` =
      // notification système classique (l'utilisateur voit le toast).
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
