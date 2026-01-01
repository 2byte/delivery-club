@echo off
setlocal enabledelayedexpansion

set RUNTIME_DIR=%~dp0runtime
set LOG_FILE=%~dp0install-bun.log
set BUN_VERSION=latest

REM Очищаем лог
echo [%date% %time%] Starting Bun portable installation > "%LOG_FILE%"

REM Создаем директорию если её нет
if not exist "%RUNTIME_DIR%" (
    mkdir "%RUNTIME_DIR%" 2>>"%LOG_FILE%"
    echo [%date% %time%] Created runtime directory >> "%LOG_FILE%"
)

cd /d "%RUNTIME_DIR%"

echo [%date% %time%] Downloading Bun from GitHub releases... >> "%LOG_FILE%"

REM Скачиваем последнюю версию Bun для Windows
powershell -Command "& {Invoke-WebRequest -Uri 'https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip' -OutFile 'bun.zip'}" >>"%LOG_FILE%" 2>&1

if !ERRORLEVEL! NEQ 0 (
    echo [%date% %time%] ERROR: Failed to download Bun >> "%LOG_FILE%"
    exit /b 1
)

echo [%date% %time%] Extracting Bun... >> "%LOG_FILE%"
powershell -Command "& {Expand-Archive -Path 'bun.zip' -DestinationPath '.' -Force}" >>"%LOG_FILE%" 2>&1

REM Находим и перемещаем bun.exe в корень runtime
for /d %%i in (bun-windows-*) do (
    if exist "%%i\bun.exe" (
        move "%%i\bun.exe" . >>"%LOG_FILE%" 2>&1
        rmdir /s /q "%%i" >>"%LOG_FILE%" 2>&1
    )
)

REM Удаляем архив
del bun.zip >>"%LOG_FILE%" 2>&1

if exist "bun.exe" (
    echo [%date% %time%] SUCCESS: Bun portable installed at %RUNTIME_DIR%\bun.exe >> "%LOG_FILE%"
    bun.exe --version >> "%LOG_FILE%" 2>&1
    echo [%date% %time%] Installation complete >> "%LOG_FILE%"
    exit /b 0
) else (
    echo [%date% %time%] ERROR: bun.exe not found after extraction >> "%LOG_FILE%"
    echo [%date% %time%] Please download manually from: https://bun.sh/ >> "%LOG_FILE%"
    exit /b 1
)
