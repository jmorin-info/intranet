# Essais réels des circuits avec PostgreSQL

Ce contrôle exécute les services backend compilés `WorkflowRuntimeService` et
`WorkflowEngineService` avec Prisma et une base PostgreSQL 16 jetable. Il ne
lance ni serveur Nest, ni ordonnanceur, ni transport de notification. Les
notifications vérifiées sont uniquement des lignes dans la base de test.

## Exécution isolée

Prérequis : Linux, Docker, Python 3, `nsenter` et un Node compatible avec le
backend compilé. Le lancement requiert root pour entrer dans l’espace réseau
privé du conteneur. Exécuter depuis une machine de construction ou de CI,
avec des dépendances installées et un backend compilé ; jamais sur un dépôt
utilisé par les services de production.

```bash
corepack pnpm --filter @omnitech/backend build
python3 scripts/integration/workflows/run-isolated.py \
  --source "$PWD" \
  --artifacts /tmp/omnitech-workflow-integration
```

`--artifacts` est obligatoire et doit être hors de l’arbre source. Le runner
crée un répertoire privé par exécution, un mot de passe aléatoire dans un
fichier `0600`, un réseau Docker interne dédié et un conteneur PostgreSQL
limité à 1 CPU et 512 Mio. Aucun port n’est publié sur l’hôte. Les processus
Prisma/Node accèdent à `127.0.0.1:5432` dans cet espace réseau, sans route vers
les réseaux métier. Le schéma local est appliqué avec `db push --skip-generate` :
aucun seed du projet ni régénération du client partagé.

Le script Node exige `INTRANET_INTEGRATION_DATABASE_URL` explicitement fournie,
le protocole PostgreSQL, l’adresse `127.0.0.1`, le port attendu, l’utilisateur de
test et un nom de base `approval_it_*`. Il ne reprend jamais une `DATABASE_URL`
ambiante. Le runner fournit séparément une URL dédiée au processus Prisma CLI ;
il transmet un environnement restreint et ne charge aucun `.env` du projet.

Pour une exécution reproductible, utiliser le digest officiel enregistré dans
`isolation.json`, par exemple `--image 'postgres:16@sha256:…'`. La version serveur
effective est enregistrée : une preuve sur une autre version mineure ne doit
pas être présentée comme un essai de la version exacte de production.

Options utiles :

- `--only 'approval versus cancellation'` rejoue un scénario par son nom.
- `--only 'daily reminders|permissions'` sélectionne plusieurs scénarios.
- `--backend-dist /chemin/prive/dist` vérifie un build candidat sans toucher
  aux sources ni à leur répertoire `dist`.
- `--keep` conserve le conteneur après succès pour inspection.

Les ressources d’une exécution réussie sont supprimées seulement après
l’écriture et la synchronisation de sa preuve. En cas d’échec, elles restent
accessibles pour diagnostic. Après examen du résultat :

```bash
python3 scripts/integration/workflows/cleanup-sandbox.py \
  /tmp/omnitech-workflow-integration/REPERTOIRE_DU_RUN
```

Le nettoyage vérifie les labels propres au run avant de supprimer un
conteneur ou un réseau. Il n’agit pas sur les autres services Docker.

## Scénarios et preuves

Le runner vérifie notamment :

- Deux décideurs concurrents sur une validation simple : un résultat durable,
  un conflit métier et une seule trace de décision.
- Double envoi du même acteur : réponse idempotente, motif et audit préservés.
- Votes parallèles unanimes : aucune voix perdue, une seule activation suivante.
- Deux démarrages concurrents : une seule instance pendante.
- Refus : retour en brouillon, demande qualité clôturée, notification unique.
- Annulations concurrentes et course approbation/annulation : un seul état final.
- Relances concurrentes : une marque et une notification par destinataire,
  puis une nouvelle relance après minuit à Paris.
- Permissions, étape future et anciens circuits sur des documents publiés,
  archivés ou obsolètes : aucun effet métier non autorisé.

Les courses principales sont répétées cinq fois. `results.json` contient les
scénarios, assertions, comptages réels, version PostgreSQL et empreintes des
services et du schéma. `isolation.json`, les journaux SQL et le manifeste
prouvent l’environnement employé. Garder ces artefacts et le fichier de mot
de passe dans un stockage privé ; ne jamais les ajouter au dépôt.

Ces essais vérifient les transactions réelles du moteur. Ils ne remplacent
pas la recette navigateur, le contrôle des fichiers/antimalware réels, les
signatures, la restauration ou l’observation des performances en production.

## Garde de non-régression en CI

Le workflow `.github/workflows/workflow-transactions.yml` prépare les dépendances
verrouillées, génère Prisma et compile le backend sur un runner éphémère. Il
exécute les mêmes scénarios dans une matrice PostgreSQL **16.13** et **16.16**.
Chaque exécution vérifie la version effectivement observée ; une autre version
mineure fait échouer le rapport.

Les preuves privées restent hors du checkout, avec les droits du runner root.
`export_ci_results.py` en extrait une liste blanche : statuts, scénarios connus,
compteurs, version et empreintes des services. Il exclut les URL, noms de bases,
chemins, erreurs brutes, diagnostics SQL, variables d’environnement et identifiants
Docker. Ses tests injectent des données privées et vérifient qu’elles ne sortent
pas dans le JSON ni dans le résumé.

Seul `results.json` assaini est téléversé comme artefact CI, avec une conservation
de sept jours. Un résumé lisible est ajouté à la page du job, y compris en cas
d’échec d’installation ou d’exécution. Les fichiers exportés sont lisibles par
le runner non privilégié, sans ouvrir l’accès aux répertoires privés `0700`.
Le nettoyage final vérifie les labels des seuls conteneurs et réseaux du test.

La présence du workflow dans le dépôt n’atteste pas son exécution sur GitHub.
La protection de branche doit imposer les deux contrôles de la matrice pour
en faire une condition de fusion effective ; ce réglage reste une action de
l’administrateur du dépôt.
