# Mobile App — Architecture

> Statut : v1.1 (scaffolding Capacitor)
> Audience : devs, reviewers, architectes
> Date : 2026-04-26

## 1. TL;DR

L'app mobile OMNITECH Intranet est une **WebView native Capacitor** qui charge la PWA Next.js de production (`https://intranet.omnitech-security.fr`). Pas de re-implementation des ecrans, pas de duplication du code metier — l'app native est une coquille fine qui ajoute :

- Distribution App Store (iOS) + Play Store (Android)
- Acces aux APIs natives via plugins Capacitor (push, preferences, network, etc.)
- Splash screen + status bar branded SEAL / OMNITECH
- Gestion du cycle de vie applicatif (background/foreground)

L'objectif est d'**arriver vite a une app dans les stores** avec un cout de maintenance minimal — le frontend Next.js est l'unique source de verite UI.

## 2. Pourquoi Capacitor (vs Expo)

Le WIP precedent avait demarre un scaffolding Expo / React Native. Voici la comparaison qui a motive le pivot :

| Critere                                 | Expo / React Native                                                                                     | Capacitor (choix retenu)                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Code UI                                 | Re-implementer **toute** l'app en RN (screens, navigation, forms, validation, theming SEAL, i18n, etc.) | Reutilise la PWA Next.js a 100%                                        |
| Cout initial                            | 4-8 semaines pour atteindre la parite                                                                   | < 1 semaine pour scaffolding + push                                    |
| Maintenance                             | 2 codebases UI a maintenir en parallele                                                                 | 1 seule codebase (Next.js)                                             |
| Deploiement updates                     | Re-build + re-soumission stores pour chaque feature UI                                                  | OTA via push web — re-soumission stores uniquement pour modifs natives |
| Performance native (animations, gestes) | Excellente (rendering natif)                                                                            | Bonne (WebView moderne sur iOS 16+/Android 12+)                        |
| Acces APIs natives                      | First-class                                                                                             | Via plugins Capacitor (couverture similaire)                           |
| Auth / sessions                         | A re-implementer (token storage manuel)                                                                 | Cookies httpOnly partages avec le backend, marche out-of-the-box       |
| Offline                                 | A construire from scratch                                                                               | Reutilise le service worker PWA existant + plugin Capacitor Network    |

**Decision** : pour un **intranet metier** (use cases : consultation docs ISO, ticketing, news, wiki), la difference de performance entre WebView et natif est imperceptible. Le bon ROI penche tres fort vers Capacitor.

Si plus tard une feature critique necessite un rendering vraiment natif (ex : scanner OCR de documents avec preview live, AR pour le terrain), on pourra cohabiter — Capacitor permet d'integrer des `UIViewController` / `Activity` natifs custom (cf. [Custom Native Code](https://capacitorjs.com/docs/ios/custom-code)).

## 3. Schema general

```
+-------------------------------------------------------------+
|                  iOS / Android Device                       |
|                                                             |
|   +-----------------------------------------------------+   |
|   |    OMNITECH Intranet (binaire .ipa / .apk)          |   |
|   |                                                     |   |
|   |   +-------------------------------------------+     |   |
|   |   |   Capacitor WebView (WKWebView / WebView) |     |   |
|   |   |                                           |     |   |
|   |   |   loads -> https://intranet.omnitech-     |     |   |
|   |   |            security.fr/dashboard          |     |   |
|   |   |                                           |     |   |
|   |   |   PWA Next.js (App Router, SSR)           |     |   |
|   |   |   - Auth via cookies httpOnly             |     |   |
|   |   |   - Service Worker (offline cache)        |     |   |
|   |   |   - Notifications push (Web Push API)     |     |   |
|   |   +-------------------+-----------------------+     |   |
|   |                       |                             |   |
|   |                       | window.Capacitor bridge     |   |
|   |                       v                             |   |
|   |   +-------------------------------------------+     |   |
|   |   | Capacitor plugins (natif)                 |     |   |
|   |   | - PushNotifications (APNs / FCM)          |     |   |
|   |   | - Preferences (Keychain / SharedPrefs)    |     |   |
|   |   | - Network (NWPathMonitor / ConnectivityMgr)|    |   |
|   |   | - App (lifecycle, deep links)             |     |   |
|   |   | - StatusBar / SplashScreen (UI native)    |     |   |
|   |   +-------------------------------------------+     |   |
|   +-----------------------------------------------------+   |
|                                                             |
+-------------------------------------------------------------+
                              |
                              | HTTPS (cookies, fetch, WebSocket)
                              v
+-------------------------------------------------------------+
|         Backend NestJS @ https://intranet.omnitech-         |
|         security.fr/api/v1/*                                |
|                                                             |
|   - JWT cookies httpOnly (auth)                             |
|   - CSRF protection (SameSite=Lax)                          |
|   - VAPID push subscriptions (WebPush + Safari Web Push)    |
|   - WebSocket (notifications real-time)                     |
+-------------------------------------------------------------+
```

## 4. Mode de chargement : Live URL vs Static Export

Capacitor supporte deux modes pour fournir le contenu a la WebView :

### 4.1 Live URL mode (CHOIX RETENU — v1.1)

`server.url` dans `capacitor.config.ts` pointe vers une URL HTTPS publique. La WebView fait des requetes HTTP normales vers le backend.

**Avantages** :

- Pas de breaking change Next.js : SSR + App Router + middleware (CSP nonce, i18n) preserves
- Updates produit OTA : un fix backend ou une nouvelle page Next.js arrive sans re-soumission stores
- Auth out-of-the-box : les cookies httpOnly emis par `/api/v1/auth/*` traversent la WebView nativement (WKWebView et Android WebView se comportent comme un Safari / Chrome standard)
- Reutilise le service worker existant (`apps/frontend/public/sw.js`) pour offline + push

**Inconvenients** :

- L'app ne fonctionne pas du tout sans connexion initiale (le SW cache au-dela du premier load, mais il faut atteindre la WebView une fois)
- Latence reseau perceptible au cold start (~500ms-1s pour le HTML initial)
- Risque "Apple App Store rejection" : Apple peut considerer une app qui n'est qu'un wrapper d'un site web comme "trop maigre" (cf. §7)

### 4.2 Static Export mode (alternative — non retenu)

`webDir` pointe vers un dossier `out/` genere par `next build` avec `output: 'export'`. La WebView charge des fichiers HTML/JS embarques dans le binaire.

**Pourquoi NON retenu** :

- `output: 'export'` casse les routes API Next.js (`/api/...`) : OK car backend separe (NestJS), mais aussi casse middleware (CSP nonce, i18n routing) — il faudrait re-implementer cote runtime
- Casse les Server Components : actuellement l'app utilise `next-intl` server-side et `App Router` lourdement
- Auth : `next-auth`-style sessions cote SSR ne marche plus, on devrait passer en pur client-side (Bearer tokens en localStorage, moins secure)
- Maintenance : double config Next.js (export vs server) + double build pipeline

Si ce mode devient necessaire (ex : mode strictement offline-first), une migration v2 serait :

1. Extraire les pages "publiques" (login, splash) en static
2. Garder le SSR sur intranet
3. Capacitor charge static -> redirige vers SSR a l'auth

## 5. Choix `webDir`

Capacitor exige un `webDir` avec un `index.html` meme en live-URL mode. Il sert :

1. De fallback offline initial (page de chargement avec auto-retry)
2. A la commande `cap sync` qui copie ce contenu dans le bundle natif

On pointe vers `apps/mobile/web-fallback/` (et non `apps/frontend/public/` qui n'a pas d'`index.html` — Next.js sert via SSR). Le contenu : un `index.html` minimal avec un spinner SEAL, un message "Chargement de l'application...", et un script qui re-tente la navigation vers `https://intranet.omnitech-security.fr/` apres 3 secondes ou au tap utilisateur.

L'utilisateur final ne devrait JAMAIS voir cette page en conditions normales — la WebView est immediatement redirigee vers `server.url`. Elle existe pour les cas degraades : offline au cold start, server.url miss-configure, etc.

## 6. Flux d'authentification

```
1. User ouvre l'app (cold start)
   |
2. SplashScreen (2s) -> WebView charge https://intranet.omnitech-security.fr/dashboard
   |
3. Pas de cookie session -> middleware Next.js redirect 302 -> /login
   |
4. User saisit identifiants -> POST /api/v1/auth/login
   |
5. Backend repond avec Set-Cookie: access_token=...; HttpOnly; Secure; SameSite=Lax
   |
6. WebView stocke le cookie dans son cookie jar persistent
   |   (WKHTTPCookieStore sur iOS, CookieManager sur Android)
   |
7. Toutes les requetes suivantes l'envoient automatiquement
   |
8. Au prochain lancement (warm start), le cookie est encore la (persiste sur disque)
   |
9. Refresh token rotation marche normalement
```

**Aucune modification cote backend ou frontend n'est requise** : l'app se comporte comme un navigateur Safari/Chrome.

## 7. Risques App Store / Play Store

### Apple App Store — Guideline 4.2 "Minimum Functionality"

Apple peut refuser une app jugee trop "thin" (cf. [App Review Guideline 4.2.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)). Pour un wrap PWA d'un intranet metier, on minimise le risque en :

1. **B2B Enterprise distribution** (option preferee) : utiliser le programme Apple Developer Enterprise (99 USD/an + 299 USD activation) pour distribuer en interne hors App Store. Pas de review, signature in-house.
2. **App Store Custom Apps** : distribution privee via Apple Business Manager (pas de review publique).
3. Si distribution publique requise : ajouter au moins **2 features natives differenciantes** (cf. roadmap v1.2) — biometric auth, share extension, widget, haptics, etc.

### Google Play Store

Plus permissif : un wrap PWA passe sans difficulte tant que :

- Target SDK >= 34 (Android 14, requis depuis Aout 2025)
- Permissions explicites declarees (POST_NOTIFICATIONS pour push, etc.)
- Privacy policy URL renseignee dans la console

Pas de risque de rejection sur ce point.

## 8. Impact sur le backend

**Aucun.** Le backend NestJS continue de servir `intranet.omnitech-security.fr/api/v1/*` exactement comme avant. Le user-agent de la WebView est differenciable (`Capacitor` est dans la chaine UA), donc on pourra plus tard tracker en metrics si besoin.

Pour les push notifications :

- iOS Safari Web Push (>=16.4) : marche dans la WebView via le service worker existant — pas de changement
- Android Chrome WebView : Web Push fonctionne aussi via VAPID
- **Optionnel v1.2** : si on veut des push natives APNs (iOS) / FCM (Android) — qui delivrent meme app fermee plus reliably que Web Push — il faudra un nouvel endpoint backend `POST /api/v1/push/mobile/register-fcm` avec table dediee. **Pas requis pour v1.1**.

## 9. Limites connues

| Limite                                                 | Workaround                                   | v      |
| ------------------------------------------------------ | -------------------------------------------- | ------ |
| Pas de support Apple Watch                             | Hors scope                                   | jamais |
| Cold start ~ 1s (WebView + SSR)                        | Splash 2s masque                             | v1.1   |
| Pas de mode offline reel (au-dela du SW cache)         | Page offline.html + retry banner             | v1.1   |
| Deep links (`omnitech://document/123`) non geres       | Plugin App.addListener('appUrlOpen')         | v1.2   |
| Pas de biometrie (FaceID/TouchID)                      | Plugin `@capacitor-community/biometric-auth` | v1.2   |
| Pas de share extension iOS (envoyer un PDF dans l'app) | Custom iOS extension                         | v1.3   |

## 10. Decisions cles a retenir pour la review

1. **Live URL mode**, pas static export. Trade-off connectivite vs simplicite : on gagne en velocite produit.
2. **Pas de duplication du code Next.js**. Tout le code metier reste dans `apps/frontend/`.
3. **App ID** : `fr.omnitechsecurity.intranet` (sans dash, requis par Capacitor pour package Java compat).
4. **Capacitor 7.x** retenu (vs 8.x latest) pour rester compatible Node 20 (engines repo).
5. **Push v1.1** : reutiliser VAPID + service worker existants. **Pas de modification backend**. FCM/APNs natifs = v1.2 si necessaire.
6. **Distribution** : envisager Apple Enterprise / Apple Business Manager pour eviter le risque review 4.2.

## 11. References

- [Capacitor docs](https://capacitorjs.com/docs)
- [Capacitor 7 release notes](https://capacitorjs.com/blog/announcing-capacitor-7)
- [Apple App Review Guideline 4.2](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality)
- `docs/mobile/CAPACITOR_BUILD.md` — runbook build iOS + Android
- `docs/mobile/ROADMAP.md` — features prevues v1.1 -> v2
