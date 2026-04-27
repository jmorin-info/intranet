# HA Postgres avec Patroni — OMNITECH Intranet (Wave D item 19)

> Architecture haute disponibilité actif/passif pour la base PostgreSQL.
> Cible : tolérance à la perte d'1 nœud (panne hardware, reboot, MAJ kernel).
> RPO async = quelques secondes ; RTO failover automatique 30-60s.

## Sommaire

1. [Architecture](#1-architecture)
2. [Pré-requis](#2-pré-requis)
3. [Installation 3 nœuds](#3-installation-3-nœuds)
4. [Failover automatique](#4-failover-automatique)
5. [Failover manuel (switchover planifié)](#5-failover-manuel-switchover-planifié)
6. [Rollback split-brain](#6-rollback-split-brain)
7. [Chaos engineering](#7-chaos-engineering--tests-recommandés)
8. [Monitoring](#8-monitoring--alertes)
9. [FAQ ops](#9-faq-ops)

---

## 1. Architecture

```
                           ┌─────────────────────────────┐
                           │   Backend NestJS (intranet) │
                           │   DATABASE_URL=10.33.120.50 │
                           └──────────────┬──────────────┘
                                          │
                            VIP keepalived│ 10.33.120.50
                                          │
        ┌─────────────────────────────────┼─────────────────────────────────┐
        │                                 │                                 │
   ┌────▼────────┐                  ┌─────▼───────┐                  ┌──────▼──────┐
   │  pg-node-1  │                  │  pg-node-2  │                  │  pg-node-3  │
   │ 10.33.120.51│ ◄── replic. ──── │ 10.33.120.52│ ◄── replic. ──── │ 10.33.120.53│
   │   LEADER    │                  │   REPLICA   │                  │   REPLICA   │
   │  Postgres16 │                  │  Postgres16 │                  │  Postgres16 │
   │   Patroni   │                  │   Patroni   │                  │   Patroni   │
   │ keepalived* │                  │ keepalived  │                  │ keepalived  │
   │   etcd      │                  │   etcd      │                  │   etcd      │
   └─────────────┘                  └─────────────┘                  └─────────────┘
        prio 200                       prio 150                         prio 100
                            (* keepalived MASTER courant)

Composants (par nœud) :
  - PostgreSQL 16   (data plane)
  - Patroni 3.x     (orchestrateur HA — élection leader, promote, demote)
  - etcd v3         (DCS — consensus Raft, quorum 2/3)
  - keepalived      (VRRP — VIP applicative)
```

### Décisions de design

- **3 nœuds** : nécessaire pour le quorum etcd (2/3). 2 nœuds = split-brain garanti.
- **VIP keepalived** plutôt que HAProxy : moins de hops, latence quasi-nulle, le check
  `check-patroni-leader.sh` garantit que la VIP est sur le leader réel.
- **Async replication** par défaut : RPO ≈ secondes (latence inter-nœud). Pour zero-data-loss,
  activer `synchronous_mode: true` dans `bootstrap.dcs` (perte perf ~30%).
- **etcd** plutôt que Consul/ZooKeeper : déjà standard k8s, opérationnellement éprouvé,
  intégration Patroni first-class.

---

## 2. Pré-requis

| Composant  | Version min               | Notes                                        |
| ---------- | ------------------------- | -------------------------------------------- |
| PostgreSQL | 16.x                      | 15.x acceptable, 14.x déconseillé (perf wal) |
| Patroni    | 3.2.x                     | Python ≥ 3.9                                 |
| etcd       | 3.5.x                     | API v3 strict (pas v2)                       |
| keepalived | 2.2.x                     | Mode VRRPv2 (vrrp_strict)                    |
| OS         | Debian 12+ / Ubuntu 24.04 | Kernel ≥ 5.15 pour watchdog                  |

### Réseau

- 3 IPs nœuds : `10.33.120.51`, `.52`, `.53`
- VIP applicative : `10.33.120.50/24`
- Time sync : **chrony actif** (drift > 1s = corruption Raft etcd)
- Pare-feu ouvert entre nœuds :
  - 5432 (Postgres)
  - 8008 (Patroni REST)
  - 2379, 2380 (etcd)
  - VRRP (proto 112) sur le sous-réseau

### Stockage

- SSD recommandés (etcd p99 fsync < 10ms)
- WAL archive partagé : NFS ou S3 via wal-g (optionnel, pour PITR > 24h)

---

## 3. Installation 3 nœuds

### 3.1 Provisionner les 3 VMs

```bash
# Sur chaque VM
apt update
apt install -y postgresql-16 postgresql-contrib-16 patroni keepalived chrony python3-pip
pip3 install --break-system-packages 'patroni[etcd3]'

# Désactiver l'instance Postgres par défaut (Patroni la pilotera)
systemctl stop postgresql@16-main
systemctl disable postgresql@16-main
```

### 3.2 Bootstrap etcd

Suivre [`infra/etcd/BOOTSTRAP.md`](../../infra/etcd/BOOTSTRAP.md).

### 3.3 Configurer Patroni

```bash
# Sur chaque nœud, déployer le fichier yaml correspondant
cp infra/patroni/patroni-node1.yml /etc/patroni/patroni.yml  # node 1
cp infra/patroni/patroni-node2.yml /etc/patroni/patroni.yml  # node 2
cp infra/patroni/patroni-node3.yml /etc/patroni/patroni.yml  # node 3

# Substituer les passwords (NE PAS COMMITER)
cat > /etc/patroni/secrets.env <<EOF
PATRONI_ADMIN_PASSWORD=$(openssl rand -base64 32)
PATRONI_REPL_PASSWORD=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
EOF
chmod 600 /etc/patroni/secrets.env
chown root:postgres /etc/patroni/secrets.env

# Substitution envsubst au démarrage (ou directement dans systemd)
envsubst '${PATRONI_ADMIN_PASSWORD} ${PATRONI_REPL_PASSWORD} ${POSTGRES_PASSWORD}' \
  < /etc/patroni/patroni.yml > /etc/patroni/patroni.yml.tmp
mv /etc/patroni/patroni.yml.tmp /etc/patroni/patroni.yml
chmod 600 /etc/patroni/patroni.yml

# Service systemd
cp infra/patroni/patroni.service /etc/systemd/system/
systemctl daemon-reload
```

### 3.4 Démarrer Patroni dans l'ordre

```bash
# Node 1 d'abord (priorité haute → deviendra leader)
systemctl start patroni
sleep 30
patronictl -c /etc/patroni/patroni.yml list  # Doit afficher node1 = Leader

# Puis node 2 et 3 (replica)
systemctl start patroni  # sur chaque nœud
```

Vérification :

```bash
patronictl -c /etc/patroni/patroni.yml list
# +-----------+--------------+---------+---------+----+-----------+
# | Member    | Host         | Role    | State   | TL | Lag in MB |
# +-----------+--------------+---------+---------+----+-----------+
# | pg-node-1 | 10.33.120.51 | Leader  | running |  1 |           |
# | pg-node-2 | 10.33.120.52 | Replica | running |  1 |         0 |
# | pg-node-3 | 10.33.120.53 | Replica | running |  1 |         0 |
# +-----------+--------------+---------+---------+----+-----------+
```

### 3.5 Configurer keepalived

```bash
# Sur node 1 — priorité 200
NODE_PRIORITY=200 INTERFACE=eth0 \
VRRP_PASSWORD=$(openssl rand -hex 8) \
envsubst < infra/keepalived/keepalived.conf.template > /etc/keepalived/keepalived.conf

# Idem node 2 (priorité 150) et node 3 (priorité 100), MÊME VRRP_PASSWORD
# Le mot de passe VRRP doit être IDENTIQUE sur les 3 nœuds (sinon ils s'ignorent)

cp scripts/check-patroni-leader.sh /usr/local/bin/
cp scripts/keepalived-notify.sh /usr/local/bin/
chmod +x /usr/local/bin/check-patroni-leader.sh /usr/local/bin/keepalived-notify.sh
mkdir -p /var/log/keepalived

systemctl enable --now keepalived
ip addr show eth0  # Doit montrer 10.33.120.50/24 sur node 1
```

### 3.6 Smoke test

```bash
# Depuis le backend NestJS
psql -h 10.33.120.50 -U omnitech -d omnitech_intranet -c "SELECT pg_is_in_recovery();"
# Doit retourner "f" (false → leader, accepte writes)
```

---

## 4. Failover automatique

### Détection

- Patroni ping le leader toutes les 10s (`loop_wait`)
- Si TTL etcd (30s) expire sans heartbeat → élection
- Replica le plus à jour (lag minimal) gagne
- Promotion ≈ 5-10s (rewind + apply WAL pending)
- keepalived détecte que le nouveau leader a la VIP via `check-patroni-leader.sh`

### Timeline observée (chaos test : `kill -9 postgres` sur leader)

```
T+0s    : kill -9 sur le leader → Postgres mort
T+10s   : Patroni leader se rend compte qu'il est mort, écrit dans etcd
T+30s   : TTL DCS expiré → élection automatique
T+35s   : pg-node-2 promu Leader (rewind WAL, accept writes)
T+38s   : keepalived sur node-2 voit check_patroni_leader OK → prend la VIP
T+40s   : Backend reconnecte (reconnect TCP transparent côté pg client)
TOTAL   : ~40s downtime perceptible côté utilisateur
```

### Effets côté backend NestJS

- Connexions ouvertes : abandonnées (queries en cours échouent)
- Connection pool : reconnect automatique à `10.33.120.50:5432` (la VIP)
- Aucun changement de `DATABASE_URL` côté backend
- Sessions HTTP en cours : rejouent la transaction (idempotence prisma)

---

## 5. Failover manuel (switchover planifié)

Pour MAJ Postgres, kernel update, ou maintenance node1 :

```bash
# Vue du cluster avant
patronictl -c /etc/patroni/patroni.yml list

# Switchover propre vers node-2 (sans perte de transactions)
patronictl -c /etc/patroni/patroni.yml switchover \
  --master pg-node-1 \
  --candidate pg-node-2 \
  --scheduled "+0s" \
  --force

# Patroni :
#   1. Met l'ancien leader en read-only
#   2. Attend que node-2 ait rejoint (lag = 0)
#   3. Promeut node-2
#   4. Reconnecte node-1 en replica
# Downtime : ~5s (pas de WAL pending puisque switchover propre)
```

Procédure typique pour MAJ Postgres minor :

1. Switchover du leader → replica autre nœud
2. Sur l'ex-leader : `apt upgrade postgresql-16` puis `systemctl restart patroni`
3. Vérifier qu'il rejoint en replica
4. Switchover suivant pour MAJ le 2e nœud
5. Etc.

---

## 6. Rollback split-brain

Cas critique mais possible si :

- etcd cluster perd le quorum (2 nœuds sur 3 morts)
- Réseau partition (node-1 isolé des 2 autres pendant > TTL)

Symptômes :

- 2 nœuds se croient Leader
- VIP keepalived peut bouger plusieurs fois en 1min
- Backend reçoit des écritures qui sont perdues côté replica majoritaire

### Procédure de rollback

```bash
# 1. ARRÊT IMMÉDIAT du backend NestJS pour stopper les writes
ssh app-server systemctl stop omnitech-backend

# 2. Identifier le "vrai" leader (celui dans la majorité etcd)
patronictl -c /etc/patroni/patroni.yml list
# Si etcd a perdu quorum, lister manuellement les nœuds qui se voient :
ETCDCTL_API=3 etcdctl member list

# 3. Forcer le leader définitif (= celui avec le plus haut tx_id)
patronictl -c /etc/patroni/patroni.yml failover \
  --master pg-node-2 \
  --candidate pg-node-2 \
  --force

# 4. Sur les EX-leaders fantômes : reinit complet
ssh node-1 'systemctl stop patroni && rm -rf /var/lib/postgresql/16/main/* && systemctl start patroni'
# Patroni va re-clone depuis le leader courant (peut prendre 5-30min selon DB size)

# 5. Restaurer les transactions perdues depuis Restic (si nécessaire)
#    cf. docs/infrastructure/BACKUP_RESTIC_OFFSITE.md

# 6. Redémarrer le backend
ssh app-server systemctl start omnitech-backend
```

### Prévention

- TTL etcd 30s + election 1s : laisse le temps à un nœud isolé de se rendre compte
- `pre-vote: true` dans etcd.conf : un nœud isolé ne déclenche pas l'élection
- `synchronous_mode: true` (à activer si on accepte la perte de perf) :
  les writes ne sont commit que si replica synchrone OK

---

## 7. Chaos engineering — tests recommandés

À exécuter trimestriellement en environnement de pré-prod (cluster identique à prod).

### Test 1 : kill leader

```bash
ssh pg-node-1 'kill -9 $(pgrep -f "postgres -D")'
# Attendu : failover en < 60s, lag réplica = 0
```

### Test 2 : reboot leader

```bash
ssh pg-node-1 'shutdown -r now'
# Attendu : failover propre, ex-leader rejoint en replica au reboot
```

### Test 3 : network partition

```bash
ssh pg-node-1 'iptables -A INPUT -s 10.33.120.0/24 -j DROP; \
              iptables -A OUTPUT -d 10.33.120.0/24 -j DROP'
# Attendu : node-1 sort du cluster (vu mort), node-2 ou node-3 prend leader.
# Au flush iptables → node-1 rejoint en replica.
```

### Test 4 : etcd quorum loss

```bash
ssh etcd-node-1 systemctl stop etcd
ssh etcd-node-2 systemctl stop etcd
# Attendu : Patroni passe en read-only sur tous les nœuds (refuse writes).
#           Backend → 503 Service Unavailable (cohérent, pas de split-brain)
# Récupération : restart d'au moins 1 etcd → quorum revient → cluster OK
```

### Test 5 : disk full sur leader

```bash
ssh pg-node-1 'dd if=/dev/zero of=/var/lib/postgresql/fill bs=1M count=99999'
# Attendu : Postgres refuse writes, Patroni détecte, failover automatique
# Récupération : free space puis Patroni rejoint
```

### Document à produire après chaque test

`docs/runbooks/chaos-test-YYYY-MM-DD.md` : timeline observée, écarts vs RTO 60s,
actions correctives.

---

## 8. Monitoring & alertes

### Prometheus exporter Patroni

```bash
pip3 install patroni-exporter
# Service : http://NODE:8088/metrics
```

### Métriques critiques

| Métrique                                   | Alerte                | Severity |
| ------------------------------------------ | --------------------- | -------- |
| `patroni_master == 0` sur tous les nœuds   | aucun leader > 30s    | CRIT     |
| `patroni_master == 1` sur 2+ nœuds         | split-brain potentiel | CRIT     |
| `patroni_xlog_replayed_location_lag_bytes` | > 100MB pendant 5min  | WARN     |
| `patroni_postgres_running == 0`            | Postgres down         | CRIT     |
| `etcd_server_has_leader == 0`              | etcd cluster down     | CRIT     |
| `etcd_server_leader_changes_total` (rate)  | > 1/min               | WARN     |
| `etcd_disk_wal_fsync_duration_seconds` p99 | > 10ms                | WARN     |
| `keepalived_master_count`                  | != 1 sur le LAN       | CRIT     |

### Tableau de bord Grafana

Dashboard ID communauté : `Patroni 12 / etcd 3`. Importer depuis grafana.com.

---

## 9. FAQ ops

**Q : Le replica peut-il accepter des reads ?**
R : Oui, `hot_standby: on` est activé. On peut router des reads SELECT vers replicas
via PgBouncer ou en pointant directement sur l'IP du replica. Mais notre intranet
~100 users : pas nécessaire avant de scaler.

**Q : Et si on perd 2 nœuds simultanément ?**
R : Quorum etcd cassé (1/3) → Patroni passe en read-only sur le nœud restant
(refuse writes). C'est par design : préserver la cohérence > disponibilité.
Récupération = remonter au moins 1 nœud etcd.

**Q : Comment changer le mot de passe `omnitech` (compte applicatif) ?**
R : `patronictl alter-user omnitech --password "$NEW_PASS"` — Patroni propage
sur les 3 nœuds. Puis update `DATABASE_URL` côté backend.

**Q : Backups : on continue à utiliser pg_dump ?**
R : Non, on bascule sur Restic offsite quotidien. Voir
[`BACKUP_RESTIC_OFFSITE.md`](./BACKUP_RESTIC_OFFSITE.md).

**Q : Chaos test recommandé avant prod ?**
R : OUI, OBLIGATOIRE. Au minimum tests 1, 2, 3 dans cette doc, en env pré-prod
identique à la prod. Documenter timeline observée vs RTO 60s.

---

**Variables d'env ajoutées** : voir [`.env.example`](../../.env.example) section
`# === HA Postgres / Patroni (Wave D item 19) ===`.
