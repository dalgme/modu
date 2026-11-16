@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0converter.ps1" -Once
echo Done. See converter.log in this folder.
pause
