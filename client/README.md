# Delivery Club Client

Cross-platform TypeScript client for pushing and pulling encrypted files and directory archives.

This package exposes the reusable client library from the `client` workspace. The CLI entrypoint is not part of the JSR package.

## JSR

```ts
import { DeliveryClient, ZipArchive, Logger } from "jsr:@2byte/delivery-club-client";
import type { ClientConfig } from "jsr:@2byte/delivery-club-client";
```

## Runtime Notes

This package is designed for Node.js and Bun runtimes.

It uses:

- `node:fs`
- `node:path`
- `node:crypto`
- `node:child_process`

Archive creation is platform-aware:

- Windows: PowerShell `Compress-Archive`
- Unix-like systems: `tar`

## Public API

- `DeliveryClient`
- `ZipArchive`
- `Logger`
- `EncryptionUtils`
- all public types from `src/types.ts`

## Archive Ignore Rules

Directory archiving supports relative-path-aware ignore patterns.

Examples:

```json
{
  "ignores": {
    "push": [
      "node_modules",
      "notify/node_modules",
      "deploy",
      "logs",
      "*.log",
      "*.exe"
    ],
    "pull": []
  }
}
```

See [docs/README.md](./docs/README.md) for the full ignore pattern cheat sheet.

## Example

```ts
import { DeliveryClient } from "jsr:@2byte/delivery-club-client";

const client = new DeliveryClient("./client.config.json");

await client.status();
```

## Publishing

Publish this package from the `client/` directory:

```bash
cd client
jsr publish --dry-run
jsr publish
```