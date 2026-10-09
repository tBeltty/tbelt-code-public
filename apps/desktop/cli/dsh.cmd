@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
rem The installed application keeps its data in %USERPROFILE%\.tbelt-code (see INSTALLED_APP_HOME_DIR_NAME in src/main.ts).
if "%DSH_HOME%"=="" set "DSH_HOME=%USERPROFILE%\.tbelt-code"
"%~dp0..\..\..\..\tBelt Code.exe" --expose-internals "%~dp0..\..\..\app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js" %*
exit /b %errorlevel%
