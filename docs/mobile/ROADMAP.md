# Mobile App — Roadmap

> Statut : v1.1 en cours
> Owner : equipe Frontend / DevOps
> Source : item 22 spec OMNITECH Intranet

## Vue d'ensemble

```
v1.1 (now)        v1.2 (Q3 2026)         v1.3 (Q4 2026)        v2.0 (2027+)
+-------------+   +------------------+   +------------------+   +------------------+
| Wrap PWA    |-->| Plugins natifs   |-->| Distribution     |-->| Custom screens   |
| basique     |   | + push FCM/APNs  |   | publique stores  |   | si necessaire    |
| Push web    |   | Biometric        |   | Share extension  |   | (RN cohabit)     |
| Live URL    |   | Deep links       |   | Widget iOS       |   |                  |
+-------------+   +------------------+   +------------------+   +------------------+
```

## v1.1 — Wrap PWA basique (LIVRAISON ACTUELLE)

**Goal** : prouver le concept, etre installable sur device de test interne.

- [x] Scaffolding Capacitor 7.x (config, ios/, android/)
- [x] Plugins essentiels : push, preferences, network, app, status-bar, splash-screen
- [x] Live URL mode pointant vers prod (override env pour dev)
- [x] Splash + status bar branded SEAL
- [x] CI : `mobile-build-check` job (cap sync verifie la config)
- [x] Documentation : architecture + runbook + roadmap
- [ ] Build .ipa debug TestFlight (necessite macOS — hors CI)
- [ ] Build .apk debug pour test interne Android
- [ ] Push notifications testees sur device physique iOS / Android (via VAPID Web Push existant)

**Critere de succes v1.1** : un dev peut installer l'app sur son iPhone/Android, se logger avec son compte intranet, recevoir une notif de mention, et naviguer dans la PWA sans difference visible vs Safari/Chrome.

## v1.2 — Features natives differenciantes (Q3 2026)

**Goal** : reduire le risque de rejection App Store + ameliorer l'UX.

### Push notifications natives FCM / APNs

Actuellement v1.1 utilise les Web Push (VAPID) servis via le service worker. Limites :

- Sur iOS, Web Push fonctionne uniquement quand l'app est ouverte (limitation iOS 16.4)
- Sur Android, idem partiellement

Solution v1.2 :

- Backend : nouvelle table `MobileFcmToken` (id, userId, token, platform=ios|android, registeredAt, lastUsed)
- Backend : endpoint `POST /api/v1/push/mobile/register-fcm` (rate-limit comme l'endpoint Web Push existant)
- Backend : librairie `firebase-admin` pour envoyer FCM (Android) + APNs HTTP/2 (iOS)
- Backend : extension du dispatcher push existant pour router selon la subscription type (web vs mobile)
- Frontend mobile : au login, appel `PushNotifications.register()` -> envoi du token au backend

### Biometric authentication

Plugin : `@capacitor-community/biometric-auth` (FaceID / TouchID iOS, BiometricPrompt Android)

Use case : "Deverrouiller l'app sans retaper le mot de passe a chaque cold start" (le refresh token est encore valide cote backend, on demande juste un check biometrique).

UX : opt-in dans les settings PWA, switch "Deverrouillage biometrique" cote profil utilisateur.

### Deep links

Plugin : `@capacitor/app` (deja installe, pas encore branche)

Configuration :

- iOS : `Universal Links` declare dans `apple-app-site-association` JSON deja servi par le backend (`/.well-known/apple-app-site-association`)
- Android : `App Links` via `intent-filter` dans `AndroidManifest.xml` + verification SHA-256

Use case : un email avec un lien vers `https://intranet.omnitech-security.fr/documents/123` ouvre directement l'app si installee, sinon le navigateur.

### Share extension iOS (preliminary)

Use case : depuis l'app Mail iOS, partager un PDF -> "OMNITECH Intranet" -> upload direct vers `/documents/upload`.

Necessite une extension Xcode native (pas un simple plugin Capacitor). Plus complexe — peut glisser en v1.3.

## v1.3 — Distribution publique stores (Q4 2026)

**Goal** : si la decision est prise de distribuer publiquement (vs Enterprise / Business Manager).

### App Store review readiness

- [ ] Au moins 3 features natives differenciantes (push FCM, biometric, deep links cf. v1.2 — done)
- [ ] Privacy nutrition labels remplis (App Store Connect)
- [ ] Screenshots iPhone 6.7" + 5.5" + iPad 12.9"
- [ ] App preview video (30s, optionnel mais recommande)
- [ ] Marketing landing page sur omnitech-security.fr/intranet-mobile

### Play Store production

- [ ] Closed testing > 14 jours minimum (requis par Google pour soumission prod)
- [ ] Data Safety form completee
- [ ] Target SDK 35 (Android 15, requis a partir de Q3 2026 selon le calendrier Google)

### Widget iOS (homescreen)

Use case : afficher le nombre de tickets / mentions non lues sur le widget homescreen.

Necessite WidgetKit natif (Swift) — extension Xcode separee, pas un plugin Capacitor. Effort : 2-3 jours de dev iOS pur.

## v2.0 — Custom screens si besoin (2027+)

**Goal** : si certaines features critiques ne tiennent pas en WebView, integrer du React Native cote-a-cote.

### Pattern de cohabitation Capacitor + RN

Capacitor permet d'embedder des `UIViewController` (iOS) / `Activity` / `Fragment` (Android) custom. On peut donc avoir 90% de l'app en WebView (PWA) et 10% en RN pour des ecrans specifiques.

Candidats potentiels :

- **Camera + scan OCR temps reel** (use case : scan d'un document pour pre-fill un formulaire ISO 27001) — la WebView a une latence visible sur la prevue camera
- **AR overlays** (use case : annotation 3D d'un site visite) — non rendu possible en HTML
- **Audio meeting client** (visioconf integree, use case : remplacer Jitsi externe) — RTC bas niveau plus fiable en natif

### Migration plan

1. Ajouter `react-native` + `react-native-capacitor` deps a `apps/mobile/package.json`
2. Creer un dossier `apps/mobile/native-screens/` pour les composants RN
3. Bridge WebView <-> RN via Capacitor messaging API
4. Une page Next.js cliquable (ex: bouton "Scanner un document") -> appelle un plugin custom -> ouvre le RN ViewController

> Tres lourd architecturalement, a faire UNIQUEMENT si v1.3 montre une limite reelle. Ne pas anticiper.

## Backlog non priorise

- iPad layout (responsive deja OK via Tailwind, mais audit specifique a faire)
- Apple Watch companion (consultation read-only de l'agenda OMNITECH ?)
- Android Auto / CarPlay (probablement pas pertinent pour un intranet)
- Tablette Android Samsung DeX mode
- Mode kiosk (lock l'app sur le device pour usage receptionniste)
- App icon dynamic badge (nombre de notifs non lues sur le launcher Android)
- Desktop Electron wrap ? (cf. roadmap intranet principale, pas mobile)

## KPIs a suivre

- Nombre d'installations actives (par device, MAU)
- % d'utilisateurs sur mobile vs desktop (segmentation analytics)
- Crash-free rate (Sentry mobile SDK a installer en v1.2)
- Cold start time (target < 2s incluant splash)
- App Store rating (target > 4.0 si distribution publique)

## Liens

- `docs/mobile/ARCHITECTURE.md` — pourquoi Capacitor + risques review
- `docs/mobile/CAPACITOR_BUILD.md` — procedure build
- Item 22 specs : "App mobile native : Capacitor wrap du PWA"
- [Capacitor docs](https://capacitorjs.com/docs)
