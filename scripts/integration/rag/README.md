# Test PostgreSQL RAG isolé

`run-isolated.py` démarre un PostgreSQL officiel sur un réseau Docker interne,
sans port publié, avec 512 MiB de mémoire et un volume temporaire. Le schéma
est créé uniquement dans une base `approval_it_*` synthétique à accès dédié.
Aucun serveur applicatif, seed métier ou notification externe n’est démarré.
Les journaux et secrets éphémères restent dans le répertoire privé d’artefacts.
Les preuves durables ne contiennent pas les identifiants de connexion.

Depuis une copie autonome déjà compilée, sous Linux avec Docker et root :

```bash
python3 scripts/integration/rag/run-isolated.py \
  --source "$PWD" --artifacts /root/intranet-rag-integration \
  --image postgres:16
```

Fixer le digest d’image dans le compte rendu avant d’utiliser un tag mutable
pour une qualification reproductible. Les preuves `isolation.json` enregistrent
le digest effectivement exécuté, les bornes mémoire/CPU et l’absence de port.
Les conteneurs/réseaux réussis sont supprimés automatiquement ; un échec est
conservé pour diagnostic et doit être nettoyé en vérifiant son étiquette
`omnitech.rag.integration` dans `manifest.json`.

Le test ajoute Redis officiel `redis:7-alpine` sur le même réseau interne,
avec 64 MiB et sans port publié. Son digest est conservé dans
`redis-isolation.json`. Le conteneur Redis est nettoyé avec PostgreSQL.

Les 8 scénarios vérifient : version courante distincte du dernier téléversement,
provenance et filtre SQL/lexical, suppression des résultats obsolètes/non CLEAN,
course avec une version nouvelle, rollback réel après suppression et insertion,
annulation d’embedding et fallback lexical, remplacements concurrents et absence
de doublons, retrait de Wiki privées et Runbook non publiés. Le dernier scénario exécute réellement les modes `--check`/`--apply` du CLI
root, le refus d’un verrou Redis déjà tenu et l’absence de contenu métier dans
sa sortie. Les modèles Ollama
sont simulés ; ce test ne qualifie ni l’inférence réelle ni pgvector lui-même.
