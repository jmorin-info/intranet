<#
.SYNOPSIS
  Génère le rapport mensuel des sauvegardes Veeam Backup & Replication.
  Conformité ISO 27001 A.8.13 (Sauvegardes) et A.5.30 (Préparation des TIC pour la continuité d'activité).

.DESCRIPTION
  Ce script collecte les statistiques de tous les jobs Veeam B&R pour un mois donné
  et produit deux fichiers :
    - veeam-report-YYYY-MM.json : rapport structuré pour l'intranet OMNITECH
    - veeam-report-YYYY-MM.xlsx : rapport Excel pour archivage

.PARAMETER Month
  Mois cible au format YYYY-MM (défaut : mois précédent)

.PARAMETER OutputPath
  Dossier de sortie (défaut : C:\OmnitechReports\Veeam)

.PARAMETER UploadUrl
  URL optionnelle pour uploader directement vers l'intranet OMNITECH
  (si fournie, le script POST le JSON+XLSX vers cette URL avec un token Bearer)

.PARAMETER UploadToken
  JWT token de l'API OMNITECH (si UploadUrl fourni)

.EXAMPLE
  .\Generate-VeeamMonthlyReport.ps1
  .\Generate-VeeamMonthlyReport.ps1 -Month "2026-03"
  .\Generate-VeeamMonthlyReport.ps1 -UploadUrl "https://intranet.omnitech-security.fr/api/it-exports/upload" -UploadToken "ey..."

.NOTES
  Auteur : OMNITECH SECURITY - IT
  Pré-requis : Veeam.Backup.PowerShell (livré avec Veeam B&R Console)
  Tester : Add-PSSnapin VeeamPSSnapin (anciennes versions) ou Import-Module Veeam.Backup.PowerShell
#>

[CmdletBinding()]
param(
  [string]$Month = (Get-Date -Date (Get-Date).AddMonths(-1) -Format "yyyy-MM"),
  [string]$OutputPath = "C:\OmnitechReports\Veeam",
  [string]$UploadUrl,
  [string]$UploadToken
)

# Bannière OMNITECH
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host " OMNITECH SECURITY - Rapport Veeam mensuel" -ForegroundColor Cyan
Write-Host " ISO 27001 A.8.13 / A.5.30" -ForegroundColor DarkCyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Création du dossier de sortie
if (-not (Test-Path $OutputPath)) {
  New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
  Write-Host "[+] Dossier créé : $OutputPath" -ForegroundColor Green
}

# Import du module Veeam
try {
  Import-Module Veeam.Backup.PowerShell -ErrorAction Stop
  Write-Host "[+] Module Veeam.Backup.PowerShell chargé" -ForegroundColor Green
} catch {
  try {
    Add-PSSnapin VeeamPSSnapin -ErrorAction Stop
    Write-Host "[+] Snap-in VeeamPSSnapin chargé (legacy)" -ForegroundColor Green
  } catch {
    Write-Error "Impossible de charger le module Veeam. Vérifiez que Veeam B&R Console est installée."
    exit 1
  }
}

# Calcul des bornes du mois
$startDate = [datetime]::ParseExact("$Month-01", "yyyy-MM-dd", $null)
$endDate = $startDate.AddMonths(1)
Write-Host "[i] Période : $($startDate.ToString('yyyy-MM-dd')) -> $($endDate.ToString('yyyy-MM-dd'))" -ForegroundColor Yellow

# Collecte des jobs
$jobs = Get-VBRJob
Write-Host "[i] $($jobs.Count) jobs Veeam trouvés" -ForegroundColor Yellow

# Récupération des sessions du mois
$allSessions = Get-VBRBackupSession | Where-Object { $_.CreationTime -ge $startDate -and $_.CreationTime -lt $endDate }
Write-Host "[i] $($allSessions.Count) sessions de backup pendant la période" -ForegroundColor Yellow

# Tentative de récupération des restores (tests de restauration)
$restoreSessions = @()
try {
  $restoreSessions = Get-VBRRestoreSession -ErrorAction SilentlyContinue | Where-Object { $_.CreationTime -ge $startDate -and $_.CreationTime -lt $endDate }
} catch {
  Write-Host "[!] Get-VBRRestoreSession indisponible (ignoré)" -ForegroundColor DarkYellow
}
Write-Host "[i] $($restoreSessions.Count) sessions de restore pendant la période" -ForegroundColor Yellow

# Construction du rapport
$report = @{
  reportPeriod = $Month
  generatedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
  generatedBy = $env:USERNAME
  generatedOn = $env:COMPUTERNAME
  iso27001Compliance = @{
    control = "A.8.13 - Information backup"
    secondaryControl = "A.5.30 - ICT readiness for business continuity"
    standard = "ISO/IEC 27001:2022"
  }
  summary = @{
    totalJobs = $jobs.Count
    totalSessions = $allSessions.Count
    successCount = ($allSessions | Where-Object { $_.Result -eq 'Success' }).Count
    warningCount = ($allSessions | Where-Object { $_.Result -eq 'Warning' }).Count
    failedCount = ($allSessions | Where-Object { $_.Result -eq 'Failed' }).Count
    totalBackedUpGB = 0
    totalProcessedVMs = 0
    averageDurationMinutes = 0
    restoreTestsCount = $restoreSessions.Count
    restoreTestsSuccess = ($restoreSessions | Where-Object { $_.Result -eq 'Success' }).Count
  }
  jobs = @()
  alerts = @()
  restoreTests = @()
}

# Détails par job
foreach ($job in $jobs) {
  $jobSessions = $allSessions | Where-Object { $_.JobId -eq $job.Id }
  $lastSession = $jobSessions | Sort-Object CreationTime -Descending | Select-Object -First 1

  $targetRepo = ""
  try { $targetRepo = $job.GetTargetRepository().Name } catch { $targetRepo = "N/A" }

  $jobInfo = @{
    name = $job.Name
    type = "$($job.JobType)"
    targetRepository = $targetRepo
    isEnabled = $job.IsScheduleEnabled
    sessionCount = $jobSessions.Count
    successRate = if ($jobSessions.Count -gt 0) { [math]::Round((($jobSessions | Where-Object { $_.Result -eq 'Success' }).Count / $jobSessions.Count) * 100, 1) } else { 0 }
    lastResult = if ($lastSession) { "$($lastSession.Result)" } else { "NoData" }
    lastRunDate = if ($lastSession) { $lastSession.CreationTime.ToString("yyyy-MM-ddTHH:mm:ssZ") } else { $null }
    lastDurationMinutes = if ($lastSession) { [math]::Round($lastSession.Progress.Duration.TotalMinutes, 1) } else { 0 }
    lastDataSizeGB = if ($lastSession) { [math]::Round($lastSession.Progress.ProcessedSize / 1GB, 2) } else { 0 }
    averageDurationMinutes = if ($jobSessions.Count -gt 0) { [math]::Round((($jobSessions | ForEach-Object { $_.Progress.Duration.TotalMinutes } | Measure-Object -Average).Average), 1) } else { 0 }
  }

  # Détection d'alertes
  if ($jobInfo.successRate -lt 95 -and $jobInfo.sessionCount -gt 0) {
    $report.alerts += "Job '$($job.Name)' : taux de succès $($jobInfo.successRate)% (seuil 95%)"
  }
  if ($jobInfo.lastResult -eq 'Failed') {
    $report.alerts += "Job '$($job.Name)' : dernière exécution en échec"
  }
  if (-not $job.IsScheduleEnabled) {
    $report.alerts += "Job '$($job.Name)' : planification désactivée"
  }
  if ($jobInfo.sessionCount -eq 0) {
    $report.alerts += "Job '$($job.Name)' : aucune exécution sur la période"
  }

  $report.summary.totalBackedUpGB += $jobInfo.lastDataSizeGB
  $report.jobs += $jobInfo
}

$report.summary.totalBackedUpGB = [math]::Round($report.summary.totalBackedUpGB, 2)

# Calcul de la durée moyenne globale
if ($allSessions.Count -gt 0) {
  $avg = ($allSessions | ForEach-Object { $_.Progress.Duration.TotalMinutes } | Measure-Object -Average).Average
  $report.summary.averageDurationMinutes = [math]::Round($avg, 1)
}

# Détails des restore tests
foreach ($rs in $restoreSessions) {
  $report.restoreTests += @{
    name = "$($rs.Name)"
    result = "$($rs.Result)"
    startTime = $rs.CreationTime.ToString("yyyy-MM-ddTHH:mm:ssZ")
    endTime = if ($rs.EndTime) { $rs.EndTime.ToString("yyyy-MM-ddTHH:mm:ssZ") } else { $null }
  }
}

# Écriture JSON
$jsonPath = Join-Path $OutputPath "veeam-report-$Month.json"
$report | ConvertTo-Json -Depth 10 | Out-File -FilePath $jsonPath -Encoding UTF8
Write-Host "[+] Rapport JSON écrit : $jsonPath" -ForegroundColor Green

# Écriture Excel (si module ImportExcel installé)
$xlsxPath = Join-Path $OutputPath "veeam-report-$Month.xlsx"
if (Get-Module -ListAvailable -Name ImportExcel) {
  Import-Module ImportExcel
  $report.jobs | ForEach-Object { [PSCustomObject]$_ } | Export-Excel -Path $xlsxPath -WorksheetName "Jobs" -AutoSize -BoldTopRow -FreezeTopRow -ClearSheet
  if ($report.restoreTests.Count -gt 0) {
    $report.restoreTests | ForEach-Object { [PSCustomObject]$_ } | Export-Excel -Path $xlsxPath -WorksheetName "Restores" -AutoSize -BoldTopRow -FreezeTopRow
  }
  $summaryRow = [PSCustomObject]$report.summary
  $summaryRow | Export-Excel -Path $xlsxPath -WorksheetName "Summary" -AutoSize -BoldTopRow
  Write-Host "[+] Rapport Excel écrit : $xlsxPath" -ForegroundColor Green
} else {
  Write-Host "[!] Module ImportExcel non installé. Installation : Install-Module ImportExcel -Force" -ForegroundColor Yellow
  Write-Host "[!] Rapport Excel non généré." -ForegroundColor Yellow
}

# Upload optionnel vers l'intranet
if ($UploadUrl -and $UploadToken) {
  Write-Host "[i] Upload vers l'intranet OMNITECH..." -ForegroundColor Yellow
  try {
    $form = @{
      file = Get-Item -Path $jsonPath
      category = 'VEEAM_BACKUP'
      reportPeriod = $Month
      description = "Rapport mensuel Veeam B&R - $Month - $($report.summary.successCount)/$($report.summary.totalSessions) succès"
    }
    Invoke-RestMethod -Uri $UploadUrl -Method Post -Form $form -Headers @{ Authorization = "Bearer $UploadToken" } -SkipCertificateCheck
    Write-Host "[+] JSON uploadé vers l'intranet" -ForegroundColor Green

    if (Test-Path $xlsxPath) {
      $form.file = Get-Item -Path $xlsxPath
      Invoke-RestMethod -Uri $UploadUrl -Method Post -Form $form -Headers @{ Authorization = "Bearer $UploadToken" } -SkipCertificateCheck
      Write-Host "[+] XLSX uploadé vers l'intranet" -ForegroundColor Green
    }
  } catch {
    Write-Warning "Upload échoué : $_"
  }
}

# Synthèse écran
Write-Host ""
Write-Host "=== SYNTHESE ===" -ForegroundColor Cyan
Write-Host "Période       : $Month"
Write-Host "Jobs          : $($report.summary.totalJobs)"
Write-Host "Sessions      : $($report.summary.totalSessions)"
Write-Host "Succès        : $($report.summary.successCount)" -ForegroundColor Green
Write-Host "Avertissements: $($report.summary.warningCount)" -ForegroundColor Yellow
Write-Host "Échecs        : $($report.summary.failedCount)" -ForegroundColor Red
Write-Host "Volume total  : $($report.summary.totalBackedUpGB) GB"
Write-Host "Restore tests : $($report.summary.restoreTestsCount) ($($report.summary.restoreTestsSuccess) OK)"
if ($report.alerts.Count -gt 0) {
  Write-Host ""
  Write-Host "[!] $($report.alerts.Count) alerte(s) détectée(s) :" -ForegroundColor Red
  foreach ($a in $report.alerts) { Write-Host "  - $a" -ForegroundColor Yellow }
}
Write-Host ""
Write-Host "[+] Rapport disponible dans : $OutputPath" -ForegroundColor Green
