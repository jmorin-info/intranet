# OMNITECH - Rapports Veeam Backup & Replication

Scripts PowerShell pour générer et exploiter les rapports mensuels Veeam B&R
dans le cadre de la certification ISO 27001:2022 (contrôles A.8.13 et A.5.30).

## Contenu

| Fichier | Rôle |
|---------|------|
| `Generate-VeeamMonthlyReport.ps1` | Script principal de collecte + export JSON/XLSX |
| `INSTALL.md` | Procédure d'installation et planification |
| `README.md` | Ce fichier |

## Pré-requis

- **Windows Server** avec la console Veeam B&R installée (v11 ou v12+)
- **PowerShell 5.1** minimum (PowerShell 7+ recommandé)
- **Module Veeam** : `Veeam.Backup.PowerShell` (fourni avec la console Veeam)
  - Ou snap-in legacy `VeeamPSSnapin` (v9.5 et antérieur)
- **Droits** : le compte qui exécute le script doit avoir le rôle
  `Veeam Backup Administrator` ou `Veeam Backup Viewer`
- **Module ImportExcel** (optionnel, pour le XLSX) :
  ```powershell
  Install-Module ImportExcel -Scope CurrentUser -Force
  ```

## Utilisation manuelle

### Génération basique (mois précédent)

```powershell
.\Generate-VeeamMonthlyReport.ps1
```

Produit dans `C:\OmnitechReports\Veeam\` :
- `veeam-report-YYYY-MM.json` (structure exploitable par l'intranet)
- `veeam-report-YYYY-MM.xlsx` (si ImportExcel installé)

### Génération pour un mois précis

```powershell
.\Generate-VeeamMonthlyReport.ps1 -Month "2026-03"
```

### Dossier de sortie personnalisé

```powershell
.\Generate-VeeamMonthlyReport.ps1 -OutputPath "D:\Reports\Veeam"
```

### Upload direct vers l'intranet OMNITECH

```powershell
.\Generate-VeeamMonthlyReport.ps1 `
  -UploadUrl "https://intranet.omnitech-security.fr/api/it-exports/upload" `
  -UploadToken "eyJhbGciOi..."
```

Le script POST le fichier JSON (et le XLSX s'il existe) vers l'API en
multipart/form-data avec les métadonnées suivantes :
- `category` = `VEEAM_BACKUP`
- `reportPeriod` = mois au format `YYYY-MM`
- `description` = résumé succès/total

> Voir `INSTALL.md` pour générer un JWT longue durée.

## Structure du JSON produit

```jsonc
{
  "reportPeriod": "2026-03",
  "generatedAt": "2026-04-01T03:15:00Z",
  "generatedBy": "svc_veeam",
  "generatedOn": "VEEAM-SRV01",
  "iso27001Compliance": {
    "control": "A.8.13 - Information backup",
    "secondaryControl": "A.5.30 - ICT readiness for business continuity",
    "standard": "ISO/IEC 27001:2022"
  },
  "summary": {
    "totalJobs": 12,
    "totalSessions": 372,
    "successCount": 358,
    "warningCount": 10,
    "failedCount": 4,
    "totalBackedUpGB": 4821.55,
    "averageDurationMinutes": 47.2,
    "restoreTestsCount": 3,
    "restoreTestsSuccess": 3
  },
  "jobs": [
    {
      "name": "JOB_VM_PROD_DAILY",
      "type": "Backup",
      "targetRepository": "REPO_DATACORE_01",
      "isEnabled": true,
      "sessionCount": 31,
      "successRate": 100,
      "lastResult": "Success",
      "lastRunDate": "2026-03-31T22:03:14Z",
      "lastDurationMinutes": 52.4,
      "lastDataSizeGB": 218.7,
      "averageDurationMinutes": 49.3
    }
  ],
  "alerts": [
    "Job 'JOB_SQL_WEEKLY' : taux de succès 75% (seuil 95%)"
  ],
  "restoreTests": [
    {
      "name": "Restore Test - File Level",
      "result": "Success",
      "startTime": "2026-03-15T10:12:00Z",
      "endTime": "2026-03-15T10:34:00Z"
    }
  ]
}
```

## Tâche planifiée Windows

Voir `INSTALL.md` pour l'exemple de commande `schtasks` et d'export XML.
Recommandé : exécution le **1er de chaque mois à 03:00** pour couvrir
le mois précédent.

## Dépannage

| Symptôme | Cause probable | Solution |
|----------|---------------|----------|
| `Impossible de charger le module Veeam` | Console Veeam non installée | Installer Veeam B&R Console sur le serveur |
| `Get-VBRJob : Accès refusé` | Compte sans droits Veeam | Ajouter le compte dans `Users and Roles` de la console Veeam |
| XLSX non généré | `ImportExcel` absent | `Install-Module ImportExcel -Force` |
| Upload 401 | Token expiré | Regénérer un JWT long terme (voir `INSTALL.md`) |
| Upload 403 | Rôle insuffisant | Le compte API doit être `ADMIN` ou `SUPER_ADMIN` |
| Upload 413 | Fichier trop gros (>200 Mo) | Réduire le nombre de jobs exportés |

## Conformité ISO 27001:2022

Ce rapport couvre les contrôles suivants :

- **A.8.13 - Information backup** : Preuve que les sauvegardes sont bien
  exécutées, surveillées et que leur intégrité est mesurée.
- **A.5.30 - ICT readiness for business continuity** : Preuve des tests
  de restauration (section `restoreTests`).

Les rapports doivent être conservés au minimum **3 ans** pour audit.

---

**OMNITECH SECURITY** — IT / RSSI — <julien.morin@omnitech-security.fr>
