# Deploiement Kubernetes / k3s — OMNITECH Intranet

> Statut : **option future**. Pour ~100 utilisateurs sur 1 VM, `docker compose`
> reste la cible recommandee (cf [`DOCKER_COMPOSE_PROD.md`](./DOCKER_COMPOSE_PROD.md)).
> Ce chart Helm est concu pour basculer en cluster multi-noeud quand la
> charge ou la criticite (HA, multi-region, scale auto > 500 users) le
> justifient.

## Sommaire

1. [Architecture cible](#1-architecture-cible)
2. [Pre-requis cluster](#2-pre-requis-cluster)
3. [Installation k3s](#3-installation-k3s)
4. [Pre-installation Helm chart](#4-pre-installation-helm-chart)
5. [Installation du chart](#5-installation-du-chart)
6. [Secrets : Sealed Secrets vs External Secrets](#6-secrets--sealed-secrets-vs-external-secrets)
7. [Operations courantes](#7-operations-courantes)
8. [Scaling](#8-scaling)
9. [Upgrades / rollback](#9-upgrades--rollback)
10. [Runbook restore](#10-runbook-restore)
11. [Troubleshooting](#11-troubleshooting)

## 1. Architecture cible

```
                  +-----------------------+
                  |  Internet / VPN       |
                  +-----------+-----------+
                              |
                              v
                       Traefik Ingress
                  (TLS via cert-manager)
                              |
        +---------------------+---------------------+
        |                     |                     |
        v                     v                     v
   /api  /onlyoffice          /                     /
        |                     |                     |
   backend Service       frontend Service     onlyoffice Service
   (HPA: 3-10)           (3 replicas)         (1 replica, RWO PVC)
        |
        +-> postgres StatefulSet (RWO 100Gi)
        +-> redis StatefulSet (RWO 16Gi)
        +-> meilisearch StatefulSet (RWO 50Gi)
        +-> ollama Deployment (RWO 100Gi, init pull modeles)
        +-> stirling-pdf Deployment
```

**Choix structurants :**

- **Postgres / Redis / Meilisearch en `StatefulSet` 1 replica** : ces services
  ne supportent pas le scaling horizontal natif (Postgres a besoin d'un operateur
  de type CloudNativePG / Zalando, Redis a besoin de Sentinel/Cluster). Pour
  un MVP, un replica avec PVC + sauvegardes regulieres suffit. La HA reelle
  passe par un operateur Cloud / un service externe (RDS / Cloud SQL).
- **Backend / Frontend en `Deployment` + HPA** : scaling stateless via
  CPU + custom metrics Prometheus.
- **PVC `ReadWriteOnce`** : compatible `local-path-provisioner` (k3s) et
  `longhorn` (multi-noeud). Ne pas utiliser `ReadWriteMany` (contraintes).
- **Ollama en Deployment + PVC** : modeles pre-charges via initContainer.
  Recreate strategy car PVC RWO + modeles lourds.

## 2. Pre-requis cluster

| Element                 | Recommande                                                |
| ----------------------- | --------------------------------------------------------- |
| Noeuds                  | 3 noeuds minimum (HA control plane optionnel via etcd)    |
| CPU / RAM par noeud     | 8 vCPU / 16 Go (24 Go si Ollama)                          |
| Stockage par noeud      | 200 Go SSD                                                |
| Reseau                  | 10G interne, 1G public                                    |
| StorageClass            | `local-path` (mono-noeud) ou `longhorn` (multi-noeud)     |
| Ingress controller      | Traefik (inclus dans k3s) ou nginx-ingress                |
| cert-manager            | v1.14+ avec `ClusterIssuer letsencrypt-prod`              |
| Metrics-server          | Inclus k3s (active par defaut)                            |
| Prometheus + adapter    | Optionnel — necessaire pour les custom metrics HPA        |

## 3. Installation k3s

### Mono-noeud (PoC / preprod)

```bash
# Installer k3s avec Traefik et local-path-provisioner par defaut
curl -sfL https://get.k3s.io | sh -

# Verifier
kubectl get nodes
kubectl get storageclass
# NAME                  PROVISIONER             RECLAIMPOLICY  ...
# local-path (default)  rancher.io/local-path   Delete         ...
```

### Multi-noeud HA (3 control-plane + N workers)

```bash
# Sur le 1er control-plane (init du cluster)
curl -sfL https://get.k3s.io | sh -s - server \
  --cluster-init \
  --tls-san k3s.intranet.omnitech-security.fr

# Recuperer le token sur le 1er master
sudo cat /var/lib/rancher/k3s/server/node-token

# Sur les autres masters
curl -sfL https://get.k3s.io | sh -s - server \
  --server https://<MASTER_1>:6443 \
  --token <TOKEN>

# Sur les workers
curl -sfL https://get.k3s.io | sh -s - agent \
  --server https://<MASTER>:6443 \
  --token <TOKEN>
```

### Recuperer kubeconfig sur la machine d'admin

```bash
scp root@k3s-master:/etc/rancher/k3s/k3s.yaml ~/.kube/config-omnitech
sed -i "s/127.0.0.1/<MASTER_PUBLIC_IP>/" ~/.kube/config-omnitech
export KUBECONFIG=~/.kube/config-omnitech
kubectl get nodes
```

## 4. Pre-installation Helm chart

### 4.1 Installer Helm 3

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

### 4.2 Installer cert-manager

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --version v1.14.0 \
  --set installCRDs=true

# ClusterIssuer Let's Encrypt
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: noc@omnitech-security.fr
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: traefik
EOF
```

### 4.3 Installer un provisioner de storage repliqué (multi-noeud)

```bash
# Longhorn (recommande pour PVC ReadWriteOnce repliques 3x)
helm repo add longhorn https://charts.longhorn.io
helm install longhorn longhorn/longhorn \
  --namespace longhorn-system --create-namespace \
  --set defaultSettings.defaultReplicaCount=3
```

### 4.4 Installer Sealed Secrets ou external-secrets

Voir [section 6](#6-secrets--sealed-secrets-vs-external-secrets).

## 5. Installation du chart

### 5.1 Dev / preprod

```bash
helm upgrade --install intranet infra/k3s/charts/intranet \
  -f infra/k3s/charts/intranet/values.dev.yaml \
  --namespace intranet-dev \
  --create-namespace \
  --wait --timeout 10m

# Verifier
kubectl get pods -n intranet-dev
kubectl get ingress -n intranet-dev
```

### 5.2 Production

**Pre-requis :**

1. Le Secret `omnitech-secrets` est applique via SealedSecret (cf section 6).
2. Le namespace `intranet` existe et est labelise pour les NetworkPolicy.
3. Le DNS `intranet.omnitech-security.fr` pointe vers les load balancers du
   cluster (ou le LoadBalancer Service Traefik).

```bash
# Pre-creer le namespace avec les labels
kubectl create namespace intranet
kubectl label namespace intranet kubernetes.io/metadata.name=intranet

# Install / upgrade
helm upgrade --install intranet infra/k3s/charts/intranet \
  -f infra/k3s/charts/intranet/values.prod.yaml \
  --namespace intranet \
  --wait --timeout 15m

# Suivre le rollout
kubectl rollout status deploy/intranet-omnitech-intranet-backend -n intranet
kubectl rollout status deploy/intranet-omnitech-intranet-frontend -n intranet
```

## 6. Secrets : Sealed Secrets vs External Secrets

### Comparatif

| Critere                       | Sealed Secrets                  | external-secrets-operator + Vault   |
| ----------------------------- | ------------------------------- | ----------------------------------- |
| Complexite installation       | Faible (1 helm install)         | Moyenne (Vault + ESO + auth)        |
| Rotation automatique          | Non (manuel, via `kubeseal`)    | Oui (depuis Vault)                  |
| Audit acces secret            | Limite                          | Vault audit log natif               |
| Multi-cluster                 | 1 cle par cluster (re-sceller)  | Centralise sur Vault                |
| Cas d'usage OMNITECH          | Cluster mono-tenant, < 50 users | Multi-team / multi-cluster / regule |

**Choix recommande pour OMNITECH** : **Sealed Secrets**, plus simple,
suffisant pour notre cible. Si on bascule vers du multi-tenant ou si la
DRH/RGPD demande une rotation auditee, basculer vers ESO + Vault.

### Sealed Secrets — install + usage

```bash
# 1. Installer le controller
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets \
  --namespace kube-system

# 2. Recuperer la cle publique du controller
kubeseal --fetch-cert > pub-cert.pem

# 3. Creer le Secret en clair localement
cat > /tmp/omnitech-secrets.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: omnitech-secrets
  namespace: intranet
type: Opaque
stringData:
  POSTGRES_PASSWORD: "$(openssl rand -base64 32)"
  REDIS_PASSWORD: "$(openssl rand -base64 32)"
  JWT_ACCESS_SECRET: "$(openssl rand -hex 32)"
  JWT_REFRESH_SECRET: "$(openssl rand -hex 32)"
  MEILI_MASTER_KEY: "$(openssl rand -base64 32)"
  ONLYOFFICE_JWT_SECRET: "$(openssl rand -base64 48)"
  SMTP_PASSWORD: "<smtp_password>"
  DOCUSEAL_API_KEY: "<docuseal_api_key>"
  DOCUSEAL_WEBHOOK_SECRET: "$(openssl rand -base64 32)"
EOF

# 4. Sceller (le fichier scelle peut etre commit en toute securite)
kubeseal --cert pub-cert.pem -f /tmp/omnitech-secrets.yaml -o yaml \
  > infra/k3s/sealed/omnitech-secrets.sealed.yaml

# 5. Detruire la version en clair
shred -u /tmp/omnitech-secrets.yaml

# 6. Appliquer
kubectl apply -f infra/k3s/sealed/omnitech-secrets.sealed.yaml

# Le controller va dechiffrer et creer le Secret omnitech-secrets dans intranet
kubectl get secret omnitech-secrets -n intranet
```

### external-secrets + Vault (alternative)

```bash
# 1. Installer ESO
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets --create-namespace

# 2. SecretStore pointant vers Vault (KV v2)
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: intranet
spec:
  provider:
    vault:
      server: https://vault.omnitech-security.fr
      path: secret
      version: v2
      auth:
        kubernetes:
          mountPath: kubernetes
          role: omnitech-intranet
EOF

# 3. ExternalSecret declenchera la creation du Secret omnitech-secrets
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: omnitech-secrets
  namespace: intranet
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: SecretStore
  target:
    name: omnitech-secrets
  data:
    - secretKey: POSTGRES_PASSWORD
      remoteRef:
        key: omnitech/intranet
        property: postgres_password
    # ... idem pour les autres
EOF
```

## 7. Operations courantes

### Lister tous les pods de l'app

```bash
kubectl get pods -n intranet -l app.kubernetes.io/part-of=omnitech-intranet
```

### Logs en suivi

```bash
kubectl logs -f -n intranet -l app.kubernetes.io/component=backend --max-log-requests 10
```

### Exec dans un pod

```bash
kubectl exec -it -n intranet deploy/intranet-omnitech-intranet-backend -- sh
```

### Migrations Prisma

```bash
# A executer apres chaque release qui modifie le schema
kubectl exec -n intranet deploy/intranet-omnitech-intranet-backend -- \
  pnpm --filter @omnitech/database exec prisma migrate deploy
```

## 8. Scaling

### Manuel

```bash
kubectl scale deploy intranet-omnitech-intranet-backend --replicas=5 -n intranet
```

### Auto (HPA — deja configure pour le backend)

Le backend a un HPA `min=3, max=10` base sur :

- CPU > 65%
- Custom metric `http_request_duration_seconds > 500ms` (Prometheus + adapter)

```bash
# Suivre l'etat
kubectl get hpa -n intranet -w

# Debug : forcer du load
kubectl run -i --tty load-test --image=alpine/curl --restart=Never -- \
  sh -c 'while true; do curl -s http://intranet-omnitech-intranet-backend.intranet:3000/health > /dev/null; done'
```

### Frontend

Pas de HPA par defaut (Next.js stateless mais peu CPU-bound). Scaling manuel
si necessaire.

### Postgres

**Pas de scaling horizontal trivial.** Pour de la HA reelle, migrer vers :

- **CloudNativePG** (operateur, replication streaming)
- **Zalando postgres-operator** (similaire, autre ecosysteme)
- **Service externe** : RDS Aurora, Cloud SQL HA, etc.

## 9. Upgrades / rollback

### Helm release upgrade (zero downtime backend)

```bash
# Modifier values.prod.yaml (par ex. backend.image.tag: "1.1.0")
git diff infra/k3s/charts/intranet/values.prod.yaml

helm upgrade intranet infra/k3s/charts/intranet \
  -f infra/k3s/charts/intranet/values.prod.yaml \
  --namespace intranet \
  --wait --timeout 15m

# Suivre
kubectl rollout status deploy/intranet-omnitech-intranet-backend -n intranet
```

### Rollback rapide

```bash
# Lister les revisions
helm history intranet -n intranet

# Rollback a la N-1
helm rollback intranet -n intranet
# ou a une revision specifique
helm rollback intranet 5 -n intranet
```

### Rollback Postgres / data : voir runbook restore (section 10).

## 10. Runbook restore

> ISO 27001 A.8.13 — sauvegarde et restauration. Ce runbook doit etre teste
> annuellement (fait via `scripts/test-backup-restore.sh` en environnement
> compose). Un test similaire en k3s est planifie pour Q3 2026.

### 10.1 Restauration Postgres

```bash
# 1. Recuperer le dump SQL le plus recent (cf scripts/backup-full.sh ou Veeam)
ls -lh /var/backups/omnitech/db_*.sql.gz

# 2. Stopper backend (frontend peut rester, mais 502)
kubectl scale deploy intranet-omnitech-intranet-backend --replicas=0 -n intranet

# 3. Copier le dump dans le pod postgres
DUMP=/var/backups/omnitech/db_2026-04-25.sql.gz
kubectl cp $DUMP intranet/intranet-omnitech-intranet-postgres-0:/tmp/dump.sql.gz

# 4. Restaurer
kubectl exec -n intranet intranet-omnitech-intranet-postgres-0 -- \
  sh -c 'gunzip -c /tmp/dump.sql.gz | psql -U omnitech -d omnitech_intranet'

# 5. Redemarrer backend
kubectl scale deploy intranet-omnitech-intranet-backend --replicas=3 -n intranet

# 6. Verifier
curl https://intranet.omnitech-security.fr/api/health
```

### 10.2 Restauration storage (PVC backend)

```bash
# 1. Snapshot du PVC actuel (sauvegarde au cas ou la restauration deconne)
kubectl annotate pvc intranet-omnitech-intranet-storage \
  pre-restore-snapshot=$(date -u +%Y-%m-%dT%H-%M-%S) -n intranet

# 2. Si Longhorn : restaurer depuis snapshot integre
# (UI Longhorn -> Backup -> Restore -> nouveau PVC -> remplacer claim)

# 3. Sinon : pod temporaire qui copie depuis tar
kubectl run restore --image alpine --restart=Never -n intranet \
  --overrides='{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"intranet-omnitech-intranet-storage"}}],"containers":[{"name":"r","image":"alpine","stdin":true,"tty":true,"volumeMounts":[{"name":"data","mountPath":"/data"}]}]}}' \
  --command -- sh

# Dans le pod : nettoyer puis untar du backup
# / # tar xzf - -C /data < /tmp/storage_2026-04-25.tar.gz
```

### 10.3 Restauration cluster complet (Disaster Recovery)

1. Re-provisionner les noeuds k3s (cf section 3).
2. Re-installer cert-manager + Sealed Secrets controller + Longhorn.
3. Re-appliquer le SealedSecret `omnitech-secrets`.
4. `helm install` du chart (section 5.2).
5. Restaurer Postgres (section 10.1).
6. Restaurer storage (section 10.2).
7. Re-tirer les modeles Ollama si PVC vide.

## 11. Troubleshooting

| Symptome                                      | Diagnostic / fix                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Pod backend en `CrashLoopBackOff`             | `kubectl logs ...` — souvent `omnitech-secrets` manquant ou DB indisponible |
| Pod postgres `Pending`                        | PVC non provisionne — `kubectl describe pvc` — verifier StorageClass   |
| Ingress 503                                   | `kubectl describe ingress` — verifier que les Services pointent bien   |
| Cert TLS pending                              | `kubectl describe challenge -A` — souvent DNS pas propage              |
| HPA "unknown" CPU                             | metrics-server pas installe (`kubectl top nodes` doit fonctionner)     |
| HPA custom metric "FailedGetPodsMetric"       | Prometheus adapter pas installe ou metric pas exposee par backend      |
| Ollama OOM                                    | Augmenter `ollama.resources.limits.memory` ou desactiver `RAG_ENABLED` |
| OnlyOffice JWT error                          | Le secret `ONLYOFFICE_JWT_SECRET` doit etre identique cote backend     |
| `kubectl exec` impossible (frozen)            | Pod en cours de demarrage — attendre `kubectl get pod` Status=Running  |

## Annexes

### A. Commandes utiles

```bash
# Liste de toutes les ressources gerees par la release
helm get manifest intranet -n intranet | kubectl get -f - -n intranet

# Diff avant upgrade (necessite plugin helm-diff)
helm diff upgrade intranet infra/k3s/charts/intranet \
  -f infra/k3s/charts/intranet/values.prod.yaml -n intranet

# Forcer le redemarrage d'un Deployment (sans changement d'image)
kubectl rollout restart deploy/intranet-omnitech-intranet-backend -n intranet

# Identifier le noeud d'un pod (utile en debug stockage RWO)
kubectl get pods -n intranet -o wide

# Drain d'un noeud avant maintenance
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
```

### B. Migration `compose -> k3s`

Quand la decision de migrer sera prise :

1. **Sauvegarder** : dump SQL + snapshot storage (`scripts/backup-full.sh`).
2. **Provisionner** k3s (section 3) en parallele de la VM compose.
3. **Restaurer** SQL + storage dans le cluster (section 10).
4. **Tester** sur un sous-domaine `k3s.intranet.omnitech-security.fr`.
5. **Switcher le DNS** : pointer `intranet.omnitech-security.fr` vers le LB k3s.
6. **Garder la VM compose** en standby 7 jours, puis decommissioning.
