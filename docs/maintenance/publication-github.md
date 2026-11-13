# Publication et validation du dépôt central

L'intranet reste public sur `jmorin-info/intranet`. Le dépôt SI-IA est privé.
La consolidation repart de l'historique réel de la VM, dont `origin/main`
est un ancêtre, puis intègre les correctifs RAG et qualité séparément. Aucun
historique existant n'est réécrit et aucun push forcé n'est nécessaire.

Avant publication, scanner l'historique ajouté et l'arbre de sources :

```sh
gitleaks git --redact --no-banner --log-opts='origin/main..HEAD' .
bash scripts/security/check-secrets.sh .
```

Le scanner ne dispense plus de contrôle les documentations, les seeds ou les
templates. Seuls des exemples littéraux et références de variables précises
sont autorisés. Les secrets détectés ne doivent jamais être imprimés dans un
rapport public. Les dépendances et les builds sont validés dans une copie
autonome, sans charger de configuration d'exploitation.

Les checks locaux attestent les lots indiqués dans leurs rapports. Ils ne
prouvent ni une exécution GitHub Actions ni le déploiement de chaque commit.
La branche de consolidation contient aussi des lots en attente de déploiement ;
la référence du code actuellement déployé reste dans le rapport d'intervention.

Les branches principales doivent refuser les suppressions et push forcés,
exiger les checks utiles et la résolution des conversations. Une revue humaine
indépendante reste nécessaire pour les évolutions sensibles. La protection des
branches du dépôt SI-IA privé n'est pas disponible avec GitHub Free : l'API
renvoie 403 et demande une offre compatible. Garder SI-IA privé et documenter
cette limite ; ne pas présenter une convention locale comme une protection
serveur effective.

Les identifiants de publication restent dans un coffre ou en mémoire pendant
l'intervention. Ne jamais les placer dans les URLs Git, les fichiers `.env`,
les workflows, les journaux ou le dépôt. Révoquer les identifiants temporaires
une fois l'intervention terminée.
