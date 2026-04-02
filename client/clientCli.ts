#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
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

  public async run(argv: string[]): Promise<void> {
    const parsed = this.parseCliArgs(argv);

    if (!parsed.command || parsed.command === "help") {
      this.showHelp();
      return;
    }

    switch (parsed.command) {
      case "init":
        this.initClient(parsed.options);
        return;
      case "build":
        await this.buildClient(parsed.options);
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
  build       Compile client.ts to a standalone executable
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

Build options:
  --outfile <path>        Output executable path (default: ./client.exe on Windows, ./client elsewhere)
  --target <target>       Build target platform (default: current platform)
                          windows     bun-windows-x64
                          linux       bun-linux-x64
                          mac         bun-darwin-x64
                          mac-arm     bun-darwin-arm64

Examples:
  bun clientCli.ts init
  bun clientCli.ts init --mode ts --dir ./client-app
  bun clientCli.ts init --mode exe --dir ./deploy --server-url http://10.0.0.1:3004 --hostname host_1
  bun clientCli.ts init --mode ts-portable --dir ./portable-client --force
  bun clientCli.ts build --outfile ./deploy/client.exe
  bun clientCli.ts build --target linux --outfile ./deploy/client
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

  private async buildClient(options: Record<string, string | boolean>): Promise<void> {
    const rawTarget = typeof options.target === "string" ? options.target : undefined;
    const bunTarget = this.resolveBunTarget(rawTarget);

    const isWindows = rawTarget === "windows" || (!rawTarget && process.platform === "win32");
    const defaultOutfile = isWindows ? "client.exe" : "client";
    const outfile = resolve(typeof options.outfile === "string" ? options.outfile : defaultOutfile);

    // client.ts lives next to clientCli.ts in the JSR package
    const clientEntryPath = join(import.meta.dirname, "client.ts");

    if (!existsSync(clientEntryPath)) {
      this.exitWithError(`client.ts not found at: ${clientEntryPath}`);
    }

    const args = ["build", clientEntryPath, "--compile", `--outfile=${outfile}`];
    if (rawTarget) {
      args.push(`--target=${bunTarget}`);
    }

    console.log("Building delivery client executable...");
    console.log(`  Source: ${clientEntryPath}`);
    console.log(`  Output: ${outfile}`);
    if (rawTarget) {
      console.log(`  Target: ${bunTarget}`);
    }
    console.log();

    const proc = Bun.spawn(["bun", ...args], {
      stdout: "inherit",
      stderr: "inherit",
      stdin: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      this.exitWithError(`Build failed with exit code ${exitCode}`);
    }

    console.log(`\nBuild successful: ${outfile}`);
  }

  private resolveBunTarget(target: string | undefined): string {
    switch (target) {
      case "windows": return "bun-windows-x64";
      case "linux":   return "bun-linux-x64";
      case "mac":
      case "macos":   return "bun-darwin-x64";
      case "mac-arm":
      case "macos-arm": return "bun-darwin-arm64";
      default: return "bun";
    }
  }

  private exitWithError(message: string): never {
    console.error(`Error: ${message}`);
    console.error('Run "bun clientCli.ts help" for usage.');
    process.exit(1);
  }
}

const cli = new DeliveryClientCli();
cli.run(process.argv).catch((e) => {
  console.error(`Fatal error: ${e}`);
  process.exit(1);
});
