@echo off
cd /d "%~dp0.."
for %%I in ("%~dp0.") do set FOLDER=%%~nxI
echo GRANDSUN layout site - keep this window open
start "" "http://localhost:8080/%FOLDER%/"
where python >nul 2>nul && ( python "%~dp0server.py" & goto :eof )
where py >nul 2>nul && ( py "%~dp0server.py" & goto :eof )
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
