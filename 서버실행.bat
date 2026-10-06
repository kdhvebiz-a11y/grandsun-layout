@echo off
cd /d "%~dp0.."
echo GRANDSUN layout site - keep this window open
start "" "http://localhost:8080/%%EB%%B0%%B0%%EC%%B9%%98%%EB%%8F%%84/"
where python >nul 2>nul && ( python "%~dp0server.py" & goto :eof )
where py >nul 2>nul && ( py "%~dp0server.py" & goto :eof )
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
