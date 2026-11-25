@echo off
REM Levanta FlowArquitecture en http://localhost:5173 y abre el navegador.
REM Doble clic sobre este archivo. Cerrar esta ventana detiene la app.
title FlowArquitecture - servidor local
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo No se encontro npm en el PATH. Instala Node.js LTS y vuelve a intentar.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias por primera vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo Fallo npm install. Revisa tu conexion o el proxy corporativo.
    echo.
    pause
    exit /b 1
  )
)

start "" http://localhost:5173/
call npm run dev -- --port 5173 --strictPort
pause
