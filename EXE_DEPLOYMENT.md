# Soft Delivery Client - EXE Deployment Package

## 📦 What You Need

This package requires:
- `client.exe` (compiled executable)
- `node_modules/` folder with jszip
- `client.config.json` (your configuration)

## 🚀 Quick Setup

### Step 1: Get the Files

You need these files in the same folder:
```
C:\SoftDelivery\
  ├── client.exe
  ├── client.config.json
  ├── node_modules\
  │   ├── jszip\
  │   └── readable-stream\
  └── package.json
```

### Step 2: Install Dependencies (First Time Only)

If you don't have node_modules, create `package.json`:

```json
{
  "type": "module",
  "dependencies": {
    "jszip": "^3.10.1",
    "readable-stream": "^4.7.0"
  }
}
```

Then install:
```bash
bun install
```

### Step 3: Configure

Copy `client.config.example.json` to `client.config.json` and edit:

```json
{
  "serverUrl": "http://your-server:3004",
  "hostname": "computer-name",
  "authKey": "your-secret-key",
  "localStorageDir": "./downloads",
  "logFile": "./logs/client.log",
  "silentMode": false
}
```

### Step 4: Run

```bash
# Check server
client.exe status

# Pull new files
client.exe pull

# Push file
client.exe push myfile.txt

# Push and share with other hosts
client.exe push myfile.txt --share

# Check sync status
client.exe sync-status
```

## ⚙️ Automated Sync (Silent Mode)

### Set Silent Mode

Edit `client.config.json`:
```json
{
  "silentMode": true,
  ...
}
```

### Schedule Automatic Sync

**Option A: Task Scheduler (Simple)**

Create a scheduled task:
```powershell
# Open Task Scheduler
# Or use command line:
schtasks /create /tn "SoftDeliverySync" /tr "C:\SoftDelivery\client.exe pull" /sc hourly /st 09:00
```

**Option B: Task Scheduler (Advanced)**

1. Open Task Scheduler (`taskschd.msc`)
2. Create Basic Task
3. Name: "Soft Delivery Sync"
4. Trigger: Daily / Hourly
5. Action: Start a program
6. Program: `C:\SoftDelivery\client.exe`
7. Arguments: `pull`
8. Start in: `C:\SoftDelivery`

**Option C: Windows Service (Best for 24/7)**

Install NSSM (Non-Sucking Service Manager):
```powershell
# Download NSSM from nssm.cc
# Then install service:
nssm install SoftDeliveryClient "C:\SoftDelivery\client.exe" pull
nssm set SoftDeliveryClient AppDirectory "C:\SoftDelivery"
nssm set SoftDeliveryClient AppStdout "C:\SoftDelivery\logs\service.log"
nssm set SoftDeliveryClient AppStderr "C:\SoftDelivery\logs\service-error.log"
nssm start SoftDeliveryClient
```

## 📝 Logs

Logs are saved to the path in config (default: `./logs/client.log`)

**View logs:**
```bash
# PowerShell
Get-Content logs\client.log -Tail 50

# CMD
type logs\client.log
```

**Log format:**
```
[2025-12-31T10:30:45.123Z] [INFO] Client initialized
[2025-12-31T10:30:46.456Z] [SUCCESS] Downloaded 3 files
[2025-12-31T10:30:47.789Z] [ERROR] Connection failed
```

## 🔧 Troubleshooting

### "Cannot find module 'jszip'"

**Solution:** Ensure `node_modules` folder exists:
```bash
# In the same folder as client.exe:
bun install
```

Or copy `node_modules` from build machine.

### "Authentication failed"

**Check:**
1. `client.config.json` exists
2. `hostname` matches server's delivery_hosts.json
3. `authKey` matches server's key for this host
4. Server is running and accessible

### Files not downloading

```bash
# Check what server has for you
client.exe list for

# Check your sync state
client.exe sync-status

# Reset and try again
client.exe sync-reset
client.exe pull
```

### Logs not appearing

1. Check `logFile` path in config
2. Ensure folder exists (create `logs` folder)
3. Check folder permissions

## 📂 Multiple Machines Setup

Each machine needs unique configuration:

**Machine 1 (client.config.json):**
```json
{
  "hostname": "office-pc-1",
  "authKey": "key-for-office-pc-1",
  ...
}
```

**Machine 2 (client.config.json):**
```json
{
  "hostname": "office-pc-2",
  "authKey": "key-for-office-pc-2",
  ...
}
```

**Important:** Each hostname must be registered on the server using `deliverierCli.ts add`

## 🔐 Security

### Protect Config File

```powershell
# Windows - Restrict access to config file
icacls client.config.json /inheritance:r /grant:r "%USERNAME%:F"
```

### Secure Logs

Logs may contain sensitive information. Keep them secure:
```powershell
icacls logs /inheritance:r /grant:r "%USERNAME%:F"
```

## 📊 Commands Reference

| Command | Description |
|---------|-------------|
| `status` | Check server connection |
| `pull` | Download new files (git-style) |
| `push <file>` | Upload file to server |
| `push <file> --share` | Share file with other hosts |
| `list for` | List files available for pull |
| `list from` | List files you've pushed |
| `sync-status` | Show local sync state |
| `sync-reset` | Reset sync (re-download all) |

## 📦 Portable Installation

Copy entire folder to USB/network share:
```
\\NetworkShare\SoftDelivery\
  ├── client.exe
  ├── client.config.json
  ├── node_modules\
  └── package.json
```

Run from any machine:
```bash
\\NetworkShare\SoftDelivery\client.exe pull
```

## 🔄 Updates

To update the client:
1. Replace `client.exe` with new version
2. Keep existing `client.config.json` and `node_modules`
3. No reconfiguration needed

## 💡 Tips

- Use **silent mode** for automated tasks
- Check **logs** regularly for issues
- Use **sync-reset** if files are out of sync
- Use **--share** flag to distribute files to other machines
- Set up **Task Scheduler** for hands-free operation
