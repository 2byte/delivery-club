# Building Client Executable

## Building Standalone EXE (Working Solution)

```bash
# Windows
bun run build:client:win

# Linux
bun run build:client:linux

# macOS
bun run build:client:mac
```

## Deployment Structure

Since jszip is external, you need to deploy the executable with node_modules:

```
deployment/
  ├── client.exe                  # Compiled executable (~114MB)
  └── client.config.json          # Your configuration
```

## Deployment Steps

### Option 1: Full Package (Recommended)
1. Build executable: `bun run build:client:win`
2. Copy entire project folder to target machine
3. Configure `client.config.json`
4. Run: `client.exe pull`

### Option 2: Minimal Package
1. Build executable: `bun run build:client:win`
2. Create deployment folder with:
   - `client.exe`
   - `client.config.example.json`
3. On target machine:
   - Copy files
   - Configure client.config.json
   - Run `client.exe pull`

## Silent Mode Deployment

### Windows Task Scheduler
```powershell
# Create scheduled task
schtasks /create /tn "SoftDeliverySync" /tr "C:\path\to\client.exe pull" /sc hourly

# Or with config file
schtasks /create /tn "SoftDeliverySync" /tr "cmd /c cd C:\path\to\client && client.exe pull" /sc hourly
```

### Windows Service (Advanced)
Use NSSM (Non-Sucking Service Manager) to run as service:
```powershell
nssm install SoftDeliveryClient "C:\path\to\client.exe" pull
nssm set SoftDeliveryClient AppDirectory "C:\path\to\client"
nssm start SoftDeliveryClient
```

## File Structure Requirements

The executable needs to find node_modules in one of these locations:
- Same directory as executable
- Parent directory
- Current working directory

**Important:** Always run the executable from its directory or ensure node_modules is accessible.

## Build Output

- **Windows**: ~114MB executable
- **Linux**: ~90-100MB executable  
- **macOS**: ~90-100MB executable

## Troubleshooting

### "Authentication failed"
- Check client.config.json exists and is properly configured
- Verify hostname and authKey match server's delivery_hosts.json

### Logs not appearing
- Check logFile path in config is writable
- Ensure parent directory for logs exists