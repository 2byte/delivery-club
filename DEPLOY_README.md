# Soft Delivery Client - Quick Deploy Package

## What's Included

- `client.ts` - Main client application
- `client.config.example.json` - Configuration template
- `client.bat` - Windows launcher
- `client.sh` - Linux/macOS launcher
- `package.json` - Dependencies

## Quick Setup

### Step 1: Install Bun Runtime
```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# Linux/macOS
curl -fsSL https://bun.sh/install | bash
```

### Step 2: Install Dependencies
```bash
bun install
```

### Step 3: Configure
```bash
# Copy and edit config
cp client.config.example.json client.config.json
# Edit client.config.json with your server details
```

### Step 4: Run

**Windows:**
```bash
client.bat pull
client.bat push ./myfile.txt --share
client.bat sync-status
```

**Linux/macOS:**
```bash
./client.sh pull
./client.sh push ./myfile.txt --share
./client.sh sync-status
```

**Or directly with Bun:**
```bash
bun client.ts pull
```

## Configuration

Edit `client.config.json`:

```json
{
  "serverUrl": "http://your-server:3004",
  "hostname": "machine-name",
  "authKey": "your-encryption-key",
  "localStorageDir": "./downloads",
  "logFile": "./logs/client.log",
  "silentMode": false
}
```

## Silent Mode (Background Operation)

Set `"silentMode": true` in config, then:

**Windows Task Scheduler:**
```powershell
schtasks /create /tn "SoftDeliverySync" /tr "C:\path\to\client.bat pull" /sc hourly
```

**Linux Cron:**
```bash
# Add to crontab (crontab -e)
0 * * * * /path/to/client.sh pull
```

## File Structure After Setup

```
deployment/
  ├── client.ts
  ├── client.config.json       (your config)
  ├── client.bat               (Windows)
  ├── client.sh                (Linux/macOS)
  ├── package.json
  ├── node_modules/            (after bun install)
  ├── downloads/               (pulled files)
  └── logs/                    (client.log)
```

## Commands

- `status` - Check server connection
- `pull` - Download new files (git-style)
- `push <file>` - Upload file to server
- `push <file> --share` - Share file with other hosts
- `list [for|from]` - List files on server
- `sync-status` - Show local sync state
- `sync-reset` - Reset sync (re-download all)

## Troubleshooting

### "Bun is not installed"
Install Bun runtime from https://bun.sh

### "Authentication failed"
Check hostname and authKey in config match server's delivery_hosts.json

### Files not downloading
```bash
# Check sync status
bun client.ts sync-status

# Reset and try again
bun client.ts sync-reset
bun client.ts pull
```

## Why Not .exe?

Bun's compiler has limitations with jszip library. The wrapper script approach:
- ✅ Same functionality
- ✅ Easier updates (just replace client.ts)
- ✅ Smaller deployment size
- ✅ Cross-platform
- ✅ No compilation issues

## Package Size

- Runtime (Bun): ~90MB (one-time install)
- Client code: ~50KB
- Dependencies: ~2MB
- Total per machine: ~92MB (Bun installed once)
