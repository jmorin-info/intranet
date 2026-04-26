# Safari Web Push — Notes d'architecture

Ce document complète l'implémentation Web Push standard (VAPID) avec les
spécificités Safari (iOS 16.4+ et macOS Safari 16+). Il décrit le comportement,
les contraintes Apple, la procédure de test et le troubleshooting.

> **Vague A post-launch v1.1** — implémenté en avril 2026, après la mise en
> production initiale Web Push standard sur Chrome / Firefox / Edge.

## TL;DR

- Safari iOS 16.4 (mars 2023) et Safari macOS 16 sont **alignés sur le standard
  Web Push W3C**. La librairie `web-push` côté backend (>= 3.5.0, nous sommes
  en 3.6.7) gère VAPID nativement pour Apple sans code spécifique.
- **Friction principale côté iOS** : `Notification.requestPermission()`
  n'est appelable qu'**après que la PWA ait été installée à l'écran d'accueil**.
  Sur macOS Safari, c'est OK directement depuis l'onglet.
- **Apple Push Notifications service (APNs) "legacy"** (avant 16) avec
  certificats Apple Developer = deprecated, **non supporté** ici.

## Comportement par plateforme

| Plateforme | Compatible | Install PWA requise | Détection côté frontend |
|---|---|---|---|
| Chrome / Edge / Firefox (desktop, Android) | Oui | Non | `serviceWorker` + `PushManager` + `Notification` |
| Safari macOS 16+ | Oui | Non | idem |
| Safari iOS 16.4+ | Oui | **Oui** (Add to Home Screen) | idem **+** `display-mode: standalone` ou `navigator.standalone` |
| Safari iOS < 16.4 | Non | — | API absente — le composant est masqué |

### Safari iOS — installation PWA

L'utilisateur doit :

1. Toucher l'icône **Partager** dans la barre Safari.
2. Choisir **Sur l'écran d'accueil** dans la liste.
3. Rouvrir l'intranet depuis l'icône installée (mode standalone).
4. Activer les notifications via le toggle du profil ou le bandeau dédié.

Tant que la PWA n'est pas installée, le composant `<PushNotificationsPrompt />`
affiche un bandeau pédagogique avec ces étapes (cf.
`apps/frontend/src/components/notifications/push-notifications-prompt.tsx`).

### Détection côté frontend

Helpers dans `apps/frontend/src/lib/platform-detection.ts` :

- `detectPlatform()` — `'ios' | 'macos' | 'android' | 'desktop' | 'unknown'`.
  Prend en compte le quirk d'iPadOS 13+ qui rapporte "Macintosh" + Touch UI.
- `isStandalone()` — vérifie `display-mode: standalone` (matchMedia) **et**
  `navigator.standalone` (API historique iOS).
- `isIosSafari()` — raccourci pour `detectPlatform() === 'ios'`.
- `isWebPushSupported()` — vérifie SW + PushManager + Notification.
- `getWebPushReadiness()` — `'unsupported' | 'ios-needs-install' | 'ready'`.
  Décide ce que l'UI doit afficher.

Tests unitaires (Vitest) : `apps/frontend/src/lib/__tests__/platform-detection.test.ts`.

## Limitations Apple Web Push

Documenter ces limites pour les futurs développeurs et pour le support N1 :

### 1. Pas de badge count sur l'icône iOS

`Badging API` (`navigator.setAppBadge(count)`) n'est **pas supporté** sur iOS
Safari (mai 2026). Sur macOS Safari c'est expérimental. Le compteur de
notifications non-lues se voit donc dans l'app uniquement, pas sur l'icône
home-screen.

### 2. Action buttons limités

Les `actions` dans le payload `showNotification` ne sont **pas affichées** sur
iOS Safari (pas de boutons inline dans la notification déroulée). Le clic sur
la notification ouvre simplement la PWA via `notificationclick` → `clients.openWindow`.

Sur macOS Safari, les actions s'affichent dans la bannière mais sont limitées
en nombre par rapport à Chrome/Firefox.

→ **Recommandation** : ne pas concevoir de flows critiques qui dépendent
d'action buttons. Toujours prévoir un fallback "tap → page dédiée".

### 3. Taille du payload

Apple impose une limite de **4 KB** sur le payload chiffré, conforme au
standard Web Push. Les champs `title`, `body`, `icon`, `badge`, `url`, `tag`,
`data` doivent rester sobres. C'est déjà le cas dans le service
`PushNotificationsService.dispatch()`.

### 4. TTL et délivrance

Apple ne garantit pas la délivrance en arrière-plan si l'appareil est en mode
low-power, en silencieux, ou si la PWA n'a pas été ouverte récemment. Le TTL
configuré côté backend est de 86400 s (24h) — suffisant pour les alertes de
sécurité non-urgentes. Pour les alertes critiques, prévoir un canal mail en
parallèle (déjà implémenté).

## Schéma de données

Le modèle Prisma `PushSubscription` a été enrichi (vague A v1.1) avec un champ
`platform` optionnel pour la traçabilité :

```prisma
model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  platform  String?    // 'ios' | 'macos' | 'android' | 'desktop' | 'unknown'
  createdAt DateTime @default(now())
  lastUsed  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([platform])
}
```

Migration : `packages/database/prisma/migrations/20260426_push_subscription_platform/`.
Additive, nullable, idempotent. Les souscriptions pré-vague A garderont
`platform = NULL` jusqu'à leur prochaine resync (le hook
`usePushNotifications` réenregistre automatiquement).

## API backend

### Endpoint capabilities

`GET /api/v1/push/capabilities` (auth requise) retourne :

```json
{
  "enabled": true,
  "vapidPublicKey": "BIs…",
  "supportsSafari": true,
  "knownPlatforms": ["ios", "macos", "android", "desktop", "unknown"]
}
```

Utilisé par `<PushNotificationsPrompt />` pour décider d'afficher un avertissement
si le serveur n'est pas prêt.

### Endpoint subscribe

`POST /api/v1/push/subscribe` accepte désormais un champ optionnel `platform`
(en plus du User-Agent). Le frontend l'envoie via le helper `detectPlatform()`,
ce qui lève l'ambiguïté iPadOS / macOS du User-Agent.

```jsonc
{
  "endpoint": "https://web.push.apple.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "userAgent": "Mozilla/5.0 ...",
  "platform": "ios"        // hint client (optionnel mais recommandé)
}
```

Audit : l'événement `PUSH_SUBSCRIBE` inclut désormais `platform` dans
`metadata`, en plus de `endpointHost`. Le champ `endpoint` complet n'est jamais
loggué (RGPD — c'est techniquement un identifiant device).

## Procédure de test sur iPhone réel

Pré-requis :
- iPhone iOS 16.4 ou ultérieur.
- Compte intranet provisionné (ou compte de démo).
- VAPID configuré côté backend (`VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`).

### Étapes

1. **Installer la PWA**
   - Ouvrir Safari → URL de l'intranet → s'authentifier.
   - Toucher l'icône Partager (carré + flèche vers le haut, milieu de la barre).
   - Faire défiler → **Sur l'écran d'accueil** → **Ajouter**.
   - Vérifier que l'icône OMNITECH apparaît bien sur l'écran d'accueil.

2. **Lancer la PWA depuis l'écran d'accueil**
   - Toucher l'icône — la PWA s'ouvre en plein écran (pas de barre Safari).
   - Aller dans **Mon profil** → section **Préférences de notification**.
   - Le bandeau "Activer les notifications sur iPhone" doit avoir disparu
     (PWA installée). Le bandeau standard "Notifications push" doit être visible.

3. **Activer les notifications**
   - Toucher **Activer les notifications**.
   - iOS affiche la prompt système "OMNITECH Security souhaite vous envoyer
     des notifications" → **Autoriser**.
   - Le composant doit afficher le badge "Actives sur cet appareil".

4. **Vérifier la souscription côté serveur**
   - Côté backend : `psql` ou `pgcli` :
     ```sql
     SELECT id, "userId", LEFT(endpoint, 50) AS endpoint_prefix, platform, "userAgent"
     FROM "PushSubscription"
     WHERE "userId" = '<votre-user-id>'
     ORDER BY "lastUsed" DESC;
     ```
   - Vérifier `platform = 'ios'` et que `endpoint` commence bien par
     `https://web.push.apple.com/`.

5. **Envoyer une notification de test** (admin uniquement)
   - Toujours dans la PWA, sur la page profil, déclencher
     `POST /api/v1/push/test` (via curl ou un bouton dédié si présent).
   - La notification doit apparaître dans le centre de notifications iOS,
     même si la PWA est en arrière-plan.
   - Verrouiller l'iPhone → renvoyer une test → doit s'afficher sur l'écran
     verrouillé.

6. **Tester `notificationclick`**
   - Toucher la notification dans le centre.
   - La PWA doit s'ouvrir et naviguer sur l'URL fournie dans le payload
     (par défaut `/dashboard`).

### Cas limites à valider

- [ ] iPhone en mode silencieux : la notification arrive sans son mais le
      badge apparaît dans le centre de notifications.
- [ ] iPhone en mode économie d'énergie : la délivrance peut être différée
      (Apple Best Effort), mais doit arriver dans l'heure.
- [ ] Désinstaller la PWA → la souscription est invalidée côté Apple → au
      prochain push, le serveur reçoit un 410 Gone et purge la sub
      (cf. `dispatch()` dans `push-notifications.service.ts`).
- [ ] Re-installer la PWA → ré-activer → vérifier qu'on a bien deux entrées
      `PushSubscription` distinctes (anciens device-id Apple invalide + nouveau).

## Troubleshooting

### "La permission est demandée mais refusée systématiquement"

Symptôme : l'appel à `Notification.requestPermission()` retourne immédiatement
`'denied'` sans afficher de prompt.

Causes possibles :
- iOS exige le mode standalone — vérifier `window.matchMedia('(display-mode: standalone)').matches`.
- L'utilisateur a refusé une fois → iOS ne redemandera pas. Il faut
  désinstaller + réinstaller la PWA.
- Mode sécurité renforcée (Lockdown Mode) sur iOS : Web Push désactivé.

### "La souscription se crée mais aucune notification n'arrive"

Causes possibles :
- VAPID `subject` mal configuré — Apple impose un `mailto:` valide.
  Vérifier `VAPID_SUBJECT` dans l'env backend.
- Endpoint Apple expiré → 410 Gone côté backend → la sub est purgée. Re-souscrire.
- Notification silenced par "Focus mode" iOS (Ne pas déranger). Inviter
  l'utilisateur à autoriser OMNITECH dans le Focus mode → Apps autorisées.
- Payload trop gros (> 4 KB chiffré) — vérifier la taille du JSON envoyé.

### "L'icône PWA est correcte mais la notification a une mauvaise icône"

Apple utilise l'icône **180×180** déclarée via `<link rel="apple-touch-icon">`
ou dans le manifest. Vérifier :
- `apps/frontend/src/app/layout.tsx` — `<link rel="apple-touch-icon" href="/icon-180.png" sizes="180x180" />`.
- `apps/frontend/public/manifest.json` — entrée `{ "src": "/icon-180.png", "sizes": "180x180" }`.
- Cache iOS particulièrement collant : forcer une nouvelle version (`?v=N`).

### "iOS Safari n'expose pas l'API Notifications même en standalone"

Vérifier :
- iOS >= 16.4 (Réglages → Général → Informations).
- HTTPS valide (Apple bloque tout en HTTP, même en LAN).
- La PWA a bien été ouverte depuis l'icône d'accueil (pas depuis Safari).

## Tâches reportées (v1.2 ou plus tard)

- **Screenshots animés** dans le bandeau iOS install — placeholder actuellement.
- **Badging API** : à explorer dès qu'Apple le supporte sur iOS Safari.
- **Action buttons** unifiés : repenser les flows pour exploiter les actions
  Web Push standard une fois iOS aligné sur Chrome.
- **Multi-device** : afficher la liste des devices souscrits dans `/profile`
  avec possibilité de révoquer un device spécifique (data déjà disponible via
  `PushSubscription.userAgent` + `platform`).
- **Notifications silencieuses** (`silent: true`) pour la sync de données
  pure : non standard, à creuser.

## Références

- [Apple WebKit blog — Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) (mars 2023)
- [W3C Push API](https://www.w3.org/TR/push-api/)
- [VAPID RFC 8292](https://datatracker.ietf.org/doc/html/rfc8292)
- [web-push npm](https://www.npmjs.com/package/web-push) — 3.6.7 dans `apps/backend/package.json`
- ISO 27001 A.5.13 (Communication des informations) — audit `PUSH_SUBSCRIBE` / `PUSH_UNSUBSCRIBE`.
