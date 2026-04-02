#!/usr/bin/env bun

import { ClientScaffoldGenerator } from "./src/ClientScaffoldGenerator.ts";
import type { ScaffoldMode } from "./src/ClientScaffoldGenerator.ts";

interface CliParseResult {
  command: string;
  positional: string[];
  options: Record<string, string | boolean>;
}

class DeliveryClientCli {
  private scaffoldGenerator: ClientScaffoldGenerator;

  constructor() {
    this.scaffoldGenerator = new ClientScaffoldGenerator();
  }

  public run(argv: string[]): void {
    const parsed = this.parseCliArgs(argv);

    if (!parsed.command || parsed.command === "help") {
      this.showHelp();
      return;
    }

    switch (parsed.command) {
      case "init":
        this.initClient(parsed.options);
        return;
      default:
        this.exitWithError(`Unknown command: ${parsed.command}`);
    }
  }

  private showHelp(): void {
    console.log(`
Delivery Client CLI

Usage:
  bun clientCli.ts <command> [options]

Commands:
  init        Scaffold client deployment files in a directory
  help        Show this help message

Init options:
  --mode <mode>           Deployment mode (default: ts)
                          ts          TypeScript source, requires Bun
                          exe         Pre-compiled executable launcher
                          ts-portable TypeScript + portable Bun auto-installer
  --dir <path>            Target directory (default: current directory)
  --server-url <url>      Pre-fill serverUrl in config (default: http://localhost:3004)
  --hostname <name>       Pre-fill hostname in config (default: my-host)
  --force                 Overwrite existing files

Examples:
  bun clientCli.ts init
  bun clientCli.ts init --mode ts --dir ./client-app
  bun clientCli.ts init --mode exe --dir ./deploy --server-url http://10.0.0.1:3004 --hostname host_1
  bun clientCli.ts init --mode ts-portable --dir ./portable-client --force
`);
  }

  private parseCliArgs(argv: string[]): CliParseResult {
    const args = argv.slice(2);
    const command = args[0] ?? "";
    const positional: string[] = [];
    const options: Record<string, string | boolean> = {};

    for (let index = 1; index < args.length; index += 1) {
      const token = args[index];
      if (!token) {
        continue;
      }

      if (token.startsWith("--")) {
        const key = token.slice(2);
        const next = args[index + 1];

        if (!next || next.startsWith("--")) {
          options[key] = true;
          continue;
        }

        options[key] = next;
        index += 1;
        continue;
      }

      positional.push(token);
    }

    return { command, positional, options };
  }

  private initClient(options: Record<string, string | boolean>): void {
    const rawMode = typeof options.mode === "string" ? options.mode : "ts";
    const validModes: ScaffoldMode[] = ["ts", "exe", "ts-portable"];

    if (!validModes.includes(rawMode as ScaffoldMode)) {
      this.exitWithError(`Invalid mode: "${rawMode}". Valid modes: ${validModes.join(", ")}`);
    }

    const outputDir = typeof options.dir === "string" ? options.dir : process.cwd();
    const serverUrl = typeof options["server-url"] === "string" ? options["server-url"] : undefined;
    const hostname = typeof options.hostname === "string" ? options.hostname : undefined;

    const result = this.scaffoldGenerator.createClientBootstrap({
      outputDir,
      mode: rawMode as ScaffoldMode,
      serverUrl,
      hostname,
      force: Boolean(options.force),
    });

    console.log(`\nScaffolded delivery client (mode: ${result.mode}) in: ${result.outputDir}`);

    if (result.created.length > 0) {
      console.log("\nCreated:");
      for (const filePath of result.created) {
        console.log(`  - ${filePath}`);
      }
    }

    if (result.skipped.length > 0) {
      console.log("\nSkipped (already exist, use --force to overwrite):");
      for (const filePath of result.skipped) {
        console.log(`  - ${filePath}`);
      }
    }

    this.printNextSteps(result.mode as ScaffoldMode, result.outputDir);
  }

  private printNextSteps(mode: ScaffoldMode, outputDir: string): void {
    console.log("\nNext steps:");
    console.log(`  1. Edit ${outputDir}\\client.config.json`);

    switch (mode) {
      case "ts":
        console.log("  2. bun install");
        console.log("  3. bun client.ts status");
        break;
      case "exe":
        console.log("  2. Place client.exe in the directory");
        console.log("  3. run.bat status");
        break;
      case "ts-portable":
        console.log("  2. run.bat status  (Bun will be downloaded automatically)");
        break;
    }

    console.log();
  }

  private exitWithError(message: string): never {
    console.error(`Error: ${message}`);
    console.error('Run "bun clientCli.ts help" for usage.');
    process.exit(1);
  }
}

const cli = new DeliveryClientCli();
cli.run(process.argv);
