#!/usr/bin/env bun

/**
 * Soft Delivery Client - Production version with silent mode and file logging
 * Can be compiled to standalone executable for deployment on different machines
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  appendFileSync,
  rmSync,
} from "fs";
import { join, basename, dirname } from "path";
import { spawnSync } from "child_process";

export type ClientFileHooks = {
  onDownloadName?: {
    name: string;
    extractTo: string;
  };
  moves?: {
    byNames?: { [key: string]: string };
  };
};

/**
 * Remote hooks type
 * Keyed by hostname
 */
export type ClientRemoteHooks = {
  [key: string]: ClientFileHooks;
};

/**
 * Client configuration interface
 */
interface ClientConfig {
  serverUrl: string;
  hostname: string;
  authKey: string;
  localStorageDir: string;
  logFile: string;
  silentMode: boolean;
  ignores?: {
    push?: string[];
    pull?: string[];
  };
  sharedHooks?: ClientFileHooks;
  localHooks?: ClientFileHooks;
  remoteHooks?: ClientRemoteHooks;
}

/**
 * Sync state to track downloaded files
 */
interface SyncState {
  downloadedFiles: string[];
  lastSync: string;
}

/**
 * File info from server
 */
interface FileInfo {
  storedName: string;
  originalName: string;
  size: number;
  timestamp: string;
  isDirectory?: boolean;
  hooks?: ClientFileHooks;
}

/**
 * Pull response from server
 */
interface PullResponse {
  totalFiles: number;
  newFiles: FileInfo[];
  count: number;
}

/**
 * List response from server
 */
interface ListResponse {
  hostId: string;
  direction: string;
  files: string[];
  count: number;
}

/**
 * Status response from server
 */
interface StatusResponse {
  status: string;
}

/**
 * Logger class for file and console output
 */
class Logger {
  private logFile: string;
  private silentMode: boolean;

  constructor(logFile: string, silentMode: boolean = false) {
    this.logFile = logFile;
    this.silentMode = silentMode;

    // Ensure log directory exists
    const logDir = dirname(logFile);
    const isCurrentDir = logDir === "." || logDir === "./" || logDir === "";

    if (!existsSync(logDir) && !isCurrentDir) {
      try {
        mkdirSync(logDir, { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create log directory ${logDir} for log file: ${error}`);
      }
    }
  }

  /**
   * Log message to file and optionally console
   */
  log(message: string, level: "INFO" | "ERROR" | "SUCCESS" | "WARN" = "INFO"): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;

    // Always write to file
    try {
      appendFileSync(this.logFile, logMessage + "\n");
    } catch (error) {
      // If can't write to log, output to console anyway
      console.error("Failed to write to log file:", error);
    }

    // Output to console if not in silent mode
    if (!this.silentMode) {
      const emoji =
        {
          INFO: "ℹ️",
          ERROR: "❌",
          SUCCESS: "✅",
          WARN: "⚠️",
        }[level] || "";
      console.log(`${emoji} ${message}`);
    }
  }

  info(message: string): void {
    this.log(message, "INFO");
  }

  error(message: string): void {
    this.log(message, "ERROR");
  }

  success(message: string): void {
    this.log(message, "SUCCESS");
  }

  warn(message: string): void {
    this.log(message, "WARN");
  }
}

/**
 * Encryption utilities class
 */
class EncryptionUtils {
  static createKeyHash(key: string): Buffer {
    return createHash("sha256").update(key).digest();
  }

  static encrypt(data: Buffer, key: string): Buffer {
    const keyHash = this.createKeyHash(key);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", keyHash, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, encrypted]);
  }

  static decrypt(encryptedData: Buffer, key: string): Buffer {
    const keyHash = this.createKeyHash(key);
    const iv = encryptedData.subarray(0, 16);
    const encrypted = encryptedData.subarray(16);

    const decipher = createDecipheriv("aes-256-cbc", keyHash, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

/**
 * Main client class
 */
class SoftDeliveryClient {
  private config: ClientConfig;
  private logger: Logger;
  private trackingFile: string;

  constructor(configPath: string = "./client.config.json") {
    // Load configuration
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    this.config = JSON.parse(readFileSync(configPath, "utf-8"));
    this.logger = new Logger(this.config.logFile, this.config.silentMode);
    this.trackingFile = join(this.config.localStorageDir, ".sync_state.json");

    // Ensure directories exist
    if (!existsSync(this.config.localStorageDir)) {
      try {
        mkdirSync(this.config.localStorageDir, { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create local storage directory: ${error}`);
      }
    }

    this.logger.info("Client initialized");
    this.logger.info(`Server: ${this.config.serverUrl}`);
    this.logger.info(`Hostname: ${this.config.hostname}`);
  }

  /**
   * Create directory if it doesn't exist
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      try {
        mkdirSync(dirPath, { recursive: true });
      } catch (error) {
        this.logger.error(`Failed to create directory ${dirPath}: ${error}`);
        throw new Error(`Failed to create directory ${dirPath}: ${error}`);
      }
    }
  }

  private extractDirWithCheckHook(filename: string): string | null {
    if (this.config.localHooks && this.config?.localHooks?.onDownloadName) {
      const hook = this.config.localHooks.onDownloadName;

      // Check if exists directory for this hook
      this.ensureDirectoryExists(hook.extractTo);
      
      if (hook.name === filename) {
        return hook.extractTo;
      }
    }
    return null;
  }

  /**
   * Load sync state from file
   */
  private loadSyncState(): SyncState {
    if (existsSync(this.trackingFile)) {
      return JSON.parse(readFileSync(this.trackingFile, "utf-8"));
    }
    return { downloadedFiles: [], lastSync: new Date(0).toISOString() };
  }

  /**
   * Save sync state to file
   */
  private saveSyncState(state: SyncState): void {
    writeFileSync(this.trackingFile, JSON.stringify(state, null, 2));
  }

  /**
   * Create zip archive from directory using PowerShell with ignore rules
   */
  private createZipFromDirectory(dirPath: string): Buffer {
    const tempZipPath = join(dirname(dirPath), `temp_${Date.now()}.zip`);
    const tempScriptPath = join(dirname(dirPath), `temp_script_${Date.now()}.ps1`);
    const tempConfigPath = join(dirname(dirPath), `temp_config_${Date.now()}.json`);

    try {
      // PowerShell script for archiving with ignore patterns
      const psScript = `
      param([string]$configPath, [string]$zipPath)

      $config = Get-Content $configPath | ConvertFrom-Json

      $ignoreDirs  = @()
      $ignoreFiles = @()

      foreach ($rule in $config.ignores.push) {
          if ($rule -match '[*?]') { $ignoreFiles += $rule }
          else { $ignoreDirs += $rule }
      }

      function Is-Ignored($item) {
          foreach ($dir in $ignoreDirs) {
              if ($item.FullName -match "\\\\$\{dir\}(\\\\|$)") { return $true }
          }

          if (-not $item.PSIsContainer) {
              foreach ($mask in $ignoreFiles) {
                  if ($item.Name -like $mask) { return $true }
              }
          }
          return $false
      }

      Get-ChildItem . -Recurse -Force |
          Where-Object { -not (Is-Ignored $_) } |
          Compress-Archive -DestinationPath $zipPath -Force
      `;

      // Write temporary script and config files
      writeFileSync(tempScriptPath, psScript);
      writeFileSync(tempConfigPath, JSON.stringify(this.config));

      // Execute PowerShell script
      const result = spawnSync(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-File", tempScriptPath, tempConfigPath, tempZipPath],
        {
          cwd: dirPath,
          encoding: "utf-8",
          windowsHide: true,
        }
      );

      if (result.error || result.status !== 0) {
        const errorMsg = result.stderr || result.error || "Unknown error";
        throw new Error(`Failed to create zip: ${errorMsg}`);
      }

      // Read the created zip file
      const zipData = readFileSync(tempZipPath);

      return zipData;
    } catch (error) {
      throw error;
    } finally {
      // Clean up temporary files
      rmSync(tempZipPath, { force: true });
      rmSync(tempScriptPath, { force: true });
      rmSync(tempConfigPath, { force: true });
    }
  }

  /**
   * Push file or directory to server
   */
  async push(
    filePath: string,
    customFilename: string | undefined = undefined,
    share: boolean = false,
    targetHostname: string | undefined = undefined
  ): Promise<boolean> {
    const targetHost = targetHostname || this.config.hostname;
    this.logger.info(
      `Starting push: ${filePath}${share ? " (shared mode)" : ""}${
        targetHostname ? ` to host: ${targetHostname}` : ""
      }`
    );

    try {
      let fileData: Buffer;
      let isDirectory = false;
      let filename = customFilename || basename(filePath);

      // Check if path is a directory
      if (existsSync(filePath)) {
        const stats = statSync(filePath);

        if (stats.isDirectory()) {
          this.logger.info("Detected directory, creating zip archive...");
          isDirectory = true;

          // Create zip from directory
          fileData = this.createZipFromDirectory(filePath);
          filename = customFilename || `${basename(filePath)}.zip`;
          this.logger.info(`Zip created: ${fileData.length} bytes`);
        } else {
          // Read file normally
          fileData = readFileSync(filePath);
        }
      } else {
        this.logger.error(`Path not found: ${filePath}`);
        return false;
      }

      this.logger.info(`Original size: ${fileData.length} bytes`);

      // Encrypt file
      const encryptedData = EncryptionUtils.encrypt(fileData, this.config.authKey);
      this.logger.info(`Encrypted size: ${encryptedData.length} bytes`);

      // Create form data
      const formData = new FormData();
      formData.append("file", new Blob([encryptedData]), "encrypted.bin");
      formData.append("filename", filename);
      formData.append("isDirectory", isDirectory.toString());
      formData.append("share", share.toString());

      // Check if we have remoteHooks for the target host
      if (this.config.remoteHooks) {
        const remoteHooksForTarget = (this.config.remoteHooks as any)[targetHost];
        if (remoteHooksForTarget) {
          formData.append("hooks", JSON.stringify(remoteHooksForTarget));
          this.logger.info(`Sending hooks to ${targetHost}`);
        }
      }

      // Send request
      const response = await fetch(`${this.config.serverUrl}/push`, {
        method: "POST",
        headers: {
          "X-Host-Name": targetHost,
          "X-Auth-Key": this.config.authKey,
        },
        body: formData,
        verbose: this.config.silentMode ? false : true,
      });

      const result = await response.json();

      if (response.ok) {
        this.logger.success(`File ${share ? "shared" : "pushed"} successfully: ${filename}`);
        if (share) {
          this.logger.info("File is now available for other hosts to pull");
        }
        return true;
      } else {
        this.logger.error(`Push failed: ${JSON.stringify(result)}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Push error: server url ${this.config.serverUrl} - ${error}`);
      return false;
    }
  }

  /**
   * Pull all new files from server (git-style)
   */
  async pull(): Promise<number> {
    this.logger.info("Starting pull operation...");

    try {
      // Load sync state
      const syncState = this.loadSyncState();
      this.logger.info(`Already downloaded: ${syncState.downloadedFiles.length} files`);

      // Request list of new files
      const response = await fetch(`${this.config.serverUrl}/pull`, {
        method: "POST",
        headers: {
          "X-Host-Name": this.config.hostname,
          "X-Auth-Key": this.config.authKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientFiles: syncState.downloadedFiles }),
      });

      if (!response.ok) {
        const error = await response.json();
        this.logger.error(`Pull failed: ${JSON.stringify(error)}`);
        return 0;
      }

      const result = (await response.json()) as PullResponse;
      this.logger.info(`Server has ${result.totalFiles} total files`);
      this.logger.info(`New files to download: ${result.count}`);

      if (result.count === 0) {
        this.logger.success("Already up to date!");
        return 0;
      }

      let downloadedCount = 0;

      // Download each new file
      for (const fileInfo of result.newFiles) {
        this.logger.info(`Downloading: ${fileInfo.originalName} (${fileInfo.size} bytes)`);

        // If file has hooks, save them to config
        if (fileInfo.hooks) {
          this.logger.info(`File has hooks, updating config...`);
          const configPath = process.env.CLIENT_CONFIG || "./client.config.json";
          this.saveHooksToConfig(configPath, fileInfo.hooks);
          // Reload config to use new hooks
          this.config = JSON.parse(readFileSync(configPath, "utf-8"));
        }

        const downloadResponse = await fetch(`${this.config.serverUrl}/download`, {
          method: "POST",
          headers: {
            "X-Host-Name": this.config.hostname,
            "X-Auth-Key": this.config.authKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ storedName: fileInfo.storedName }),
        });

        if (!downloadResponse.ok) {
          this.logger.error(`Failed to download ${fileInfo.originalName}`);
          continue;
        }

        // Get encrypted data
        const encryptedData = Buffer.from(await downloadResponse.arrayBuffer());

        // Decrypt file
        const decryptedData = EncryptionUtils.decrypt(encryptedData, this.config.authKey);

        // Check if file is a zip archive
        const isZipFile = fileInfo.originalName.toLowerCase().endsWith(".zip");

        // Determine destination path
        const destinationPath = this.getDestinationPath(fileInfo.originalName);

        if (isZipFile) {
          try {
            // Unzip the archive using PowerShell
            this.logger.info(`Detected ZIP archive, extracting...`);

            // Detect extraction path from hooks
            const hookExtractDir = this.extractDirWithCheckHook(fileInfo.originalName);
            const extractPath = hookExtractDir || this.config.localStorageDir;

            // Use the new extractArchive method
            this.extractArchive(fileInfo.originalName, decryptedData, extractPath);
          } catch (error) {
            this.logger.error(`Failed to extract ZIP: ${error}`);
            // Fallback: save as regular file
            writeFileSync(destinationPath, decryptedData);
            this.logger.warn(`Saved as regular file: ${destinationPath}`);
          }
        } else {
          // Save as regular file
          const localPath = destinationPath;

          writeFileSync(localPath, decryptedData);
          this.logger.success(`Saved: ${localPath}`);
        }

        // Update sync state
        syncState.downloadedFiles.push(fileInfo.storedName);
        downloadedCount++;
      }

      // Save updated sync state
      syncState.lastSync = new Date().toISOString();
      this.saveSyncState(syncState);

      this.logger.success(`Pull complete! Downloaded ${downloadedCount} files`);
      return downloadedCount;
    } catch (error) {
      this.logger.error(`Pull error: ${error}`);
      return 0;
    }
  }

  /**
   * List files on server
   */
  async list(direction: "for" | "from" = "for"): Promise<void> {
    this.logger.info(`Listing files (${direction} host)...`);

    try {
      const response = await fetch(`${this.config.serverUrl}/files`, {
        method: "POST",
        headers: {
          "X-Host-Name": this.config.hostname,
          "X-Auth-Key": this.config.authKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ direction }),
      });

      const result = (await response.json()) as ListResponse;

      if (response.ok) {
        this.logger.info(`Files (${result.count}):`);
        result.files.forEach((file: string) => this.logger.info(`  - ${file}`));
      } else {
        this.logger.error(`List failed: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      this.logger.error(`List error: ${error}`);
    }
  }

  /**
   * Check server status
   */
  async status(): Promise<boolean> {
    this.logger.info("Checking server status...");

    try {
      const response = await fetch(`${this.config.serverUrl}/status`);
      const result = (await response.json()) as StatusResponse;
      this.logger.success(`Server status: ${result.status}`);
      return true;
    } catch (error) {
      this.logger.error(`Server is not responding: ${error}`);
      return false;
    }
  }

  /**
   * Reset sync state
   */
  resetSync(): void {
    this.logger.info("Resetting sync state...");
    const state: SyncState = {
      downloadedFiles: [],
      lastSync: new Date().toISOString(),
    };
    this.saveSyncState(state);
    this.logger.success("Sync state reset. Next pull will download all files.");
  }

  /**
   * Show sync status
   */
  syncStatus(): void {
    const state = this.loadSyncState();
    this.logger.info(`Sync Status:`);
    this.logger.info(`  Downloaded files: ${state.downloadedFiles.length}`);
    this.logger.info(`  Last sync: ${new Date(state.lastSync).toLocaleString()}`);
  }

  /**
   * Extract ZIP archive using PowerShell
   */
  private extractArchive(filename: string, data: Buffer, extractPath: string): void {
    try {
      // Save decrypted data to temp zip file
      const tempZipPath = join(extractPath, `temp_${Date.now()}.zip`);
      writeFileSync(tempZipPath, data);

      // Ensure extraction directory exists
      if (!existsSync(extractPath)) {
        mkdirSync(extractPath, { recursive: true });
      }

      // Use PowerShell Expand-Archive to extract
      const psCommand = `Expand-Archive -Path "${tempZipPath}" -DestinationPath "${extractPath}" -Force`;
      const result = spawnSync("powershell.exe", ["-Command", psCommand], {
        encoding: "utf-8",
        windowsHide: true,
      });

      // Clean up temp zip file
      rmSync(tempZipPath, { force: true });

      if (result.error || result.status !== 0) {
        throw new Error(`PowerShell extract failed: ${result.stderr || result.error}`);
      }

      this.logger.success(`Extracted files from ${filename} to ${extractPath}`);
    } catch (error) {
      this.logger.error(`Failed to extract ZIP: ${error}`);
      this.logger.warn(`Saved as regular file: ${extractPath}`);
      throw new Error(`Extraction failed: ${filename} to ${extractPath}`, { cause: error });
    }
  }

  getDestinationPath(originalName: string): string {
    // Check if there is a move rule for this file
    if (
      this.config.localHooks &&
      this.config.localHooks.moves &&
      this.config.localHooks.moves.byNames &&
      this.config.localHooks.moves.byNames[originalName]
    ) {
      const destPath = this.config.localHooks.moves.byNames[originalName];
      this.ensureDirectoryExists(dirname(destPath));
      return destPath;
    }
    return join(this.config.localStorageDir, originalName);
  }

  /**
   * Save hooks to config file (update localHooks)
   */
  private saveHooksToConfig(configPath: string, hooks: ClientFileHooks): void {
    try {
      // Read current config
      const configData = readFileSync(configPath, "utf-8");
      const config = JSON.parse(configData);

      // Update localHooks
      config.localHooks = hooks;

      // Write back to file with pretty formatting
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      this.logger.info("Hooks saved to config as localHooks");
    } catch (error) {
      this.logger.error(`Failed to save hooks to config: ${error}`);
    }
  }
}

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
    const client = new SoftDeliveryClient(configPath);

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
