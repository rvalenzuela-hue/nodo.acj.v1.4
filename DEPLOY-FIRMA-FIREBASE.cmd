@echo off
setlocal
cd /d "%~dp0"
echo.
echo NODO - Despliegue del servicio de firma en Firebase
where firebase >nul 2>nul
if errorlevel 1 (
  echo ERROR: Firebase CLI no esta instalado.
  echo Instala con: npm install -g firebase-tools
  pause
  exit /b 1
)
echo Proyecto: sigeac-1fc0c
firebase use sigeac-1fc0c
if errorlevel 1 goto :error
firebase deploy --only functions:manageSigner,functions:signActa,firestore:rules --project sigeac-1fc0c
if errorlevel 1 goto :error
echo.
echo LISTO. Functions de firma desplegadas.
echo Puedes volver al Portal de Firmas y probar nuevamente.
pause
exit /b 0
:error
echo.
echo ERROR: Firebase no pudo desplegar las Functions.
echo Revisa el mensaje que aparece arriba; no es necesario volver a instalar NODO.
pause
exit /b 1
