@echo off
REM Soft Delivery Client - Deployment Package Creator
REM Creates a minimal deployment package with exe and minimal node_modules

echo Creating deployment package...

REM Create deployment directory
if exist deploy rmdir /s /q deploy
mkdir deploy
mkdir deploy\node_modules

echo Building client.exe...
call bun run build:client:win

if not exist client.exe (
    echo Error: client.exe not found. Build failed?
    exit /b 1
)

echo Copying files...
copy client.exe deploy\
copy client.config.example.json deploy\
copy package.deploy.json deploy\package.json
copy EXE_DEPLOYMENT.md deploy\README.md

echo Installing minimal dependencies...
cd deploy
call bun install --production
cd ..

echo.
echo ========================================
echo Deployment package created in: deploy\
echo ========================================
echo.
echo Package contents:
dir deploy /b
echo.
echo Package size:
powershell -Command "Get-ChildItem -Path deploy -Recurse | Measure-Object -Property Length -Sum | Select-Object @{Name='Size (MB)';Expression={[math]::Round($_.Sum/1MB,2)}}"
echo.
echo To deploy: Copy entire 'deploy' folder to target machine
echo.
