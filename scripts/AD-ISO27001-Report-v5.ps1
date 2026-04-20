<#
.SYNOPSIS
  Rapport Active Directory ISO 27001:2022 — OMNITECH Security
  VERSION 5.0 — PowerShell 5.1 compatible, intégration intranet OMNITECH

.DESCRIPTION
  Audit SMSI aligné ISO/IEC 27001:2022 Annexe A, ANSSI BP28, NIS2 Art.21.
  Conçu pour s'exécuter DIRECTEMENT sur le Contrôleur de Domaine (BX-AD-01-IT-VM).
  Génère : rapport HTML interactif (Chart.js), export JSON, inventaire enrichi, email SMTP.

  Corrections v5 (PowerShell 5.1) :
    - Opérateur ?? (null-coalescing) remplacé par fonction NVL compatible PS 5.1
    - Join-String (PS 7+) remplacé par -join natif
    - Export JSON structuré pour import dans l'intranet OMNITECH (ad-audit/analyze)
    - Paramètre -IntranetApiUrl pour envoi automatique du rapport JSON à l'intranet
    - Toutes les corrections v4 conservées (15 bugs fixes, 25+ contrôles)

  Nouveaux contrôles v4 (25+) :
    ms-DS-MachineAccountQuota, auditpol local, Credential Guard/VBS, AppLocker local,
    ASR Rules, DCSync ACL, AS-REP Roasting, Kerberoasting, Schema Admins vide,
    AdminSDHolder orphelins, GPP cpassword SYSVOL, BitLocker escrow AD,
    SIDHistory, ReversibleEncryption, DNS Scavenging, PrintSpooler DC,
    LMCompatibility, Schannel TLS, LDAPS 636, SMB3 Encryption,
    Netlogon SignOrSeal, LLMNR désactivé, RemoteSAM, WPAD, SPN duplicates,
    RID500 rename, Computers stale password, SYSVOL ACL, WEF subscriptions,
    DS Changes SACL, Kerberos ticket lifetimes, Admin/user ratio stats,
    gMSA coverage, Constrained/RBCD delegation, Patch/Reboot DCs, PKI ESC1-ESC6

.PARAMETER OutDir         Répertoire de sortie (C:\Temp\AD-ISO27001-Reports)
.PARAMETER OutBaseName    Préfixe des fichiers de sortie
.PARAMETER ExceptionsFile Fichier JSON des risques acceptés
.PARAMETER SmtpServer     Serveur SMTP interne
.PARAMETER SmtpFrom       Adresse expéditeur
.PARAMETER SmtpTo         Destinataire(s) — séparés par des virgules
.PARAMETER TestEmail      Écrase SmtpTo pour test
.PARAMETER NoEmail        Désactive envoi email
.PARAMETER DryRun         Mode simulation (pas d'email, pas d'écriture externe)
.PARAMETER SkipSlowChecks Ignorer checks lents (événements, inventaire complet, SPN dup)
.PARAMETER Domain         Domaine AD cible (auto-détecté si absent)
.PARAMETER PurpleKnightReportPath Chemin rapport Purple Knight HTML/JSON (optionnel)
#>

#Requires -Version 5.1
#Requires -Modules ActiveDirectory
#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string] $OutDir                  = 'C:\Temp\AD-ISO27001-Reports',
    [string] $OutBaseName             = 'AD-ISO27001-Report',
    [string] $ExceptionsFile          = 'C:\Temp\AD-ISO27001-Reports\exceptions.json',
    [string] $SmtpServer,
    [string] $SmtpFrom,
    [string] $SmtpTo,
    [string] $TestEmail,
    [switch] $NoEmail,
    [switch] $DryRun,
    [switch] $SkipSlowChecks,
    [string] $Domain,
    [string] $PurpleKnightReportPath,
    [string] $IntranetApiUrl = ''   # URL de l'API intranet pour envoi automatique (ex: http://10.33.120.55:3000/api)
)

Set-StrictMode -Version 2.0

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 0 — PS 5.1 COMPATIBILITY HELPERS
# ══════════════════════════════════════════════════════════════════════════════
# NVL: Null-coalescing helper (replaces ?? operator from PS 7+)
function NVL { param($Value, $Default) if ($null -ne $Value) { $Value } else { $Default } }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 1 — BOOTSTRAP UNIQUE
# ══════════════════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'
$WarningPreference     = 'SilentlyContinue'

if (-not (Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$RunId          = Get-Date -Format 'yyyyMMdd_HHmmss'
$JsonPath       = Join-Path $OutDir "$($OutBaseName)_$RunId.json"
$HtmlPath       = Join-Path $OutDir "$($OutBaseName)_$RunId.html"
$AppLogPath     = Join-Path $OutDir "$($OutBaseName)_$RunId.log"
$TranscriptPath = Join-Path $OutDir "$($OutBaseName)_$RunId.transcript.log"
$InventoryPath  = Join-Path $OutDir "$($OutBaseName)_$RunId.inventory.json"
$CsvPath        = Join-Path $OutDir "$($OutBaseName)_$RunId.csv"

Start-Transcript -Path $TranscriptPath -Force | Out-Null

try { [void][System.Reflection.Assembly]::LoadWithPartialName('System.Web') }    catch {}
try { [void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') } catch {}

# Bannière
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   OMNITECH Security — AD ISO 27001:2022 Audit Engine v5.0   ║" -ForegroundColor Cyan
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host ("  ║  RunId   : {0,-51}║" -f $RunId) -ForegroundColor Cyan
Write-Host ("  ║  OutDir  : {0,-51}║" -f $OutDir) -ForegroundColor Cyan
Write-Host ("  ║  Host    : {0,-51}║" -f $env:COMPUTERNAME) -ForegroundColor Cyan
Write-Host ("  ║  Started : {0,-51}║" -f (Get-Date -Format 'dd/MM/yyyy HH:mm:ss')) -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 2 — LOGGING
# ══════════════════════════════════════════════════════════════════════════════
function Write-FileLine {
    param([string]$Path, [string]$Line)
    for ($i = 0; $i -lt 5; $i++) {
        try { Add-Content -LiteralPath $Path -Value $Line -Encoding UTF8 -ErrorAction Stop; break }
        catch [System.IO.IOException] { Start-Sleep -Milliseconds (120 * ($i + 1)) }
        catch { break }
    }
}

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet('INFO','WARN','ERROR','DEBUG','SUCCESS')][string]$Level = 'INFO'
    )
    $ts   = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[{0}] {1} {2}" -f $ts, $Level.PadRight(7), $Message
    $col  = switch ($Level) {
        'ERROR'   { 'Red' }; 'WARN' { 'Yellow' }; 'SUCCESS' { 'Green' }; 'DEBUG' { 'DarkGray' }
        default   { 'White' }
    }
    Write-Host $line -ForegroundColor $col
    Write-FileLine -Path $AppLogPath -Line $line
}

try { $os = (Get-CimInstance Win32_OperatingSystem).Caption } catch { $os = 'Unknown' }
Write-Log ("PSVersion={0} | OS={1} | Host={2}" -f $PSVersionTable.PSVersion, $os, $env:COMPUTERNAME)

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 3 — SYSTÈME D'EXCEPTIONS (exceptions.json)
# ══════════════════════════════════════════════════════════════════════════════
$Global:Exceptions = @{}

function Load-Exceptions {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        @() | ConvertTo-Json | Set-Content $Path -Encoding UTF8
        Write-Log "Fichier exceptions créé : $Path"
        return
    }
    try {
        $data = Get-Content $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($ex in $data) { $Global:Exceptions[$ex.CheckId] = $ex }
        Write-Log "Exceptions chargées : $($Global:Exceptions.Count)"
    } catch { Write-Log "Erreur chargement exceptions : $_" 'WARN' }
}

function Apply-Exception {
    param([string]$CheckId)
    if ($Global:Exceptions.ContainsKey($CheckId)) {
        $ex = $Global:Exceptions[$CheckId]
        if ($ex.Status -eq 'active') {
            try { if ([DateTime]::Parse($ex.ReviewDate) -gt (Get-Date)) { return $ex } }
            catch {}
        }
    }
    return $null
}

Load-Exceptions -Path $ExceptionsFile

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 4 — MODÈLE DE DÉCISIONS
# ══════════════════════════════════════════════════════════════════════════════
$Global:Decisions = New-Object System.Collections.Generic.List[object]

class Decision {
    [string]   $Id;          [string]   $Title;     [bool]     $Passed
    [string]   $Severity;    [string]   $Category;  [string]   $Evidence
    [string]   $Justification; [string] $Remediation
    [string[]] $References;  [string[]] $Targets;   [string]   $Timestamp
}

function Add-Decision {
    param(
        [Parameter(Mandatory)][string]   $Id,
        [Parameter(Mandatory)][string]   $Title,
        [Parameter(Mandatory)][bool]     $Pass,
        [Parameter(Mandatory)][string]   $Severity,
        [Parameter(Mandatory)][string]   $Category,
        [string]   $Evidence      = '',
        [string]   $Justification = '',
        [string]   $Remediation   = '',
        [string[]] $References    = @(),
        [string[]] $Targets       = @()
    )
    $d = [Decision]::new()
    $d.Id = $Id; $d.Title = $Title; $d.Passed = [bool]$Pass
    $d.Severity = $Severity; $d.Category = $Category
    $d.Evidence = $Evidence; $d.Justification = $Justification
    $d.Remediation = $Remediation; $d.References = $References
    $d.Targets = $Targets; $d.Timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $Global:Decisions.Add($d) | Out-Null
    $st  = if ($d.Severity -eq 'Info') { 'INFO' } elseif ($d.Passed) { 'PASS' } else { 'FAIL' }
    $col = switch ($st) { 'PASS' { 'Green' } 'FAIL' { 'Red' } default { 'Cyan' } }
    Write-Host ("  [{0}] {1,-42} {2}" -f $st.PadRight(4), $Id, $Title) -ForegroundColor $col
}

function ADH {
    # Wrapper compact + intégration Apply-Exception (FIX BUG-11)
    param([Parameter(Mandatory)][hashtable]$H)
    $ex = Apply-Exception -CheckId $H['Id']
    if ($null -ne $ex) {
        $H['Pass']          = $true
        $H['Evidence']      = "[EXCEPTION #{0} | Expire:{1}] {2}" -f $ex.Id, $ex.ReviewDate, (NVL $H['Evidence'] '')
        $H['Justification'] = "[EXCEPTION APPROUVÉE] {0} | Owner:{1}" -f (NVL $ex.BusinessJustification ''), (NVL $ex.Owner '')
        Write-Log "Exception active : $($H['Id']) (expire $($ex.ReviewDate))" 'WARN'
    }
    Add-Decision `
        -Id            $H['Id']                    `
        -Title         $H['Title']                 `
        -Pass          ([bool](NVL $H['Pass'] $false)) `
        -Severity      (NVL $H['Severity']      'Info') `
        -Category      (NVL $H['Category']      'General') `
        -Evidence      (NVL $H['Evidence']      '') `
        -Justification (NVL $H['Justification'] '') `
        -Remediation   (NVL $H['Remediation']   '') `
        -References    (NVL $H['References']    @()) `
        -Targets       (NVL $H['Targets']       @())
}

# ── Helpers décisions ──────────────────────────────────────────────────────────
function Make-Justif {
    param([string[]]$IsoRefs, [string]$Why, [string]$AnssiRefs='', [string]$Nis2Art='')
    $tags = @()
    if ($IsoRefs -and $IsoRefs.Count -gt 0) { $tags += $IsoRefs }
    if ($AnssiRefs) { $tags += "ANSSI:$AnssiRefs" }
    if ($Nis2Art)   { $tags += "NIS2:$Nis2Art" }
    if ($tags.Count -gt 0) { return "[{0}] {1}" -f ($tags -join ','), $Why }
    return $Why
}

function Make-Remediation {
    param([string]$Headline, [string[]]$Steps, [string[]]$Refs)
    $s = @()
    if ($Headline) { $s += $Headline }
    if ($Steps)    { $s += ($Steps | ForEach-Object { " - $_" }) -join "`n" }
    if ($Refs -and $Refs.Count -gt 0) { $s += "(Réf. : {0})" -f ($Refs -join ', ') }
    return ($s -join "`n")
}

function Join-Sample {
    param([object[]]$Items, [int]$Max = 15)
    if (-not $Items -or $Items.Count -eq 0) { return '' }
    $arr = @($Items | Select-Object -First $Max)
    $txt = ($arr -join ', ')
    if ($Items.Count -gt $Max) { $txt += " (+{0})" -f ($Items.Count - $Max) }
    return $txt
}

function Get-Priority {
    param([string]$Severity, [bool]$Pass)
    if ($Pass) { return 'P4 - Surveillance' }
    switch -Regex ($Severity) {
        'Critical' { return 'P1 - Immédiat (<24h)' }
        'High'     { return 'P1 - Court terme (<7j)' }
        'Medium'   { return 'P2 - Planifié (<30j)' }
        default    { return 'P3 - Amélioration (<90j)' }
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 5 — IMPORT MODULES
# ══════════════════════════════════════════════════════════════════════════════
function Import-ModuleSafe {
    param([Parameter(Mandatory)][string]$Name)
    try {
        if (-not (Get-Module -ListAvailable -Name $Name)) {
            Write-Log "Module '$Name' introuvable." 'WARN'; return $false
        }
        Import-Module -Name $Name -ErrorAction Stop | Out-Null
        Write-Log "Module '$Name' chargé." 'INFO'
        return $true
    } catch { Write-Log "Import '$Name' échoué : $($_.Exception.Message)" 'WARN'; return $false }
}

$HAS_AD   = Import-ModuleSafe 'ActiveDirectory'
$HAS_GPMC = Import-ModuleSafe 'GroupPolicy'
$HAS_DNS  = Import-ModuleSafe 'DnsServer'
$HAS_ADCS = Import-ModuleSafe 'ADCSAdministration'

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 6 — FONCTIONS UTILITAIRES RÉSEAU / REGISTRE
# ══════════════════════════════════════════════════════════════════════════════
function Test-IsLocalComputer {
    param([string]$ComputerName)
    if ([string]::IsNullOrWhiteSpace($ComputerName)) { return $true }
    $local = @('localhost', '127.0.0.1', $env:COMPUTERNAME)
    try { $local += [System.Net.Dns]::GetHostName() } catch {}
    if ($env:USERDNSDOMAIN) { $local += "{0}.{1}" -f $env:COMPUTERNAME, $env:USERDNSDOMAIN }
    foreach ($n in $local) { if ($ComputerName -ieq $n) { return $true } }
    return $false
}

function Test-RemoteRegistryValue {
    # FIX BUG-12 (TrimStart→-replace) + FIX BUG-15 (timeout via job)
    param([string]$ComputerName, [string]$Path, [string]$Name, [int]$TimeoutSec = 8)
    $cleanPath = $Path -replace '^HKLM:\\', ''
    if (Test-IsLocalComputer $ComputerName) {
        try {
            $reg = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
                [Microsoft.Win32.RegistryHive]::LocalMachine,
                [Microsoft.Win32.RegistryView]::Default)
            $sub = $reg.OpenSubKey($cleanPath)
            if ($null -eq $sub) { return $null }
            return $sub.GetValue($Name, $null)
        } catch { return $null }
    }
    $job = Start-Job -ScriptBlock {
        param($cn, $cp, $n)
        try {
            $reg = [Microsoft.Win32.RegistryKey]::OpenRemoteBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $cn)
            $sub = $reg.OpenSubKey($cp); if (-not $sub) { return $null }
            return $sub.GetValue($n, $null)
        } catch { return $null }
    } -ArgumentList $ComputerName, $cleanPath, $Name
    $r = $job | Wait-Job -Timeout $TimeoutSec | Receive-Job
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    return $r
}

$Global:PSSessionOpts = New-PSSessionOption -OperationTimeout 30000 -OpenTimeout 10000

function Invoke-RemoteOrLocal {
    param([string]$ComputerName, [scriptblock]$ScriptBlock, [object[]]$ArgumentList = @())
    if (Test-IsLocalComputer $ComputerName) { return (& $ScriptBlock @ArgumentList) }
    try {
        return (Invoke-Command -ComputerName $ComputerName -ScriptBlock $ScriptBlock `
            -ArgumentList $ArgumentList -SessionOption $Global:PSSessionOpts -ErrorAction Stop)
    } catch { Write-Log "PSRemoting $ComputerName : $($_.Exception.Message)" 'WARN'; throw }
}

function Test-TCPPort {
    param([string]$ComputerName, [int]$Port, [int]$TimeoutMs = 3000)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar  = $tcp.BeginConnect($ComputerName, $Port, $null, $null)
        $ok  = $ar.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        $tcp.Close()
        return $ok
    } catch { return $false }
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 7 — RAPPORT HTML (Chart.js + filtres + tri + export CSV)
# ══════════════════════════════════════════════════════════════════════════════
function New-HtmlReport {
    param([object[]]$Decisions, [string]$DomainName, [string]$RunId, [string[]]$DCList = @())

    function he { param($s) [System.Web.HttpUtility]::HtmlEncode(($s -as [string])) }
    function js { param($s) ($s -as [string]) -replace "'", "\'" -replace '"', '\"' -replace "`n", '\n' }

    $passC = ($Decisions | Where-Object { $_.Passed  -and $_.Severity -ne 'Info' }).Count
    $failC = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -ne 'Info' }).Count
    $infoC = ($Decisions | Where-Object { $_.Severity -eq 'Info' }).Count
    $total = $passC + $failC
    $score = if ($total -gt 0) { [Math]::Round($passC / $total * 100, 1) } else { 0 }
    $crit  = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'Critical' }).Count
    $high  = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'High' }).Count
    $med   = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'Medium' }).Count

    $maturite = switch ($score) {
        { $_ -ge 95 } { '5 — Optimisé' ;break }
        { $_ -ge 85 } { '4 — Géré quantitativement' ;break }
        { $_ -ge 75 } { '3 — Défini' ;break }
        { $_ -ge 60 } { '2 — Géré' ;break }
        default        { '1 — Initial' }
    }
    $scoreColor = if ($score -ge 85) { '#22c55e' } elseif ($score -ge 70) { '#f59e0b' } else { '#ef4444' }

    # Données Chart.js — catégories
    $cats = $Decisions | Group-Object Category
    $catLabels = ($cats | ForEach-Object { "'" + (js $_.Name) + "'" }) -join ','
    $catPass   = ($cats | ForEach-Object { ($_.Group | Where-Object { $_.Passed }).Count }) -join ','
    $catFail   = ($cats | ForEach-Object { ($_.Group | Where-Object { -not $_.Passed }).Count }) -join ','

    # Données Chart.js — sévérités
    $sevData = @{ Critical=0; High=0; Medium=0; Low=0; Info=0 }
    foreach ($d in $Decisions) { if ($sevData.ContainsKey($d.Severity)) { $sevData[$d.Severity]++ } }

    # ISO mapping
    $isoAgg = @{}
    foreach ($d in $Decisions) {
        if ($d.Justification -match '^\[(?<iso>[^\]]+)\]') {
            $Matches['iso'].Split(',') | ForEach-Object {
                $k = $_.Trim(); if ($k -match '^A\.\d') { if (-not $isoAgg[$k]) { $isoAgg[$k]=0 }; $isoAgg[$k]++ }
            }
        }
    }
    $isoBadges = ($isoAgg.Keys | Sort-Object | ForEach-Object {
        "<span class='badge iso' title='$_ — $($isoAgg[$_]) contrôles'>$_ ($($isoAgg[$_]))</span>"
    }) -join ' '

    # Alertes prioritaires
    $alertsHtml = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -in 'Critical','High' } |
        Sort-Object Severity | Select-Object -First 10 | ForEach-Object {
            $bc = if ($_.Severity -eq 'Critical') { '#fff1f2' } else { '#fff7ed' }
            $bc2= if ($_.Severity -eq 'Critical') { '#dc2626' } else { '#f97316' }
            $ev = if ($_.Evidence) { $_.Evidence.Substring(0,[Math]::Min(120,$_.Evidence.Length)) } else { '-' }
            "<div style='background:{0};border-left:4px solid {1};border-radius:8px;padding:14px 18px;margin-bottom:10px;'>
               <div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;'>
                 <span style='font-weight:700;font-size:13px;color:#1e293b;'>[$(he $_.Id)] $(he $_.Title)</span>
                 <span style='background:{1};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;'>$(he $_.Severity)</span>
               </div>
               <div style='font-size:12px;color:#64748b;'>$(he $ev)</div>
             </div>" -f $bc, $bc2
        }) -join ''

    # Lignes tableau
    $rows = foreach ($d in $Decisions) {
        $st  = if ($d.Severity -eq 'Info') { 'info' } elseif ($d.Passed) { 'pass' } else { 'fail' }
        $prio = Get-Priority -Severity $d.Severity -Pass $d.Passed
        $refs = ($d.References | ForEach-Object { "<a href='$(he $_)' target='_blank' rel='noopener'>$(he $_)</a>" }) -join '<br>'
        @"
<tr data-status="$st" data-sev="$(he $d.Severity)" data-cat="$(he $d.Category)">
  <td style="white-space:nowrap"><code class="id-badge $st">$(he $d.Id)</code></td>
  <td>$(he $d.Title)</td>
  <td><span class="badge $st">$(he $d.Severity)</span><br><small class="prio">$prio</small></td>
  <td><pre>$(he $d.Evidence)</pre></td>
  <td>$(he $d.Justification)</td>
  <td><pre>$(he $d.Remediation)</pre></td>
  <td>$refs</td>
  <td><small>$(he ($d.Targets -join ', '))</small></td>
</tr>
"@
    }

    $style = @'
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --omni-blue: #004469; --omni-orange: #F68D2E; --omni-taupe: #837274;
  --pass: #22c55e; --fail: #ef4444; --warn: #f59e0b; --info: #3b82f6;
  --crit: #dc2626; --high: #f97316; --med: #eab308; --low: #64748b;
  --bg: #f0f4f8; --card: #ffffff; --border: #e2e8f0; --text: #1e293b; --muted: #64748b;
}
html { scroll-behavior: smooth; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: var(--bg); color: var(--text); font-size: 13px; line-height: 1.5; }
.page { max-width: 1600px; margin: 0 auto; padding: 20px; }

/* Header */
.report-header { background: linear-gradient(135deg, var(--omni-blue) 0%, #006699 50%, var(--omni-orange) 100%);
  color: #fff; padding: 32px 40px; border-radius: 16px; margin-bottom: 24px;
  display: flex; justify-content: space-between; align-items: center;
  box-shadow: 0 4px 24px rgba(0,68,105,.25); }
.report-header h1 { font-size: 24px; font-weight: 800; letter-spacing: -.5px; margin-bottom: 6px; }
.report-header .sub { opacity: .85; font-size: 13px; }
.report-header .meta { text-align: right; font-size: 12px; line-height: 2; opacity: .9; }
.report-header .meta strong { color: var(--omni-orange); }

/* KPI */
.kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 24px; }
.kpi { background: var(--card); border-radius: 14px; padding: 22px 18px; text-align: center;
  box-shadow: 0 2px 10px rgba(0,0,0,.06); border-top: 5px solid var(--border);
  transition: transform .2s, box-shadow .2s; }
.kpi:hover { transform: translateY(-3px); box-shadow: 0 6px 20px rgba(0,0,0,.1); }
.kpi.pass  { border-color: var(--pass); }
.kpi.fail  { border-color: var(--fail); }
.kpi.info  { border-color: var(--info); }
.kpi.score { border-color: var(--omni-orange); background: linear-gradient(135deg, #fff7ed, #fff); }
.kpi.crit  { border-color: var(--crit); }
.kpi.high  { border-color: var(--high); }
.kpi .num  { font-size: 44px; font-weight: 900; line-height: 1; display: block; }
.kpi.pass .num  { color: var(--pass); }
.kpi.fail .num  { color: var(--fail); }
.kpi.info .num  { color: var(--info); }
.kpi.score .num { color: var(--omni-orange); }
.kpi.crit .num  { color: var(--crit); }
.kpi.high .num  { color: var(--high); }
.kpi .lbl  { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
  color: var(--muted); margin-top: 6px; display: block; }
.kpi .sub  { font-size: 11px; color: var(--muted); margin-top: 4px; }

/* Cards */
.card { background: var(--card); border-radius: 14px; padding: 26px 28px; margin-bottom: 20px;
  box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.card h2 { font-size: 15px; font-weight: 700; color: var(--omni-blue); margin-bottom: 18px;
  padding-bottom: 12px; border-bottom: 2px solid var(--border); display: flex; align-items: center; gap: 10px; }
.card h2 .icon { font-size: 18px; }

/* Charts */
.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.chart-card { background: var(--card); border-radius: 14px; padding: 26px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.chart-card h3 { font-size: 14px; font-weight: 700; color: var(--omni-blue); margin-bottom: 16px; }
@media (max-width: 900px) { .charts-grid { grid-template-columns: 1fr; } }

/* Badges */
.badge { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px;
  font-weight: 700; border: 1.5px solid; margin: 2px; white-space: nowrap; }
.badge.pass { color: #166534; background: #dcfce7; border-color: #86efac; }
.badge.fail { color: #991b1b; background: #fee2e2; border-color: #fca5a5; }
.badge.info { color: #1e40af; background: #dbeafe; border-color: #93c5fd; }
.badge.iso  { color: #92400e; background: #fef3c7; border-color: #fcd34d; font-size: 10px; }
.badge.cat  { color: #374151; background: #f3f4f6; border-color: #d1d5db; }
.id-badge   { display: inline-block; padding: 2px 8px; border-radius: 5px; font-family: 'Consolas', monospace;
  font-size: 11px; font-weight: 700; }
.id-badge.pass { background: #dcfce7; color: #166534; }
.id-badge.fail { background: #fee2e2; color: #991b1b; }
.id-badge.info { background: #dbeafe; color: #1e40af; }
.prio { color: var(--muted); font-size: 10px; }

/* Controls */
.controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
.controls input[type=text], .controls select {
  padding: 8px 14px; border: 1.5px solid var(--border); border-radius: 8px;
  font-size: 12px; color: var(--text); background: var(--card);
  transition: border-color .2s; }
.controls input:focus, .controls select:focus { outline: none; border-color: var(--omni-orange); }
.controls input[type=text] { min-width: 280px; }
.btn { padding: 8px 16px; border: none; border-radius: 8px; cursor: pointer; font-size: 12px;
  font-weight: 700; transition: all .2s; }
.btn-primary   { background: var(--omni-blue); color: #fff; }
.btn-secondary { background: var(--omni-orange); color: #fff; }
.btn:hover { opacity: .85; transform: translateY(-1px); }

/* Table */
.table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); }
table { border-collapse: collapse; width: 100%; font-size: 12px; }
thead th { background: #f8fafc; padding: 11px 10px; text-align: left; font-weight: 700;
  color: var(--muted); border-bottom: 2px solid var(--border);
  position: sticky; top: 0; z-index: 10; cursor: pointer; user-select: none; white-space: nowrap; }
thead th:hover { background: #e2e8f0; color: var(--text); }
thead th::after { content: ' ⇅'; opacity: .3; font-size: 10px; }
thead th.sort-asc::after  { content: ' ↑'; opacity: 1; color: var(--omni-orange); }
thead th.sort-desc::after { content: ' ↓'; opacity: 1; color: var(--omni-orange); }
tbody tr { border-bottom: 1px solid var(--border); transition: background .1s; }
tbody tr:hover { background: #fffbf5; }
tbody tr[data-status="fail"] { border-left: 3px solid var(--fail); }
tbody tr[data-status="pass"] { border-left: 3px solid var(--pass); }
tbody tr[data-status="info"] { border-left: 3px solid var(--info); }
tbody td { padding: 10px; vertical-align: top; }
pre { white-space: pre-wrap; font-family: 'Consolas', monospace; font-size: 11px;
  color: var(--text); background: #f8fafc; padding: 6px 8px; border-radius: 5px; max-height: 120px; overflow-y: auto; }
a { color: var(--omni-blue); text-decoration: none; }
a:hover { text-decoration: underline; color: var(--omni-orange); }

/* Maturity */
.maturity-bar { display: flex; gap: 6px; margin-top: 12px; }
.mat-step { flex: 1; height: 8px; border-radius: 4px; background: #e2e8f0; }
.mat-step.active { background: var(--omni-orange); }

/* Footer */
.footer { text-align: center; color: var(--muted); font-size: 11px; margin-top: 20px; padding: 20px;
  border-top: 1px solid var(--border); }

/* Print */
@media print {
  .controls, .charts-grid { display: none; }
  body { background: #fff; }
  .page { padding: 0; }
}
</style>
'@

    $js = @'
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
(function(){
  /* ── Filtres ─────────────────────────────────────────────────────── */
  const tbody   = document.querySelector('#decisionsTable tbody');
  const q       = document.getElementById('q');
  const fStatus = document.getElementById('fStatus');
  const fSev    = document.getElementById('fSev');
  const fCat    = document.getElementById('fCat');

  function applyFilters(){
    const qs = (q.value||'').toLowerCase().trim();
    const st = fStatus.value, sv = fSev.value, ct = fCat.value;
    let visible = 0;
    Array.from(tbody.rows).forEach(tr=>{
      const okQ = !qs || tr.innerText.toLowerCase().includes(qs);
      const okS = !st || tr.dataset.status === st;
      const okV = !sv || tr.dataset.sev    === sv;
      const okC = !ct || tr.dataset.cat    === ct;
      const show = okQ && okS && okV && okC;  // FIX BUG-07 : && au lieu de 'etet'
      tr.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    document.getElementById('visibleCount').textContent = visible;
  }
  if (q)       q.addEventListener('input', applyFilters);
  if (fStatus) fStatus.addEventListener('change', applyFilters);
  if (fSev)    fSev.addEventListener('change', applyFilters);
  if (fCat)    fCat.addEventListener('change', applyFilters);

  /* ── Tri colonnes ─────────────────────────────────────────────────── */
  let sortDir = 1, sortCol = -1;
  const ths = document.querySelectorAll('#decisionsTable thead th');
  ths.forEach((th,i)=>{
    th.addEventListener('click', ()=>{
      ths.forEach(t=>t.classList.remove('sort-asc','sort-desc'));
      sortDir = (sortCol===i) ? -sortDir : 1;
      sortCol = i;
      th.classList.add(sortDir===1 ? 'sort-asc' : 'sort-desc');
      const rows = Array.from(tbody.rows);
      rows.sort((a,b)=>{
        const va=(a.cells[i]||{innerText:''}).innerText.trim();
        const vb=(b.cells[i]||{innerText:''}).innerText.trim();
        return sortDir * va.localeCompare(vb,'fr',{numeric:true,sensitivity:'base'});
      });
      rows.forEach(r=>tbody.appendChild(r));
    });
  });

  /* ── Export CSV (vue filtrée) ─────────────────────────────────────── */
  document.getElementById('btnCsv').addEventListener('click',()=>{
    const hdrs=['ID','Titre','Sévérité','Statut','Evidence','Justification','Remédiation','Références','Cibles'];
    const rows=[hdrs];
    Array.from(tbody.rows).forEach(tr=>{
      if(tr.style.display==='none') return;
      const td=tr.cells;
      rows.push([
        td[0].innerText.trim(), td[1].innerText.trim(),
        td[2].innerText.split('\n')[0].trim(), tr.dataset.status.toUpperCase(),
        td[3].innerText.trim(), td[4].innerText.trim(), td[5].innerText.trim(),
        td[6].innerText.replace(/\n/g,' | '), td[7].innerText.trim()
      ]);
    });
    const csv=rows.map(r=>r.map(v=>'"'+(v||'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
    const a=document.createElement('a');
    a.href='data:text/csv;charset=utf-8,\uFEFF'+encodeURIComponent(csv);
    a.download='AD-ISO27001-Decisions.csv'; a.click();
  });

  /* ── Remplissage filtres ─────────────────────────────────────────── */
  (function fillFilters(){
    const st=new Set(),sv=new Set(),ct=new Set();
    Array.from(tbody.rows).forEach(tr=>{st.add(tr.dataset.status);sv.add(tr.dataset.sev);ct.add(tr.dataset.cat);});
    [...st].sort().forEach(v=>fStatus.append(new Option(v.toUpperCase(),v)));
    [...sv].sort().forEach(v=>fSev.append(new Option(v,v)));
    [...ct].sort().forEach(v=>fCat.append(new Option(v,v)));
    document.getElementById('visibleCount').textContent=tbody.rows.length;
  })();

  /* ── Chart.js initialisé après DOM prêt ─────────────────────────── */
  const C = Chart;
  const catColors = ['#004469','#F68D2E','#22c55e','#ef4444','#3b82f6','#8b5cf6','#f59e0b','#14b8a6','#ec4899','#6366f1'];

  // Donut — répartition par catégorie (FAIL uniquement)
  const ctxCat = document.getElementById('chartCategory');
  if (ctxCat && typeof catLabels !== 'undefined') {
    new C(ctxCat, {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets:[{data: catFail, backgroundColor: catColors, borderWidth:2}]
      },
      options:{
        responsive:true, plugins:{
          legend:{position:'right',labels:{font:{size:11},boxWidth:12}},
          title:{display:true,text:'Échecs par catégorie',font:{size:13,weight:'bold'}}
        }
      }
    });
  }

  // Barres — PASS/FAIL par catégorie
  const ctxBar = document.getElementById('chartBar');
  if (ctxBar && typeof catLabels !== 'undefined') {
    new C(ctxBar, {
      type: 'bar',
      data: {
        labels: catLabels,
        datasets:[
          {label:'PASS',data:catPass,backgroundColor:'rgba(34,197,94,.75)',borderRadius:4},
          {label:'FAIL',data:catFail,backgroundColor:'rgba(239,68,68,.75)',borderRadius:4}
        ]
      },
      options:{
        responsive:true, indexAxis:'y',
        plugins:{legend:{position:'top'},title:{display:true,text:'PASS / FAIL par catégorie',font:{size:13,weight:'bold'}}},
        scales:{x:{stacked:false,beginAtZero:true},y:{stacked:false}}
      }
    });
  }

  // Jauge score
  const ctxScore = document.getElementById('chartScore');
  if (ctxScore && typeof scoreValue !== 'undefined') {
    new C(ctxScore, {
      type: 'doughnut',
      data:{
        datasets:[{
          data:[scoreValue, 100-scoreValue],
          backgroundColor:[scoreValue>=85?'#22c55e':scoreValue>=70?'#f59e0b':'#ef4444','#e2e8f0'],
          borderWidth:0, circumference:180, rotation:270
        }]
      },
      options:{
        responsive:true, cutout:'75%',
        plugins:{legend:{display:false},tooltip:{enabled:false}},
        animation:{animateRotate:true}
      }
    });
    const scoreLabel = document.createElement('div');
    scoreLabel.style.cssText='position:absolute;bottom:0;width:100%;text-align:center;font-size:28px;font-weight:900;color:'+
      (scoreValue>=85?'#22c55e':scoreValue>=70?'#f59e0b':'#ef4444');
    scoreLabel.textContent=scoreValue+'%';
    ctxScore.parentNode.style.position='relative';
    ctxScore.parentNode.appendChild(scoreLabel);
  }

  // Radar — sévérités
  const ctxRad = document.getElementById('chartRadar');
  if (ctxRad && typeof sevValues !== 'undefined') {
    new C(ctxRad, {
      type:'radar',
      data:{
        labels:['Critical','High','Medium','Low','Info'],
        datasets:[{
          label:'Contrôles',data:sevValues,
          backgroundColor:'rgba(0,68,105,.15)',borderColor:'#004469',
          pointBackgroundColor:'#F68D2E',pointRadius:5,borderWidth:2
        }]
      },
      options:{responsive:true,plugins:{legend:{display:false},
        title:{display:true,text:'Distribution par sévérité',font:{size:13,weight:'bold'}}}}
    });
  }
})();
</script>
'@

    $matLevel  = [int]($maturite.Substring(0,1))
    $matSteps  = (1..5 | ForEach-Object { $cls = if ($_ -le $matLevel) { 'active' } else { '' }; "<div class='mat-step $cls'></div>" }) -join ''

    $dcListHtml = if ($DCList.Count -gt 0) { ($DCList -join ' &nbsp;|&nbsp; ') } else { 'N/A' }

    return @"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="description" content="Rapport ISO 27001 Active Directory — OMNITECH Security"/>
<title>AD ISO 27001 — $DomainName — $RunId</title>
$style
</head>
<body>
<div class="page">

<!-- Header -->
<div class="report-header">
  <div>
    <h1>&#x1F6E1; Active Directory — Conformité ISO 27001:2022</h1>
    <div class="sub">OMNITECH Security &nbsp;·&nbsp; Confidentiel RSSI &nbsp;·&nbsp; Niveau Maturité : $maturite</div>
    <div class="maturity-bar" title="Niveau de maturité CMMI : $maturite">$matSteps</div>
  </div>
  <div class="meta">
    <strong>Domaine :</strong> $DomainName<br>
    <strong>DCs :</strong> $dcListHtml<br>
    <strong>Généré :</strong> $(Get-Date -Format 'dd/MM/yyyy HH:mm')<br>
    <strong>RunId :</strong> $RunId
  </div>
</div>

<!-- KPIs -->
<div class="kpi-row">
  <div class="kpi score">
    <span class="num" style="color:$scoreColor">${score}%</span>
    <span class="lbl">Score Conformité</span>
    <span class="sub">$passC PASS / $failC FAIL</span>
  </div>
  <div class="kpi fail">
    <span class="num">$crit</span>
    <span class="lbl">Critiques</span>
    <span class="sub">Action immédiate</span>
  </div>
  <div class="kpi high">
    <span class="num">$high</span>
    <span class="lbl">Élevés</span>
    <span class="sub">Court terme</span>
  </div>
  <div class="kpi" style="border-color:#eab308">
    <span class="num" style="color:#ca8a04">$med</span>
    <span class="lbl">Moyens</span>
    <span class="sub">Planifié</span>
  </div>
  <div class="kpi pass">
    <span class="num">$passC</span>
    <span class="lbl">Conformes</span>
    <span class="sub">PASS</span>
  </div>
  <div class="kpi info">
    <span class="num">$infoC</span>
    <span class="lbl">Informatifs</span>
    <span class="sub">INFO</span>
  </div>
</div>

<!-- Graphiques -->
<div class="charts-grid">
  <div class="chart-card">
    <h3>&#128202; Score de conformité</h3>
    <div style="position:relative;max-height:200px;"><canvas id="chartScore"></canvas></div>
  </div>
  <div class="chart-card">
    <h3>&#11835; Radar sévérités</h3>
    <canvas id="chartRadar"></canvas>
  </div>
  <div class="chart-card">
    <h3>&#128308; Échecs par catégorie</h3>
    <canvas id="chartCategory"></canvas>
  </div>
  <div class="chart-card">
    <h3>&#9646; PASS / FAIL par catégorie</h3>
    <canvas id="chartBar"></canvas>
  </div>
</div>

<!-- Actions prioritaires -->
$(if ($alertsHtml) { "<div class='card'><h2><span class='icon'>&#128680;</span> Actions Prioritaires</h2>$alertsHtml</div>" })

<!-- ISO mapping -->
<div class="card">
  <h2><span class='icon'>&#128211;</span> Couverture ISO 27001:2022 — Annexe A</h2>
  <div>$isoBadges</div>
</div>

<!-- Tableau de détail -->
<div class="card">
  <h2><span class='icon'>&#128203;</span> Détail des Contrôles</h2>
  <div class="controls">
    <input id="q" type="text" placeholder="&#128269; Recherche plein texte..."/>
    <select id="fStatus"><option value="">Statut...</option></select>
    <select id="fSev"><option value="">Sévérité...</option></select>
    <select id="fCat"><option value="">Catégorie...</option></select>
    <button id="btnCsv" class="btn btn-primary">&#8595; CSV</button>
    <button class="btn btn-secondary" onclick="window.print()">&#128438; Imprimer</button>
    <span style="color:var(--muted);font-size:11px;margin-left:8px;"><span id="visibleCount">0</span> contrôles affichés</span>
  </div>
  <div class="table-wrap">
  <table id="decisionsTable">
    <thead><tr>
      <th>ID</th><th>Titre</th><th>Sévérité</th><th>Evidence</th>
      <th>Justification</th><th>Remédiation</th><th>Références</th><th>Cibles</th>
    </tr></thead>
    <tbody>
      $([string]::Join([Environment]::NewLine, $rows))
    </tbody>
  </table>
  </div>
</div>

<div class="footer">
  Généré par <strong>AD-ISO27001-Report v5.0</strong> &nbsp;|&nbsp;
  PowerShell $($PSVersionTable.PSVersion) &nbsp;|&nbsp;
  OMNITECH Security &nbsp;|&nbsp; Confidentiel RSSI
</div>

</div><!-- /page -->

<script>
// Données injectées pour Chart.js
const catLabels = [$catLabels];
const catPass   = [$catPass];
const catFail   = [$catFail];
const scoreValue = $score;
const sevValues  = [$($sevData['Critical']),$($sevData['High']),$($sevData['Medium']),$($sevData['Low']),$($sevData['Info'])];
</script>
$js
</body>
</html>
"@
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 8 — EMAIL + FONCTIONS MANQUANTES
# ══════════════════════════════════════════════════════════════════════════════
function New-ReportEmailHtml {
    param([string]$DomainName,[string]$RunId,[int]$PassCount,[int]$FailCount,[int]$InfoCount,[object[]]$Decisions)
    $total  = $PassCount + $FailCount
    $score  = if ($total -gt 0) { [Math]::Round($PassCount/$total*100,0) } else { 0 }
    $crit   = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'Critical' }).Count
    $high   = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'High' }).Count
    $sc     = if ($score -ge 85) { '#16a34a' } elseif ($score -ge 70) { '#d97706' } else { '#dc2626' }
    $issues = ($Decisions | Where-Object { -not $_.Passed -and $_.Severity -in 'Critical','High' } |
        Select-Object -First 6 | ForEach-Object {
            $bc = if ($_.Severity -eq 'Critical') { '#fee2e2' } else { '#fff7ed' }
            $tc = if ($_.Severity -eq 'Critical') { '#991b1b' } else { '#9a3412' }
            "<tr><td style='padding:10px 12px;background:$bc;border-radius:6px;'>
              <strong style='color:$tc;'>[$($_.Id)] $($_.Title)</strong><br>
              <small style='color:#6b7280;'>$(if($_.Evidence){$_.Evidence.Substring(0,[Math]::Min(100,$_.Evidence.Length))})</small>
             </td></tr>"
        }) -join ''
    return @"
<!DOCTYPE html><html><head><meta charset='utf-8'></head>
<body style='margin:0;padding:20px;background:#f0f4f8;font-family:Segoe UI,Arial,sans-serif;'>
<div style='max-width:680px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.12);'>
  <div style='background:linear-gradient(135deg,#004469,#F68D2E);padding:32px;color:#fff;'>
    <h1 style='font-size:20px;margin:0 0 6px;'>&#x1F6E1; AD ISO 27001:2022 — Rapport de conformité</h1>
    <div style='opacity:.85;font-size:12px;'>$DomainName &nbsp;·&nbsp; $(Get-Date -Format 'dd/MM/yyyy HH:mm') &nbsp;·&nbsp; RunId : $RunId</div>
  </div>
  <div style='padding:32px;'>
    <div style='text-align:center;margin-bottom:28px;'>
      <div style='font-size:72px;font-weight:900;color:$sc;line-height:1;'>$score%</div>
      <div style='font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;'>Score de conformité</div>
    </div>
    <div style='display:flex;gap:10px;margin-bottom:28px;text-align:center;'>
      <div style='flex:1;background:#dcfce7;border-radius:10px;padding:14px;border:1.5px solid #86efac;'>
        <div style='font-size:30px;font-weight:800;color:#16a34a;'>$PassCount</div>
        <div style='font-size:10px;color:#166534;font-weight:700;letter-spacing:.5px;'>CONFORMES</div>
      </div>
      <div style='flex:1;background:#fee2e2;border-radius:10px;padding:14px;border:1.5px solid #fca5a5;'>
        <div style='font-size:30px;font-weight:800;color:#dc2626;'>$FailCount</div>
        <div style='font-size:10px;color:#991b1b;font-weight:700;letter-spacing:.5px;'>NON CONFORMES</div>
      </div>
      <div style='flex:1;background:#fef3c7;border-radius:10px;padding:14px;border:1.5px solid #fcd34d;'>
        <div style='font-size:30px;font-weight:800;color:#d97706;'>$crit</div>
        <div style='font-size:10px;color:#92400e;font-weight:700;letter-spacing:.5px;'>CRITIQUES</div>
      </div>
      <div style='flex:1;background:#fff7ed;border-radius:10px;padding:14px;border:1.5px solid #fed7aa;'>
        <div style='font-size:30px;font-weight:800;color:#ea580c;'>$high</div>
        <div style='font-size:10px;color:#9a3412;font-weight:700;letter-spacing:.5px;'>ÉLEVÉS</div>
      </div>
      <div style='flex:1;background:#dbeafe;border-radius:10px;padding:14px;border:1.5px solid #93c5fd;'>
        <div style='font-size:30px;font-weight:800;color:#2563eb;'>$InfoCount</div>
        <div style='font-size:10px;color:#1e40af;font-weight:700;letter-spacing:.5px;'>INFO</div>
      </div>
    </div>
    $(if($issues){"<h3 style='font-size:14px;color:#004469;margin-bottom:10px;'>&#9888; Actions prioritaires</h3><table style='width:100%;border-collapse:separate;border-spacing:0 6px;'>$issues</table>"})
    <div style='margin-top:24px;padding:14px;background:#f8fafc;border-radius:8px;font-size:11px;color:#64748b;text-align:center;'>
      Rapport détaillé HTML + JSON en pièce jointe. Confidentiel RSSI — OMNITECH Security.
    </div>
  </div>
</div>
</body></html>
"@
}

function Convert-DecisionsToHtml {
    # FIX BUG-04 : fonction manquante dans l'original
    param([Parameter(Mandatory)][object[]]$Decisions)
    $p = ($Decisions | Where-Object { $_.Passed -and $_.Severity -ne 'Info' }).Count
    $f = ($Decisions | Where-Object { -not $_.Passed }).Count
    $i = ($Decisions | Where-Object { $_.Severity -eq 'Info' }).Count
    return (New-ReportEmailHtml -DomainName $Global:DomainName -RunId $Global:RunId `
        -PassCount $p -FailCount $f -InfoCount $i -Decisions $Decisions)
}

function Send-ReportMail {
    param([string]$SmtpServer,[string]$From,[string]$To,[string]$Subject,[string]$HtmlBody,[string[]]$Attachments=@())
    try {
        $msg = New-Object System.Net.Mail.MailMessage
        $msg.From = $From; $msg.To.Add($To)
        $msg.Subject = $Subject; $msg.IsBodyHtml = $true; $msg.Body = $HtmlBody
        $msg.BodyEncoding = [System.Text.Encoding]::UTF8
        foreach ($a in $Attachments) {
            if ([System.IO.File]::Exists($a)) { $msg.Attachments.Add((New-Object System.Net.Mail.Attachment($a))) }
        }
        $smtp = New-Object System.Net.Mail.SmtpClient($SmtpServer)
        $smtp.Send($msg); $msg.Dispose(); return $true
    } catch { Write-Log "Erreur email : $($_.Exception.Message)" 'WARN'; return $false }
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 9 — DÉCOUVERTE DOMAINE
# ══════════════════════════════════════════════════════════════════════════════
Write-Log "=== [9] Découverte du domaine ===" 'INFO'

function Get-DomainName {
    if ($Domain) { return $Domain }
    if ($HAS_AD) { try { return (Get-ADDomain).DNSRoot } catch {} }
    return $env:USERDNSDOMAIN
}
function Get-DCList {
    if (-not $HAS_AD) { return @($env:COMPUTERNAME) }
    try { return @(Get-ADDomainController -Filter * | Select-Object -ExpandProperty HostName) }
    catch { Write-Log "Erreur Get-DCs : $_" 'WARN'; return @($env:COMPUTERNAME) }
}

$DomainName        = Get-DomainName
$Global:DomainName = $DomainName
$Global:RunId      = $RunId
$DCs               = @(Get-DCList)
$LocalDC           = $env:COMPUTERNAME
$DomainDN          = if ($HAS_AD) { try { (Get-ADDomain).DistinguishedName } catch { '' } } else { '' }

Write-Log "Domaine  : $DomainName"
Write-Log "DCs      : $($DCs -join ', ')"
Write-Log "DC local : $LocalDC"
Write-Log "DN       : $DomainDN"

$Global:EnhancedInventory = @{ Users=@(); Computers=@(); Groups=@(); OUs=@(); GPOs=@() }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 10 — CORE AD
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [10] Core AD ===" 'INFO'

# CHECK-C01 : AD Recycle Bin
try {
    if ($HAS_AD) {
        $rb = Get-ADOptionalFeature -Filter "name -like 'Recycle Bin Feature'" -ErrorAction Stop | Select-Object -First 1
        $sc = @(); if ($rb -and $rb.EnabledScopes) { $sc = @($rb.EnabledScopes) }
        ADH @{ Id='C01-RecycleBin'; Title='AD Recycle Bin activée'; Pass=($sc.Count -gt 0); Severity='Medium'; Category='AD Core'
          Evidence="EnabledScopes=$($sc -join ';')"
          Justification=(Make-Justif @('A.5.30') 'Restauration rapide objets sans authoritative restore.')
          Remediation=(Make-Remediation 'Activer AD Recycle Bin' @(
            'Enable-ADOptionalFeature -Identity "Recycle Bin Feature" -Scope ForestOrConfigurationSet -Target (Get-ADForest).Name'
          ) @('https://learn.microsoft.com/windows-server/identity/ad-ds/manage/ad-recycle-bin')) }
    }
} catch { ADH @{ Id='C01-RecycleBin'; Title='Recycle Bin check failed'; Pass=$false; Severity='Medium'; Category='AD Core'; Evidence=$_.Exception.Message } }

# CHECK-C02 : SYSVOL DFSR vs FRS
try {
    if ($HAS_AD) {
        $forest = Get-ADForest
        $ok = ($forest.ForestMode -as [string]) -match 'Windows2008|Windows2012|Windows2016|Windows2019|Windows2022'
        ADH @{ Id='C02-SYSVOL-DFSR'; Title='SYSVOL répliqué par DFSR (pas FRS legacy)'; Pass=$ok; Severity='High'; Category='AD Core'
          Evidence="ForestMode=$($forest.ForestMode)"
          Justification=(Make-Justif @('A.8.10') 'Réplication DFSR — résilience et intégrité SYSVOL.')
          Remediation=(Make-Remediation 'Migrer SYSVOL vers DFSR' @('Utiliser DFSRMIG.exe en 4 étapes') @('https://learn.microsoft.com/windows-server/storage/dfs-replication/migrate-sysvol-to-dfsr')) }
    }
} catch { ADH @{ Id='C02-SYSVOL-DFSR'; Title='SYSVOL check failed'; Pass=$false; Severity='High'; Category='AD Core'; Evidence=$_.Exception.Message } }

# CHECK-C03 : KRBTGT âge MDP (Golden Ticket)
try {
    if ($HAS_AD) {
        $krbtgt = Get-ADUser -Identity 'krbtgt' -Properties PasswordLastSet
        $days = if ($krbtgt.PasswordLastSet) { (New-TimeSpan -Start $krbtgt.PasswordLastSet -End (Get-Date)).TotalDays } else { 9999 }
        ADH @{ Id='C03-KRBTGT-Age'; Title='Rotation KRBTGT < 180 jours (protection Golden Ticket)'; Pass=($days -lt 180); Severity='High'; Category='Identity'
          Evidence="PasswordLastSet il y a $([Math]::Round($days,0)) jours"
          Justification=(Make-Justif @('A.8.1','A.8.2') 'Rotation KRBTGT limite la durée de vie des Golden Tickets.' -AnssiRefs 'KRBGT-1')
          Remediation=(Make-Remediation '2 rotations successives KRBTGT' @(
            'Reset #1 → attendre réplication inter-sites (min 24h)', 'Reset #2 → purge tickets existants',
            'Valider authentification applicative avant/après'
          ) @('https://learn.microsoft.com/windows-server/identity/ad-ds/manage/kerberos/krbtgt-account-password-reset')) }
    }
} catch { ADH @{ Id='C03-KRBTGT-Age'; Title='KRBTGT check failed'; Pass=$false; Severity='High'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-C04 : ms-DS-MachineAccountQuota = 0
try {
    if ($HAS_AD) {
        $maq = ((Get-ADDomain | Get-ADObject -Properties 'ms-DS-MachineAccountQuota').'ms-DS-MachineAccountQuota') -as [int]
        ADH @{ Id='C04-MachineAccountQuota'; Title='ms-DS-MachineAccountQuota = 0'; Pass=($maq -eq 0); Severity='High'; Category='AD Core'
          Evidence="MachineAccountQuota=$maq (défaut=10)"
          Justification=(Make-Justif @('A.8.1') 'Empêcher les users de joindre des machines — vecteur MITM/relay (MAQ>0 exploitable avec Responder).' -AnssiRefs 'MAQ-0')
          Remediation='Set-ADDomain -Identity $DomainName -Replace @{"ms-DS-MachineAccountQuota"=0}' }
    }
} catch { ADH @{ Id='C04-MachineAccountQuota'; Title='MAQ check failed'; Pass=$false; Severity='High'; Category='AD Core'; Evidence=$_.Exception.Message } }

# CHECK-C05 : FSMO roles + santé réplication (repadmin)
try {
    if ($HAS_AD) {
        $dom = Get-ADDomain; $fst = Get-ADForest
        $fsmo = "PDC=$($dom.PDCEmulator) | RID=$($dom.RIDMaster) | Infra=$($dom.InfrastructureMaster) | Schema=$($fst.SchemaMaster) | Naming=$($fst.DomainNamingMaster)"
        $rep  = (repadmin /replsummary 2>$null) -join "`n"
        $repOk = $rep -match 'fails:\s*0|Largest delta\s*:\s*\d{2}:\d{2}:\d{2}'
        ADH @{ Id='C05-FSMO-Replication'; Title='FSMO roles documentés — réplication AD saine'; Pass=$repOk; Severity='Medium'; Category='AD Core'
          Evidence="$fsmo`n--- replsummary ---`n$(($rep | Select-String 'fails|error|largest|delta|showsync' | Select-Object -First 15 | ForEach-Object {$_.Line}) -join "`n")"
          Justification=(Make-Justif @('A.8.10') 'Convergence annuaire et maîtrise des rôles uniques.')
          Remediation='repadmin /syncall /AdeP ; repadmin /showrepl pour diagnostique. Surveiller DFSR backlog.' }
    }
} catch { ADH @{ Id='C05-FSMO-Replication'; Title='FSMO/Replication check failed'; Pass=$false; Severity='Medium'; Category='AD Core'; Evidence=$_.Exception.Message } }

# CHECK-C06 : Politique MDP domaine baseline
try {
    if ($HAS_AD) {
        $pol  = Get-ADDefaultDomainPasswordPolicy -ErrorAction Stop
        $cplx = [bool]$pol.ComplexityEnabled; $minL = $pol.MinPasswordLength
        $maxA = $pol.MaxPasswordAge.Days; $lkTh = $pol.LockoutThreshold
        $hist = $pol.PasswordHistoryCount; $lkDur= $pol.LockoutDuration.Minutes
        $ok   = $cplx -and ($minL -ge 12) -and ($maxA -le 365) -and ($lkTh -ge 3 -and $lkTh -le 10) -and ($hist -ge 12)
        ADH @{ Id='C06-DomainPasswordPolicy'; Title='Politique MDP domaine — baseline ISO/ANSSI'; Pass=$ok; Severity='High'; Category='SecPolicy'
          Evidence="Complexity=$cplx; MinLen=$minL; MaxAge=${maxA}j; LockoutThreshold=$lkTh; History=$hist; LockoutDuration=${lkDur}min"
          Justification=(Make-Justif @('A.8.2') 'Force et renouvellement des mots de passe.' -AnssiRefs 'PAP-MDR' -Nis2Art 'Art.21(2)(i)')
          Remediation=(Make-Remediation 'Renforcer la politique domaine' @(
            'Complexity = Enabled', 'MinPasswordLength >= 12 (viser 14)',
            'MaxPasswordAge <= 365j (viser 90j pour comptes standards)',
            'LockoutThreshold entre 5 et 10', 'PasswordHistoryCount >= 12',
            'Préférer FGPP pour comptes admins et service (longueur 20+)'
          ) @('https://learn.microsoft.com/windows/security/threat-protection/security-policy-settings')) }
    }
} catch { ADH @{ Id='C06-DomainPasswordPolicy'; Title='Password policy check failed'; Pass=$false; Severity='High'; Category='SecPolicy'; Evidence=$_.Exception.Message } }

# CHECK-C07 : Fine-Grained Password Policies présentes
try {
    if ($HAS_AD) {
        $fgpp = Get-ADFineGrainedPasswordPolicy -Filter * -ErrorAction SilentlyContinue |
            Select-Object Name, Precedence, MinPasswordLength, LockoutThreshold
        $ok = ($fgpp -and @($fgpp).Count -gt 0)
        $fgppDesc = @($fgpp | ForEach-Object { '{0}(prec={1},len={2},lock={3})' -f $_.Name, $_.Precedence, $_.MinPasswordLength, $_.LockoutThreshold }) -join ', '
        ADH @{ Id='C07-FGPP'; Title='Fine-Grained Password Policies présentes'; Pass=$ok; Severity='Medium'; Category='SecPolicy'
          Evidence="FGPP=$fgppDesc"
          Justification=(Make-Justif @('A.8.2') 'Politiques différenciées par risque — comptes admins/service plus stricts.')
          Remediation='New-ADFineGrainedPasswordPolicy : MinPasswordLength>=20, LockoutThreshold=5 pour comptes T0. Appliquer via PSO.' }
    }
} catch { ADH @{ Id='C07-FGPP'; Title='FGPP check failed'; Pass=$false; Severity='Medium'; Category='SecPolicy'; Evidence=$_.Exception.Message } }

# CHECK-C08 : Protected Users non vide
try {
    if ($HAS_AD) {
        $pu = Get-ADGroup -Identity 'Protected Users' -ErrorAction Stop
        $mem = @(); try { $mem = @(Get-ADGroupMember $pu -Recursive | Select-Object -ExpandProperty SamAccountName) } catch {}
        ADH @{ Id='C08-ProtectedUsers'; Title="Protected Users non vide — $($mem.Count) membres"; Pass=($mem.Count -gt 0); Severity='Medium'; Category='Identity'
          Evidence="Membres=$($mem -join ',')"
          Justification=(Make-Justif @('A.8.1') 'Kerberos hardening sur comptes sensibles : pas NTLM, pas délégation, pas RC4.')
          References=@('https://learn.microsoft.com/windows/security/identity-protection/protected-users-security-group') }
    }
} catch { ADH @{ Id='C08-ProtectedUsers'; Title='Protected Users check failed'; Pass=$false; Severity='Medium'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-C09 : SPN Duplicates
if (-not $SkipSlowChecks) {
    try {
        $dupSpn = (setspn -X -F 2>&1) | Where-Object { $_ -match 'Checking|duplicate' }
        $hasDup = $dupSpn -match 'Duplicate'
        ADH @{ Id='C09-SPN-Duplicates'; Title='Aucun SPN dupliqué (Kerberos auth integrity)'; Pass=(-not $hasDup); Severity='High'; Category='AD Core'
          Evidence="$(($dupSpn | Select-Object -First 10) -join '; ')"
          Justification=(Make-Justif @('A.8.9') 'SPN dupliqués cassent l''authentification Kerberos et peuvent être exploités.')
          Remediation='setspn -Q */* pour lister ; setspn -D <SPN> <compte> pour supprimer le doublon. Corriger le compte fautif.' }
    } catch { ADH @{ Id='C09-SPN-Duplicates'; Title='SPN duplicates check failed'; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message } }
}

# CHECK-C10 : SYSVOL ACL — pas d'écriture pour Everyone
try {
    $sysvol = "\\$DomainName\SYSVOL\$DomainName\scripts"
    if (Test-Path $sysvol) {
        $acl    = Get-Acl $sysvol -ErrorAction Stop
        $openAcl= @($acl.Access | Where-Object {
            $_.IdentityReference -match 'Everyone|Tout le monde|Authenticated Users|Domain Users|Utilisateurs du domaine' -and
            $_.FileSystemRights -match 'Write|Modify|FullControl' -and $_.AccessControlType -eq 'Allow'
        })
        $aclDesc = @($openAcl | ForEach-Object { '{0}:{1}' -f $_.IdentityReference, $_.FileSystemRights }) -join '; '
        ADH @{ Id='C10-SYSVOL-ACL'; Title='SYSVOL\scripts — pas d''écriture pour groupes larges'; Pass=($openAcl.Count -eq 0); Severity='Critical'; Category='GPO'
          Evidence="ACL suspects=$aclDesc"
          Justification=(Make-Justif @('A.8.10') 'Écriture SYSVOL = injection de scripts exécutés sur toutes les machines du domaine.')
          Remediation='icacls \\domain\SYSVOL\domain\scripts — supprimer droits Write pour Everyone/Domain Users. Garder Admins/SYSTEM uniquement.' }
    } else {
        ADH @{ Id='C10-SYSVOL-ACL'; Title='SYSVOL\scripts inaccessible pour audit ACL'; Pass=$false; Severity='Info'; Category='GPO'; Evidence="Chemin $sysvol inaccessible" }
    }
} catch { ADH @{ Id='C10-SYSVOL-ACL'; Title='SYSVOL ACL check failed'; Pass=$false; Severity='Low'; Category='GPO'; Evidence=$_.Exception.Message } }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 11 — CONTRÔLES PAR DC (Windows / OS)
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [11] Contrôles par DC ===" 'INFO'

foreach ($dc in $DCs) {
    Write-Log "  DC : $dc" 'DEBUG'

    # CHECK-D01 : LDAP Signing + Channel Binding
    try {
        $lsi = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters' 'LDAPServerIntegrity'
        $cb  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Parameters' 'LdapEnforceChannelBinding'
        ADH @{ Id="D01-LDAP-SignCB::$dc"; Title="LDAP Signing=Require + ChannelBinding=Always ($dc)"; Pass=($lsi -eq 2 -and $cb -eq 2); Severity='High'; Category='AD Core'
          Evidence="LDAPServerIntegrity=$lsi (need=2); LdapEnforceChannelBinding=$cb (need=2)"
          Justification=(Make-Justif @('A.8.9') 'Prévention relay et downgrade LDAP.')
          Remediation='GPO : Domain Controller Security Policy → LDAP server signing = Require. Reg : NTDS\Parameters\LDAPServerIntegrity=2 ; LdapEnforceChannelBinding=2.'
          References=@('https://support.microsoft.com/help/4520412'); Targets=@($dc) }
    } catch { ADH @{ Id="D01-LDAP-SignCB::$dc"; Title="LDAP Sign/CB check failed ($dc)"; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D02 : SMB1 désactivé
    try {
        $s1 = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' 'SMB1'
        ADH @{ Id="D02-SMB1::$dc"; Title="SMB1 désactivé ($dc)"; Pass=($null -eq $s1 -or $s1 -eq 0); Severity='High'; Category='OS'
          Evidence="SMB1=$($s1 -as [string])"
          Justification=(Make-Justif @('A.8.9') 'Protocole obsolète — vecteur EternalBlue/WannaCry.')
          Remediation='Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force ; Remove-WindowsFeature FS-SMB1'
          References=@('https://aka.ms/stopusingSMB1'); Targets=@($dc) }
    } catch { ADH @{ Id="D02-SMB1::$dc"; Title="SMB1 check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D03 : SMB Signing requis (serveur)
    try {
        $sig = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' 'RequireSecuritySignature'
        ADH @{ Id="D03-SMBSign::$dc"; Title="SMB Signing requis serveur ($dc)"; Pass=($sig -eq 1); Severity='High'; Category='OS'
          Evidence="RequireSecuritySignature=$sig"
          Justification=(Make-Justif @('A.8.9') 'Intégrité SMB — prévention relay NTLM / MITM.')
          Remediation='Set-SmbServerConfiguration -RequireSecuritySignature $true -Force'
          Targets=@($dc) }
    } catch { ADH @{ Id="D03-SMBSign::$dc"; Title="SMB Signing check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D04 : SMB3 Encryption sur les partages
    try {
        $encData = Invoke-RemoteOrLocal $dc { (Get-SmbServerConfiguration).EncryptData }
        ADH @{ Id="D04-SMB3Encrypt::$dc"; Title="SMB3 EncryptData activé ($dc)"; Pass=([bool]$encData); Severity='Medium'; Category='OS'
          Evidence="EncryptData=$encData"
          Justification=(Make-Justif @('A.8.9') 'Chiffrement données SMB en transit.')
          Remediation='Set-SmbServerConfiguration -EncryptData $true -Force'
          Targets=@($dc) }
    } catch { ADH @{ Id="D04-SMB3Encrypt::$dc"; Title="SMB3 encrypt check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D05 : NTP configuré
    try {
        $ntp = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters' 'NtpServer'
        $ok  = ($ntp -and $ntp -match '\w')
        ADH @{ Id="D05-NTP::$dc"; Title="NTP configuré ($dc)"; Pass=$ok; Severity='Medium'; Category='OS'
          Evidence="NtpServer=$ntp"
          Justification=(Make-Justif @('A.8.17') 'Synchronisation horloges — validité tickets Kerberos et cohérence logs.')
          Remediation='GPO Computer Configuration > Windows Settings > Security Settings > System Services > W32Time'
          Targets=@($dc) }
    } catch { ADH @{ Id="D05-NTP::$dc"; Title="NTP check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }  # FIX BUG-03 : $false pas $pass

    # CHECK-D06 : RDP + NLA
    try {
        $deny = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections'
        $nla  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' 'UserAuthentication'
        $ok   = ($deny -eq 1) -or ($nla -eq 1)
        ADH @{ Id="D06-RDP-NLA::$dc"; Title="RDP avec NLA ou RDP désactivé ($dc)"; Pass=$ok; Severity='High'; Category='OS'
          Evidence="fDenyTSConnections=$deny; UserAuthentication=$nla"
          Justification=(Make-Justif @('A.8.9') 'NLA exige authentification Kerberos/NTLM avant établissement session RDP.')
          Remediation='GPO : Remote Desktop Services > Require NLA = Enabled. Registry : UserAuthentication=1'
          Targets=@($dc) }
    } catch { ADH @{ Id="D06-RDP-NLA::$dc"; Title="RDP/NLA check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D07 : WDigest désactivé
    try {
        $wd = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\WDigest' 'UseLogonCredential'
        ADH @{ Id="D07-WDigest::$dc"; Title="WDigest désactivé ($dc)"; Pass=($null -eq $wd -or $wd -eq 0); Severity='High'; Category='OS'
          Evidence="UseLogonCredential=$($wd -as [string])"
          Justification=(Make-Justif @('A.8.5') 'Supprime le cache credentials WDigest en clair dans LSASS.')
          Remediation='HKLM\SecurityProviders\WDigest : UseLogonCredential=0 via GPO ou registry.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D07-WDigest::$dc"; Title="WDigest check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D08 : LSA Protection (RunAsPPL)
    try {
        $ppl = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RunAsPPL'
        $cfg = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'LsaCfgFlags'
        ADH @{ Id="D08-LSA-PPL::$dc"; Title="LSA Protection RunAsPPL activée ($dc)"; Pass=($ppl -eq 1 -or $cfg -in 1,2); Severity='High'; Category='OS'
          Evidence="RunAsPPL=$ppl; LsaCfgFlags=$cfg"
          Justification=(Make-Justif @('A.8.5') 'LSASS en mode PPL bloque dump Mimikatz/ProcDump.' -AnssiRefs 'LSA-PPL')
          Remediation='GPO DeviceGuard ou HKLM\Lsa : RunAsPPL=1. Reboot requis. Tester compatibilité antivirus/EDR.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D08-LSA-PPL::$dc"; Title="LSA PPL check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D09 : Kerberos AES only + PAC full signature
    try {
        $enc = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Kerberos\Parameters' 'SupportedEncryptionTypes'
        $pac = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\Kerberos\Parameters' 'KrbtgtFullPacSignature'
        $aes = ($null -ne $enc) -and ($enc -band 0x18) -and (-not ($enc -band 0x3))
        ADH @{ Id="D09-Kerb-AES-PAC::$dc"; Title="Kerberos AES-only + PAC full-signature ($dc)"; Pass=($aes -and $pac -in 1,2); Severity='High'; Category='AD Core'
          Evidence="SupportedEncryptionTypes=0x$([int]$enc | ForEach-Object{$_.ToString('X')}); KrbtgtFullPacSignature=$pac"
          Justification=(Make-Justif @('A.8.9') 'Interdit RC4/DES ; PAC full-signature protège Silver/Diamond Ticket.')
          Remediation='SupportedEncryptionTypes=0x18 (AES128+AES256 only) ; KrbtgtFullPacSignature=2 (full enforcement).'
          Targets=@($dc) }
    } catch { ADH @{ Id="D09-Kerb-AES-PAC::$dc"; Title="Kerberos check failed ($dc)"; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D10 : Kerberos ticket lifetimes (GPO)
    try {
        $maxTkt  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\Kerberos\Parameters' 'MaxTicketAge'
        $maxRen  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\Kerberos\Parameters' 'MaxRenewAge'
        $maxSrv  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\Kerberos\Parameters' 'MaxServiceAge'
        $ok = ($null -ne $maxTkt -and $maxTkt -le 10) -and ($null -ne $maxRen -and $maxRen -le 7)
        ADH @{ Id="D10-Kerb-Lifetimes::$dc"; Title="Kerberos ticket lifetimes corrects ($dc)"; Pass=$ok; Severity='Medium'; Category='AD Core'
          Evidence="MaxTicketAge=${maxTkt}h; MaxRenewAge=${maxRen}j; MaxServiceAge=${maxSrv}min"
          Justification=(Make-Justif @('A.8.9') 'Réduire la fenêtre d''exploitation des tickets volés.')
          Remediation='GPO Default Domain Policy : max ticket lifetime=10h ; max renewal=7j ; max service=600min.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D10-Kerb-Lifetimes::$dc"; Title="Kerberos lifetimes check failed ($dc)"; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D11 : NTLM Restriction (RestrictNTLM + NTLMv2 only)
    try {
        $rsend  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0' 'RestrictSendingNTLMTraffic'
        $minSrv = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0' 'NTLMMinServerSec'
        $lmLvl  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'LmCompatibilityLevel'
        $ok = ($lmLvl -ge 5) -and ($minSrv -ge 537395200)  # NTLMv2 + session 128bit
        ADH @{ Id="D11-NTLM-Harden::$dc"; Title="NTLM durci — NTLMv2 only + restriction ($dc)"; Pass=$ok; Severity='High'; Category='OS'
          Evidence="LmCompatibilityLevel=$lmLvl (need>=5=NTLMv2only); NTLMMinServerSec=$minSrv; RestrictSending=$rsend"
          Justification=(Make-Justif @('A.8.9') 'Forcer NTLMv2 uniquement. Réduire surface relay/pass-the-hash.' -AnssiRefs 'NTLM-R1' -Nis2Art 'Art.21(2)(e)')
          Remediation='GPO Network Security → LAN Manager Auth Level = 5 (NTLMv2 only). NTLMMinServerSec=537395200. RestrictSending=2 (Deny all).'
          Targets=@($dc) }
    } catch { ADH @{ Id="D11-NTLM-Harden::$dc"; Title="NTLM harden check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D12 : Schannel — TLS 1.0 / SSL 2.0 / SSL 3.0 désactivés
    try {
        $tlsBad = @()
        foreach ($proto in @('SSL 2.0','SSL 3.0','TLS 1.0','TLS 1.1')) {
            $srv = Test-RemoteRegistryValue $dc "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\$proto\Server" 'Enabled'
            $cli = Test-RemoteRegistryValue $dc "HKLM:\SYSTEM\CurrentControlSet\Control\SecurityProviders\SCHANNEL\Protocols\$proto\Client" 'Enabled'
            if ($srv -ne 0 -or $cli -ne 0) { $tlsBad += $proto }
        }
        ADH @{ Id="D12-Schannel::$dc"; Title="Schannel — protocoles faibles désactivés ($dc)"; Pass=($tlsBad.Count -eq 0); Severity='High'; Category='OS'
          Evidence="ProtosFaibles=$(if($tlsBad.Count -gt 0){$tlsBad -join ', '}else{'Aucun'})"
          Justification=(Make-Justif @('A.8.9') 'SSL/TLS faibles — vulnérabilités POODLE, BEAST, DROWN. Imposer TLS 1.2+.' -AnssiRefs 'TLS-1' -Nis2Art 'Art.21(2)(h)')
          Remediation='Désactiver via registry ou IISCrypto : Server\Enabled=0 et DisabledByDefault=1 pour SSL2, SSL3, TLS1.0, TLS1.1. Activer TLS1.2 minimum.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D12-Schannel::$dc"; Title="Schannel check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D13 : LDAPS port 636 disponible
    try {
        $ldaps = Test-TCPPort -ComputerName $dc -Port 636 -TimeoutMs 3000
        ADH @{ Id="D13-LDAPS::$dc"; Title="LDAPS port 636 disponible ($dc)"; Pass=$ldaps; Severity='High'; Category='AD Core'
          Evidence="TCP/636=$ldaps"
          Justification=(Make-Justif @('A.8.9') 'LDAP chiffré (LDAPS) requis pour toutes les applications cliente AD. LDAP clair = credentials en transit non chiffrés.')
          Remediation='Installer un certificat serveur sur le DC (machine cert, SAN=FQDN DC). Vérifier le CA chain. Tester avec ldp.exe → SSL.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D13-LDAPS::$dc"; Title="LDAPS check failed ($dc)"; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D14 : LAPS (legacy ou Windows LAPS)
    try {
        $lapsLeg = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Policies\Microsoft Services\AdmPwd' 'AdmPwdEnabled'
        $lapsWin = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\LAPS' 'BackupDirectory'
        $ok = ($lapsLeg -eq 1) -or ($null -ne $lapsWin)
        ADH @{ Id="D14-LAPS::$dc"; Title="LAPS actif sur $dc"; Pass=$ok; Severity='High'; Category='OS'
          Evidence="LegacyLAPS.AdmPwdEnabled=$lapsLeg; WinLAPS.BackupDirectory=$lapsWin"
          Justification=(Make-Justif @('A.8.2') 'Rotation automatique MDP admin local — protection lateral movement.')
          Remediation='Migrer vers Windows LAPS (built-in). GPO LAPS : BackupDirectory=1 (AD) ou 2 (Entra). Vérifier ACL ms-Mcs-AdmPwd ou msLAPS-Password.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D14-LAPS::$dc"; Title="LAPS check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D15 : Netlogon RequireSignOrSeal
    try {
        $nlog = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\Netlogon\Parameters' 'RequireSignOrSeal'
        $seal = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\Netlogon\Parameters' 'SealSecureChannel'
        $sign = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\Netlogon\Parameters' 'SignSecureChannel'
        $ok   = ($nlog -eq 1) -and ($seal -eq 1) -and ($sign -eq 1)
        ADH @{ Id="D15-Netlogon::$dc"; Title="Netlogon RequireSignOrSeal activé ($dc)"; Pass=$ok; Severity='High'; Category='AD Core'
          Evidence="RequireSignOrSeal=$nlog; SealSecureChannel=$seal; SignSecureChannel=$sign"
          Justification=(Make-Justif @('A.8.9') 'Protège canal Netlogon — mitige ZeroLogon (CVE-2020-1472) et attaques machine-account.')
          Remediation='HKLM\Netlogon\Parameters : RequireSignOrSeal=1 ; SealSecureChannel=1 ; SignSecureChannel=1. Appliquer via GPO DCs.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D15-Netlogon::$dc"; Title="Netlogon check failed ($dc)"; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D16 : Firewall domaine activé
    try {
        $fw = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\DomainProfile' 'EnableFirewall'
        ADH @{ Id="D16-Firewall::$dc"; Title="Windows Firewall — profil domaine activé ($dc)"; Pass=($fw -eq 1); Severity='Medium'; Category='OS'
          Evidence="EnableFirewall=$fw"
          Justification=(Make-Justif @('A.8.9','A.8.10') 'Réduction surface réseau exposée.')
          Remediation='Set-NetFirewallProfile -Profile Domain -Enabled True -DefaultInboundAction Block'
          Targets=@($dc) }
    } catch { ADH @{ Id="D16-Firewall::$dc"; Title="Firewall check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D17 : Print Spooler désactivé (PrintNightmare)
    try {
        $svc = Invoke-RemoteOrLocal $dc { (Get-Service -Name 'Spooler' -ErrorAction SilentlyContinue).StartType }
        ADH @{ Id="D17-Spooler::$dc"; Title="Print Spooler désactivé ($dc)"; Pass=($svc -in 'Disabled','Manual'); Severity='High'; Category='OS'
          Evidence="Spooler.StartType=$svc"
          Justification=(Make-Justif @('A.8.9') 'PrintNightmare (CVE-2021-1675) — Spooler inutile sur DC = surface d''attaque à supprimer.')
          Remediation='Set-Service -Name Spooler -StartupType Disabled ; Stop-Service Spooler -Force'
          Targets=@($dc) }
    } catch { ADH @{ Id="D17-Spooler::$dc"; Title="Spooler check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D18 : Security log size >= 1 Go
    try {
        $gl  = Invoke-RemoteOrLocal $dc { wevtutil gl Security 2>$null }
        $txt = ($gl -join "`n")
        $sz  = if ($txt -match 'maxSize:\s*(\d+)') { [int64]$Matches[1] } else { 0 }
        $ret = if ($txt -match 'retention:\s*(\w+)') { $Matches[1] } else { '' }
        ADH @{ Id="D18-AuditLogSize::$dc"; Title="Security log >= 1 Go + rétention ($dc)"; Pass=($sz -ge 1073741824); Severity='Medium'; Category='Audit'
          Evidence="MaxSize=$([Math]::Round($sz/1MB,0)) Mo; Retention=$ret"
          Justification=(Make-Justif @('A.5.29','A.8.15') 'Préserver preuves audit ; éviter écrasement anticipé.')
          Remediation='wevtutil sl Security /ms:2147483648 /rt:false  (2 Go, pas d''écrasement). Forwarder vers SIEM Graylog (port 5044 Winlogbeat).'
          Targets=@($dc) }
    } catch { ADH @{ Id="D18-AuditLogSize::$dc"; Title="Audit log check failed ($dc)"; Pass=$false; Severity='Low'; Category='Audit'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D19 : PowerShell ScriptBlock + Module logging
    try {
        $sb  = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging' 'EnableScriptBlockLogging'
        $mod = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging' 'EnableModuleLogging'
        $tr  = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\Transcription' 'EnableTranscripting'
        ADH @{ Id="D19-PSLogging::$dc"; Title="PowerShell ScriptBlock + Module logging ($dc)"; Pass=($sb -eq 1 -and $mod -eq 1); Severity='High'; Category='Audit'
          Evidence="ScriptBlockLogging=$sb; ModuleLogging=$mod; Transcription=$tr"
          Justification=(Make-Justif @('A.5.29','A.8.15') 'Forensics PowerShell — tracer toutes les exécutions de scripts.')
          Remediation='GPO Admin Templates > Windows Components > Windows PowerShell : ScriptBlockLogging=Enabled ; ModuleLogging=Enabled.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D19-PSLogging::$dc"; Title="PS logging check failed ($dc)"; Pass=$false; Severity='Low'; Category='Audit'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D20 : WEF Subscriptions présentes
    try {
        $wef = Invoke-RemoteOrLocal $dc { (wecutil es 2>$null) }
        $ok  = ($null -ne $wef -and @($wef).Count -gt 0)
        ADH @{ Id="D20-WEF::$dc"; Title="WEF Subscriptions présentes ($dc)"; Pass=$ok; Severity='Medium'; Category='Audit'
          Evidence="Subscriptions=$($wef -join '; ')"
          Justification=(Make-Justif @('A.5.29','A.5.28') 'Windows Event Forwarding vers collecteur SIEM pour centralisation.' -Nis2Art 'Art.21(2)(j)')
          Remediation='Configurer WEF via GPO ou Winlogbeat (Graylog 10.33.220.10 port 5044). Créer subscriptions Security/DS/PowerShell/TaskScheduler.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D20-WEF::$dc"; Title="WEF check failed ($dc)"; Pass=$false; Severity='Low'; Category='Audit'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D21 : DS-Changes SACL activé (audit changements AD)
    try {
        $ldapLog = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Diagnostics' '15 Field Engineering'
        $dsLogEv= Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\NTDS\Diagnostics' '5 Replication Events'
        $ok = ($ldapLog -ge 1)
        ADH @{ Id="D21-DS-Changes::$dc"; Title="DS Changes / diagnostics NTDS activés ($dc)"; Pass=$ok; Severity='Medium'; Category='Audit'
          Evidence="NTDS-Field-Eng=$ldapLog; NTDS-Replication=$dsLogEv"
          Justification=(Make-Justif @('A.5.29','A.8.10') 'Tracer les changements AD — activations/désactivations comptes, GPO, groupes.')
          Remediation='HKLM\NTDS\Diagnostics : "15 Field Engineering"=5 pour LDAP event debug. Activer "Audit Directory Service Changes" dans la politique d''audit DC.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D21-DS-Changes::$dc"; Title="DS Changes check failed ($dc)"; Pass=$false; Severity='Low'; Category='Audit'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D22 : Anonymous / Null session désactivé
    try {
        $evrAuth = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' 'RestrictNullSessAccess'
        $noEnum  = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RestrictAnonymous'
        $noSam   = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RestrictAnonymousSAM'
        $ok = ($evrAuth -eq 1) -and ($noEnum -ge 1) -and ($noSam -eq 1)
        ADH @{ Id="D22-Anonymous::$dc"; Title="Null session / Anonymous enumeration désactivé ($dc)"; Pass=$ok; Severity='High'; Category='OS'
          Evidence="RestrictNullSessAccess=$evrAuth; RestrictAnonymous=$noEnum; RestrictAnonymousSAM=$noSam"
          Justification=(Make-Justif @('A.8.9','A.8.5') 'Empêcher l''énumération d''utilisateurs, groupes et shares sans authentification.')
          Remediation='GPO : RestrictAnonymous=1 ; RestrictAnonymousSAM=1 ; RestrictNullSessAccess=1.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D22-Anonymous::$dc"; Title="Anonymous session check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D23 : LLMNR / NetBIOS désactivés
    try {
        $llmnr  = Test-RemoteRegistryValue $dc 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' 'EnableMulticast'
        $nbns   = Invoke-RemoteOrLocal $dc {
            $v = (Get-NetAdapterBinding | Where-Object ComponentID -eq 'ms_netbios' | Select-Object -First 1).Enabled
            return $v
        }
        $ok = ($llmnr -eq 0) -and (-not $nbns)
        ADH @{ Id="D23-LLMNR-NBNS::$dc"; Title="LLMNR et NetBIOS désactivés ($dc)"; Pass=$ok; Severity='High'; Category='OS'
          Evidence="LLMNR.EnableMulticast=$llmnr (need=0); NetBIOS-binding=$nbns (need=False)"
          Justification=(Make-Justif @('A.8.9') 'LLMNR/NBNS = vecteurs Responder pour relay NTLM / poisoning réseau.')
          Remediation='GPO Admin Templates > DNS Client > Turn off multicast name resolution = Enabled. Désactiver NetBIOS via DHCP option 001 ou GPO NIC settings.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D23-LLMNR-NBNS::$dc"; Title="LLMNR/NBNS check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D24 : Remote SAM restriction (RestrictRemoteSam)
    try {
        $rSam = Test-RemoteRegistryValue $dc 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa' 'RestrictRemoteSam'
        $ok   = (-not [string]::IsNullOrEmpty($rSam))
        ADH @{ Id="D24-RemoteSAM::$dc"; Title="RestrictRemoteSam configuré ($dc)"; Pass=$ok; Severity='Medium'; Category='OS'
          Evidence="RestrictRemoteSam=$rSam"
          Justification=(Make-Justif @('A.8.9') 'Limite les comptes pouvant énumérer la SAM distante (BloodHound / SharpHound collecte).')
          Remediation='HKLM\Lsa : RestrictRemoteSam = O:BAG:BAD:(A;;RC;;;BA) — authorise Administrators uniquement.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D24-RemoteSAM::$dc"; Title="Remote SAM check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }

    # CHECK-D25 : Patch / Reboot pending
    try {
        $hot = Invoke-RemoteOrLocal $dc { Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 1 InstalledOn, HotFixID }
        $rb  = Invoke-RemoteOrLocal $dc { Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending' }
        ADH @{ Id="D25-Patch::$dc"; Title="Pas de reboot pending — dernier patch récent ($dc)"; Pass=(-not $rb); Severity='Medium'; Category='OS'
          Evidence="LastHotfix=$($hot.HotFixID) ($($hot.InstalledOn)); RebootPending=$rb"
          Justification=(Make-Justif @('A.8.7','A.8.8') 'DCs patchés — vulnérabilités corrigées.' -Nis2Art 'Art.21(2)(e)')
          Remediation='Appliquer les KB de sécurité mensuels. Planifier les reboots DC en maintenance window documentée.'
          Targets=@($dc) }
    } catch { ADH @{ Id="D25-Patch::$dc"; Title="Patch check failed ($dc)"; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message; Targets=@($dc) } }
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 12 — CONTRÔLES LOCAUX (DC courant uniquement)
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [12] Contrôles locaux ($LocalDC) ===" 'INFO'

# CHECK-L01 : Audit Policy (auditpol local)
try {
    $ap = (auditpol /get /category:* 2>$null) -join "`n"
    $logon    = $ap -match '(Logon|Ouverture de session).*?(Success and Failure|Succès et échecs)'
    $accMgmt  = $ap -match '(User Account Management|Gestion des comptes).*?(Success and Failure|Succès et échecs)'
    $dirSvc   = $ap -match '(Directory Service Changes|Changements du service d.annuaire).*?(Success|Succès)'
    $privUse  = $ap -match '(Sensitive Privilege Use|Utilisation de privilèges).*?(Success and Failure|Succès et échecs)'
    $polChg   = $ap -match '(Audit Policy Change|Changement de stratégie d.audit).*?(Success and Failure|Succès et échecs)'
    $procCr   = $ap -match '(Process Creation|Création de processus).*?Success'
    $ok = $logon -and $accMgmt -and $dirSvc
    ADH @{ Id='L01-AuditPolicy'; Title='Audit Policy DC — catégories critiques activées'; Pass=$ok; Severity='High'; Category='Audit'
      Evidence="Logon=$logon; AccountMgmt=$accMgmt; DirServiceChanges=$dirSvc; PrivUse=$privUse; PolicyChange=$polChg; ProcessCreate=$procCr"
      Justification=(Make-Justif @('A.5.29','A.8.15') 'Traçabilité complète des opérations critiques sur le DC.' -AnssiRefs 'LOG-DC-1' -Nis2Art 'Art.21(2)(j)')
      Remediation='auditpol /set /category:"Logon/Logoff","Account Management","DS Access","Privilege Use","Policy Change","Detailed Tracking" /success:enable /failure:enable' }
} catch { ADH @{ Id='L01-AuditPolicy'; Title='auditpol check failed'; Pass=$false; Severity='High'; Category='Audit'; Evidence=$_.Exception.Message } }

# CHECK-L02 : Credential Guard / VBS
try {
    $vbs  = Test-RemoteRegistryValue $LocalDC 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard' 'EnableVirtualizationBasedSecurity'
    $cgf  = Test-RemoteRegistryValue $LocalDC 'HKLM:\SYSTEM\CurrentControlSet\Control\DeviceGuard' 'LsaCfgFlags'
    $cgRun = $false
    try {
        $wmi   = Get-CimInstance -Namespace 'root\Microsoft\Windows\DeviceGuard' -ClassName 'Win32_DeviceGuard' -EA Stop
        $cgRun = $wmi.VirtualizationBasedSecurityStatus -in 2,3
        $cgSvc = $wmi.SecurityServicesRunning -contains 1
    } catch {}
    ADH @{ Id='L02-CredentialGuard'; Title='Credential Guard / VBS actif (protection LSASS virtualisée)'; Pass=($vbs -eq 1 -or $cgRun); Severity='High'; Category='OS'
      Evidence="VBS.Enable=$vbs; LsaCfgFlags=$cgf; VBSRunning=$cgRun"
      Justification=(Make-Justif @('A.8.5') 'Isole credentials dans VSM — Mimikatz inopérant sur LSASS.' -AnssiRefs 'VIRT-1')
      Remediation='GPO DeviceGuard : EnableVirtualizationBasedSecurity=1 ; CredentialGuard=1. Nécessite UEFI, TPM 2.0, Secure Boot, Driver compatible.' }
} catch { ADH @{ Id='L02-CredentialGuard'; Title='Credential Guard check failed'; Pass=$false; Severity='High'; Category='OS'; Evidence=$_.Exception.Message } }

# CHECK-L03 : BitLocker partition système
try {
    if (Get-Command Get-BitLockerVolume -EA SilentlyContinue) {
        $blv  = Get-BitLockerVolume -MountPoint $env:SystemDrive -EA Stop
        $prot = ($blv.ProtectionStatus -in 'On', 1)
        $kp   = @($blv.KeyProtector.KeyProtectorType)
        $tpm  = $kp -contains 'Tpm' -or $kp -contains 'TpmPin' -or $kp -contains 'TpmKey'
        ADH @{ Id='L03-BitLocker'; Title='BitLocker actif avec protecteur TPM (partition système DC)'; Pass=($prot -and $tpm); Severity='High'; Category='OS'
          Evidence="ProtectionStatus=$($blv.ProtectionStatus); KeyProtectors=$($kp -join ',')"
          Justification=(Make-Justif @('A.8.23') 'Protection données au repos — partition système DC.')
          Remediation='manage-bde -on C: -RecoveryPassword -TpmAndPin puis manage-bde -protectors -adbackup C: pour escrow clé dans AD.' }
    } else { ADH @{ Id='L03-BitLocker'; Title='BitLocker — Get-BitLockerVolume indisponible'; Pass=$false; Severity='Info'; Category='OS' } }
} catch { ADH @{ Id='L03-BitLocker'; Title='BitLocker check failed'; Pass=$false; Severity='High'; Category='OS'; Evidence=$_.Exception.Message } }

# CHECK-L04 : AppLocker en enforcement
try {
    if (Get-Command Get-AppLockerPolicy -EA SilentlyContinue) {
        $pol  = Get-AppLockerPolicy -Effective -EA Stop
        $enf  = @($pol.RuleCollections | Where-Object { $_.EnforcementMode -eq 'Enforced' })
        ADH @{ Id='L04-AppLocker'; Title="AppLocker en Enforced — $($enf.Count) collection(s) (DC local)"; Pass=($enf.Count -gt 0); Severity='Medium'; Category='OS'
          Evidence="Enforced=$((@($enf | ForEach-Object {$_.RuleCollectionType}) -join ','))"
          Justification=(Make-Justif @('A.8.19') 'Application allowlisting sur le DC — contrôle des exécutables.')
          Remediation='Déployer AppLocker : mode Audit d''abord, puis Enforced pour EXE/MSI/Script. Tester compatibilité AV/EDR.' }
    } else { ADH @{ Id='L04-AppLocker'; Title='AppLocker non disponible'; Pass=$false; Severity='Info'; Category='OS' } }
} catch { ADH @{ Id='L04-AppLocker'; Title='AppLocker check failed'; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message } }

# CHECK-L05 : Defender ASR Rules
try {
    $base  = 'HKLM:\SOFTWARE\Microsoft\Windows Defender\Windows Defender Exploit Guard\ASR\Rules'
    $rules = @(
        @{Id='{d4f940ab-401b-4efc-aadc-ad5f3c50688a}';N='Block Office child processes'}
        @{Id='{3b576869-a4ec-4529-8536-b80a7769e899}';N='Block LSASS credential theft'}
        @{Id='{56a863a9-875e-4185-98a7-b882c64b5ce5}';N='Block WMI persistence'}
        @{Id='{9e6c4e1f-7d60-472f-ba1a-a39ef669e4b3}';N='Block credential stealing LSASS'}
        @{Id='{be9ba2d9-53ea-4cdc-84e5-9b1eeee46550}';N='Block executable content email/webmail'}
        @{Id='{e6db77e5-3df2-4cf1-b95a-636979351e5b}';N='Block persistence through WMI event subscription'}
    )
    $res = @(); $allOk = $true
    foreach ($r in $rules) {
        $v = (Get-ItemProperty -Path $base -Name $r.Id -EA SilentlyContinue).($r.Id)
        if ($v -in '1','2',1,2) { $res += "$($r.N)=ACTIF($v)" }
        else { $res += "$($r.N)=ABSENT"; $allOk = $false }
    }
    ADH @{ Id='L05-Defender-ASR'; Title="Defender ASR Rules critiques actives — $($rules.Count) règles"; Pass=$allOk; Severity='High'; Category='OS'
      Evidence=($res -join ' | ')
      Justification=(Make-Justif @('A.8.7') 'Réduction surface attaque Defender — bloquer vecteurs d''attaque courants.')
      Remediation='Add-MpPreference -AttackSurfaceReductionRules_Ids @(GUID) -AttackSurfaceReductionRules_Actions Block. Valider en mode Audit d''abord.' }
} catch { ADH @{ Id='L05-Defender-ASR'; Title='ASR check failed'; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message } }

# CHECK-L06 : RID 500 (Administrator) renommé ou désactivé
try {
    if ($HAS_AD) {
        $rid500 = Get-ADUser -Filter {adminCount -eq 0} -Properties SamAccountName,SID,Enabled |
            Where-Object { $_.SID -match '-500$' } | Select-Object -First 1
        if ($rid500) {
            $renamed = ($rid500.SamAccountName -notin 'Administrator','Administrateur')
            ADH @{ Id='L06-RID500'; Title='Compte RID-500 renommé ou désactivé'; Pass=($renamed -or -not $rid500.Enabled); Severity='Medium'; Category='Identity'
              Evidence="SamAccountName=$($rid500.SamAccountName); Enabled=$($rid500.Enabled)"
              Justification=(Make-Justif @('A.8.2') 'Compliquer l''attaque par force brute sur le compte admin intégré connu.')
              Remediation='Rename-ADObject ou Rename-ADAccount pour donner un nom non trivial au compte RID-500. Désactiver si inutilisé.' }
        }
    }
} catch { ADH @{ Id='L06-RID500'; Title='RID500 check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-L07 : Computers avec password stale (> 30j)
try {
    if ($HAS_AD) {
        $since = (Get-Date).AddDays(-30)
        $stale = @(Get-ADComputer -Filter { Enabled -eq $true } -Properties PasswordLastSet,Name |
            Where-Object { $_.PasswordLastSet -and $_.PasswordLastSet -lt $since } |
            Select-Object -ExpandProperty Name)
        ADH @{ Id='L07-ComputerStalePassword'; Title="Machines actives avec MDP > 30j — $($stale.Count)"; Pass=($stale.Count -eq 0); Severity='Medium'; Category='Identity'
          Evidence="Count=$($stale.Count); Exemples=$(Join-Sample $stale)"
          Justification=(Make-Justif @('A.8.2') 'Rotation MDP machine confirme que les machines sont actives et gérées.')
          Remediation='Investiguer les machines dont le MDP ne tourne pas (défaut = 30j). Vérifier connectivité réseau et service Netlogon.' }
    }
} catch { ADH @{ Id='L07-ComputerStalePassword'; Title='Stale computer pwd check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 13 — COMPTES UTILISATEURS
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [13] Comptes utilisateurs ===" 'INFO'

# CHECK-U01 : Compte Guest désactivé
try {
    if ($HAS_AD) {
        $g = Get-ADUser -Filter { SamAccountName -eq 'Guest' } -Properties Enabled
        ADH @{ Id='U01-Guest'; Title='Compte Guest désactivé'; Pass=(-not $g.Enabled); Severity='High'; Category='Identity'
          Evidence="Guest.Enabled=$($g.Enabled)"
          Justification=(Make-Justif @('A.8.2') 'Compte anonyme non authentifié — à désactiver systématiquement.')
          Remediation='Disable-ADAccount -Identity Guest' }
    }
} catch { ADH @{ Id='U01-Guest'; Title='Guest check failed'; Pass=$false; Severity='High'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U02 : PasswordNeverExpires (actifs, hors gMSA)
try {
    if ($HAS_AD) {
        $pne = @(Get-ADUser -Filter { PasswordNeverExpires -eq $true -and Enabled -eq $true } -Properties SamAccountName |
            Where-Object { $_.SamAccountName -notlike '*$' } | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U02-PwdNeverExpires'; Title="PasswordNeverExpires sur comptes actifs — $($pne.Count)"; Pass=($pne.Count -eq 0); Severity='High'; Category='Identity'
          Evidence="Count=$($pne.Count); Comptes=$(Join-Sample $pne)"
          Justification=(Make-Justif @('A.8.2') 'MDP sans expiration = surface d''attaque permanente si compromis.' -AnssiRefs 'PAP-MDR')
          Remediation='Pour chaque compte : évaluer la nécessité, activer l''expiration (Set-ADAccountControl -PasswordNeverExpires $false) ou migrer vers gMSA.'
          Targets=$pne }
    }
} catch { ADH @{ Id='U02-PwdNeverExpires'; Title='PasswordNeverExpires check failed'; Pass=$false; Severity='High'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U03 : PasswordNotRequired
try {
    if ($HAS_AD) {
        $pnr = @(Get-ADUser -LDAPFilter '(&(userAccountControl:1.2.840.113556.1.4.803:=32)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))' `
            -Properties SamAccountName | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U03-PwdNotRequired'; Title="Comptes actifs sans MDP requis — $($pnr.Count)"; Pass=($pnr.Count -eq 0); Severity='Critical'; Category='Identity'
          Evidence="Count=$($pnr.Count); Comptes=$(Join-Sample $pnr)"
          Justification=(Make-Justif @('A.8.2','A.8.5') 'PASSWD_NOTREQD = authentification sans MDP — accès non contrôlé.')
          Remediation='Set-ADAccountControl -Identity <compte> -PasswordNotRequired $false. Vérifier l''impact applicatif.'
          Targets=$pnr }
    }
} catch { ADH @{ Id='U03-PwdNotRequired'; Title='PasswordNotRequired check failed'; Pass=$false; Severity='Critical'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U04 : ReversibleEncryption
try {
    if ($HAS_AD) {
        $rev = @(Get-ADUser -LDAPFilter '(userAccountControl:1.2.840.113556.1.4.803:=128)' `
            -Properties SamAccountName | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U04-ReversibleEncryption'; Title="Chiffrement réversible MDP — $($rev.Count)"; Pass=($rev.Count -eq 0); Severity='Critical'; Category='Identity'
          Evidence="Count=$($rev.Count); Comptes=$(Join-Sample $rev)"
          Justification=(Make-Justif @('A.8.5') 'Chiffrement réversible = MDP récupérable en clair dans NTDS.dit.')
          Remediation='Set-ADAccountControl -AllowReversiblePasswordEncryption $false. Forcer renouvellement MDP.'
          Targets=$rev }
    }
} catch { ADH @{ Id='U04-ReversibleEncryption'; Title='Reversible encryption check failed'; Pass=$false; Severity='Critical'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U05 : Comptes inactifs > 90j
try {
    if ($HAS_AD) {
        $since = (Get-Date).AddDays(-90)
        $inact = @(Get-ADUser -Filter { Enabled -eq $true } -Properties LastLogonTimestamp,SamAccountName |
            Where-Object { $null -ne $_.LastLogonTimestamp -and [DateTime]::FromFileTime($_.LastLogonTimestamp) -lt $since } |
            Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U05-Inactive90'; Title="Utilisateurs actifs sans connexion > 90j — $($inact.Count)"; Pass=($inact.Count -eq 0); Severity='Medium'; Category='Identity'
          Evidence="Count=$($inact.Count); Exemples=$(Join-Sample $inact)"
          Justification=(Make-Justif @('A.5.18') 'Revue des accès — déprovisionnement comptes abandonnés.')
          Remediation='Script mensuel : désactiver après 90j sans connexion, archiver après 180j. Coordonner avec RH/RH Lucca.'
          Targets=$inact }
    }
} catch { ADH @{ Id='U05-Inactive90'; Title='Inactive users check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U06 : Kerberoasting (SPN sur user actif, hors gMSA)
try {
    if ($HAS_AD) {
        $krb = @(Get-ADUser -LDAPFilter '(servicePrincipalName=*)' -Properties SamAccountName,PasswordNeverExpires,PasswordLastSet |
            Where-Object { $_.Enabled -and $_.SamAccountName -notlike '*$' } | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U06-Kerberoastable'; Title="Comptes Kerberoastables (SPN sur user) — $($krb.Count)"; Pass=($krb.Count -eq 0); Severity='High'; Category='Identity'
          Evidence="Count=$($krb.Count); Comptes=$(Join-Sample $krb)"
          Justification=(Make-Justif @('A.8.2','A.8.9') 'TGS-REP crack offline possible si MDP faible — pas besoin de privilèges pour Kerberoaster.')
          Remediation='Migrer vers gMSA. Si SPN indispensable : MDP >= 30 cars, rotation < 30j, alertes sur demande TGS. Monitorer avec Semperis/Defender.'
          Targets=$krb }
    }
} catch { ADH @{ Id='U06-Kerberoastable'; Title='Kerberoastable check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U07 : AS-REP Roasting (DoNotRequirePreauth)
try {
    if ($HAS_AD) {
        $asrep = @(Get-ADUser -LDAPFilter '(userAccountControl:1.2.840.113556.1.4.803:=4194304)' `
            -Properties SamAccountName | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U07-ASREPRoast'; Title="Comptes AS-REP Roastables — $($asrep.Count)"; Pass=($asrep.Count -eq 0); Severity='High'; Category='Identity'
          Evidence="Count=$($asrep.Count); Comptes=$(Join-Sample $asrep)"
          Justification=(Make-Justif @('A.8.9') 'Permet d''obtenir un hash AS-REP sans credentials → crack offline.')
          Remediation='Supprimer DONT_REQ_PREAUTH : Set-ADAccountControl -DoesNotRequirePreAuth $false. Contrôler avec Get-ADUser -Filter {DoesNotRequirePreAuth -eq $true}.'
          Targets=$asrep }
    }
} catch { ADH @{ Id='U07-ASREPRoast'; Title='AS-REP Roast check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U08 : Délégation Kerberos non contrainte (hors DCs)
try {
    if ($HAS_AD) {
        $uncU = @(Get-ADUser     -LDAPFilter '(userAccountControl:1.2.840.113556.1.4.803:=524288)' -Properties SamAccountName | Select-Object -ExpandProperty SamAccountName)
        $uncC = @(Get-ADComputer -LDAPFilter '(userAccountControl:1.2.840.113556.1.4.803:=524288)' -Properties Name,UserAccountControl |
            Where-Object { -not ($_.UserAccountControl -band 0x2000 -or $_.UserAccountControl -band 0x1000000) } |
            Select-Object -ExpandProperty Name)
        ADH @{ Id='U08-UnconstrainedDelegation'; Title="Délégation Kerberos non contrainte — $($uncU.Count+$uncC.Count) objets"; Pass=($uncU.Count+$uncC.Count -eq 0); Severity='Critical'; Category='Identity'
          Evidence="Users=$($uncU -join ','); Computers=$($uncC -join ',')"
          Justification=(Make-Justif @('A.8.9') 'Unconstrained = toute machine/user se connectant cède son TGT → impersonation totale.' -AnssiRefs 'DELEG-1')
          Remediation='Set-ADAccountControl -TrustedForDelegation $false sur chaque objet. Utiliser délégation contrainte ou RBCD uniquement vers SPNs précis.'
          Targets=($uncU + $uncC) }
    }
} catch { ADH @{ Id='U08-UnconstrainedDelegation'; Title='Unconstrained delegation check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U09 : AdminSDHolder orphelins (adminCount=1 hors groupes protégés)
try {
    if ($HAS_AD) {
        $pGroups = @('Domain Admins','Enterprise Admins','Schema Admins','Administrators',
                     'Account Operators','Server Operators','Backup Operators','Print Operators')
        $pSIDs = @()
        foreach ($g in $pGroups) { try { $pSIDs += (Get-ADGroup $g -EA Stop).SID.Value } catch {} }
        $ac1   = Get-ADUser -LDAPFilter '(adminCount=1)' -Properties SamAccountName,MemberOf
        $orphs = @($ac1 | Where-Object {
            $mbr = @($_.MemberOf)
            if (-not $mbr) { $true }
            else { $ok = $false; foreach ($dn in $mbr) { try { if ($pSIDs -contains (Get-ADGroup -Identity $dn -EA Stop).SID.Value) { $ok=$true;break } } catch {} }; -not $ok }
        } | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U09-AdminSDHolder'; Title="AdminSDHolder orphelins (adminCount=1 hors groupes protégés) — $($orphs.Count)"; Pass=($orphs.Count -eq 0); Severity='High'; Category='Identity'
          Evidence="Count=$($orphs.Count); Comptes=$(Join-Sample $orphs)"
          Justification=(Make-Justif @('A.8.1','A.8.10') 'SDProp orphelins — ACL restreintes persistantes sur comptes non privilégiés.')
          References=@('https://learn.microsoft.com/troubleshoot/windows-server/identity/adminsdholder-protected-accounts-and-groups')
          Remediation='Réactiver héritage ACL + adminCount=0 : dsacls "<DN>" /resetDefaultDACL puis Set-ADUser -Replace @{adminCount=0}.'
          Targets=$orphs }
    }
} catch { ADH @{ Id='U09-AdminSDHolder'; Title='AdminSDHolder check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U10 : DCSync rights hors Admins/DCs
try {
    if ($HAS_AD) {
        $acl    = (Get-Acl "AD:\$DomainDN").Access
        $dcsync = @($acl | Where-Object {
            $_.ActiveDirectoryRights -match 'ExtendedRight' -and
            $_.ObjectType -in [Guid]'1131f6ad-9c07-11d1-f79f-00c04fc2dcd2',
                              [Guid]'1131f6aa-9c07-11d1-f79f-00c04fc2dcd2' -and
            $_.AccessControlType -eq 'Allow' -and
            $_.IdentityReference -notmatch 'Domain Controllers|Enterprise Domain Controllers|Domain Admins|Enterprise Admins|SYSTEM|Administrators|ENTERPRISE DOMAIN CONTROLLERS'
        } | ForEach-Object { $_.IdentityReference.ToString() }) | Sort-Object -Unique
        ADH @{ Id='U10-DCSync-Rights'; Title="DCSync ACL — aucun compte non-admin avec droit réplication"; Pass=($dcsync.Count -eq 0); Severity='Critical'; Category='AD Core'
          Evidence="Suspects=$(Join-Sample $dcsync)"
          Justification=(Make-Justif @('A.8.1','A.8.10') 'DCSync extrait tous les hashes NT du domaine → compromission totale en quelques secondes.' -AnssiRefs 'DCSYNC-1')
          Remediation='Retirer DS-Replication-Get-Changes-All/Get-Changes de tout compte non-DC via dsacls ou PowerShell : (Get-Acl "AD:\$dn").Access | Where ObjectType -match "1131f6ad"...'
          Targets=$dcsync }
    }
} catch { ADH @{ Id='U10-DCSync-Rights'; Title='DCSync check failed'; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message } }

# CHECK-U11 : SID History
try {
    if ($HAS_AD) {
        $sidh = @(Get-ADUser -LDAPFilter '(sIDHistory=*)' -Properties SamAccountName | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U11-SIDHistory'; Title="Comptes avec SIDHistory — $($sidh.Count)"; Pass=($sidh.Count -eq 0); Severity='Medium'; Category='Identity'
          Evidence="Count=$($sidh.Count); Comptes=$(Join-Sample $sidh)"
          Justification=(Make-Justif @('A.8.2') 'SIDHistory de migrations peut conférer des droits résiduels dans d''anciens domaines.')
          Remediation='Valider puis purger : Set-ADUser -Remove @{sIDHistory=$sidobj} pour chaque entrée obsolète.'
          Targets=$sidh }
    }
} catch { ADH @{ Id='U11-SIDHistory'; Title='SIDHistory check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U12 : Schema Admins vide
try {
    if ($HAS_AD) {
        $sa = @(Get-ADGroupMember 'Schema Admins' -Recursive -EA SilentlyContinue | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U12-SchemaAdmins-Empty'; Title='Schema Admins vide (sauf opérations ponctuelles schéma)'; Pass=($sa.Count -eq 0); Severity='High'; Category='Identity'
          Evidence="Membres=$($sa -join ',')"
          Justification=(Make-Justif @('A.8.1') 'Schema Admins vide en permanence — membres uniquement lors d''extensions de schéma planifiées et documentées.')
          Remediation='Retirer tous les membres. N''ajouter temporairement que lors d''un projet documenté avec CR validé par la Direction.'
          Targets=$sa }
    }
} catch { ADH @{ Id='U12-SchemaAdmins-Empty'; Title='Schema Admins check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U13 : Domain Admins — nombre contrôlé
try {
    if ($HAS_AD) {
        $da = @(Get-ADGroupMember 'Domain Admins' -Recursive -EA SilentlyContinue | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U13-DomainAdmins-Count'; Title="Domain Admins — $($da.Count) membres (cible: <=5)"; Pass=($da.Count -le 5); Severity='High'; Category='Identity'
          Evidence="Membres=$($da -join ',')"
          Justification=(Make-Justif @('A.8.1','A.5.15') 'Moindre privilège sur le groupe le plus puissant du domaine.')
          Remediation='Maintenir uniquement les comptes T0 dédiés. Utiliser PAW/bastion pour les tâches d''administration quotidiennes.'
          Targets=$da }
    }
} catch { ADH @{ Id='U13-DomainAdmins-Count'; Title='DomainAdmins count failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U14 : Domain Admins dans Protected Users
try {
    if ($HAS_AD) {
        $da = @(Get-ADGroupMember 'Domain Admins' -Recursive -EA SilentlyContinue | Select-Object -ExpandProperty SamAccountName)
        $pu = @(Get-ADGroupMember 'Protected Users' -Recursive -EA SilentlyContinue | Select-Object -ExpandProperty SamAccountName)
        $np = @($da | Where-Object { $_ -notin $pu })
        ADH @{ Id='U14-DA-InProtectedUsers'; Title='Domain Admins dans Protected Users'; Pass=($np.Count -eq 0); Severity='Medium'; Category='Identity'
          Evidence="DA hors PU=$(Join-Sample $np)"
          Justification=(Make-Justif @('A.8.1') 'Protected Users interdit NTLM, RC4 et délégation pour les comptes T0.')
          Remediation='Add-ADGroupMember -Identity "Protected Users" -Members (Get-ADGroupMember "Domain Admins" -Recursive | Select-Object -ExpandProperty SamAccountName)'
          Targets=$np }
    }
} catch { ADH @{ Id='U14-DA-InProtectedUsers'; Title='DA-PU check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U15 : gMSA coverage (comptes de service modernes)
try {
    if ($HAS_AD) {
        $gmsa = @(Get-ADServiceAccount -Filter * -EA SilentlyContinue | Select-Object -ExpandProperty Name)
        $svc  = @(Get-ADUser -LDAPFilter '(servicePrincipalName=*)' -Properties SamAccountName |
            Where-Object { $_.Enabled -and $_.SamAccountName -notlike '*$' } | Select-Object -ExpandProperty SamAccountName)
        ADH @{ Id='U15-gMSA-Coverage'; Title="gMSA présents — $($gmsa.Count) gMSA vs $($svc.Count) comptes user avec SPN"; Pass=($gmsa.Count -gt 0 -and $svc.Count -eq 0); Severity='Medium'; Category='Identity'
          Evidence="gMSA=$(Join-Sample $gmsa); UserSPN=$(Join-Sample $svc)"
          Justification=(Make-Justif @('A.8.2') 'gMSA = MDP géré automatiquement (120 chars, rotation auto) — supprime le risque MDP service.')
          Remediation='Migrer les comptes de service vers gMSA : New-ADServiceAccount -DNSHostName $fqdn -Name svc_X. Appliquer Install-ADServiceAccount sur les serveurs concernés.'
          Targets=$svc }
    }
} catch { ADH @{ Id='U15-gMSA-Coverage'; Title='gMSA check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# CHECK-U16 : Ratio admins/users
try {
    if ($HAS_AD) {
        $tot = (Get-ADUser -Filter { Enabled -eq $true } | Measure-Object).Count
        $adm = @()
        foreach ($g in @('Domain Admins','Enterprise Admins','Schema Admins','Administrators')) {
            try { $adm += @(Get-ADGroupMember $g -Recursive -EA SilentlyContinue | Select-Object -ExpandProperty SamAccountName) } catch {}
        }
        $adm     = @($adm | Sort-Object -Unique)
        $ratio   = if ($tot -gt 0) { [Math]::Round($adm.Count / $tot * 100, 1) } else { 0 }
        $ok      = ($ratio -le 5)
        ADH @{ Id='U16-AdminRatio'; Title="Ratio admins/utilisateurs — $ratio% (cible: <=5%)"; Pass=$ok; Severity='Medium'; Category='Identity'
          Evidence="TotalActifs=$tot; TotalAdmins=$($adm.Count); Ratio=$ratio%"
          Justification=(Make-Justif @('A.8.1','A.5.15') 'Ratio élevé = mauvaise hygiène des privilèges. ANSSI recommande < 5%.' -AnssiRefs 'NP-RATIO-1')
          Remediation='Auditer chaque compte admin. Supprimer les memberships non justifiés. Documenter les comptes T0/T1/T2 selon le modèle 3 tiers.' }
    }
} catch { ADH @{ Id='U16-AdminRatio'; Title='Admin ratio check failed'; Pass=$false; Severity='Low'; Category='Identity'; Evidence=$_.Exception.Message } }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 14 — GPO / SYSVOL
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [14] GPO / SYSVOL ===" 'INFO'

# CHECK-G01 : GPP cpassword dans SYSVOL
try {
    $sysvol = "\\$DomainName\SYSVOL"
    if (Test-Path $sysvol) {
        $gppF  = @(Get-ChildItem -Path $sysvol -Recurse -ErrorAction SilentlyContinue `
            -Include 'Groups.xml','Services.xml','ScheduledTasks.xml','DataSources.xml','Printers.xml' |
            Where-Object { (Get-Content $_.FullName -Raw -EA SilentlyContinue) -match 'cpassword' })
        ADH @{ Id='G01-GPP-cpassword'; Title='GPP cpassword absent du SYSVOL'; Pass=($gppF.Count -eq 0); Severity='Critical'; Category='GPO'
          Evidence="Fichiers=$($gppF.FullName -join ' | ')"
          Justification=(Make-Justif @('A.8.10') 'cpassword chiffré avec clé AES Microsoft publique — déchiffrable immédiatement (Get-GPPPassword).')
          References=@('https://support.microsoft.com/kb/2962486')
          Remediation='KB2962486 obligatoire. Purger manuellement les fichiers GPP concernés. Changer TOUS les MDP référencés immédiatement.'
          Targets=($gppF.FullName) }
    } else {
        ADH @{ Id='G01-GPP-cpassword'; Title='SYSVOL inaccessible pour audit GPP'; Pass=$false; Severity='Info'; Category='GPO'; Evidence="$sysvol inaccessible" }
    }
} catch { ADH @{ Id='G01-GPP-cpassword'; Title='GPP cpassword check failed'; Pass=$false; Severity='Low'; Category='GPO'; Evidence=$_.Exception.Message } }

# CHECK-G02 : SYSVOL ACL — scripts lisibles/écriture
try {
    $sysvolScripts = "\\$DomainName\SYSVOL\$DomainName\scripts"
    if (Test-Path $sysvolScripts) {
        $acl    = Get-Acl $sysvolScripts -EA Stop
        $openAcl= @($acl.Access | Where-Object {
            $_.IdentityReference -match 'Everyone|Tout le monde|Authenticated Users|Domain Users|Utilisateurs du domaine' -and
            $_.FileSystemRights  -match 'Write|Modify|FullControl' -and $_.AccessControlType -eq 'Allow'
        })
        $aclDesc2 = @($openAcl | ForEach-Object { '{0}:{1}' -f $_.IdentityReference, $_.FileSystemRights }) -join '; '
        ADH @{ Id='G02-SYSVOL-ACL'; Title='SYSVOL\scripts — pas d''écriture pour groupes larges'; Pass=($openAcl.Count -eq 0); Severity='Critical'; Category='GPO'
          Evidence="ACL suspects=$aclDesc2"
          Justification=(Make-Justif @('A.8.10') 'Écriture SYSVOL\scripts = backdoor GPO exécutée sur toutes les machines.')
          Remediation='icacls \\domain\SYSVOL\domain\scripts /remove "Domain Users" /t. Conserver Admins + SYSTEM + CREATOR OWNER uniquement.' }
    }
} catch { ADH @{ Id='G02-SYSVOL-ACL'; Title='SYSVOL ACL check failed'; Pass=$false; Severity='Low'; Category='GPO'; Evidence=$_.Exception.Message } }

# CHECK-G03 : GPOs non liées (orphelines)
try {
    if ($HAS_AD -and $HAS_GPMC) {
        $allGPOs  = Get-GPO -All -Domain $DomainName -EA Stop
        $unlinked = @($allGPOs | Where-Object {
            ([xml](Get-GPOReport -Guid $_.Id -ReportType XML -Domain $DomainName 2>$null)).GPO.LinksTo -eq $null
        } | Select-Object -ExpandProperty DisplayName)
        ADH @{ Id='G03-GPO-Unlinked'; Title="GPOs non liées — $($unlinked.Count)"; Pass=($unlinked.Count -eq 0); Severity='Low'; Category='GPO'
          Evidence="GPOs=$(Join-Sample $unlinked)"
          Justification=(Make-Justif @('A.8.10') 'GPOs orphelines polluent l''inventaire et peuvent être liées par erreur.')
          Remediation='Supprimer les GPOs non liées après revue : Remove-GPO -Name "..." -Domain $DomainName'
          Targets=$unlinked }
    } else {
        ADH @{ Id='G03-GPO-Unlinked'; Title='GPO orphelines — module GPMC absent'; Pass=$false; Severity='Info'; Category='GPO'; Evidence='Install RSAT-GPMC' }
    }
} catch { ADH @{ Id='G03-GPO-Unlinked'; Title='GPO orphelines check failed'; Pass=$false; Severity='Low'; Category='GPO'; Evidence=$_.Exception.Message } }

# CHECK-G04 : DNS Aging/Scavenging
try {
    if ($HAS_DNS) {
        $zones = @(Get-DnsServerZone -ComputerName $LocalDC -EA Stop |
            Where-Object { -not $_.IsAutoCreated -and $_.ZoneType -eq 'Primary' })
        $noScav = @($zones | Where-Object { -not $_.Aging } | Select-Object -ExpandProperty ZoneName)
        ADH @{ Id='G04-DNS-Scavenging'; Title="DNS Aging/Scavenging activé sur toutes les zones — $($noScav.Count) sans"; Pass=($noScav.Count -eq 0); Severity='Medium'; Category='OS'
          Evidence="Sans scavenging=$(Join-Sample $noScav)"
          Justification=(Make-Justif @('A.8.9') 'Enregistrements DNS périmés = reconnaissance réseau facilitée / confusion des noms.')
          Remediation='Set-DnsServerZoneAging -Name <zone> -Aging $true -RefreshInterval 7.00:00:00 -NoRefreshInterval 7.00:00:00'
          Targets=$noScav }
    } else {
        ADH @{ Id='G04-DNS-Scavenging'; Title='DNS Scavenging — module DnsServer absent'; Pass=$false; Severity='Info'; Category='OS' }
    }
} catch { ADH @{ Id='G04-DNS-Scavenging'; Title='DNS Scavenging check failed'; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message } }

# CHECK-G05 : BitLocker escrow AD
try {
    if ($HAS_AD) {
        $comps  = Get-ADComputer -Filter { Enabled -eq $true } -Properties 'msTPM-OwnerInformation','msTPM-TpmInformationForComputer' -EA Stop
        $withE  = @($comps | Where-Object { $_.'msTPM-OwnerInformation' -or $_.'msTPM-TpmInformationForComputer' })
        $ratio  = if ($comps.Count -gt 0) { [Math]::Round($withE.Count/$comps.Count*100,0) } else { 0 }
        ADH @{ Id='G05-BitLocker-Escrow'; Title="BitLocker escrow TPM dans AD — $ratio%"; Pass=($ratio -ge 80); Severity='Medium'; Category='OS'
          Evidence="Total=$($comps.Count); AvecEscrow=$($withE.Count); SansEscrow=$($comps.Count-$withE.Count); Ratio=$ratio%"
          Justification=(Make-Justif @('A.8.23','A.5.30') 'Clés BitLocker escrow dans AD — garantit récupération après incident.')
          Remediation='manage-bde -protectors -adbackup C: -id <GUID>. GPO : "Do not enable BitLocker until recovery information is stored to AD DS" = Enabled.' }
    }
} catch { ADH @{ Id='G05-BitLocker-Escrow'; Title='BitLocker escrow check failed'; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message } }

# CHECK-G06 : LAPS coverage (toutes machines)
try {
    if ($HAS_AD) {
        $allComp = @(Get-ADComputer -Filter { Enabled -eq $true } -Properties Name)
        $lapsAttr = 'ms-Mcs-AdmPwd'
        $withL = 0; $noL = @()
        foreach ($c in $allComp) {
            try {
                $obj = Get-ADObject -Identity $c.DistinguishedName -Properties $lapsAttr -EA Stop
                if ($obj.$lapsAttr) { $withL++ } else { $noL += $c.Name }
            } catch { $noL += $c.Name }
        }
        $ratio = if ($allComp.Count -gt 0) { [Math]::Round($withL/$allComp.Count*100,0) } else { 0 }
        ADH @{ Id='G06-LAPS-Coverage'; Title="LAPS coverage — $ratio% des machines actives ($withL/$($allComp.Count))"; Pass=($ratio -ge 90); Severity='High'; Category='OS'
          Evidence="AvecLAPS=$withL; SansLAPS=$($noL.Count); Ratio=$ratio%"
          Justification=(Make-Justif @('A.8.2') 'LAPS doit couvrir 100% des machines gérées — MDP admin local unique et rotatif.')
          Remediation='Vérifier GPO LAPS et portée OU. Installer client LAPS (legacy) ou vérifier que Windows LAPS est activé pour les machines manquantes.'
          Targets=$noL }
    }
} catch { ADH @{ Id='G06-LAPS-Coverage'; Title='LAPS coverage check failed'; Pass=$false; Severity='Low'; Category='OS'; Evidence=$_.Exception.Message } }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 15 — PKI / CERTIFICATS (ADSI natif)
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [15] PKI / Certificats ===" 'INFO'

try {
    if ($HAS_AD) {
        $configNC = ([ADSI]"LDAP://RootDSE").configurationNamingContext
        $pkiCont  = "CN=Certificate Templates,CN=Public Key Services,CN=Services,$configNC"
        try {
            $tmpls = Get-ADObject -Filter { ObjectClass -eq 'pKICertificateTemplate' } `
                -SearchBase $pkiCont -Properties pKIExtendedKeyUsage,'msPKI-Certificate-Name-Flag','msPKI-Enrollment-Flag','msPKI-RA-Signature' `
                -Server $DomainName -EA Stop
            $vulns = @()
            foreach ($t in $tmpls) {
                $eku = (NVL $t.pKIExtendedKeyUsage @()) -join ','
                $nf  = [int]($t.'msPKI-Certificate-Name-Flag' -as [string])
                $ef  = [int]($t.'msPKI-Enrollment-Flag'       -as [string])
                $ras = [int]($t.'msPKI-RA-Signature'          -as [string])
                # ESC1 : Client Auth + enrollee supplies subject
                if ($eku -match '1\.3\.6\.1\.5\.5\.7\.3\.2' -and ($nf -band 1)) { $vulns += "ESC1:$($t.Name)" }
                # ESC2 : Any Purpose EKU
                if ($eku -match '2\.5\.29\.37\.0') { $vulns += "ESC2:$($t.Name)" }
                # ESC3 : Certificate Request Agent
                if ($eku -match '1\.3\.6\.1\.4\.1\.311\.20\.2\.1') { $vulns += "ESC3:$($t.Name)" }
                # ESC6 : EDITF_ATTRIBUTESUBJECTALTNAME2 flag 0x40
                if ($ef -band 0x40) { $vulns += "ESC6:$($t.Name)" }
            }
            ADH @{ Id='P01-PKI-ESC'; Title="Templates PKI — vulnérabilités ESC ($(Join-Sample ($vulns | ForEach-Object {($_ -split ':')[0]}) | Sort-Object -Unique))"; Pass=($vulns.Count -eq 0); Severity='Critical'; Category='PKI'
              Evidence="Vulnérabilités=$(Join-Sample $vulns); TemplatesTotal=$($tmpls.Count)"
              Justification=(Make-Justif @('A.8.24','A.5.17') 'ADCS misconfigurations → ESC1-ESC8 permettent élévation vers DA en quelques secondes.' -AnssiRefs 'PKI-ESC1' -Nis2Art 'Art.21(2)(h)')
              References=@('https://posts.specterops.io/certified-pre-owned-d95910965cd2','https://github.com/GhostPack/Certify')
              Remediation='Analyser avec Certify / Certipy. ESC1 : désactiver "Subject Alt Name supplied by requester". ESC2 : retirer Any Purpose. ESC3 : restreindre enrollment. ESC6 : désactiver EDITF_ATTRIBUTESUBJECTALTNAME2 sur la CA.'
              Targets=$vulns }
        } catch { ADH @{ Id='P01-PKI-ESC'; Title='PKI templates check failed'; Pass=$false; Severity='Low'; Category='PKI'; Evidence=$_.Exception.Message } }

        # NTAuth store
        try {
            $nta = Get-ADObject -SearchBase "CN=NTAuthCertificates,CN=Public Key Services,CN=Services,$configNC" `
                -Filter * -Properties cACertificate -EA Stop
            ADH @{ Id='P02-NTAuth'; Title='NTAuthCertificates store présent et non vide'; Pass=($nta -and @($nta.cACertificate).Count -gt 0); Severity='Info'; Category='PKI'
              Evidence="CACertCount=$(@($nta.cACertificate).Count)"
              Justification=(Make-Justif @('A.8.24') 'NTAuth = confiance pour authentification par certificat — garder propre.')
              Remediation='Vérifier que seules les CAs autorisées sont dans NTAuth. Certutil -viewdelstore "NTAuth" pour lister.' }
        } catch { ADH @{ Id='P02-NTAuth'; Title='NTAuth check failed'; Pass=$false; Severity='Low'; Category='PKI'; Evidence=$_.Exception.Message } }
    }
} catch { ADH @{ Id='P00-PKI-Global'; Title='PKI global check failed'; Pass=$false; Severity='Low'; Category='PKI'; Evidence=$_.Exception.Message } }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 16 — MODULES AVANCÉS (FIX BUG-08 : appelés AVANT Stop-Transcript)
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [16] Modules avancés ===" 'INFO'

# M01 : Réplication AD (repadmin par DC)
try {
    Write-Log "  [M01] Réplication AD..." 'INFO'
    $replErrors = @()
    foreach ($dc in $DCs) {
        try {
            $rp = Get-ADReplicationPartnerMetadata -Target $dc -Scope Domain -EA SilentlyContinue
            @($rp | Where-Object { $_.LastReplicationResult -ne 0 }) | ForEach-Object {
                $replErrors += "$dc → $($_.Partner) : code=$($_.LastReplicationResult) | lastOK=$($_.LastReplicationSuccess)"
            }
        } catch { $replErrors += "$dc : PSRemoting failed — $($_.Exception.Message)" }
    }
    ADH @{ Id='M01-Replication'; Title='Santé réplication AD — aucune erreur entre DCs'; Pass=($replErrors.Count -eq 0); Severity='High'; Category='Backup & Recovery'
      Evidence="Erreurs=$($replErrors.Count); $(Join-Sample $replErrors)"
      Justification=(Make-Justif @('A.5.30','A.8.14') 'Convergence annuaire — RTO faible en cas d''incident.') # FIX BUG-09
      Remediation='repadmin /syncall /AdeP sur chaque DC. Consulter repadmin /showrepl et Event ID 1311/1388.' }
} catch { ADH @{ Id='M01-Replication'; Title='Réplication check failed'; Pass=$false; Severity='High'; Category='Backup & Recovery'; Evidence=$_.Exception.Message } }

# M02 : Tombstone Lifetime
try {
    Write-Log "  [M02] Tombstone Lifetime..." 'INFO'
    $cfg = (Get-ADRootDSE).configurationNamingContext
    $ts  = (Get-ADObject "CN=Directory Service,CN=Windows NT,CN=Services,$cfg" -Properties tombstoneLifetime -EA Stop).tombstoneLifetime
    $ts  = if ($ts) { $ts } else { 180 }
    ADH @{ Id='M02-TombstoneLifetime'; Title="Tombstone Lifetime >= 180 jours (actuel : $ts j)"; Pass=($ts -ge 180); Severity='Medium'; Category='Backup & Recovery'
      Evidence="tombstoneLifetime=$ts jours"
      Justification=(Make-Justif @('A.8.13') 'Permettre restauration d''objets supprimés sans authoritative restore.') # FIX BUG-09
      Remediation='Set-ADObject -Identity "CN=Directory Service,CN=Windows NT,CN=Services,<ConfigNC>" -Replace @{tombstoneLifetime=180}' }
} catch { ADH @{ Id='M02-TombstoneLifetime'; Title='Tombstone check failed'; Pass=$false; Severity='Low'; Category='Backup & Recovery'; Evidence=$_.Exception.Message } }

# M03 : RODCs présents sur sites distants
try {
    if ($HAS_AD) {
        Write-Log "  [M03] RODCs..." 'INFO'
        $rodcs = @(Get-ADDomainController -Filter { IsReadOnly -eq $true } -EA SilentlyContinue | Select-Object -ExpandProperty HostName)
        ADH @{ Id='M03-RODC'; Title="RODCs déployés sur sites distants — $($rodcs.Count)"; Pass=($rodcs.Count -ge 1); Severity='Info'; Category='AD Core'
          Evidence="RODCs=$($rodcs -join ',')"
          Justification=(Make-Justif @('A.5.30','A.8.10') 'RODC = réplication en lecture seule pour sites non sécurisés (Ivry, Lançon).')
          Remediation='Déployer RODC sur sites distants. Configurer Filtered Attribute Set (FAS) et Credential Caching Policy.' }
    }
} catch { ADH @{ Id='M03-RODC'; Title='RODC check failed'; Pass=$false; Severity='Low'; Category='AD Core'; Evidence=$_.Exception.Message } }

# M04 : Analyse événements sécurité (24h) — si pas SkipSlowChecks
#       FIX v5.1 : une seule requête WinEvent avec tous les IDs + timeout job 90s
if (-not $SkipSlowChecks) {
    Write-Log "  [M04] Événements sécurité (24h)..." 'INFO'
    try {
        $since = (Get-Date).AddHours(-24)
        $allIds = @(4625, 4740, 4719, 4728, 4732, 4756, 4726, 4723, 4724)

        # Single query with all IDs — runs in a background job with 90s timeout
        # to prevent hanging on DCs with massive Security logs
        $evtJob = Start-Job -ScriptBlock {
            param($ids, $start)
            try {
                $events = @(Get-WinEvent -FilterHashtable @{ LogName='Security'; Id=$ids; StartTime=$start } -MaxEvents 5000 -ErrorAction SilentlyContinue)
                $result = @{}
                foreach ($id in $ids) { $result[$id] = @($events | Where-Object { $_.Id -eq $id }).Count }
                return $result
            } catch { return @{} }
        } -ArgumentList $allIds, $since

        $evtResult = $null
        $completed = $evtJob | Wait-Job -Timeout 90
        if ($completed) {
            $evtResult = Receive-Job $evtJob
        } else {
            Write-Log "  [M04] Timeout 90s atteint — journal Security trop volumineux" 'WARN'
            Stop-Job $evtJob -ErrorAction SilentlyContinue
        }
        Remove-Job $evtJob -Force -ErrorAction SilentlyContinue

        if ($null -ne $evtResult -and $evtResult.Count -gt 0) {
            $fl = [int](NVL $evtResult[4625] 0)
            $lk = [int](NVL $evtResult[4740] 0)
            $pc = [int](NVL $evtResult[4719] 0)
            $du = [int](NVL $evtResult[4728] 0) + [int](NVL $evtResult[4732] 0) + [int](NVL $evtResult[4756] 0)

            ADH @{ Id='M04-FailedLogons'; Title="Échecs connexion (4625) 24h — $fl"; Pass=($fl -le 100); Severity=$(if($fl -gt 500){'High'}elseif($fl -gt 100){'Medium'}else{'Info'}); Category='Security Events'
              Evidence="4625-Logon-Failures=$fl (max 5000 événements analysés)"
              Justification=(Make-Justif @('A.8.5','A.8.15') 'Détection bruteforce / password spray.')
              Remediation='Identifier comptes ciblés (whoami + source IP). Activer Account Lockout. Intégrer alerte SIEM.' }

            ADH @{ Id='M04-AccountLockouts'; Title="Verrouillages (4740) 24h — $lk"; Pass=($lk -le 5); Severity=$(if($lk -gt 20){'High'}elseif($lk -gt 5){'Medium'}else{'Info'}); Category='Security Events'
              Evidence="4740-Lockouts=$lk"
              Justification=(Make-Justif @('A.8.5') 'Indicateur spray ou script compromis avec MDP incorrect.')
              Remediation='LockoutStatus.exe pour identifier la source. Corriger script ou application responsable.' }

            ADH @{ Id='M04-PolicyChanges'; Title="Changements politique (4719) 24h — $pc"; Pass=($pc -eq 0); Severity=$(if($pc -gt 0){'Medium'}else{'Info'}); Category='Security Events'
              Evidence="4719-PolicyChanges=$pc"
              Justification=(Make-Justif @('A.8.15','A.8.17') 'Toute modification de politique de sécurité doit être documentée.')
              Remediation='Valider chaque changement avec CR/Change Management. Alerter RSSI si non planifié.' }

            ADH @{ Id='M04-PrivGroupChanges'; Title="Ajouts groupes privilégiés (4728/4732/4756) 24h — $du"; Pass=($du -eq 0); Severity=$(if($du -gt 0){'High'}else{'Info'}); Category='Security Events'
              Evidence="DA/EA/Schema-GroupAdditions=$du"
              Justification=(Make-Justif @('A.8.1') 'Toute modification de groupe privilégié doit être tracée et validée.')
              Remediation='Revue immédiate si Count>0 hors maintenance planifiée. Configurer alerte SIEM sur 4728/4732/4756.' }
        } else {
            ADH @{ Id='M04-Events'; Title='Événements sécurité — timeout ou log inaccessible'; Pass=$false; Severity='Low'; Category='Security Events'
              Evidence='Requête WinEvent timeout après 90s ou résultat vide. Utiliser -SkipSlowChecks pour ignorer.'
              Remediation='Vérifier la taille du journal Security (wevtutil gl Security). Configurer archivage/rotation.' }
        }
    } catch { ADH @{ Id='M04-Events'; Title='Analyse événements failed'; Pass=$false; Severity='Low'; Category='Security Events'; Evidence=$_.Exception.Message } }
}

# M05 : Inventaire enrichi
if (-not $SkipSlowChecks -and $HAS_AD) {
    Write-Log "  [M05] Inventaire enrichi..." 'INFO'
    try {
        $users = @(Get-ADUser -Filter * -Properties LastLogonDate,PasswordLastSet,PasswordNeverExpires,Enabled,ServicePrincipalNames,LockedOut)
        $comps = @(Get-ADComputer -Filter * -Properties OperatingSystem,LastLogonDate,Enabled,PasswordLastSet)
        $grps  = @(Get-ADGroup -Filter * -Properties GroupCategory,GroupScope,Description)
        $ous   = @(Get-ADOrganizationalUnit -Filter * -Properties gPLink,Description | Sort-Object DistinguishedName)

        $Global:EnhancedInventory.Users     = $users | Select-Object SamAccountName,Enabled,LastLogonDate,PasswordLastSet,PasswordNeverExpires,LockedOut
        $Global:EnhancedInventory.Computers = $comps | Select-Object Name,Enabled,OperatingSystem,LastLogonDate,PasswordLastSet
        $Global:EnhancedInventory.Groups    = $grps  | Select-Object Name,GroupCategory,GroupScope,Description
        $Global:EnhancedInventory.OUs       = $ous   | Select-Object Name,DistinguishedName,Description

        # OS obsolètes
        $obs = @($comps | Where-Object { $_.OperatingSystem -match 'Windows (XP|Vista|7|Server 2003|Server 2008 [^R]|Server 2012 [^R])' -and $_.Enabled })
        ADH @{ Id='M05-ObsoleteOS'; Title="OS obsolètes en production — $($obs.Count)"; Pass=($obs.Count -eq 0); Severity='Critical'; Category='OS'
          Evidence="Count=$($obs.Count); Machines=$(Join-Sample ($obs | Select-Object -ExpandProperty Name))"
          Justification=(Make-Justif @('A.8.7','A.8.8') 'OS EOL = CVEs non patchées en permanence.' -Nis2Art 'Art.21(2)(e)')
          Remediation='Plan de migration/remplacement urgent. Isoler en VLAN dédié avec firewall strict en attendant.'
          Targets=($obs | Select-Object -ExpandProperty Name) }

        Write-Log "  Inventaire : $($users.Count) users, $($comps.Count) computers, $($grps.Count) groups, $($ous.Count) OUs" 'INFO'
    } catch { Write-Log "Inventaire enrichi failed : $_" 'WARN' }
}

# M06 : Purple Knight integration
if ($PurpleKnightReportPath -and (Test-Path $PurpleKnightReportPath)) {
    Write-Log "  [M06] Purple Knight ($PurpleKnightReportPath)..." 'INFO'
    try {
        $pkContent = Get-Content $PurpleKnightReportPath -Raw -EA Stop
        $pkFinds   = @([regex]::Matches($pkContent, '"riskScore"\s*:\s*(\d+)', 'IgnoreCase'))
        $pkHigh    = @($pkFinds | Where-Object { [int]$_.Groups[1].Value -ge 70 })
        ADH @{ Id='M06-PurpleKnight'; Title="Purple Knight — $($pkFinds.Count) findings importés ($($pkHigh.Count) risque élevé)"; Pass=($pkHigh.Count -eq 0); Severity='Info'; Category='Purple Knight'
          Evidence="Fichier=$PurpleKnightReportPath; Findings=$($pkFinds.Count); HighRisk=$($pkHigh.Count)"
          Justification=(Make-Justif @('A.5.28','A.5.29') 'Analyse tierce complémentaire des indicateurs AD.')
          Remediation='Traiter les findings Purple Knight via le plan de remédiation AD. Documenter dans OMS-PRO-INC-001.' }
    } catch { ADH @{ Id='M06-PurpleKnight'; Title='PK import failed'; Pass=$false; Severity='Low'; Category='Purple Knight'; Evidence=$_.Exception.Message } }
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 17 — GÉNÉRATION DES RAPPORTS
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [17] Génération des rapports ===" 'INFO'

# Export JSON
try {
    $Global:Decisions | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $JsonPath -Encoding UTF8
    Write-Log "JSON : $JsonPath" 'SUCCESS'
} catch { Write-Log "Erreur JSON : $_" 'WARN' }

# Export CSV
try {
    $Global:Decisions | Select-Object Id,Title,Passed,Severity,Category,Evidence,Justification,Remediation,Timestamp,
        @{N='References';E={$_.References -join ' | '}},@{N='Targets';E={$_.Targets -join ', '}} |
        Export-Csv -Path $CsvPath -Encoding UTF8 -NoTypeInformation -Delimiter ';'
    Write-Log "CSV : $CsvPath" 'SUCCESS'
} catch { Write-Log "Erreur CSV : $_" 'WARN' }

# Export inventaire enrichi JSON
try {
    @{
        GeneratedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); Domain=$DomainName; RunId=$RunId
        Users=$Global:EnhancedInventory.Users; Computers=$Global:EnhancedInventory.Computers
        Groups=$Global:EnhancedInventory.Groups; OUs=$Global:EnhancedInventory.OUs
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $InventoryPath -Encoding UTF8
    Write-Log "Inventaire : $InventoryPath" 'SUCCESS'
} catch { Write-Log "Erreur inventaire : $_" 'WARN' }

# Export HTML interactif
try {
    $htmlContent = New-HtmlReport -Decisions $Global:Decisions -DomainName $DomainName -RunId $RunId -DCList $DCs
    Set-Content -LiteralPath $HtmlPath -Value $htmlContent -Encoding UTF8
    Write-Log "HTML : $HtmlPath" 'SUCCESS'
} catch { Write-Log "Erreur HTML : $_" 'WARN' }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 18 — EMAIL
# ══════════════════════════════════════════════════════════════════════════════
# SECTION 17b — EXPORT JSON INTRANET (format compatible /api/ad-audit/analyze)
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [17b] Export Intranet ===" 'INFO'

$intranetJsonPath = Join-Path $OutDir "$($OutBaseName)_$RunId.intranet.json"

try {
    # Build structured JSON that matches the backend's analyzeJsonReport() parser
    $passCount  = ($Global:Decisions | Where-Object { $_.Passed -and $_.Severity -ne 'Info' }).Count
    $failCount  = ($Global:Decisions | Where-Object { -not $_.Passed -and $_.Severity -ne 'Info' }).Count

    # Extract password policy from decisions
    $ppDecision = $Global:Decisions | Where-Object { $_.Id -eq 'C06-DomainPasswordPolicy' } | Select-Object -First 1
    $ppEvidence = if ($ppDecision) { $ppDecision.Evidence } else { '' }

    # Parse password policy values from evidence string
    $ppMinLen = 0; $ppLockout = 0; $ppHistory = 0; $ppMaxAge = 0
    if ($ppEvidence -match 'MinLen=(\d+)') { $ppMinLen = [int]$Matches[1] }
    if ($ppEvidence -match 'LockoutThreshold=(\d+)') { $ppLockout = [int]$Matches[1] }
    if ($ppEvidence -match 'History=(\d+)') { $ppHistory = [int]$Matches[1] }
    if ($ppEvidence -match 'MaxAge=(\d+)') { $ppMaxAge = [int]$Matches[1] }

    # Count various items — use ACTUAL check IDs from the script
    # U13-DomainAdmins-Count: Evidence="Membres=user1,user2,user3"
    $adminDecision = $Global:Decisions | Where-Object { $_.Id -eq 'U13-DomainAdmins-Count' } | Select-Object -First 1
    $adminCount = 0
    if ($adminDecision) {
        $membres = ($adminDecision.Evidence -replace '^Membres=', '') -split ','
        $adminCount = @($membres | Where-Object { $_ }).Count
    }

    # U05-Inactive90: Evidence="Count=X; Exemples=..."
    $staleDecision = $Global:Decisions | Where-Object { $_.Id -eq 'U05-Inactive90' } | Select-Object -First 1
    $staleCount = 0
    if ($staleDecision -and $staleDecision.Evidence -match 'Count=(\d+)') { $staleCount = [int]$Matches[1] }

    # U01-Guest: Evidence="Guest.Enabled=False" — count disabled accounts from inventory
    $disabledCount = 0
    if ($Global:EnhancedInventory.Users) {
        $disabledCount = @($Global:EnhancedInventory.Users | Where-Object { -not $_.Enabled }).Count
    }

    # Service accounts count from Kerberoastable check
    $svcAcctCount = 0
    $krbDecision = $Global:Decisions | Where-Object { $_.Id -eq 'U06-Kerberoastable' } | Select-Object -First 1
    if ($krbDecision -and $krbDecision.Evidence -match 'Count=(\d+)') { $svcAcctCount = [int]$Matches[1] }

    # Build intranet-compatible JSON
    $intranetData = @{
        PasswordPolicy = @{
            MinPasswordLength    = $ppMinLen
            LockoutThreshold     = $ppLockout
            PasswordHistoryCount = $ppHistory
            MaxPasswordAge       = $ppMaxAge
        }
        AdminCount       = $adminCount
        StaleAccounts    = $staleCount
        DisabledAccounts = $disabledCount
        LAPSEnabled      = [bool]($Global:Decisions | Where-Object { $_.Id -match 'LAPS' -and $_.Passed })
        BitLockerEnabled = [bool]($Global:Decisions | Where-Object { $_.Id -match 'BitLocker' -and $_.Passed })
        GPOCount         = ($Global:Decisions | Where-Object { $_.Category -eq 'GPO' }).Count
        DNSSECEnabled    = [bool]($Global:Decisions | Where-Object { $_.Id -match 'DNSSEC' -and $_.Passed })
        ServiceAccounts  = $svcAcctCount
        Domain           = $DomainName
        GeneratedAt      = (Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')
        RunId            = $RunId
        Score            = if (($passCount + $failCount) -gt 0) { [Math]::Round($passCount / ($passCount + $failCount) * 100, 1) } else { 0 }
        TotalChecks      = $Global:Decisions.Count
        Decisions        = @($Global:Decisions | ForEach-Object {
            @{
                Id            = $_.Id
                Title         = $_.Title
                Passed        = $_.Passed
                Severity      = $_.Severity
                Category      = $_.Category
                Evidence      = $_.Evidence
                Justification = $_.Justification
                Remediation   = $_.Remediation
            }
        })
    }

    $intranetData | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $intranetJsonPath -Encoding UTF8
    Write-Log "Intranet JSON : $intranetJsonPath" 'SUCCESS'

    # Auto-upload to intranet API if configured
    if ($IntranetApiUrl -and -not $DryRun.IsPresent) {
        Write-Log "Envoi du rapport vers l'intranet : $IntranetApiUrl/ad-audit/analyze" 'INFO'
        try {
            $jsonBody = $intranetData | ConvertTo-Json -Depth 6
            $headers  = @{ 'Content-Type' = 'application/json' }
            $response = Invoke-RestMethod -Uri "$IntranetApiUrl/ad-audit/analyze" -Method POST `
                -Body $jsonBody -Headers $headers -TimeoutSec 30
            Write-Log ("Intranet upload OK — Score: {0}%" -f $response.overallScore) 'SUCCESS'
        } catch {
            Write-Log ("Intranet upload FAILED : {0}" -f $_.Exception.Message) 'WARN'
            Write-Log "Le fichier $intranetJsonPath peut etre importe manuellement via l'interface web." 'INFO'
        }
    }
} catch { Write-Log "Export intranet failed : $_" 'WARN' }

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 18 — EMAIL
# ══════════════════════════════════════════════════════════════════════════════
Write-Log ""; Write-Log "=== [18] Email ===" 'INFO'

$passC = ($Global:Decisions | Where-Object { $_.Passed -and $_.Severity -ne 'Info' }).Count
$failC = ($Global:Decisions | Where-Object { -not $_.Passed -and $_.Severity -ne 'Info' }).Count
$infoC = ($Global:Decisions | Where-Object { $_.Severity -eq 'Info' }).Count
$scoreF= if (($passC+$failC) -gt 0) { [Math]::Round($passC/($passC+$failC)*100,1) } else { 0 }

$mailSubj = "[ISO27001][AD] $DomainName — $(Get-Date -Format 'dd/MM/yyyy') — Score:${scoreF}% FAIL:$failC"
$mailBody = New-ReportEmailHtml -DomainName $DomainName -RunId $RunId `
    -PassCount $passC -FailCount $failC -InfoCount $infoC `
    -Decisions ($Global:Decisions | Sort-Object @{e={if(-not $_.Passed){0}else{1}}},Severity,Id)

$canEmail = (-not $DryRun.IsPresent) -and (-not $NoEmail.IsPresent) -and $SmtpServer -and $SmtpFrom -and ($SmtpTo -or $TestEmail)
if ($canEmail) {
    $rcpt = if ($TestEmail) { $TestEmail } else { $SmtpTo }
    $ok   = Send-ReportMail -SmtpServer $SmtpServer -From $SmtpFrom -To $rcpt `
        -Subject $mailSubj -HtmlBody $mailBody -Attachments @($HtmlPath,$JsonPath,$CsvPath)
    Write-Log ("Email → $rcpt : $(if($ok){'OK'}else{'ECHEC'})") $(if($ok){'SUCCESS'}else{'WARN'})
} else {
    $why = if ($DryRun){'DryRun'} elseif ($NoEmail){'NoEmail'} else {'SMTP non configuré'}
    Write-Log "Email désactivé : $why" 'INFO'
}

# ══════════════════════════════════════════════════════════════════════════════
# SECTION 19 — RÉSUMÉ FINAL
# ══════════════════════════════════════════════════════════════════════════════
$total = $passC + $failC
$crit  = ($Global:Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'Critical' }).Count
$high  = ($Global:Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'High'     }).Count
$med   = ($Global:Decisions | Where-Object { -not $_.Passed -and $_.Severity -eq 'Medium'   }).Count

$maturite = switch ($scoreF) {
    {$_-ge 95}{'5 — Optimisé';break}
    {$_-ge 85}{'4 — Géré quantitativement';break}
    {$_-ge 75}{'3 — Défini';break}
    {$_-ge 60}{'2 — Géré';break}
    default   {'1 — Initial'}
}

Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║              RÉSUMÉ AUDIT ISO 27001:2022 — OMNITECH         ║" -ForegroundColor Cyan
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host ("  ║  Domaine    : {0,-48}║" -f $DomainName) -ForegroundColor Cyan
Write-Host ("  ║  DCs        : {0,-48}║" -f ($DCs -join ', ')) -ForegroundColor Cyan
Write-Host ("  ║  Contrôles  : {0,-48}║" -f "$($Global:Decisions.Count) total | PASS:$passC | FAIL:$failC | INFO:$infoC") -ForegroundColor Cyan
Write-Host ("  ║  Score      : {0,-48}║" -f "${scoreF}% — Niveau $maturite") -ForegroundColor $(if($scoreF -ge 85){'Green'}elseif($scoreF -ge 70){'Yellow'}else{'Red'})
Write-Host ("  ║  Critiques  : {0,-48}║" -f "$crit | Élevés : $high | Moyens : $med") -ForegroundColor $(if($crit -gt 0){'Red'}elseif($high -gt 0){'Yellow'}else{'Green'})
Write-Host "  ╠══════════════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host ("  ║  HTML       : {0,-48}║" -f $HtmlPath) -ForegroundColor Cyan
Write-Host ("  ║  JSON       : {0,-48}║" -f $JsonPath) -ForegroundColor Cyan
Write-Host ("  ║  CSV        : {0,-48}║" -f $CsvPath) -ForegroundColor Cyan
Write-Host ("  ║  Inventaire : {0,-48}║" -f $InventoryPath) -ForegroundColor Cyan
Write-Host ("  ║  Log        : {0,-48}║" -f $AppLogPath) -ForegroundColor Cyan
Write-Host ("  ║  Intranet   : {0,-48}║" -f $intranetJsonPath) -ForegroundColor Cyan
Write-Host "  ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Top 5 actions prioritaires
if ($crit -gt 0 -or $high -gt 0) {
    Write-Host "  TOP ACTIONS PRIORITAIRES :" -ForegroundColor Red
    $Global:Decisions | Where-Object { -not $_.Passed -and $_.Severity -in 'Critical','High' } |
        Sort-Object @{e={if($_.Severity -eq 'Critical'){0}else{1}}} |
        Select-Object -First 5 | ForEach-Object {
            Write-Host ("    [{0}] {1} — {2}" -f $_.Severity.PadRight(8), $_.Id.PadRight(40), $_.Title) -ForegroundColor $(if($_.Severity -eq 'Critical'){'Red'}else{'Yellow'})
        }
    Write-Host ""
}

Stop-Transcript | Out-Null
Write-Host "  Audit terminé. Durée : $('{0:N1}' -f ((Get-Date) - [datetime]::ParseExact($RunId, 'yyyyMMdd_HHmmss', $null)).TotalMinutes) min" -ForegroundColor Green
