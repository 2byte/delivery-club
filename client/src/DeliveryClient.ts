import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { Logger } from "./Logger.ts";
import { EncryptionUtils } from "./EncriptionUtils.ts";
import type { ClientConfig, SyncState, PullResponse, ListResponse, StatusResponse, ClientFileHooks, ClientRemoteHooks } from "./types.ts";
import { ZipArchive } from "./ZipArchive.ts";
import type { HookOnDownloadName } from "./types.ts";

/**
 * Main client class
 */
export class DeliveryClient {
  private config: ClientConfig;
  private logger: Logger;
  private trackingFile: string;
  private zipArchive: ZipArchive;

  constructor(configPath: string = "./client.config.json") {
    // Load configuration
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }

    this.config = JSON.parse(readFileSync(configPath, "utf-8"));
    this.logger = new Logger(this.config.logFile, this.config.silentMode, this.config.writeLogToFileEnabled);
    this.zipArchive = new ZipArchive(this.config, this.logger);
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

    if (this.config.localHooks) {
      const hookOnDownloadName = this.config.localHooks.onDownloadName;

      if (!hookOnDownloadName) {
        return null;
      }

      const hooksOnDownloadName = [];

      if ("name" in hookOnDownloadName) {
        hooksOnDownloadName.push(hookOnDownloadName);
      } else {
        Object.values(hookOnDownloadName).forEach((hook) => {
          if (hook && "name" in hook) {
            hooksOnDownloadName.push(hook);
          }
          });
      }

      const foundHook = hooksOnDownloadName.find((hook) => hook.name === filename) as HookOnDownloadName | undefined;
      
      if (foundHook) {
        this.ensureDirectoryExists(foundHook.extractTo);
        return foundHook.extractTo;
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

          this.zipArchive.updateConfig(this.config);
          const archiveResult = this.zipArchive.createArchiveFromDirectory(filePath);
          fileData = archiveResult.data;
          filename = customFilename || `${basename(filePath)}${archiveResult.extension}`;
          this.logger.info(`Archive created: ${fileData.length} bytes (${archiveResult.extension})`);
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
          this.zipArchive.updateConfig(this.config);
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

        // Check if file is an archive
        const lowerName = fileInfo.originalName.toLowerCase();
        const isArchiveFile =
          lowerName.endsWith(".zip") ||
          lowerName.endsWith(".tar.gz") ||
          lowerName.endsWith(".tgz") ||
          lowerName.endsWith(".tar");

        // Determine destination path
        const destinationPath = this.getDestinationPath(fileInfo.originalName);

        if (isArchiveFile) {
          try {
            this.logger.info(`Detected archive, extracting...`);

            // Detect extraction path from hooks
            const hookExtractDir = this.extractDirWithCheckHook(fileInfo.originalName);
            const extractPath = hookExtractDir || this.config.localStorageDir;

            this.zipArchive.extractArchive(fileInfo.originalName, decryptedData, extractPath);
          } catch (error) {
            this.logger.error(`Failed to extract archive: ${error}`);
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