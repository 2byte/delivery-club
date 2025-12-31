@echo off
REM Soft Delivery Client Wrapper for Windows
REM Usage: client.bat <command> [options]

REM Check if bun is installed
where bun >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: Bun is not installed or not in PATH
    echo Please install Bun from https://bun.sh
    exit /b 1
)

REM Check if client.ts exists
if not exist "%~dp0client.ts" (
    echo Error: client.ts not found
    exit /b 1
)

REM Check if config exists
if not exist "%~dp0client.config.json" (
    echo Warning: client.config.json not found
    echo Please copy client.config.example.json to client.config.json and configure it
)

REM Run the client
cd /d "%~dp0"
bun run client.ts %*
