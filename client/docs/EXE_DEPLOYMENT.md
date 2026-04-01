# Soft Delivery Client - EXE Deployment Package

## 📦 What You Need

This package requires:
- `client.exe` (compiled executable)
- `client.config.json` (your configuration)

## 🚀 Quick Setup

### Step 1: Get the Files

You need these files in the same folder:
```
C:\ClientDelivery\
  ├── client.exe
  └── client.config.json
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
schtasks /create /tn "ClientDeliverySync" /tr "C:\ClientDelivery\client.exe pull" /sc hourly /st 09:00
```

**Option B: Task Scheduler (Advanced)**

1. Open Task Scheduler (`taskschd.msc`)
2. Create Basic Task
3. Name: "Soft Delivery Sync"
4. Trigger: Daily / Hourly
5. Action: Start a program
6. Program: `C:\ClientDelivery\client.exe`
7. Arguments: `pull`
8. Start in: `C:\ClientDelivery`

**Option C: Windows Service (Best for 24/7)**

Install NSSM (Non-Sucking Service Manager):
```powershell
# Download NSSM from nssm.cc
# Then install service:
nssm install DeliveryClient "C:\ClientDelivery\client.exe" pull
nssm set DeliveryClient AppDirectory "C:\ClientDelivery"
nssm set DeliveryClient AppStdout "C:\ClientDelivery\logs\service.log"
nssm set DeliveryClient AppStderr "C:\ClientDelivery\logs\service-error.log"
nssm start DeliveryClient
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
\\NetworkShare\ClientDelivery\
  ├── client.exe
  └── Client.config.json
```

Run from any machine:
```bash
\\NetworkShare\ClientDelivery\client.exe pull
```

## 🔄 Updates

To update the client:
1. Replace `client.exe` with new version
2. Keep existing `client.config.json`
3. No reconfiguration needed

## 💡 Tips

- Use **silent mode** for automated tasks
- Check **logs** regularly for issues
- Use **sync-reset** if files are out of sync
- Use **--share** flag to distribute files to other machines
- Set up **Task Scheduler** for hands-free operation
