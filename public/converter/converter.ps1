# modu HWP -> PDF converter agent (v1)
# Runs at Windows logon (hidden). Asks the platform when to run (schedule set on the settings page),
# converts unconverted HWP/HWPX reports with the installed Hancom Office, and uploads the PDFs.
param([switch]$Once)
$ErrorActionPreference = 'Stop'
$AgentVersion = 'win-1.0'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Config = Get-Content -Raw -Encoding UTF8 (Join-Path $Root 'config.json') | ConvertFrom-Json
$Base = ([string]$Config.baseUrl).TrimEnd('/')
$Headers = @{ Authorization = ('Bearer ' + $Config.token); 'X-Agent-Version' = $AgentVersion }
$LogFile = Join-Path $Root 'converter.log'
$Work = Join-Path $env:TEMP 'modu-hwp-converter'

function Write-Log([string]$m) {
  try {
    if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 2MB)) { Move-Item $LogFile ($LogFile + '.old') -Force }
    Add-Content -Path $LogFile -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m) -Encoding UTF8
  } catch {}
}

function Invoke-Api([string]$Method, [string]$Path, $Body) {
  $p = @{ Uri = ($Base + $Path); Method = $Method; Headers = $Headers; UseBasicParsing = $true; TimeoutSec = 120 }
  if ($null -ne $Body) {
    $p.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5 -Compress))
    $p.ContentType = 'application/json; charset=utf-8'
  }
  return Invoke-RestMethod @p
}

function New-Hwp {
  $h = New-Object -ComObject HWPFrame.HwpObject
  # Hancom security module (optional): suppresses the file-access approval dialog when registered by install.ps1
  try { [void]$h.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule') } catch {}
  # Auto-answer Hancom message boxes so an unattended run does not stop on a dialog
  try { [void]$h.SetMessageBoxMode(0x2FFF1) } catch {}
  return $h
}

function Close-Hwp($h) {
  if ($null -eq $h) { return }
  try { $h.Clear(1) } catch {}
  try { $h.Quit() } catch {}
  try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($h) } catch {}
}

function Convert-One($h, [string]$src, [string]$dst, [string]$ext) {
  $fmt = 'HWP'
  if ($ext -eq 'hwpx') { $fmt = 'HWPX' }
  $opened = $h.Open($src, $fmt, 'forceopen:true;suspendpassword:true;versionwarning:false')
  if (-not $opened) { throw 'open_failed (password, distribution-only or damaged file?)' }
  $saved = $h.SaveAs($dst, 'PDF', '')
  try { $h.Clear(1) } catch {}
  if (-not $saved -or -not (Test-Path $dst)) { throw 'save_pdf_failed' }
}

function Start-Run {
  [void](Invoke-Api 'POST' '/api/converter/run' @{ phase = 'start' })
  $done = 0; $failed = 0
  New-Item -ItemType Directory -Force -Path $Work | Out-Null
  $hwp = $null
  $seen = @{}
  try {
    while ($true) {
      $jobs = Invoke-Api 'GET' '/api/converter/jobs' $null
      $items = @($jobs.items | Where-Object { -not $seen.ContainsKey($_.docId + '|' + $_.sourcePath) })
      if ($items.Count -eq 0) { break }
      if ($null -eq $hwp) { $hwp = New-Hwp }
      foreach ($j in $items) {
        $seen[$j.docId + '|' + $j.sourcePath] = $true
        $src = Join-Path $Work ($j.docId + '.' + $j.ext)
        $dst = Join-Path $Work ($j.docId + '.pdf')
        try {
          Remove-Item $src, $dst -Force -ErrorAction SilentlyContinue
          Invoke-WebRequest -Uri $j.downloadUrl -OutFile $src -UseBasicParsing -TimeoutSec 300 | Out-Null
          Convert-One $hwp $src $dst $j.ext
          $up = Invoke-Api 'POST' '/api/converter/upload' @{ docId = $j.docId }
          Invoke-WebRequest -Uri $up.uploadUrl -Method Put -InFile $dst -ContentType 'application/pdf' -UseBasicParsing -TimeoutSec 300 | Out-Null
          [void](Invoke-Api 'POST' '/api/converter/complete' @{ docId = $j.docId; sourcePath = $j.sourcePath; stagingPath = $up.stagingPath })
          $done++
          Write-Log ('OK ' + $j.docId)
        } catch {
          $failed++
          $msg = $_.Exception.Message
          Write-Log ('FAIL ' + $j.docId + ' ' + $msg)
          try { [void](Invoke-Api 'POST' '/api/converter/fail' @{ docId = $j.docId; sourcePath = $j.sourcePath; error = $msg }) } catch {}
          # Hancom may be stuck after an error - start a fresh instance
          Close-Hwp $hwp
          $hwp = New-Hwp
        } finally {
          Remove-Item $src, $dst -Force -ErrorAction SilentlyContinue
        }
      }
    }
  } finally {
    Close-Hwp $hwp
    try { [void](Invoke-Api 'POST' '/api/converter/run' @{ phase = 'finish'; converted = $done; failed = $failed }) } catch {}
  }
  Write-Log ('RUN converted=' + $done + ' failed=' + $failed)
}

if ($Once) {
  # run-now.cmd: convert right away (the background agent keeps its own schedule)
  Write-Log ('run-now ' + $AgentVersion)
  try { Start-Run } catch { Write-Log ('RUN error ' + $_.Exception.Message); Write-Host $_.Exception.Message }
  exit 0
}

# one background agent per Windows user
$created = $false
$mutex = [System.Threading.Mutex]::new($true, 'Local\ModuHwpConverter', [ref]$created)
if (-not $created) { Write-Log 'already running - exit'; exit 0 }
Write-Log ('agent start ' + $AgentVersion)
while ($true) {
  $sleep = 3600
  try {
    $s = Invoke-Api 'GET' '/api/converter/schedule' $null
    if ($s.runNow) {
      try { Start-Run } catch { Write-Log ('RUN error ' + $_.Exception.Message) }
      $sleep = 60
    } elseif ($s.sleepSeconds) {
      $sleep = [int]$s.sleepSeconds
    }
  } catch {
    Write-Log ('schedule error ' + $_.Exception.Message)
    $sleep = 600
  }
  Start-Sleep -Seconds ([Math]::Max(60, [Math]::Min(3600, $sleep)))
}
