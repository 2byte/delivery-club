@echo off
REM Silent PowerShell launcher for Soft Delivery Client
REM Runs client.exe without showing console window

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0

REM Get all arguments
set ARGS=%*
if "%ARGS%"=="" set ARGS=pull

REM Run client.exe hidden using PowerShell
powershell -WindowStyle Hidden -Command "& '%SCRIPT_DIR%client.exe' %ARGS%; exit $LASTEXITCODE"
