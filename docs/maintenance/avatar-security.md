# Avatars : validation et publication

Le point d’entrée `POST /users/me/avatar` conserve uniquement un WebP réencodé par le serveur. Aucun nom ni extension fournis par le client ne deviennent un chemin de stockage.

Le multipart est gardé en mémoire, limité à un fichier de 2 Mio sans champ supplémentaire. La signature, le MIME annoncé et le format réellement décodé doivent correspondre à JPEG, PNG ou WebP. Sharp refuse les entrées tronquées, les images animées, les dimensions supérieures à 4096 × 4096 et les entrées dépassant 16 777 216 pixels. Le résultat est une image fixe de 512 pixels au maximum, sans agrandissement ni conservation des métadonnées EXIF/XMP. Un PNG valide suivi de HTML est réencodé : les octets HTML ne sont pas publiés.

## Ressources et annulation

Sur l’instance backend, l’admission globale est de 6 requêtes avatar avant Multer. Chaque corps admis est limité à 2 Mio ; les requêtes excédentaires reçoivent 503 avec fermeture de connexion avant lecture du multipart. Le traitement est limité à 2 décodages natifs et 4 entrées en attente. Le plafond correspond aux 2 CPU de la VM ; `sharp.concurrency()` et les autres usages de Sharp restent inchangés. La limite de 5 uploads par minute et par utilisateur s’applique en complément.

Les compteurs sont partagés par toutes les requêtes du processus Node, avec libération idempotente. Une déconnexion annule le travail en attente. Un décodage natif déjà commencé conserve son permis jusqu’à sa fin réelle, puis son résultat est abandonné. Le fichier n’est pas publié si l’annulation est observée avant l’écriture DB ; une écriture DB déjà engagée peut néanmoins se terminer. En cas de plusieurs processus backend, ces plafonds sont multipliés par le nombre de processus : revoir le budget mémoire avant d’augmenter les workers.

## Fichiers et concurrence

Le chemin reste celui de la route de lecture existante : `path.resolve(process.cwd(), '..', '..', 'storage', 'avatars')`. Un UUID utilisateur valide et un UUID aléatoire serveur forment `<userUUID>-<randomUUID>.webp`. Le fichier réencodé est écrit dans un temporaire non servi `.avatar-<UUID>.tmp`, mode 0600, puis publié complètement par lien atomique exclusif. Une collision ou un lien préexistant n’est jamais remplacé.

L’ancien avatar n’est supprimé qu’après confirmation de la nouvelle référence DB. Le nettoyage vise uniquement le prédécesseur capturé pour cet utilisateur : aucun balayage par extension ne peut supprimer un upload concurrent. En cas d’échec DB confirmé, seul le nouveau fichier créé par cette requête est retiré. Si l’erreur peut être arrivée après le commit, ou si l’état DB reste indéterminable, le raster sûr est conservé plutôt que de supprimer un fichier potentiellement référencé.

Les échecs ambigus et certains uploads simultanés peuvent laisser des rasters orphelins. Leur collecte éventuelle doit comparer les références DB, conserver une marge d’âge couvrant les requêtes en cours et rester distincte de l’upload. Les fichiers historiques ne sont pas automatiquement réencodés ou supprimés par ce correctif.

## Preuves et portée de l’alerte

L’ancien `diskStorage` remplaçait `<userUUID>.<extensionClient>` avant la vérification de 8 octets de signature. Un upload invalide pouvait ainsi détruire la photo précédente. La destination pouvait également recevoir une extension arbitraire, alors que le MIME multipart restait contrôlé par le client.

La route Nest de lecture existante refuse déjà `.html` avec HTTP 400 et fixe un MIME `image/*` pour les extensions autorisées. Les tests le confirment. Le stockage d’un fichier nommé `.html` n’établit donc pas, à lui seul, une exécution HTML via cette route ; toute exposition statique supplémentaire doit être vérifiée dans la configuration déployée. Le correctif supprime néanmoins l’extension client et la publication de contenu non décodé.

Le flux CodeQL #283 `File → createObjectURL → img` n’est pas en lui-même une preuve d’exécution JavaScript : le contexte `<img>` compte. La prévisualisation brute a été retirée sans désactivation d’alerte. Le profil affiche l’ancienne photo pendant l’envoi, puis uniquement l’URL du raster accepté par le serveur. Le composant Avatar lie désormais son erreur à la source concernée : une nouvelle URL peut s’afficher après une ancienne image cassée.

## Validation

- 59 tests backend spécifiques : véritables Sharp/Multer, PNG/JPEG/WebP, métadonnées/polyglotte supprimées, tronqués/animation/bombes/MIME refusés, rollback DB, commit ambigu, collisions, symlinks, courses, saturation, erreurs et annulation.
- Le test de saturation HTTP déclare un corps de2 Mio, envoie seulement les en-têtes et reçoit 503 : l’admission précède réellement Multer.
- Le burst de 20 véritables décodages admet 6 entrées, en refuse 14 et termine avec les compteurs à zéro.
- 2 tests navigateur rendent le vrai composant React ; ils passent après correctif et échouent avec l’ancien composant.

```sh
corepack pnpm --filter @omnitech/backend exec jest --runInBand avatar-budget.spec.ts avatar-upload.spec.ts avatar-http.spec.ts
corepack pnpm exec playwright test -c packages/ui/playwright.avatar.config.ts
```

Le second profil sert uniquement une fixture locale sur un port loopback éphémère, sans application, API, compte ni session enregistrée ; ses requêtes externes sont bloquées. Il utilise le Chromium Playwright installé pour le projet, ou le chemin explicite `PLAYWRIGHT_CHROMIUM_EXECUTABLE` fourni par l’environnement de validation.
