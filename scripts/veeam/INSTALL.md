# Installation - Rapport Veeam mensuel OMNITECH

Procédure d'installation du script `Generate-VeeamMonthlyReport.ps1` sur
le serveur Veeam Backup & Replication et de sa planification automatique.

## 1. Copie du script

Copier le dossier `scripts/veeam/` sur le serveur Veeam, par exemple dans :

```
C:\OmnitechScripts\Veeam\
```

Structure attendue :

```
C:\OmnitechScripts\Veeam\
  Generate-VeeamMonthlyReport.ps1
  README.md
  INSTALL.md
```

## 2. Autorisations d'exécution

Autoriser l'exécution des scripts signés ou locaux :

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine
```

Ou, pour une exécution ponctuelle sans modifier la policy machine :

```powershell
powershell.exe -ExecutionPolicy Bypass -File "C:\OmnitechScripts\Veeam\Generate-VeeamMonthlyReport.ps1"
```

## 3. Installation du module ImportExcel (optionnel)

Pour générer le rapport XLSX en plus du JSON :

```powershell
Install-Module ImportExcel -Scope AllUsers -Force
```

> Nécessite un accès Internet ou un proxy NuGet interne.

## 4. Test manuel

Lancer une première fois pour vérifier que tout fonctionne :

```powershell
cd C:\OmnitechScripts\Veeam
.\Generate-VeeamMonthlyReport.ps1
```

Vérifier la création des fichiers dans `C:\OmnitechReports\Veeam\`.

## 5. Génération d'un JWT long terme

L'upload automatique vers l'intranet OMNITECH nécessite un JWT.
Le RSSI peut obtenir un token via :

### Option A - Via l'API (recommandé)

Depuis une machine authentifiée :

```bash
curl -X POST https://intranet.omnitech-security.fr/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"julien.morin@omnitech-security.fr","password":"<votre_mdp>"}'
```

La réponse contient `accessToken` (durée de vie standard) et `refreshToken`
(durée longue). Pour un usage script, générer un token de service dédié
via un compte technique avec rôle ADMIN.

### Option B - Via la console intranet (à venir)

Une page `Admin > Tokens API` permettra de générer des tokens nommés
avec date d'expiration personnalisée.

### Stockage sécurisé du token

Ne jamais hardcoder le token dans le script. Utiliser plutôt une
variable d'environnement machine :

```powershell
[Environment]::SetEnvironmentVariable("OMNITECH_API_TOKEN", "eyJhbGc...", "Machine")
```

Puis dans la tâche planifiée :

```powershell
$token = [Environment]::GetEnvironmentVariable("OMNITECH_API_TOKEN", "Machine")
.\Generate-VeeamMonthlyReport.ps1 -UploadUrl "https://intranet.omnitech-security.fr/api/it-exports/upload" -UploadToken $token
```

## 6. Planification Windows (taskschd.msc)

### Option A - Via la console graphique

1. Ouvrir **Planificateur de tâches** (`taskschd.msc`)
2. `Créer une tâche...` (pas `Créer une tâche de base`)
3. **Onglet Général** :
   - Nom : `OMNITECH - Rapport Veeam mensuel`
   - Description : `Génère et remonte le rapport Veeam sur l'intranet OMNITECH (ISO 27001 A.8.13)`
   - Compte : `svc_veeam_reports` (compte de service avec droits Veeam Viewer)
   - Cocher `Exécuter même si l'utilisateur n'est pas connecté`
   - Cocher `Exécuter avec les autorisations maximales`
4. **Onglet Déclencheurs** :
   - Nouveau > Planifié > Mensuel
   - Début : `2026-04-01 03:00:00`
   - Mois : tous
   - Jours : `1`
5. **Onglet Actions** :
   - Action : `Démarrer un programme`
   - Programme : `powershell.exe`
   - Arguments : `-ExecutionPolicy Bypass -NoProfile -File "C:\OmnitechScripts\Veeam\Generate-VeeamMonthlyReport.ps1" -UploadUrl "https://intranet.omnitech-security.fr/api/it-exports/upload"`
   - Dossier : `C:\OmnitechScripts\Veeam`
6. **Onglet Conditions** : décocher `Ne démarrer la tâche que si l'ordinateur est sur secteur`
7. **Onglet Paramètres** :
   - Cocher `Autoriser l'exécution à la demande`
   - Cocher `Si la tâche échoue, redémarrer toutes les` `15 minutes` / `3 fois`

### Option B - Via schtasks.exe

```powershell
schtasks /Create `
  /TN "OMNITECH - Rapport Veeam mensuel" `
  /TR "powershell.exe -ExecutionPolicy Bypass -NoProfile -File `"C:\OmnitechScripts\Veeam\Generate-VeeamMonthlyReport.ps1`"" `
  /SC MONTHLY /D 1 /ST 03:00 `
  /RU "OMNITECH\svc_veeam_reports" /RP "*" `
  /RL HIGHEST /F
```

### Option C - Via export XML (recommandé pour déploiement multi-sites)

Créer `veeam-monthly-report.xml` puis :

```powershell
schtasks /Create /TN "OMNITECH - Rapport Veeam mensuel" /XML veeam-monthly-report.xml /RU "OMNITECH\svc_veeam_reports" /RP "*"
```

## 7. Vérification que le rapport est remonté

### Depuis le serveur Veeam

```powershell
Get-ChildItem C:\OmnitechReports\Veeam\ -Filter "veeam-report-*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 3
```

### Depuis l'intranet OMNITECH

1. Se connecter sur https://intranet.omnitech-security.fr
2. Naviguer vers `Admin > Exports IT`
3. Cliquer sur la catégorie **Veeam Backup & Replication**
4. Le widget "Dernier rapport Veeam" doit afficher :
   - La période du rapport (ex : `2026-03`)
   - La date de génération
   - Les 3 KPIs visuels (Succès / Avertissements / Échecs)
   - Le volume total sauvegardé
   - La liste des alertes éventuelles
   - Un tableau abrégé des jobs

### Via l'API

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://intranet.omnitech-security.fr/api/it-exports/veeam/latest
```

Doit retourner un JSON avec `reportId`, `reportPeriod`, `summary`, `jobs[]` et `alerts[]`.

## 8. Logs et supervision

Les logs du script sont visibles dans le **Planificateur de tâches** :
`Historique` > double-clic sur la tâche.

Pour un log persistant, rediriger la sortie :

```powershell
.\Generate-VeeamMonthlyReport.ps1 *>> C:\OmnitechReports\Veeam\last-run.log
```

En cas d'échec d'upload, le JSON reste dans `C:\OmnitechReports\Veeam\`
et peut être uploadé manuellement depuis l'intranet via drag-and-drop
sur la catégorie `Veeam Backup & Replication`.

## 9. Rétention

Conserver les rapports JSON/XLSX **minimum 3 ans** pour audit ISO 27001.
L'intranet OMNITECH conserve automatiquement tous les uploads
(soft-delete uniquement en cas de suppression manuelle).

Nettoyage local (après 1 an) :

```powershell
Get-ChildItem C:\OmnitechReports\Veeam\ -Filter "veeam-report-*.json" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddYears(-1) } |
  Remove-Item -Force
```

---

**Contact** : Julien MORIN - RSSI OMNITECH SECURITY
