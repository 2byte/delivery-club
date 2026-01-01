@echo off
REM Soft Delivery Client - Deployment Package Creator
REM Creates a minimal deployment package with exe and minimal node_modules

set RUNTIME_DIR=%~dp0runtime
set BUN_EXE=%RUNTIME_DIR%\bun.exe

REM Check if portable bun exists
if not exist "%BUN_EXE%" (
    echo ERROR: Portable Bun not found at: %BUN_EXE%
    echo Please run install-bun-portable.bat first to install Bun
    echo.
    pause
    exit /b 1
)

REM Create deployment directory
if exist deploy rmdir /s /q deploy >nul 2>&1
mkdir deploy >nul 2>&1
mkdir deploy\node_modules >nul 2>&1

REM Building client.exe...
"%BUN_EXE%" build client.ts --compile --outfile client.exe --external jszip >nul 2>&1

if not exist client.exe (
    echo Error: client.exe not found. Build failed?
    pause
    exit /b 1
)

REM Copying files...
copy client.exe deploy\ >nul 2>&1
copy client.config.example.json deploy\ >nul 2>&1
copy client-silent.vbs deploy\ >nul 2>&1
copy client-silent.bat deploy\ >nul 2>&1
copy package.deploy.json deploy\package.json >nul 2>&1
copy EXE_DEPLOYMENT.md deploy\README.md >nul 2>&1
copy SILENT_MODE.md deploy\ >nul 2>&1

REM Installing minimal dependencies...
cd deploy
"%BUN_EXE%" install --production >nul 2>&1
cd ..

echo.
echo Deployment package created successfully in: deploy\
echo.
echo Package ready for deployment
echo.
pause
