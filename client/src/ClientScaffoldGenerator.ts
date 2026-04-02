import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type ScaffoldMode = "ts" | "exe" | "ts-portable";

export interface ClientScaffoldOptions {
  outputDir?: string;
  force?: boolean;
  mode?: ScaffoldMode;
  serverUrl?: string;
  hostname?: string;
}

export interface ClientScaffoldResult {
  created: string[];
  skipped: string[];
  outputDir: string;
  mode: ScaffoldMode;
}

/**
 * Generates client deployment bootstrap files for different deployment modes:
 * - ts: TypeScript source with bun as runtime
 * - exe: Pre-compiled executable with bat/vbs launchers
 * - ts-portable: TypeScript source with portable bun auto-installer
 */
export class ClientScaffoldGenerator {
  private static readonly DEFAULT_SERVER_URL = "http://localhost:3004";
  private static readonly DEFAULT_HOSTNAME = "my-host";

  public createClientBootstrap(options: ClientScaffoldOptions = {}): ClientScaffoldResult {
    const outputDir = resolve(options.outputDir || process.cwd());
    const force = Boolean(options.force);
    const mode: ScaffoldMode = options.mode ?? "ts";
    const serverUrl = options.serverUrl ?? ClientScaffoldGenerator.DEFAULT_SERVER_URL;
    const hostname = options.hostname ?? ClientScaffoldGenerator.DEFAULT_HOSTNAME;

    this.ensureDirectory(outputDir);

    const templates = this.getTemplates(outputDir, mode, serverUrl, hostname);

    const created: string[] = [];
    const skipped: string[] = [];

    for (const template of templates) {
      if (!force && existsSync(template.path)) {
        skipped.push(template.path);
        continue;
      }
      writeFileSync(template.path, template.content, "utf-8");
      created.push(template.path);
    }

    return { created, skipped, outputDir, mode };
  }

  private getTemplates(
    outputDir: string,
    mode: ScaffoldMode,
    serverUrl: string,
    hostname: string
  ): Array<{ path: string; content: string }> {
    const common = [
      {
        path: join(outputDir, "client.config.json"),
        content: this.getConfigTemplate(serverUrl, hostname),
      },
    ];

    switch (mode) {
      case "ts":
        return [
          ...common,
          { path: join(outputDir, "client.ts"), content: this.getTsClientTemplate() },
          { path: join(outputDir, "package.json"), content: this.getTsPackageJsonTemplate() },
          { path: join(outputDir, "README.md"), content: this.getTsReadmeTemplate() },
        ];

      case "exe":
        return [
          ...common,
          { path: join(outputDir, "run.bat"), content: this.getExeRunBatTemplate() },
          { path: join(outputDir, "run-silent.vbs"), content: this.getSilentVbsTemplate("run.bat") },
          { path: join(outputDir, "README.md"), content: this.getExeReadmeTemplate() },
        ];

      case "ts-portable":
        return [
          ...common,
          { path: join(outputDir, "client.ts"), content: this.getTsClientTemplate() },
          { path: join(outputDir, "package.json"), content: this.getTsPackageJsonTemplate() },
          { path: join(outputDir, "install-bun.bat"), content: this.getInstallBunBatTemplate() },
          { path: join(outputDir, "run.bat"), content: this.getPortableRunBatTemplate() },
          { path: join(outputDir, "run-silent.vbs"), content: this.getSilentVbsTemplate("run.bat") },
          { path: join(outputDir, "README.md"), content: this.getPortableReadmeTemplate() },
        ];
    }
  }

  private ensureDirectory(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  // --- Config ---

  private getConfigTemplate(serverUrl: string, hostname: string): string {
    const config = {
      serverUrl,
      hostname,
      authKey: "your-auth-key-from-delivery-hosts-json",
      localStorageDir: "./downloads",
      logFile: "./client.log",
      silentMode: false,
    };
    return JSON.stringify(config, null, 2) + "\n";
  }

  // --- TS shared templates ---

  private getTsClientTemplate(): string {
    return [
      "#!/usr/bin/env bun",
      "",
      'import { DeliveryClient } from "@delivery-club/client";',
      "",
      "async function main() {",
      "  const args = process.argv.slice(2);",
      "  const command = args[0];",
      '  const configPath = process.env.CLIENT_CONFIG || "./client.config.json";',
      "",
      "  if (!command) {",
      "    console.log(",
      "      `Soft Delivery Client\\n\\n" +
      "Usage: bun client.ts <command>\\n\\n" +
      "Commands:\\n" +
      "  status              Check server status\\n" +
      "  push <path>         Push file or directory\\n" +
      "  push <path> --share Share with other hosts\\n" +
      "  push <path> --target-host <hostname>  Push to specific host\\n" +
      "  pull                Pull new files from server\\n" +
      "  list [for|from]     List files\\n" +
      "  sync-status         Show sync state\\n" +
      "  sync-reset          Reset sync state`",
      "    );",
      "    process.exit(0);",
      "  }",
      "",
      "  const client = new DeliveryClient(configPath);",
      "",
      "  switch (command) {",
      '    case "status":',
      "      await client.status();",
      "      break;",
      "",
      '    case "push": {',
      "      if (!args[1]) {",
      '        console.error("Usage: push <filepath> [--share] [--target-host <hostname>]");',
      "        process.exit(1);",
      "      }",
      '      const share = args.includes("--share");',
      '      const thIdx = args.indexOf("--target-host");',
      "      const targetHost = thIdx !== -1 && args[thIdx + 1] ? args[thIdx + 1] : undefined;",
      '      const customName = args[2] && !args[2].startsWith("--") ? args[2] : undefined;',
      "      await client.push(args[1], customName, share, targetHost);",
      "      break;",
      "    }",
      "",
      '    case "pull":',
      "      await client.pull();",
      "      break;",
      "",
      '    case "list":',
      '      await client.list((args[1] as "for" | "from") || "for");',
      "      break;",
      "",
      '    case "sync-status":',
      "      client.syncStatus();",
      "      break;",
      "",
      '    case "sync-reset":',
      "      client.resetSync();",
      "      break;",
      "",
      "    default:",
      "      console.error(`Unknown command: ${command}`);",
      "      process.exit(1);",
      "  }",
      "}",
      "",
      "main().catch((e) => {",
      "  console.error(`Fatal error: ${e}`);",
      "  process.exit(1);",
      "});",
      "",
    ].join("\n");
  }

  private getTsPackageJsonTemplate(): string {
    const pkg = {
      dependencies: {
        "@delivery-club/client": "npm:jsr:@delivery-club/client",
      },
    };
    return JSON.stringify(pkg, null, 2) + "\n";
  }

  // --- TS mode README ---

  private getTsReadmeTemplate(): string {
    return [
      "# Delivery Client",
      "",
      "Requires [Bun](https://bun.sh) runtime.",
      "",
      "## Setup",
      "",
      "1. Edit `client.config.json` — set `serverUrl`, `hostname`, and `authKey`",
      "2. Install dependencies:",
      "   ```bash",
      "   bun install",
      "   ```",
      "3. Run commands:",
      "   ```bash",
      "   bun client.ts status",
      "   bun client.ts push ./myfile.txt",
      "   bun client.ts pull",
      "   bun client.ts list",
      "   ```",
      "",
    ].join("\n");
  }

  // --- EXE mode templates ---

  private getExeRunBatTemplate(): string {
    return [
      "@echo off",
      "REM Delivery Client launcher",
      "REM Place client.exe in the same directory as this script",
      "",
      "set DIR=%~dp0",
      "",
      'if not exist "%DIR%client.exe" (',
      "    echo ERROR: client.exe not found.",
      "    echo Please place client.exe in the same directory as this script.",
      "    pause",
      "    exit /b 1",
      ")",
      "",
      '"%DIR%client.exe" %*',
      "",
    ].join("\n");
  }

  private getExeReadmeTemplate(): string {
    return [
      "# Delivery Client (Executable)",
      "",
      "No runtime required — uses the pre-compiled `client.exe`.",
      "",
      "## Setup",
      "",
      "1. Place `client.exe` in this directory",
      "2. Edit `client.config.json` — set `serverUrl`, `hostname`, and `authKey`",
      "3. Run commands:",
      "   ```bat",
      "   run.bat status",
      "   run.bat push C:\\path\\to\\file.txt",
      "   run.bat pull",
      "   run.bat list",
      "   ```",
      "   For silent (no console window) use `run-silent.vbs` instead.",
      "",
    ].join("\n");
  }

  // --- Portable Bun mode templates ---

  private getInstallBunBatTemplate(): string {
    return [
      "@echo off",
      "setlocal enabledelayedexpansion",
      "",
      "set RUNTIME_DIR=%~dp0runtime",
      "set LOG_FILE=%~dp0install-bun.log",
      "",
      "echo [%date% %time%] Starting Bun portable installation > \"%LOG_FILE%\"",
      "",
      "if not exist \"%RUNTIME_DIR%\" (",
      "    mkdir \"%RUNTIME_DIR%\" 2>>\"%LOG_FILE%\"",
      ")",
      "",
      "cd /d \"%RUNTIME_DIR%\"",
      "",
      "echo [%date% %time%] Downloading Bun from GitHub releases... >> \"%LOG_FILE%\"",
      "powershell -Command \"Invoke-WebRequest -Uri 'https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip' -OutFile 'bun.zip'\" >>\"%LOG_FILE%\" 2>&1",
      "",
      "if !ERRORLEVEL! NEQ 0 (",
      "    echo [%date% %time%] ERROR: Download failed. Check network and try again. >> \"%LOG_FILE%\"",
      "    type \"%LOG_FILE%\"",
      "    exit /b 1",
      ")",
      "",
      "echo [%date% %time%] Extracting... >> \"%LOG_FILE%\"",
      "powershell -Command \"Expand-Archive -Path 'bun.zip' -DestinationPath '.' -Force\" >>\"%LOG_FILE%\" 2>&1",
      "",
      "for /d %%i in (bun-windows-*) do (",
      "    if exist \"%%i\\bun.exe\" (",
      "        move \"%%i\\bun.exe\" . >>\"%LOG_FILE%\" 2>&1",
      "        rmdir /s /q \"%%i\" >>\"%LOG_FILE%\" 2>&1",
      "    )",
      ")",
      "",
      "del bun.zip >>\"%LOG_FILE%\" 2>&1",
      "",
      "if exist \"bun.exe\" (",
      "    echo [%date% %time%] SUCCESS >> \"%LOG_FILE%\"",
      "    bun.exe --version >> \"%LOG_FILE%\" 2>&1",
      "    echo Bun installed successfully.",
      "    exit /b 0",
      ") else (",
      "    echo [%date% %time%] ERROR: bun.exe not found after extraction >> \"%LOG_FILE%\"",
      "    type \"%LOG_FILE%\"",
      "    exit /b 1",
      ")",
      "",
    ].join("\n");
  }

  private getPortableRunBatTemplate(): string {
    return [
      "@echo off",
      "setlocal",
      "REM Delivery Client runner using portable Bun",
      "",
      "set DIR=%~dp0",
      "set BUN_EXE=%DIR%runtime\\bun.exe",
      "",
      'if not exist "%BUN_EXE%" (',
      "    echo Portable Bun not found. Running installer...",
      '    call "%DIR%install-bun.bat"',
      "    if not exist \"%BUN_EXE%\" (",
      "        echo ERROR: Bun installation failed. Run install-bun.bat manually.",
      "        pause",
      "        exit /b 1",
      "    )",
      ")",
      "",
      'if not exist "%DIR%node_modules" (',
      "    echo Installing dependencies...",
      '    "%BUN_EXE%" install --cwd "%DIR%"',
      ")",
      "",
      '"%BUN_EXE%" "%DIR%client.ts" %*',
      "",
    ].join("\n");
  }

  private getPortableReadmeTemplate(): string {
    return [
      "# Delivery Client (TypeScript + Portable Bun)",
      "",
      "Self-contained setup — downloads a portable Bun runtime on first run.",
      "",
      "## Setup",
      "",
      "1. Edit `client.config.json` — set `serverUrl`, `hostname`, and `authKey`",
      "2. Run any command — Bun will be downloaded automatically:",
      "   ```bat",
      "   run.bat status",
      "   run.bat push C:\\path\\to\\file.txt",
      "   run.bat pull",
      "   run.bat list",
      "   ```",
      "   Or install Bun manually first: `install-bun.bat`",
      "",
      "   For silent (no console window) use `run-silent.vbs` instead.",
      "",
    ].join("\n");
  }

  // --- Shared: silent VBS launcher ---

  private getSilentVbsTemplate(targetBat: string): string {
    return [
      "' Silent launcher — runs the bat file without a visible console window",
      "Dim shell, args, i",
      "Set shell = CreateObject(\"WScript.Shell\")",
      "args = \"\"",
      "For i = 0 To WScript.Arguments.Count - 1",
      "    args = args & \" \" & WScript.Arguments(i)",
      "Next",
      `shell.Run "cmd /c """ & CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName) & "\\${targetBat}"" " & args, 0, False`,
      "",
    ].join("\n");
  }
}
