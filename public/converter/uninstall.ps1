# modu HWP -> PDF converter - uninstall
$Dest = Join-Path $env:LOCALAPPDATA 'ModuHwpConverter'
try { Stop-ScheduledTask -TaskName 'ModuHwpConverter' -ErrorAction SilentlyContinue } catch {}
try { Unregister-ScheduledTask -TaskName 'ModuHwpConverter' -Confirm:$false -ErrorAction SilentlyContinue } catch {}
$vbs = Join-Path ([Environment]::GetFolderPath('Startup')) 'ModuHwpConverter.vbs'
Remove-Item $vbs -Force -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*ModuHwpConverter*converter.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host 'Removed the auto-start. You can delete this folder now:'
Write-Host ('  ' + $Dest)
Read-Host 'Press Enter to close'
