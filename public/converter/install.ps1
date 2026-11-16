# modu HWP -> PDF converter - installer (current Windows user, no admin needed)
$ErrorActionPreference = 'Stop'
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = Join-Path $env:LOCALAPPDATA 'ModuHwpConverter'
$TaskName = 'ModuHwpConverter'

Write-Host '== modu HWP -> PDF converter setup =='
if (-not (Test-Path (Join-Path $Src 'config.json'))) { Write-Host 'config.json is missing. Download the ZIP again from the settings page.'; Read-Host 'Press Enter'; exit 1 }

# 1) Hancom Office automation check
try {
  $h = New-Object -ComObject HWPFrame.HwpObject
  try { $h.Quit() } catch {}
  Write-Host '[OK] Hancom Office (HWPFrame.HwpObject) found'
} catch {
  Write-Host '[ERROR] Hancom Office automation (HWPFrame.HwpObject) was not found on this PC.'
  Write-Host '        Install Hancom Office (Hangul) for Windows and run install.cmd again.'
  Read-Host 'Press Enter'; exit 1
}

# 2) copy files
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
foreach ($f in @('converter.ps1', 'config.json', 'run-now.cmd', 'uninstall.cmd', 'uninstall.ps1', 'README.txt')) {
  $p = Join-Path $Src $f
  if (Test-Path $p) { Copy-Item $p -Destination $Dest -Force }
}
Get-ChildItem $Dest | Unblock-File
Write-Host ('[OK] files copied to ' + $Dest)

# 3) optional Hancom security module (suppresses the file-access approval dialog)
$dll = Get-ChildItem -Path $Src -Filter '*.dll' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'FilePathChecker*' } | Select-Object -First 1
if ($dll) {
  Copy-Item $dll.FullName -Destination $Dest -Force
  $key = 'HKCU:\Software\HNC\HwpAutomation\Modules'
  New-Item -Path $key -Force | Out-Null
  New-ItemProperty -Path $key -Name 'FilePathCheckerModule' -Value (Join-Path $Dest $dll.Name) -PropertyType String -Force | Out-Null
  Write-Host '[OK] Hancom security module registered'
} else {
  Write-Host '[INFO] Hancom security module not included - Hancom may ask "allow file access" once; choose [Allow all].'
}

# 4) start at logon (Task Scheduler, fallback: Startup folder)
$psArgs = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $Dest 'converter.ps1') + '"'
$registered = $false
try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArgs
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User ($env:USERDOMAIN + '\' + $env:USERNAME)
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'modu HWP->PDF converter' -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  $registered = $true
  Write-Host '[OK] registered in Task Scheduler (starts at Windows logon) and started now'
} catch {
  Write-Host ('[INFO] Task Scheduler not available (' + $_.Exception.Message + ') - using the Startup folder instead')
}
if (-not $registered) {
  $startup = [Environment]::GetFolderPath('Startup')
  $vbs = Join-Path $startup 'ModuHwpConverter.vbs'
  $cmd = 'powershell.exe ' + $psArgs
  Set-Content -Path $vbs -Value ('CreateObject("WScript.Shell").Run "' + $cmd.Replace('"', '""') + '", 0, False') -Encoding ASCII
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"' + $vbs + '"')
  Write-Host '[OK] added to the Startup folder and started now'
}
Write-Host ''
Write-Host 'Done. The converter checks at the times set on the platform settings page (default 09:00 / 12:00 / 17:00).'
Write-Host 'To convert right away, run run-now.cmd in the folder below.'
Write-Host ('  ' + $Dest)
Read-Host 'Press Enter to close'
