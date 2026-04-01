# Скрытый Запуск Клиента (Silent Mode)

## Быстрый Старт

### 1. Настройте конфиг
Убедитесь что в `client.config.json`:
```json
{
  "silentMode": true,
  "logFile": "./client.log"
}
```

### 2. Запуск без окна консоли

**Вариант A: VBScript (Рекомендуется)**
```cmd
wscript client-silent.vbs pull
wscript client-silent.vbs push file.txt --share
```

**Вариант B: PowerShell**
```cmd
client-silent.bat pull
client-silent.bat push file.txt
```

**Вариант C: Прямой запуск**
```cmd
start /B client.exe pull
```

## Автоматический Запуск (Task Scheduler)

### Способ 1: Через VBScript (Лучший)

1. Откройте Task Scheduler (`taskschd.msc`)
2. Create Basic Task
3. Name: "Soft Delivery Sync"
4. Trigger: Hourly / Daily
5. Action: **Start a program**
   - Program: `C:\Windows\System32\wscript.exe`
   - Arguments: `"C:\path\to\client-silent.vbs" pull`
   - Start in: `C:\path\to\`

### Способ 2: PowerShell через CMD

```powershell
schtasks /create /tn "SoftDeliverySync" /tr "powershell -WindowStyle Hidden -File C:\path\to\client-silent.bat pull" /sc hourly /st 09:00
```

### Способ 3: Командная строка

```cmd
# Создать задачу
schtasks /create /tn "SoftDeliverySync" ^
  /tr "wscript.exe \"C:\SoftDelivery\client-silent.vbs\" pull" ^
  /sc hourly ^
  /ru SYSTEM

# Проверить задачу
schtasks /query /tn "SoftDeliverySync" /fo LIST /v

# Запустить вручную
schtasks /run /tn "SoftDeliverySync"

# Удалить задачу
schtasks /delete /tn "SoftDeliverySync" /f
```

## Настройка через Task Scheduler GUI

### Основные настройки:
- **General Tab:**
  - ☑ Run whether user is logged on or not
  - ☑ Run with highest privileges
  - ☑ Hidden

- **Triggers Tab:**
  - Создать триггер (например, каждый час)
  - ☑ Enabled

- **Actions Tab:**
  - Action: Start a program
  - Program: `wscript.exe`
  - Arguments: `"C:\SoftDelivery\client-silent.vbs" pull`
  - Start in: `C:\SoftDelivery`

- **Conditions Tab:**
  - ☐ Start only if computer is on AC power (для ноутбуков)
  - ☑ Start if computer is idle for... (опционально)

- **Settings Tab:**
  - ☑ Allow task to be run on demand
  - ☑ Run task as soon as possible after a scheduled start is missed
  - If task fails, restart every: 10 minutes
  - Attempt to restart up to: 3 times

## Проверка Работы

### Просмотр логов
```cmd
REM PowerShell
Get-Content client.log -Tail 50 -Wait

REM CMD
type client.log

REM Notepad
notepad client.log
```

### Формат логов
```
[2026-01-01T10:00:00.000Z] [INFO] Client initialized
[2026-01-01T10:00:00.123Z] [INFO] Server: http://server:3004
[2026-01-01T10:00:00.456Z] [INFO] Starting pull operation...
[2026-01-01T10:00:01.789Z] [SUCCESS] Downloaded 3 files
[2026-01-01T10:00:02.012Z] [SUCCESS] Pull complete! Downloaded 3 files
```

### Мониторинг Task Scheduler
```powershell
# Последний результат задачи
schtasks /query /tn "SoftDeliverySync" /fo LIST /v | findstr "Last Result"

# История выполнения (через Event Viewer)
eventvwr.msc
# Перейти: Task Scheduler -> Task Scheduler Library
# Найти задачу -> History tab
```

## Ротация Логов

### Вариант 1: PowerShell Script
Создайте `rotate-log.ps1`:
```powershell
$logFile = "client.log"
$maxSize = 10MB

if ((Get-Item $logFile).Length -gt $maxSize) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Move-Item $logFile "client-$timestamp.log"
    
    # Удалить старые логи (старше 30 дней)
    Get-ChildItem "client-*.log" | 
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | 
        Remove-Item
}
```

Добавьте в Task Scheduler перед основной задачей.

### Вариант 2: В самом клиенте
Можно модифицировать Logger класс для автоматической ротации.

## Использование как Windows Service

### С помощью NSSM (Рекомендуется)

1. Скачайте NSSM: https://nssm.cc/download

2. Установите как сервис:
```cmd
nssm install SoftDeliveryClient wscript.exe
nssm set SoftDeliveryClient Application wscript.exe
nssm set SoftDeliveryClient AppParameters "C:\SoftDelivery\client-silent.vbs" pull
nssm set SoftDeliveryClient AppDirectory C:\SoftDelivery
nssm set SoftDeliveryClient DisplayName "Soft Delivery Client"
nssm set SoftDeliveryClient Description "Automatic file synchronization client"
nssm set SoftDeliveryClient Start SERVICE_AUTO_START

REM Для повторяющегося выполнения каждый час
nssm set SoftDeliveryClient AppThrottle 3600000

nssm start SoftDeliveryClient
```

3. Управление сервисом:
```cmd
REM Статус
nssm status SoftDeliveryClient

REM Остановить
nssm stop SoftDeliveryClient

REM Перезапустить
nssm restart SoftDeliveryClient

REM Удалить
nssm remove SoftDeliveryClient confirm
```

## Troubleshooting

### Задача не запускается
1. Проверьте Event Viewer: `eventvwr.msc`
2. Убедитесь что пути абсолютные (не относительные)
3. Проверьте права доступа к файлам
4. Запустите задачу вручную: `schtasks /run /tn "SoftDeliverySync"`

### Логи не создаются
1. Проверьте путь к `logFile` в config
2. Убедитесь что папка существует или создастся автоматически
3. Проверьте права на запись

### "Access Denied"
Запустите Task Scheduler с правами администратора или используйте учетную запись SYSTEM.

## Примеры Конфигураций

### Каждый час
```cmd
schtasks /create /tn "SyncHourly" /tr "wscript \"C:\path\to\client-silent.vbs\" pull" /sc hourly
```

### Каждые 30 минут
```cmd
schtasks /create /tn "Sync30min" /tr "wscript \"C:\path\to\client-silent.vbs\" pull" /sc minute /mo 30
```

### Каждый день в 9:00
```cmd
schtasks /create /tn "SyncDaily" /tr "wscript \"C:\path\to\client-silent.vbs\" pull" /sc daily /st 09:00
```

### При старте системы
```cmd
schtasks /create /tn "SyncOnStartup" /tr "wscript \"C:\path\to\client-silent.vbs\" pull" /sc onstart /ru SYSTEM
```

### При входе пользователя
```cmd
schtasks /create /tn "SyncOnLogon" /tr "wscript \"C:\path\to\client-silent.vbs\" pull" /sc onlogon
```

## Команды для Разных Операций

```cmd
REM Pull новых файлов
wscript client-silent.vbs pull

REM Push файла с share
wscript client-silent.vbs push "C:\file.txt" --share

REM Проверка статуса
wscript client-silent.vbs status

REM Проверка sync состояния
wscript client-silent.vbs sync-status
```

## Безопасность

### Защита конфига
```cmd
REM Ограничить доступ к config файлу
icacls client.config.json /inheritance:r /grant:r "%USERNAME%:F"
```

### Защита логов
```cmd
REM Ограничить доступ к логам
icacls client.log /inheritance:r /grant:r "%USERNAME%:F"
```

## Мониторинг

### Скрипт проверки последнего запуска
Создайте `check-sync.ps1`:
```powershell
$logFile = "client.log"
$maxAge = (Get-Date).AddHours(-2)

$lastEntry = Get-Content $logFile -Tail 1
if ($lastEntry -match '\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})') {
    $lastRun = [DateTime]::Parse($Matches[1])
    
    if ($lastRun -lt $maxAge) {
        Write-Warning "Last sync was more than 2 hours ago: $lastRun"
        # Можно отправить email или уведомление
    } else {
        Write-Host "Sync is up to date. Last run: $lastRun"
    }
}
```

Добавьте в Task Scheduler для периодической проверки.
