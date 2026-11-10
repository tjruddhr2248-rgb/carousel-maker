@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo 원고 파일^(.md^)을 이 아이콘 위에 끌어다 놓으세요.
  pause
  exit /b 2
)
node make.mjs "%~1"
if %errorlevel%==0 start "" "%~dp0out\%~n1"
pause
