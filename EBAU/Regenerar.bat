@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\unir-problemas.js
echo.
echo === Fin. Pulsa una tecla para cerrar ===
pause