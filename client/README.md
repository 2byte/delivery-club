# Delivery Club Client

Cross-platform TypeScript client for pushing and pulling encrypted files and directory archives.


## Telegram channel
A Telegram channel with interesting software [https://t.me/ithubcoding](https://t.me/ithubcoding)

## Deployment

Three deployment modes are available. Use the CLI to scaffold a ready-to-use setup:

```bash
bun ./node_modules/@delivery-club/client/clientCli.ts init --help
```

---

### Mode 1 — TypeScript source (requires Bun)

Suitable when Bun is already installed on the target machine.

```bash
bun ./node_modules/@delivery-club/client/clientCli.ts init --mode ts \
  --dir ./my-client \
  --server-url http://10.0.0.1:3004 \
  --hostname host_1
```

Generated files:

```
my-client/
  client.ts          # entry point, imports from jsr
  package.json       # dependency on @delivery-club/client
  client.config.json # connection config (fill in authKey)
  README.md
```

Setup on the target:

```bash
cd my-client
bun install
bun client.ts status
bun client.ts pull
bun client.ts push ./file.txt
```

---

### Mode 2 — Pre-compiled executable

Suitable for machines with no runtime. Client runs as a native binary.

**Step 1 — build the executable** (done once, on a dev machine with Bun):

```bash
# Build for Windows
bun ./node_modules/@delivery-club/client/clientCli.ts build --outfile ./deploy/client.exe

# Cross-compile for Linux
bun ./node_modules/@delivery-club/client/clientCli.ts build --target linux --outfile ./deploy/client

# Cross-compile for macOS (Apple Silicon)
bun ./node_modules/@delivery-club/client/clientCli.ts build --target mac-arm --outfile ./deploy/client
```

Available `--target` values: `windows`, `linux`, `mac`, `mac-arm`

**Step 2 — scaffold the deployment directory:**

```bash
bun ./node_modules/@delivery-club/client/clientCli.ts init --mode exe \
  --dir ./deploy \
  --server-url http://10.0.0.1:3004 \
  --hostname host_1
```

Generated files:

```
deploy/
  client.exe         # place the compiled binary here
  run.bat            # launcher (Windows)
  run-silent.vbs     # silent launcher (no console window)
  client.config.json # connection config (fill in authKey)
  README.md
```

Usage on target Windows machine:

```bat
run.bat status
run.bat push C:\path\to\file.txt
run.bat pull
run.bat list
```

For scheduled tasks or background use — call `run-silent.vbs` instead.

---

### Mode 3 — TypeScript + portable Bun (self-contained)

Zero prerequisites — downloads a portable Bun runtime on the first run.

```bash
bun ./node_modules/@delivery-club/client/clientCli.ts init --mode ts-portable \
  --dir ./my-client \
  --server-url http://10.0.0.1:3004 \
  --hostname host_1
```

Generated files:

```
my-client/
  client.ts          # entry point
  package.json       # dependency on @delivery-club/client
  client.config.json # connection config (fill in authKey)
  install-bun.bat    # downloads portable bun to ./runtime/
  run.bat            # auto-installs Bun if missing, then runs
  run-silent.vbs     # silent launcher
  README.md
```

Usage on target Windows machine:

```bat
run.bat status       # Bun is downloaded automatically on first run
run.bat pull
run.bat push C:\path\to\file.txt
```

---

## client.config.json

All modes share the same config format:

```json
{
  "serverUrl": "http://10.0.0.1:3004",
  "hostname": "host_1",
  "authKey": "your-auth-key-from-delivery-hosts-json",
  "localStorageDir": "./downloads",
  "logFile": "./client.log",
  "silentMode": false
}
```

`authKey` must match the key registered for this host in the server's `delivery_hosts.json`.

---

## Client commands

| Command | Description |
|---|---|
| `status` | Check server status |
| `push <path>` | Push file or directory (dirs are zipped automatically) |
| `push <path> --share` | Make the file available for other hosts to pull |
| `push <path> --target-host <id>` | Push to a specific host |
| `pull` | Download new files from the server |
| `list [for\|from]` | List files queued for this host or uploaded from it |
| `sync-status` | Show local sync state |
| `sync-reset` | Reset sync state (re-download on next pull) |

---

## Library API

The package also exports the client library for programmatic use:

```ts
import { DeliveryClient } from "jsr:@delivery-club/client";
import type { ClientConfig } from "jsr:@delivery-club/client";

const client = new DeliveryClient("./client.config.json");
await client.status();
await client.pull();
```

Public exports: `DeliveryClient`, `ZipArchive`, `Logger`, `EncryptionUtils`, `ClientScaffoldGenerator` and all types from `src/types.ts`.

---

## Runtime requirements

Designed for **Bun** and **Node.js** runtimes. Uses `node:fs`, `node:path`, `node:crypto`, `node:child_process`.

Archive creation is platform-aware: PowerShell `Compress-Archive` on Windows, `tar` on Unix-like systems.

For ignore patterns when pushing directories, see [docs/IGNORES_GUIDE.md](./docs/IGNORES_GUIDE.md).

---

## Publishing

```bash
cd client
bunx jsr publish --dry-run
bunx jsr publish
```