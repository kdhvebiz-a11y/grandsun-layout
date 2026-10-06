@echo off
cd /d "%~dp0"
where git >nul 2>nul || ( echo git not found. Use GitHub Desktop: Commit to main ^> Push origin & pause & goto :eof )
git add -A
git commit -m "update %date% %time%"
git push
echo done - GitHub Pages updates in about 1 minute
pause
