# Bootstrap cluster etcd 3 nœuds (DCS Patroni)

> Procédure à exécuter **une seule fois** pour initialiser le cluster.
> Pour l'opérationnel courant (failover, monitoring, etc.) voir
> [`docs/infrastructure/HA_POSTGRES_PATRONI.md`](../../docs/infrastructure/HA_POSTGRES_PATRONI.md).

## Pré-requis

- 3 VM Debian 12 / Ubuntu 24.04 sur réseau privé `10.33.120.0/24`
- IPs réservées :
  - `etcd-node-1` : `10.33.120.51`
  - `etcd-node-2` : `10.33.120.52`
  - `etcd-node-3` : `10.33.120.53`
- VIP keepalived : `10.33.120.50`
- Pare-feu interne : ports `2379` (clients), `2380` (peers) ouverts entre les 3 nœuds
- Time sync : **chrony actif sur les 3 nœuds** (drift > 1s = corruption Raft)

## 1. Génération du PKI mTLS

Sur un poste ops sécurisé (PAS sur les nœuds prod). Utilise `cfssl` ou `step-ca`.

```bash
# CA
cfssl gencert -initca ca-csr.json | cfssljson -bare ca

# Server cert pour chaque nœud (peer + client)
for i in 1 2 3; do
  cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
    -hostname="etcd-node-$i,10.33.120.5$i,127.0.0.1" \
    -profile=server etcd-csr.json | cfssljson -bare etcd-node-$i
done

# Client cert pour Patroni (utilisé par patroni-client.crt/key)
cfssl gencert -ca=ca.pem -ca-key=ca-key.pem \
  -profile=client client-csr.json | cfssljson -bare patroni-client
```

Distribuer ensuite vers chaque nœud (chmod 600 etcd:etcd) :

| Fichier source           | Destination                             |
| ------------------------ | --------------------------------------- |
| `ca.pem`                 | `/etc/etcd/certs/ca.crt`                |
| `etcd-node-N.pem`        | `/etc/etcd/certs/server.crt`            |
| `etcd-node-N-key.pem`    | `/etc/etcd/certs/server.key`            |
| `etcd-node-N.pem`        | `/etc/etcd/certs/peer.crt`              |
| `etcd-node-N-key.pem`    | `/etc/etcd/certs/peer.key`              |
| `patroni-client.pem`     | `/etc/patroni/certs/patroni-client.crt` |
| `patroni-client-key.pem` | `/etc/patroni/certs/patroni-client.key` |
| `ca.pem`                 | `/etc/patroni/certs/etcd-ca.crt`        |

## 2. Installation etcd

```bash
# Sur les 3 nœuds
ETCD_VER=v3.5.13
curl -L https://github.com/etcd-io/etcd/releases/download/${ETCD_VER}/etcd-${ETCD_VER}-linux-amd64.tar.gz \
  | tar xz --strip-components=1 -C /usr/local/bin etcd-${ETCD_VER}-linux-amd64/etcd etcd-${ETCD_VER}-linux-amd64/etcdctl

useradd -r -s /bin/false etcd
mkdir -p /var/lib/etcd /var/log/etcd /etc/etcd/certs
chown -R etcd:etcd /var/lib/etcd /var/log/etcd
chmod 700 /var/lib/etcd
```

## 3. Configuration

```bash
# Sur node 1
export NODE_NAME=etcd-node-1 NODE_IP=10.33.120.51
export INITIAL_CLUSTER="etcd-node-1=https://10.33.120.51:2380,etcd-node-2=https://10.33.120.52:2380,etcd-node-3=https://10.33.120.53:2380"
envsubst < infra/etcd/etcd.conf.template > /etc/etcd/etcd.conf

# Idem sur node 2 et node 3 avec NODE_NAME / NODE_IP adaptés
```

Installer le service :

```bash
cp infra/etcd/etcd.service /etc/systemd/system/etcd.service
systemctl daemon-reload
```

## 4. Démarrage simultané (fenêtre 30s max)

```bash
# Sur les 3 nœuds, démarrer dans une fenêtre courte (le bootstrap exige
# que tous les peers soient up pendant l'élection initiale)
systemctl start etcd
```

## 5. Vérification

```bash
ETCDCTL_API=3 etcdctl \
  --endpoints=https://10.33.120.51:2379,https://10.33.120.52:2379,https://10.33.120.53:2379 \
  --cacert=/etc/etcd/certs/ca.crt \
  --cert=/etc/etcd/certs/server.crt \
  --key=/etc/etcd/certs/server.key \
  endpoint health

# Doit afficher 3 endpoints "is healthy"
```

## 6. Bascule du flag `initial-cluster-state`

**Après bootstrap réussi**, modifier `/etc/etcd/etcd.conf` sur chaque nœud :

```yaml
initial-cluster-state: existing # était: new
```

Puis `systemctl restart etcd` (rolling restart, un nœud à la fois).

## 7. Activation au boot

```bash
systemctl enable etcd
```

## Observabilité

- Métriques Prometheus : `https://NODE_IP:2379/metrics` (scrape avec mTLS client cert)
- Alertes critiques :
  - `etcd_server_has_leader == 0` → split-brain ou cluster down
  - `etcd_server_leader_changes_seen_total` qui croît rapidement → instabilité réseau
  - `etcd_disk_wal_fsync_duration_seconds` p99 > 10ms → I/O lent
