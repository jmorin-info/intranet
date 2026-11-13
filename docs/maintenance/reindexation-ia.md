# Réindexation IA : garanties et exploitation

La reconstruction de l’index travaille par source, sans migration de schéma.
Les fragments GED portent `documentVersionId` et `sourceUpdatedAt` (millisecondes
Unix de `Document.updatedAt`). Les fragments Wiki et Runbook portent aussi la
date de modification de leur source. Ces champs sont produits depuis la base,
jamais depuis les métadonnées d’un appelant.

## Lecture et confidentialité

Chaque recherche lexicale, vectorielle et hybride vérifie l’accès GED canonique,
`deletedAt = null`, `scanStatus = CLEAN`, la version courante et la date de
modification. Les filtres SQL vectoriels/BM25 joignent aussi la version à son
propre document. Aucun rôle de substitution n’est créé. Sans acteur, aucun
fragment GED n’est retourné. L’ancien paramètre `RBAC_RAG_ENABLED=false` ne
contourne pas ces règles.

Les pages Wiki entrent dans cet index commun seulement si elles sont publiées
avec une visibilité `PUBLIC`. Les Runbooks doivent être publiés. Leur retrait
ou modification est vérifié en lecture, même avant la désindexation asynchrone.
Les échanges directs avec une page privée restent soumis à l’autorisation
existante de leur route dédiée. PROCEDURE, FAQ et TICKET restent sous les
contrats de leurs producteurs ; cette intervention ne remplace pas leur audit
métier et leurs règles de publication.

Les anciens fragments dépourvus de ces champs sont exclus. Un changement de
métadonnées GED invalide également la génération jusqu’à sa reconstruction :
ce choix favorise une absence temporaire de résultat à un extrait périmé.

## Reconstruction et annulation

La source est relue avant l’extraction d’un fichier. Seule la version désignée
par `currentVersionId`, appartenant au document, est extraite, y compris le snapshot HTML natif plutôt que le brouillon `content`, lorsqu’il est
`CLEAN`. L’ordre de téléversement n’est jamais utilisé. L’extraction lit au plus
16 MiB et prend en charge l’annulation des lectures. Une source textuelle est
limitée à 512 000 caractères et 300 fragments.

Les textes et vecteurs sont préparés avant toute suppression. Un échec d’Ollama
permet une génération lexicale complète ; une annulation, une baisse de capacité
ou une extraction indisponible conservent la génération précédente. Celle-ci
reste soumise aux contrôles de lecture et peut donc être invisible si la source
a changé.

Une transaction PostgreSQL prend un verrou consultatif par type/identifiant,
puis verrouille la source, revérifie sa version/date/publication, supprime
l’ancienne génération et insère la nouvelle. Toute insertion ou mise à jour de
vecteur échouée annule la transaction entière. Les autres processus voient
l’ancienne génération ou la nouvelle, jamais une reconstruction partielle.
La désindexation emploie le même verrou. La transaction est bornée à 30 secondes.

Une seule reconstruction globale est autorisée par processus et par instance
Redis. Le verrou Redis est acquis avec `NX`, un propriétaire aléatoire et une
expiration dépassant le délai maximal du travail de 60 secondes. Sa libération
compare le propriétaire. Redis indisponible : aucun traitement ne commence.
Les instances partageant une base doivent aussi partager ce Redis et cette
base logique Redis. Le backend annule son traitement lors de son arrêt.

## Capacité et activation

Les réglages sûrs par défaut sont :

| Variable | Défaut / effet |
| --- | --- |
| `RAG_REINDEX_ENABLED` | Cron désactivé ; `true` active le passage quotidien à 01:00 Europe/Paris |
| `RAG_REINDEX_SEMANTIC_ENABLED` | Désactivé ; la reconstruction reste lexicale, sans chargement de modèle |
| `RAG_MAINTENANCE_MODE` | `true` bloque les reconstructions et le préchauffage |
| `RAG_REINDEX_MAX_DURATION_MS` | 1 800 000 ms ; maximum accepté 7 200 000 ms |
| `RAG_REINDEX_MIN_AVAILABLE_MB` | Plancher non abaissable de 256 MiB en lexical, 2 048 MiB en sémantique |
| `OLLAMA_WARMUP_ENABLED` | Préchauffage désactivé ; `true` demande aussi `OLLAMA_ENABLED` et au moins 4 096 MiB disponibles |
| `RAG_EMBEDDING_CACHE_MAX` | 256 vecteurs ; plafond 2 048 |
| `RAG_EMBEDDING_CACHE_TTL_MS` | 300 000 ms ; plafond 3 600 000 ms |
| `OLLAMA_EMBEDDING_KEEP_ALIVE_SECONDS` | 60 secondes ; borné entre 0 et 300 |

La garde mesure `MemAvailable` et, en cgroup v2, le solde du conteneur. Le swap
n’augmente pas cette capacité. Elle est revérifiée avant les lots, les sources
et chaque embedding de fond. Les requêtes d’embedding sont sérialisées dans
le processus, avec une file limitée à 32, un texte maximal de 16 000 caractères,
un délai de 30 secondes couvrant aussi la lecture du corps HTTP, et au plus
trois tentatives. Une annulation utilisateur n’est pas réessayée.

Ces seuils réduisent le risque ; ils ne constituent pas une réservation de RAM
ni une garantie face aux autres services de la machine. Le budget mémoire des
modèles génératifs et des autres tâches IA doit rester surveillé séparément.

## Activation d’une version contenant ce correctif

1. Conserver le cron et les embeddings de reconstruction désactivés. Vérifier
   les sauvegardes et l’état de santé du backend après livraison.
2. Déclencher `POST /api/v1/rag/reindex` avec un compte ADMIN ou SUPER_ADMIN réel
   dans la fenêtre de maintenance. La route conserve ses gardes authentification,
   MFA et rôle ; elle n’est pas un endpoint anonyme de diagnostic.
3. Vérifier le compteur de sources et les erreurs, puis des recherches avec un
   compte autorisé et un compte sans droit. Le travail peut être relancé : chaque
   remplacement est transactionnel et les anciennes générations valides restent
   disponibles en cas d’échec.
4. Vérifier les journaux/OOM, la mémoire et le swap avant de décider de réactiver
   le cron. Sur la VM de 6 GiB, conserver le mode lexical tant que la marge pour
   un modèle résident n’a pas été mesurée.

Aucune réindexation réelle de la VM n’a été exécutée pour qualifier le correctif.
Les tests d’intégration emploient seulement des documents synthétiques.

## Reprise locale avec root système, sans session applicative

Le CLI `apps/backend/scripts/reindex-lexical.cjs` instancie uniquement les services
nécessaires. Il ne démarre ni serveur HTTP, ni `AppModule`, ni scheduler, ni
préchauffage et ne fabrique aucun utilisateur ou JWT. Il désactive les modèles
et interdit `fetch` dans son processus. Les écritures restent exclusivement les
remplacements d’index du service RAG, avec ses contrôles version/CLEAN,
transactions, garde mémoire, verrou Redis et annulation.

Il exige root système, le Node 24 qualifié, une URL PostgreSQL locale et un
répertoire de stockage absolu déjà existant. Il contrôle l’identité effective
PostgreSQL avant toute indexation et borne son pool à deux connexions.
`--check` vérifie aussi Redis et affiche uniquement un nombre de documents
éligibles et la mémoire disponible. Le CLI refuse un ancien build RAG ne portant
pas son contrat explicite : reconstruire le backend avec le commit CLI avant
utilisation.

Depuis la VM, après vérification des chemins réellement utilisés par le service :

```bash
cd /root/omnitech-intranet
# Fichier existant déjà utilisé par l'application ; ne pas copier ses secrets.
INTRANET_ENV_FILE=/root/omnitech-intranet/.env
# Choisir le stockage existant de l'application, jamais un répertoire de secours.
INTRANET_STORAGE_ROOT=/root/omnitech-intranet/storage
STORAGE_PATH="$INTRANET_STORAGE_ROOT" /opt/node-v24.22.3-linux-x64/bin/node \
  --env-file="$INTRANET_ENV_FILE" apps/backend/scripts/reindex-lexical.cjs --check
```

Ces deux chemins sont à confronter à l’unité déployée. Le CLI refuse un stockage
absent ; il n’en crée pas et n’essaie aucune autre base. Après résultat
`status: ready`, même commande avec `--apply` :

```bash
STORAGE_PATH="$INTRANET_STORAGE_ROOT" /opt/node-v24.22.3-linux-x64/bin/node \
  --env-file="$INTRANET_ENV_FILE" apps/backend/scripts/reindex-lexical.cjs --apply
```

La sortie est un JSON agrégé, sans contenu, titre, identifiant de document,
chemin de fichier, URL ou secret. `status: complete` et code 0 indiquent une
reconstruction sans erreur signalée ; `partial` et code 2 conservent les
anciennes générations des sources échouées. Le nombre d’erreurs est borné à 100
et `errorsMayBeTruncated` le signale. Une configuration/ressource/verrou refusé
renvoie `stopped` et code 1. Ctrl+C/SIGTERM interrompent le travail de façon
coopérative (codes 130/143), sans supprimer une génération valide.

Ne pas changer `RAG_MAINTENANCE_MODE` pour forcer un lancement refusé et ne pas
abaisser les planchers mémoire. Un signal ne réserve pas de RAM ; garder le
suivi des OOM et la vérification de santé applicative pendant le traitement.

Qualification : 5 tests de frontières du CLI et une exécution réelle sur
PostgreSQL 16.16 + Redis isolés, sans port publié : précontrôle, refus quand un
autre propriétaire tient le verrou, reconstruction d’un snapshot HTML et
libération du verrou. Les 8 scénarios RAG cumulent 62 assertions. Le CLI a été
exécuté sans `NODE_PATH` et sans données de production.
