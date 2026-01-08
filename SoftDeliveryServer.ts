import { Server } from './Server.js';
import { DatabaseFile } from './DatabaseFile';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, lstatSync } from 'fs';
import { join, relative, sep } from 'path';
import JSZip from 'jszip';

/**
 * Delivery host configuration interface
 */
interface DeliveryHost {
    name: string;
    hostname: string;
    encryptionMethod: string;
    key: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Database structure for delivery hosts
 */
interface DeliveryHostsDB {
    [hostId: string]: DeliveryHost;
}

/**
 * Class for managing delivery hosts from database
 */
export class SoftDeliveryHost {
    private db: DatabaseFile<DeliveryHostsDB>;
    private static readonly DB_PATH = './storage/delivery_hosts.json';

    constructor() {
        this.db = new DatabaseFile<DeliveryHostsDB>(SoftDeliveryHost.DB_PATH, {});
    }

    /**
     * Get all hosts
     */
    getAllHosts(): DeliveryHostsDB {
        return this.db.getAll();
    }

    /**
     * Get a specific host by ID
     */
    getHost(hostId: string): DeliveryHost | undefined {
        return this.db.get(hostId);
    }

    /**
     * Find host by hostname
     */
    findHostByHostname(hostname: string): { id: string; host: DeliveryHost } | null {
        const hosts = this.db.getAll();
        for (const [id, host] of Object.entries(hosts)) {
            if (host.hostname === hostname) {
                return { id, host };
            }
        }
        return null;
    }

    /**
     * Verify host authentication key
     */
    verifyHost(hostname: string, key: string): boolean {
        const result = this.findHostByHostname(hostname);
        return result !== null && result.host.key === key;
    }
}

/**
 * File metadata interface
 */
interface FileMetadata {
    originalName: string;
    storedName: string;
    hostId: string;
    timestamp: string;
    size: number;
    encrypted: boolean;
    isDirectory?: boolean;
    checksum?: string;
}

/**
 * Class for managing file storage and retrieval
 */
export class DeliveryFile {
    private static readonly FILES_FOR_HOSTS_DIR = './storage/files_for_hosts';
    private static readonly FILES_FROM_HOSTS_DIR = './storage/files_from_hosts';

    constructor() {
        this.ensureDirectories();
    }

    /**
     * Ensure storage directories exist
     */
    private ensureDirectories(): void {
        if (!existsSync(DeliveryFile.FILES_FOR_HOSTS_DIR)) {
            mkdirSync(DeliveryFile.FILES_FOR_HOSTS_DIR, { recursive: true });
        }
        if (!existsSync(DeliveryFile.FILES_FROM_HOSTS_DIR)) {
            mkdirSync(DeliveryFile.FILES_FROM_HOSTS_DIR, { recursive: true });
        }
    }

    /**
     * Generate storage filename
     */
    private generateStorageFilename(hostId: string, originalFilename: string): string {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const cleanFilename = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        return `${hostId}_${cleanFilename}_${timestamp}`;
    }

    /**
     * Save file received from host (push)
     */
    saveFileFromHost(hostId: string, filename: string, data: Buffer): FileMetadata {
        const storedName = this.generateStorageFilename(hostId, filename);
        const filePath = join(DeliveryFile.FILES_FROM_HOSTS_DIR, storedName);
        
        writeFileSync(filePath, data);

        return {
            originalName: filename,
            storedName,
            hostId,
            timestamp: new Date().toISOString(),
            size: data.length,
            encrypted: true,
        };
    }

    /**
     * Save file for delivery to host (pull)
     */
    saveFileForHost(hostId: string, filename: string, data: Buffer): FileMetadata {
        const storedName = this.generateStorageFilename(hostId, filename);
        const filePath = join(DeliveryFile.FILES_FOR_HOSTS_DIR, storedName);
        
        writeFileSync(filePath, data);

        return {
            originalName: filename,
            storedName,
            hostId,
            timestamp: new Date().toISOString(),
            size: data.length,
            encrypted: true,
        };
    }

    /**
     * Get file for host to pull
     */
    getFileForHost(hostId: string, filename: string): Buffer | null {
        const files = readdirSync(DeliveryFile.FILES_FOR_HOSTS_DIR);
        const matchingFile = files.find(f => f.startsWith(`${hostId}_`) && f.includes(filename));

        if (!matchingFile) {
            return null;
        }

        const filePath = join(DeliveryFile.FILES_FOR_HOSTS_DIR, matchingFile);
        return readFileSync(filePath);
    }

    /**
     * List files for specific host
     */
    listFilesForHost(hostId: string, directory: 'for' | 'from' = 'for'): string[] {
        const dir = directory === 'for' 
            ? DeliveryFile.FILES_FOR_HOSTS_DIR 
            : DeliveryFile.FILES_FROM_HOSTS_DIR;
        
        const files = readdirSync(dir);
        return files.filter(f => f.startsWith(`${hostId}_`));
    }

    /**
     * Get detailed file list with metadata for git-style pull
     */
    listFilesWithMetadata(hostId: string, directory: 'for' | 'from' = 'for'): FileMetadata[] {
        const dir = directory === 'for' 
            ? DeliveryFile.FILES_FOR_HOSTS_DIR 
            : DeliveryFile.FILES_FROM_HOSTS_DIR;
        
        const files = readdirSync(dir);
        const hostFiles = files.filter(f => f.startsWith(`${hostId}_`));
        
        return hostFiles.map(storedName => {
            const filePath = join(dir, storedName);
            const stats = statSync(filePath);
            
            // Parse original filename from stored name
            // Format: hostId_filename_timestamp
            const parts = storedName.split('_');
            const timestampPart = parts[parts.length - 1];
            const originalName = parts.slice(1, -1).join('_');
            
            return {
                originalName,
                storedName,
                hostId,
                timestamp: stats.mtime.toISOString(),
                size: stats.size,
                encrypted: true,
            };
        });
    }

    /**
     * Get file by stored name
     */
    getFileByStoredName(storedName: string, directory: 'for' | 'from' = 'for'): Buffer | null {
        const dir = directory === 'for' 
            ? DeliveryFile.FILES_FOR_HOSTS_DIR 
            : DeliveryFile.FILES_FROM_HOSTS_DIR;
        
        const filePath = join(dir, storedName);
        
        if (!existsSync(filePath)) {
            return null;
        }
        
        return readFileSync(filePath);
    }

    /**
     * Create zip archive from directory
     */
    async createZipFromDirectory(dirPath: string): Promise<Buffer> {
        const zip = new JSZip();
        
        const addFilesToZip = (currentPath: string, zipFolder: JSZip | null = null) => {
            const items = readdirSync(currentPath);
            
            for (const item of items) {
                const fullPath = join(currentPath, item);
                const stats = lstatSync(fullPath);
                
                if (stats.isDirectory()) {
                    const folder = zipFolder ? zipFolder.folder(item) : zip.folder(item);
                    if (folder) {
                        addFilesToZip(fullPath, folder);
                    }
                } else if (stats.isFile()) {
                    const fileData = readFileSync(fullPath);
                    if (zipFolder) {
                        zipFolder.file(item, fileData);
                    } else {
                        zip.file(item, fileData);
                    }
                }
            }
        };
        
        addFilesToZip(dirPath);
        
        return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
    }
}

/**
 * Encryption utilities class
 */
class EncryptionUtils {
    /**
     * Create encryption key hash from string
     */
    static createKeyHash(key: string): Buffer {
        return createHash('sha256').update(key).digest();
    }

    /**
     * Encrypt data using AES-256-CBC
     */
    static encrypt(data: Buffer, key: string): Buffer {
        const keyHash = this.createKeyHash(key);
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-cbc', keyHash, iv);
        
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        
        // Prepend IV to encrypted data
        return Buffer.concat([iv, encrypted]);
    }

    /**
     * Decrypt data using AES-256-CBC
     */
    static decrypt(encryptedData: Buffer, key: string): Buffer {
        const keyHash = this.createKeyHash(key);
        
        // Extract IV from the beginning of encrypted data
        const iv = encryptedData.subarray(0, 16);
        const encrypted = encryptedData.subarray(16);
        
        const decipher = createDecipheriv('aes-256-cbc', keyHash, iv);
        
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}

export class SoftDeliveryServer extends Server {
    private hostManager: SoftDeliveryHost;
    private fileManager: DeliveryFile;

    constructor(private config: {hostname: string, port: number}) {
        super({ hostname: config.hostname, port: config.port });
        this.hostManager = new SoftDeliveryHost();
        this.fileManager = new DeliveryFile();
    }

    /**
     * Authenticate host from request headers
     */
    private authenticateHost(req: Request): { authenticated: boolean; hostId?: string; host?: DeliveryHost } {
        const hostname = req.headers.get('X-Host-Name');
        const authKey = req.headers.get('X-Auth-Key');

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

    /**
     * Create error response
     */
    private errorResponse(message: string, status: number = 400): Response {
        return new Response(JSON.stringify({ error: message }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    /**
     * Create success response
     */
    private successResponse(data: any, status: number = 200): Response {
        return new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    async runServer(): Promise<void> {
        // Push endpoint - host uploads encrypted file or directory (zipped) to server
        this.post('/push', async (req: Request) => {
            // Authenticate host
            const auth = this.authenticateHost(req);
            if (!auth.authenticated || !auth.hostId || !auth.host) {
                return this.errorResponse('Authentication failed', 401);
            }

            try {
                // Get form data with file
                const formData = await req.formData();
                const file = formData.get('file') as File;
                const filename = formData.get('filename') as string || file?.name;
                const isDirectory = formData.get('isDirectory') === 'true';
                const share = formData.get('share') === 'true'; // Share with other hosts

                if (!file) {
                    return this.errorResponse('No file provided');
                }

                // Read file data
                const arrayBuffer = await file.arrayBuffer();
                const fileData = Buffer.from(arrayBuffer);

                // Decrypt file using host's key
                const decryptedData = EncryptionUtils.decrypt(fileData, auth.host.key);

                // Determine target host - use X-Host-Name header as target
                // auth.hostId comes from X-Host-Name, which now can be the target host
                const targetHostId = auth.hostId;
                const targetHostname = auth.host.hostname;

                // Save decrypted file - choose directory based on share flag
                let metadata: FileMetadata;
                if (share) {
                    // Save to files_for_hosts so other hosts can pull it
                    metadata = this.fileManager.saveFileForHost(
                        targetHostId,
                        filename,
                        decryptedData
                    );
                    console.log(`[PUSH] Shared ${isDirectory ? 'directory' : 'file'} for ${targetHostname}: ${filename} (${metadata.size} bytes) - available for pull`);
                } else {
                    // Save to files_from_hosts (default behavior)
                    metadata = this.fileManager.saveFileFromHost(
                        targetHostId,
                        filename,
                        decryptedData
                    );
                    console.log(`[PUSH] Received ${isDirectory ? 'directory' : 'file'} for ${targetHostname}: ${filename} (${metadata.size} bytes)`);
                }
                
                metadata.isDirectory = isDirectory;

                return this.successResponse({
                    message: `${isDirectory ? 'Directory' : 'File'} ${share ? 'shared' : 'received'} successfully`,
                    metadata,
                    shared: share,
                });
            } catch (error) {
                console.error('[PUSH] Error:', error);
                return this.errorResponse('Failed to process file', 500);
            }
        });

        // Status endpoint
        this.get('/status', (req: Request) => {
            return new Response(JSON.stringify({ status: 'running' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        });

        // Pull endpoint - git-style: get list of new files not yet downloaded
        this.post('/pull', async (req: Request) => {
            // Authenticate host
            const auth = this.authenticateHost(req);
            if (!auth.authenticated || !auth.hostId || !auth.host) {
                return this.errorResponse('Authentication failed', 401);
            }

            try {
                // Get list of files client already has
                const body = await req.json();
                const clientFiles = body.clientFiles || []; // Array of stored filenames

                // Get all files available for this host
                const serverFiles = this.fileManager.listFilesWithMetadata(auth.hostId, 'for');

                // Find new files that client doesn't have
                const newFiles = serverFiles.filter(f => !clientFiles.includes(f.storedName));

                console.log(`[PULL] ${auth.host.hostname} requesting sync: ${newFiles.length} new files available`);

                return this.successResponse({
                    totalFiles: serverFiles.length,
                    newFiles: newFiles.map(f => ({
                        storedName: f.storedName,
                        originalName: f.originalName,
                        size: f.size,
                        timestamp: f.timestamp,
                        isDirectory: f.isDirectory,
                    })),
                    count: newFiles.length,
                });
            } catch (error) {
                console.error('[PULL] Error:', error);
                return this.errorResponse('Failed to get file list', 500);
            }
        });

        // Download specific file endpoint
        this.post('/download', async (req: Request) => {
            // Authenticate host
            const auth = this.authenticateHost(req);
            if (!auth.authenticated || !auth.hostId || !auth.host) {
                return this.errorResponse('Authentication failed', 401);
            }

            try {
                // Get requested file by stored name
                const body = await req.json();
                const storedName = body.storedName;

                if (!storedName) {
                    return this.errorResponse('Stored name is required');
                }

                // Verify file belongs to this host
                if (!storedName.startsWith(`${auth.hostId}_`)) {
                    return this.errorResponse('Access denied', 403);
                }

                // Get file
                const fileData = this.fileManager.getFileByStoredName(storedName, 'for');

                if (!fileData) {
                    return this.errorResponse('File not found', 404);
                }

                // Encrypt file using host's key
                const encryptedData = EncryptionUtils.encrypt(fileData, auth.host.key);

                console.log(`[DOWNLOAD] Sending file to ${auth.host.hostname}: ${storedName} (${encryptedData.length} bytes encrypted)`);

                // Return encrypted file
                return new Response(encryptedData, {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Disposition': `attachment; filename="${storedName}"`,
                        'X-Original-Size': fileData.length.toString(),
                    },
                });
            } catch (error) {
                console.error('[DOWNLOAD] Error:', error);
                return this.errorResponse('Failed to retrieve file', 500);
            }
        });

        // Files listing endpoint
        this.post('/files', async (req: Request) => {
            // Authenticate host
            const auth = this.authenticateHost(req);
            if (!auth.authenticated || !auth.hostId) {
                return this.errorResponse('Authentication failed', 401);
            }

            try {
                const body = await req.json();
                const direction = body.direction || 'for'; // 'for' or 'from'

                const files = this.fileManager.listFilesForHost(
                    auth.hostId,
                    direction as 'for' | 'from'
                );

                return this.successResponse({
                    hostId: auth.hostId,
                    direction,
                    files,
                    count: files.length,
                });
            } catch (error) {
                console.error('[FILES] Error:', error);
                return this.errorResponse('Failed to list files', 500);
            }
        });

        this.start();
    }

    public run(): void {
        console.log(`🚀 Soft Delivery Server is running on port ${this.config.port}`);
        console.log(`📦 Host management: storage/delivery_hosts.json`);
        console.log(`📁 Files from hosts: storage/files_from_hosts/`);
        console.log(`📁 Files for hosts: storage/files_for_hosts/`);
        console.log(`\nEndpoints:`);
        console.log(`  POST /push     - Host uploads encrypted file/directory (zip)`);
        console.log(`  POST /pull     - Git-style: get list of new files to download`);
        console.log(`  POST /download - Download specific file by stored name`);
        console.log(`  POST /files    - List files for host`);
        console.log(`  GET  /status   - Server status\n`);
        
        this.runServer();
    }
}