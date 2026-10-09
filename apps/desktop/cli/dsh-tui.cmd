@echo off
rem `dsh-tui [args]` runs `dsh terminal [args]`; `tbelt --version` prints the launcher version.
if /i "%~1"=="--version" "%~dp0dsh.cmd" --version & exit /b %errorlevel%
if /i "%~1"=="-V" "%~dp0dsh.cmd" --version & exit /b %errorlevel%
"%~dp0dsh.cmd" terminal %*
exit /b %errorlevel%
