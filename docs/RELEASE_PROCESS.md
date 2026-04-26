# OMNITECH Intranet — Release process

> Workflow de cut d'une release et publication sur le share SMB de backup.
> Toute release passe par les 5 étapes ci-dessous, sans exception.
> ISO 27001:2022 — A.8.32 (gestion des changements), A.8.30 (externalisation).

## Pré-requis

- Branche `main` à jour, CI verte
- `CHANGELOG.md` mis à jour pour la version cible (`## [v3.2.0] - 2026-MM-DD`)
- Tag git **annotated** signé GPG sur le commit de release
- Disque dispo > 500 MB sur `/var/releases/omnitech`
- `.env` du repo de build contient `SMB_BACKUP_*` valides

## Workflow

### 1. Tag git

```bash
git switch main && git pull --ff-only
# Verifier CHANGELOG.md
git tag -as v3.2.0 -m "OMNITECH Intranet v3.2.0"
git push origin v3.2.0
```

Le tag doit suivre SemVer : `vMAJOR.MINOR.PATCH`. Pas de pre-release sur prod.

### 2. Génération du tarball

```bash
git switch v3.2.0       # ou : git checkout v3.2.0
./scripts/release-package.sh v3.2.0 --push-smb
```

Le script :
- produit `/var/releases/omnitech/omnitech-intranet-v3.2.0-<sha>.tar.gz`
- calcule le `SHA256` (`*.tar.gz.sha256`)
- pousse les deux fichiers sur `${SMB_BACKUP_SHARE}/releases/`

Sortie attendue :
```
==> 1/5 git archive HEAD
==> 2/5 injecting lockfile + infra + docs
==> 3/5 release-manifest.json
==> 4/5 tar + gzip + sha256
    artifact : /var/releases/omnitech/omnitech-intranet-v3.2.0-<sha>.tar.gz (~40-80 MB)
==> 5/5 push to SMB
```

### 3. Vérification SMB

```bash
mount -t cifs "$SMB_BACKUP_SHARE" /mnt/intranet-backup \
  -o "username=$SMB_BACKUP_USER,password=$SMB_BACKUP_PASSWORD,vers=3.0"
ls -lh /mnt/intranet-backup/releases/ | tail -5
sha256sum -c /mnt/intranet-backup/releases/omnitech-intranet-v3.2.0-*.sha256
umount /mnt/intranet-backup
```

Le `sha256sum -c` doit retourner `OK`. Si NOK : ne PAS publier, recommencer.

### 4. Test staging

Sur la VM staging (cycle de vie identique à la prod — voir
`INSTALL_FROM_SCRATCH.md`) :

```bash
# Récupérer le tarball depuis SMB
cp /mnt/intranet-backup/releases/omnitech-intranet-v3.2.0-*.tar.gz /tmp/
sha256sum -c /tmp/omnitech-intranet-v3.2.0-*.sha256

# Suivre §8 → §12 de INSTALL_FROM_SCRATCH.md
# Smoke tests obligatoires :
curl -s http://localhost:3000/api/health | jq '.services'
curl -sI https://intranet-staging.<site>/healthz
```

Si un smoke test échoue → bug bloquant, reprendre au commit précédent.

### 5. Annonce + déploiement prod

Une fois staging OK :

1. **Mail** au RSSI + équipe IT : sujet `[OMNITECH Intranet] Release v3.2.0`,
   joindre extrait `CHANGELOG.md` + lien vers le tarball SMB.
2. **Teams** canal `#intranet-ops` : message court + handle `@on-call`.
3. **Déploiement prod** : refaire §8/§9 de `INSTALL_FROM_SCRATCH.md` sur la VM
   prod (l'ancienne version reste dans `/opt/omnitech/intranet.old/` pour
   rollback rapide).
4. **Rollback** si KO < 30 min :
   ```bash
   systemctl stop omnitech-{backend,frontend}
   mv /opt/omnitech/intranet /opt/omnitech/intranet.broken
   mv /opt/omnitech/intranet.old /opt/omnitech/intranet
   systemctl start omnitech-{backend,frontend}
   ```
5. **Tag GlitchTip** : créer la release dans Sentry/GlitchTip pour grouper les
   erreurs (`SENTRY_RELEASE=v3.2.0`).

## Checklist post-release

- [ ] tag git `v3.2.0` poussé sur origin
- [ ] tarball + sha256 sur SMB sous `releases/`
- [ ] `release-manifest.json` cohérent (versions runtime à jour)
- [ ] staging passé, prod déployée
- [ ] CHANGELOG publié
- [ ] mail + Teams envoyés
- [ ] GlitchTip release tag posé
- [ ] backup nocturne suivant validé sur SMB
