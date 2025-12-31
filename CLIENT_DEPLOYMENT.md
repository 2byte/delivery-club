# Soft Delivery Client - Production Deployment Guide

## Overview
Production client for Soft Delivery Server with silent mode and file logging support. Can be compiled to standalone executable for deployment on different machines.

## Features
- ✅ Configuration file based setup
- ✅ Silent mode operation (no console output)
- ✅ File logging for all operations
- ✅ Git-style pull (only new files)
- ✅ Automatic directory compression (ZIP)
- ✅ AES-256 encryption
- ✅ Sync state tracking

## Configuration

### Setup
1. Copy `client.config.example.json` to `client.config.json`
2. Update configuration with your server details:

```json
{
  "serverUrl": "http://your-server:3004",
  "hostname": "machine1",
  "authKey": "your-encryption-key",
  "localStorageDir": "./downloads",
  "logFile": "./logs/client.log",
  "silentMode": false
}
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `serverUrl` | Server URL with port |
| `hostname` | Host identifier (must match delivery_hosts.json) |
| `authKey` | Encryption key (must match delivery_hosts.json) |
| `localStorageDir` | Directory for downloaded files |
| `logFile` | Path to log file |
| `silentMode` | `true` = no console output, `false` = show output |

## Usage

### Development Mode (with Bun)
```bash
# Check server status
bun client.ts status

# Push file
bun client.ts push ./myfile.txt

# Push directory (auto-zip)
bun client.ts push ./myfolder

# Pull new files
bun client.ts pull

# List files on server
bun client.ts list for

# Check sync status
bun client.ts sync-status

# Reset sync (re-download all)
bun client.ts sync-reset
```

### With Custom Config File
```bash
CLIENT_CONFIG=./custom-config.json bun client.ts pull
```

## Building Standalone Executable

### For Windows (EXE)
```bash
# Build standalone executable
bun build client.ts --compile --outfile client.exe

# Run the executable
client.exe pull

# With custom config
set CLIENT_CONFIG=./config.json && client.exe pull
```

### For Linux
```bash
# Build standalone executable
bun build client.ts --compile --outfile client

# Run the executable
./client pull

# With custom config
CLIENT_CONFIG=./config.json ./client pull
```

### For macOS
```bash
# Build standalone executable
bun build client.ts --compile --outfile client

# Run the executable
./client pull

# With custom config
CLIENT_CONFIG=./config.json ./client pull
```

## Silent Mode Deployment

### Example: Scheduled Task (Windows)
1. Set `silentMode: true` in config
2. Create scheduled task:
```powershell
schtasks /create /tn "SoftDeliverySync" /tr "C:\path\to\client.exe pull" /sc hourly
```

### Example: Cron Job (Linux)
1. Set `silentMode: true` in config
2. Add to crontab:
```bash
# Sync every hour
0 * * * * /path/to/client pull

# Sync every 30 minutes
*/30 * * * * /path/to/client pull
```

### Example: systemd Service (Linux)
Create `/etc/systemd/system/softdelivery-sync.service`:
```ini
[Unit]
Description=Soft Delivery Sync Service
After=network.target

[Service]
Type=oneshot
Environment="CLIENT_CONFIG=/path/to/client.config.json"
ExecStart=/path/to/client pull
WorkingDirectory=/path/to/workdir

[Install]
WantedBy=multi-user.target
```

Create timer `/etc/systemd/system/softdelivery-sync.timer`:
```ini
[Unit]
Description=Soft Delivery Sync Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=30min

[Install]
WantedBy=timers.target
```

Enable:
```bash
systemctl enable softdelivery-sync.timer
systemctl start softdelivery-sync.timer
```

## Log Files

Logs are written to the path specified in `logFile` configuration.

### Log Format
```
[2025-12-31T10:30:45.123Z] [INFO] Client initialized
[2025-12-31T10:30:45.456Z] [INFO] Starting pull operation...
[2025-12-31T10:30:46.789Z] [SUCCESS] Downloaded 5 files
```

### Log Levels
- `INFO` - General information
- `SUCCESS` - Successful operations
- `WARN` - Warnings
- `ERROR` - Errors

### Log Rotation (Recommended)
```bash
# Linux: using logrotate
# Create /etc/logrotate.d/softdelivery
/path/to/logs/client.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```

## Multiple Machine Deployment

### Scenario 1: Same Server, Different Hosts
Each machine has different config:

**Machine 1 (client.config.json)**
```json
{
  "hostname": "machine1",
  "authKey": "key-for-machine1",
  ...
}
```

**Machine 2 (client.config.json)**
```json
{
  "hostname": "machine2",
  "authKey": "key-for-machine2",
  ...
}
```

### Scenario 2: Portable Deployment
1. Build executable for target platform
2. Package with config template
3. Deploy structure:
```
deployment/
  ├── client.exe (or client)
  ├── client.config.example.json
  └── README.txt
```

## Security Best Practices

1. **Protect Config File**
   ```bash
   # Linux/macOS
   chmod 600 client.config.json
   
   # Windows (PowerShell)
   icacls client.config.json /inheritance:r /grant:r "%USERNAME%:F"
   ```

2. **Use Strong Keys**
   - Generate unique keys per host
   - Use at least 16 characters
   - Mix letters, numbers, symbols

3. **Secure Log Files**
   - Store in protected directory
   - Implement log rotation
   - Monitor for sensitive data

## Troubleshooting

### Connection Issues
Check log file for errors:
```bash
tail -f logs/client.log
```

### Authentication Failed
- Verify `hostname` matches entry in server's `delivery_hosts.json`
- Verify `authKey` matches the key in server's database
- Check server URL and port

### Files Not Downloading
- Check sync status: `bun client.ts sync-status`
- Try resetting sync: `bun client.ts sync-reset`
- Verify server has files: `bun client.ts list for`

## Advanced Usage

### Scripting
```bash
#!/bin/bash
# Example: Conditional sync script

# Pull new files
bun client.ts pull

# Check if files were downloaded
if [ $? -eq 0 ]; then
    echo "Sync successful"
    # Process downloaded files
    # ...
else
    echo "Sync failed"
    exit 1
fi
```

### Monitoring
```bash
# Check last sync time
tail -1 downloads/.sync_state.json

# Count downloaded files
cat downloads/.sync_state.json | jq '.downloadedFiles | length'
```

## Performance

- **Network**: Uses HTTP for transport
- **Encryption**: AES-256-CBC with SHA-256 key derivation
- **Compression**: ZIP for directories
- **Memory**: Efficient streaming for large files

## Support

For issues or questions:
1. Check log files first
2. Verify configuration
3. Test server connection: `bun client.ts status`
4. Review sync state: `bun client.ts sync-status`
