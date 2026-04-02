# Delivery Club Server

Bun-based TypeScript server for receiving, storing, and serving encrypted file deliveries between hosts.

This package exposes the reusable server library from the monorepo. Application bootstrap and environment-specific files stay outside the JSR package.

## JSR

```ts
import { SoftDeliveryServer } from "jsr:@2byte/delivery-club-server";
```

## Runtime Notes

This package is designed for the Bun runtime.

It uses:

- `bun`
- `jsr:@2byte/bun-server`
- `node:fs`
- `node:path`
- `node:crypto`
- `npm:jszip`

## Public API

- `SoftDeliveryServer`
- `SoftDeliveryHost`
- `DeliveryFile`
- `DatabaseFile`
- public server types from `src/SoftDeliveryServer.ts`

## Example

```ts
import { SoftDeliveryServer } from "jsr:@delivery-club/server";

const server = new SoftDeliveryServer({
  hostname: "0.0.0.0",
  port: 3004,
});

server.run();
```

## CLI

The package includes a Bun CLI for host management and quick consumer bootstrap generation.

```bash
# Manage hosts database
bun run deliverierCli.ts list
bun run deliverierCli.ts add --name "host-1" --hostname "host-1.local" --encryption "AES-256" --key "secret"

# Generate .env, .env.example and index.ts for a consumer app
bun run deliverierCli.ts init --dir ./server-app
```

You can also generate bootstrap files programmatically:

```ts
import { ServerScaffoldGenerator } from "jsr:@delivery-club/server";

const generator = new ServerScaffoldGenerator();

generator.createConsumerBootstrap({
  outputDir: "./server-app",
  hostAddress: "0.0.0.0",
  hostPort: 3004,
});
```

## Publishing

Publish this package from the `server/` directory:

```bash
cd server
jsr publish --dry-run
jsr publish
```