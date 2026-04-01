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
  status              Check server status
  push <path>         Push file or directory to server
  push <path> --share Share file with other hosts (available for pull)
  push <path> --target-host <hostname>  Push to specific host
  pull                Pull new files from server (git-style)
  list [for|from]     List files on server
  sync-status         Show local sync status
  sync-reset          Reset sync state
  
Environment Variables:
  CLIENT_CONFIG       Path to config file (default: ./client.config.json)

Examples:
  bun client.ts push ./myfile.txt
  bun client.ts push ./myfolder        # Will zip directory
  bun client.ts push ./myfile.txt --share  # Share with other hosts
  bun client.ts push ./myfile.txt --target-host host_2  # Push to host_2
  bun client.ts pull
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
          console.error("❌ Usage: push <filepath> [--share] [--target-host <hostname>]");
          process.exit(1);
        }
        const share = args.includes("--share");
        const targetHostIndex = args.indexOf("--target-host");
        const targetHost =
          targetHostIndex !== -1 && args[targetHostIndex + 1]
            ? args[targetHostIndex + 1]
            : undefined;
        const customFilename = args[2] && !args[2].startsWith("--") ? args[2] : undefined;
        await client.push(
          args[1],
          customFilename as string | undefined,
          share,
          targetHost as string | undefined
        );
        break;

      case "pull":
        await client.pull();
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
        console.error(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Fatal error: ${error}`);
    process.exit(1);
  }
}

main();
