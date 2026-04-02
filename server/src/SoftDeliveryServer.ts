import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { BunServerWrapper } from "@2byte/bun-server";
import { DatabaseFile } from "./DatabaseFile.ts";

export interface DeliveryHost {
  name: string;
  hostname: string;
  encryptionMethod: string;
  key: string;
  createdAt: string;
  updatedAt: string;
}

interface DeliveryHostsDB {
  [hostId: string]: DeliveryHost;
}

export interface ClientFileHooks {
  onDownloadName?: {
    name: string;
    extractTo: string;
  };
  moves?: {
    byNames?: Record<string, string>;
  };
}

interface PullRequestBody {
  clientFiles: string[];
}

interface DownloadRequestBody {
  storedName: string;
}

interface FilesRequestBody {
  direction?: "for" | "from";
}

export interface FileMetadata {
  originalName: string;
  storedName: string;
  hostId: string;
  timestamp: string;
  size: number;
  encrypted: boolean;
  isDirectory?: boolean;
  checksum?: string;
  hooks?: ClientFileHooks;
}

export interface SoftDeliveryServerConfig {
  hostname: string;
  port: number;
}

export class SoftDeliveryHost {
  private db: DatabaseFile<DeliveryHostsDB>;
  private static readonly DB_PATH = "./storage/delivery_hosts.json";

  constructor() {
    this.db = new DatabaseFile<DeliveryHostsDB>(SoftDeliveryHost.DB_PATH, {});
  }

  public getAllHosts(): DeliveryHostsDB {
    return this.db.getAll();
  }

  public getHost(hostId: string): DeliveryHost | undefined {
    return this.db.get(hostId);
  }

  public findHostByHostname(hostname: string): { id: string; host: DeliveryHost } | null {
    const hosts = this.db.getAll();
    for (const [id, host] of Object.entries(hosts)) {
      if (host.hostname === hostname) {
        return { id, host };
      }
    }

    return null;
  }

  public verifyHost(hostname: string, key: string): boolean {
    const result = this.findHostByHostname(hostname);
    return result !== null && result.host.key === key;
  }
}

export class DeliveryFile {
  private static readonly FILES_FOR_HOSTS_DIR = "./storage/files_for_hosts";
  private static readonly FILES_FROM_HOSTS_DIR = "./storage/files_from_hosts";

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    if (!existsSync(DeliveryFile.FILES_FOR_HOSTS_DIR)) {
      mkdirSync(DeliveryFile.FILES_FOR_HOSTS_DIR, { recursive: true });
    }

    if (!existsSync(DeliveryFile.FILES_FROM_HOSTS_DIR)) {
      mkdirSync(DeliveryFile.FILES_FROM_HOSTS_DIR, { recursive: true });
    }
  }

  private generateStorageFilename(hostId: string, originalFilename: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${hostId}_${cleanFilename}_${timestamp}`;
  }

  public saveFileFromHost(
    hostId: string,
    filename: string,
    data: Buffer,
    hooks?: ClientFileHooks,
  ): FileMetadata {
    const storedName = this.generateStorageFilename(hostId, filename);
    const filePath = join(DeliveryFile.FILES_FROM_HOSTS_DIR, storedName);

    writeFileSync(filePath, data);

    if (hooks) {
      writeFileSync(`${filePath}.hooks.json`, JSON.stringify(hooks, null, 2));
    }

    return {
      originalName: filename,
      storedName,
      hostId,
      timestamp: new Date().toISOString(),
      size: data.length,
      encrypted: true,
      hooks,
    };
  }

  public saveFileForHost(
    hostId: string,
    filename: string,
    data: Buffer,
    hooks?: ClientFileHooks,
  ): FileMetadata {
    const storedName = this.generateStorageFilename(hostId, filename);
    const filePath = join(DeliveryFile.FILES_FOR_HOSTS_DIR, storedName);

    writeFileSync(filePath, data);

    if (hooks) {
      writeFileSync(`${filePath}.hooks.json`, JSON.stringify(hooks, null, 2));
    }

    return {
      originalName: filename,
      storedName,
      hostId,
      timestamp: new Date().toISOString(),
      size: data.length,
      encrypted: true,
      hooks,
    };
  }

  public getFileForHost(hostId: string, filename: string): Buffer | null {
    const files = readdirSync(DeliveryFile.FILES_FOR_HOSTS_DIR);
    const matchingFile = files.find((fileName) => {
      return fileName.startsWith(`${hostId}_`) && fileName.includes(filename);
    });

    if (!matchingFile) {
      return null;
    }

    return readFileSync(join(DeliveryFile.FILES_FOR_HOSTS_DIR, matchingFile));
  }

  public listFilesForHost(hostId: string, directory: "for" | "from" = "for"): string[] {
    const dir =
      directory === "for" ? DeliveryFile.FILES_FOR_HOSTS_DIR : DeliveryFile.FILES_FROM_HOSTS_DIR;

    return readdirSync(dir).filter((fileName) => fileName.startsWith(`${hostId}_`));
  }

  public listFilesWithMetadata(hostId: string, directory: "for" | "from" = "for"): FileMetadata[] {
    const dir =
      directory === "for" ? DeliveryFile.FILES_FOR_HOSTS_DIR : DeliveryFile.FILES_FROM_HOSTS_DIR;

    const hostFiles = readdirSync(dir).filter((fileName) => {
      return fileName.startsWith(`${hostId}_`) && !fileName.endsWith(".hooks.json");
    });

    return hostFiles.map((storedName) => {
      const filePath = join(dir, storedName);
      const stats = statSync(filePath);
      const parts = storedName.split("_");
      const originalName = parts.slice(1, -1).join("_");
      const hooks = this.getHooksByStoredName(storedName, directory);

      return {
        originalName,
        storedName,
        hostId,
        timestamp: stats.mtime.toISOString(),
        size: stats.size,
        encrypted: true,
        hooks: hooks || undefined,
      };
    });
  }

  public getFileByStoredName(storedName: string, directory: "for" | "from" = "for"): Buffer | null {
    const dir =
      directory === "for" ? DeliveryFile.FILES_FOR_HOSTS_DIR : DeliveryFile.FILES_FROM_HOSTS_DIR;
    const filePath = join(dir, storedName);

    if (!existsSync(filePath)) {
      return null;
    }

    return readFileSync(filePath);
  }

  public getHooksByStoredName(
    storedName: string,
    directory: "for" | "from" = "for",
  ): ClientFileHooks | null {
    const dir =
      directory === "for" ? DeliveryFile.FILES_FOR_HOSTS_DIR : DeliveryFile.FILES_FROM_HOSTS_DIR;
    const hooksFilePath = join(dir, `${storedName}.hooks.json`);

    if (!existsSync(hooksFilePath)) {
      return null;
    }

    try {
      return JSON.parse(readFileSync(hooksFilePath, "utf-8")) as ClientFileHooks;
    } catch (error) {
      console.error(`Failed to read hooks file: ${hooksFilePath}`, error);
      return null;
    }
  }
}

class EncryptionUtils {
  public static createKeyHash(key: string): Buffer {
    return createHash("sha256").update(key).digest();
  }

  public static encrypt(data: Buffer, key: string): Buffer {
    const keyHash = this.createKeyHash(key);
    const iv = randomBytes(16);
    const cipher = createCipheriv("aes-256-cbc", keyHash, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    return Buffer.concat([iv, encrypted]);
  }

  public static decrypt(encryptedData: Buffer, key: string): Buffer {
    const keyHash = this.createKeyHash(key);
    const iv = encryptedData.subarray(0, 16);
    const encrypted = encryptedData.subarray(16);
    const decipher = createDecipheriv("aes-256-cbc", keyHash, iv);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }
}

export class SoftDeliveryServer extends BunServerWrapper {
  private hostManager: SoftDeliveryHost;
  private fileManager: DeliveryFile;

  constructor(private config: SoftDeliveryServerConfig) {
    super({ hostname: config.hostname, port: config.port });
    this.hostManager = new SoftDeliveryHost();
    this.fileManager = new DeliveryFile();
  }

  private authenticateHost(req: Request): {
    authenticated: boolean;
    hostId?: string;
    host?: DeliveryHost;
  } {
    const hostname = req.headers.get("X-Host-Name");
    const authKey = req.headers.get("X-Auth-Key");

    if (!hostname || !authKey) {
      return { authenticated: false };
    }

    const result = this.hostManager.findHostByHostname(hostname);
    if (!result) {
      return { authenticated: false };
    }

    const isValid = this.hostManager.verifyHost(hostname, authKey);
    if (!isValid) {
      return { authenticated: false };
    }

    return { authenticated: true, hostId: result.id, host: result.host };
  }

  private errorResponse(message: string, status = 400): Response {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  private successResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  public async runServer(): Promise<void> {
    this.post("/push", async (req: Request) => {
      const auth = this.authenticateHost(req);
      if (!auth.authenticated || !auth.hostId || !auth.host) {
        return this.errorResponse("Authentication failed", 401);
      }

      try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const filename = (formData.get("filename") as string) || file?.name;
        const isDirectory = formData.get("isDirectory") === "true";
        const share = formData.get("share") === "true";
        const hooksJson = formData.get("hooks") as string | null;

        if (!file) {
          return this.errorResponse("No file provided");
        }

        let hooks: ClientFileHooks | undefined;
        if (hooksJson) {
          try {
            hooks = JSON.parse(hooksJson) as ClientFileHooks;
            console.log(`[PUSH] Received hooks for ${filename}:`, hooks);
          } catch (error) {
            console.error("[PUSH] Failed to parse hooks:", error);
          }
        }

        const fileData = Buffer.from(await file.arrayBuffer());
        const decryptedData = EncryptionUtils.decrypt(fileData, auth.host.key);
        const targetHostId = auth.hostId;
        const targetHostname = auth.host.hostname;

        let metadata: FileMetadata;
        if (share) {
          metadata = this.fileManager.saveFileForHost(targetHostId, filename, decryptedData, hooks);
          console.log(
            `[PUSH] Shared ${isDirectory ? "directory" : "file"} for ${targetHostname}: ${filename} (${metadata.size} bytes) - available for pull`,
          );
        } else {
          metadata = this.fileManager.saveFileFromHost(targetHostId, filename, decryptedData, hooks);
          console.log(
            `[PUSH] Received ${isDirectory ? "directory" : "file"} for ${targetHostname}: ${filename} (${metadata.size} bytes)`,
          );
        }

        metadata.isDirectory = isDirectory;

        return this.successResponse({
          message: `${isDirectory ? "Directory" : "File"} ${share ? "shared" : "received"} successfully`,
          metadata,
          shared: share,
        });
      } catch (error) {
        console.error("[PUSH] Error:", error);
        return this.errorResponse("Failed to process file", 500);
      }
    });

    this.get("/status", () => {
      return new Response(JSON.stringify({ status: "running" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    this.post("/pull", async (req: Request) => {
      const auth = this.authenticateHost(req);
      if (!auth.authenticated || !auth.hostId || !auth.host) {
        return this.errorResponse("Authentication failed", 401);
      }

      try {
        const body = (await req.json()) as PullRequestBody;
        const clientFiles = body.clientFiles || [];
        const serverFiles = this.fileManager.listFilesWithMetadata(auth.hostId, "for");
        const newFiles = serverFiles.filter((fileMetadata) => {
          return !clientFiles.includes(fileMetadata.storedName);
        });

        console.log(
          `[PULL] ${auth.host.hostname} requesting sync: ${newFiles.length} new files available`,
        );

        return this.successResponse({
          totalFiles: serverFiles.length,
          newFiles: newFiles.map((fileMetadata) => ({
            storedName: fileMetadata.storedName,
            originalName: fileMetadata.originalName,
            size: fileMetadata.size,
            timestamp: fileMetadata.timestamp,
            isDirectory: fileMetadata.isDirectory,
            hooks: fileMetadata.hooks,
          })),
          count: newFiles.length,
        });
      } catch (error) {
        console.error("[PULL] Error:", error);
        return this.errorResponse("Failed to get file list", 500);
      }
    });

    this.post("/download", async (req: Request) => {
      const auth = this.authenticateHost(req);
      if (!auth.authenticated || !auth.hostId || !auth.host) {
        return this.errorResponse("Authentication failed", 401);
      }

      try {
        const body = (await req.json()) as DownloadRequestBody;
        const storedName = body.storedName;

        if (!storedName) {
          return this.errorResponse("Stored name is required");
        }

        if (!storedName.startsWith(`${auth.hostId}_`)) {
          return this.errorResponse("Access denied", 403);
        }

        const fileData = this.fileManager.getFileByStoredName(storedName, "for");
        if (!fileData) {
          return this.errorResponse("File not found", 404);
        }

        const encryptedData = EncryptionUtils.encrypt(fileData, auth.host.key);

        console.log(
          `[DOWNLOAD] Sending file to ${auth.host.hostname}: ${storedName} (${encryptedData.length} bytes encrypted)`,
        );

        return new Response(encryptedData, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="${storedName}"`,
            "X-Original-Size": fileData.length.toString(),
          },
        });
      } catch (error) {
        console.error("[DOWNLOAD] Error:", error);
        return this.errorResponse("Failed to retrieve file", 500);
      }
    });

    this.post("/files", async (req: Request) => {
      const auth = this.authenticateHost(req);
      if (!auth.authenticated || !auth.hostId) {
        return this.errorResponse("Authentication failed", 401);
      }

      try {
        const body = (await req.json()) as FilesRequestBody;
        const direction = body.direction || "for";
        const files = this.fileManager.listFilesForHost(auth.hostId, direction);

        return this.successResponse({
          hostId: auth.hostId,
          direction,
          files,
          count: files.length,
        });
      } catch (error) {
        console.error("[FILES] Error:", error);
        return this.errorResponse("Failed to list files", 500);
      }
    });

    this.maxRequestBodySize(500 * 1024 * 1024); // 500MB
    this.start();
  }

  public run(): void {
    console.log(`Soft Delivery Server is running on port ${this.config.port}`);
    console.log("Host management: storage/delivery_hosts.json");
    console.log("Files from hosts: storage/files_from_hosts/");
    console.log("Files for hosts: storage/files_for_hosts/");
    console.log("\nEndpoints:");
    console.log("  POST /push     - Host uploads encrypted file/directory (zip)");
    console.log("  POST /pull     - Git-style: get list of new files to download");
    console.log("  POST /download - Download specific file by stored name");
    console.log("  POST /files    - List files for host");
    console.log("  GET  /status   - Server status\n");

    void this.runServer();
  }
}