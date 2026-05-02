#!/usr/bin/env bun

/**
 * Soft Delivery Client - Production version with silent mode and file logging
 * Can be compiled to standalone executable for deployment on different machines
 */

import { DeliveryClient } from "./src/DeliveryClient";

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const configPath = process.env.CLIENT_CONFIG || "./client.config.json";

  if (!command) {
    console.log(`
Soft Delivery Client - Production Version

Usage: bun client.ts <command> [options]

Commands:
  status                              Check server status
  push <path>                         Push file or directory to server (shared by default)
  push <path> --no-share              Upload without sharing (stored only, not pullable)
  push <path> --create-link           Create a permanent download link after upload
  push <path> --target-host <host>    Push to specific host
  pull                                Pull new shared files from server (git-style)
  pull-link <token|url>               Download file by permanent link token or URL
  list [for|from]                     List files on server
  sync-status                         Show local sync status
  sync-reset                          Reset sync state

Environment Variables:
  CLIENT_CONFIG       Path to config file (default: ./client.config.json)

Examples:
  bun client.ts push ./myfile.txt
  bun client.ts push ./myfolder                          # Zips and shares directory
  bun client.ts push ./myfile.txt --no-share             # Store only, not pullable
  bun client.ts push ./myfile.txt --create-link          # Returns a permanent download URL
  bun client.ts push ./myfile.txt --target-host host_2
  bun client.ts pull
  bun client.ts pull-link eyJhb...                       # Download by token
  bun client.ts pull-link http://server:3004/link?token=eyJhb...
  bun client.ts sync-status
        `);
    process.exit(0);
  }

  try {
    const client = new DeliveryClient(configPath);

    switch (command) {
      case "status":
        await client.status();
        break;

      case "push":
        if (args.length < 2 || !args[1]) {
          console.error("Usage: push <filepath> [--no-share] [--create-link] [--target-host <hostname>]");
          process.exit(1);
        }
        const share = !args.includes("--no-share");
        const createLink = args.includes("--create-link");
        const targetHostIndex = args.indexOf("--target-host");
        const targetHost =
          targetHostIndex !== -1 && args[targetHostIndex + 1]
            ? args[targetHostIndex + 1]
            : undefined;
        const customFilename = args[2] && !args[2].startsWith("--") ? args[2] : undefined;
        const pushResult = await client.push(
          args[1],
          customFilename as string | undefined,
          share,
          targetHost as string | undefined,
          createLink
        );
        if (pushResult.linkUrl) {
          console.log(`\nDownload link: ${pushResult.linkUrl}`);
        }
        break;

      case "pull":
        await client.pull();
        break;

      case "pull-link":
        if (!args[1]) {
          console.error("Usage: pull-link <token|url>");
          process.exit(1);
        }
        await client.pullByLink(args[1]);
        break;

      case "list":
        const direction = (args[1] as "for" | "from") || "for";
        await client.list(direction);
        break;

      case "sync-status":
        client.syncStatus();
        break;

      case "sync-reset":
        client.resetSync();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
