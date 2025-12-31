#!/usr/bin/env bun

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, lstatSync } from 'fs';
import { join, basename, dirname } from 'path';
import JSZip from 'jszip';

/**
 * Test client for SoftDeliveryServer
 * Demonstrates how to push and pull files with encryption
 */

const SERVER_URL = 'http://localhost:3004';
const LOCAL_STORAGE_DIR = './local_downloads';
const TRACKING_FILE = './local_downloads/.sync_state.json';

// Host credentials (should match entry in delivery_hosts.json)
const HOST_CONFIG = {
    hostname: 'user1',
    authKey: 'CatchMeIfYouCan123',
};

/**
 * Sync state to track downloaded files
 */
interface SyncState {
    downloadedFiles: string[];
    lastSync: string;
}

/**
 * Load sync state from file
 */
function loadSyncState(): SyncState {
    if (existsSync(TRACKING_FILE)) {
        return JSON.parse(readFileSync(TRACKING_FILE, 'utf-8'));
    }
    return { downloadedFiles: [], lastSync: new Date(0).toISOString() };
}

/**
 * Save sync state to file
 */
function saveSyncState(state: SyncState): void {
    if (!existsSync(LOCAL_STORAGE_DIR)) {
        mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
    writeFileSync(TRACKING_FILE, JSON.stringify(state, null, 2));
}

/**
 * Encryption utilities (same as server-side)
 */
class EncryptionUtils {
    static createKeyHash(key: string): Buffer {
        return createHash('sha256').update(key).digest();
    }

    static encrypt(data: Buffer, key: string): Buffer {
        const keyHash = this.createKeyHash(key);
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-cbc', keyHash, iv);
        
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        return Buffer.concat([iv, encrypted]);
    }

    static decrypt(encryptedData: Buffer, key: string): Buffer {
        const keyHash = this.createKeyHash(key);
        const iv = encryptedData.subarray(0, 16);
        const encrypted = encryptedData.subarray(16);
        
        const decipher = createDecipheriv('aes-256-cbc', keyHash, iv);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}

/**
 * Push file to server
 */
async function pushFile(filePath: string, filename: string, share: boolean = false) {
    console.log(`\n📤 Pushing: ${filePath}${share ? ' (shared mode)' : ''}`);
    
    try {
        let fileData: Buffer;
        let isDirectory = false;
        
        // Check if path is a directory
        if (existsSync(filePath)) {
            const stats = statSync(filePath);
            
            if (stats.isDirectory()) {
                console.log(`   Detected directory, creating zip archive...`);
                isDirectory = true;
                
                // Create zip from directory
                const zip = new JSZip();
                
                const addToZip = (currentPath: string, zipFolder: JSZip | null = null) => {
                    const items = readdirSync(currentPath);
                    
                    for (const item of items) {
                        const fullPath = join(currentPath, item);
                        const itemStats = lstatSync(fullPath);
                        
                        if (itemStats.isDirectory()) {
                            const folder = zipFolder ? zipFolder.folder(item) : zip.folder(item);
                            if (folder) {
                                addToZip(fullPath, folder);
                            }
                        } else if (itemStats.isFile()) {
                            const fileContent = readFileSync(fullPath);
                            if (zipFolder) {
                                zipFolder.file(item, fileContent);
                            } else {
                                zip.file(item, fileContent);
                            }
                        }
                    }
                };
                
                addToZip(filePath);
                fileData = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
                filename = filename || `${basename(filePath)}.zip`;
                console.log(`   Zip created: ${fileData.length} bytes`);
            } else {
                // Read file normally
                fileData = readFileSync(filePath);
            }
        } else {
            console.error(`   ❌ Path not found: ${filePath}`);
            return;
        }
        
        console.log(`   Original size: ${fileData.length} bytes`);
        
        // Encrypt file
        const encryptedData = EncryptionUtils.encrypt(fileData, HOST_CONFIG.authKey);
        console.log(`   Encrypted size: ${encryptedData.length} bytes`);
        
        // Create form data
        const formData = new FormData();
        formData.append('file', new Blob([encryptedData]), 'encrypted.bin');
        formData.append('filename', filename);
        formData.append('isDirectory', isDirectory.toString());
        formData.append('share', share.toString());
        
        // Send request
        const response = await fetch(`${SERVER_URL}/push`, {
            method: 'POST',
            headers: {
                'X-Host-Name': HOST_CONFIG.hostname,
                'X-Auth-Key': HOST_CONFIG.authKey,
            },
            body: formData,
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`   ✅ Success:`, result);
        } else {
            console.error(`   ❌ Error:`, result);
        }
    } catch (error) {
        console.error(`   ❌ Failed:`, error);
    }
}

/**
 * Pull files from server (git-style: only new files)
 */
async function pullFiles() {
    console.log(`\n📥 Pulling new files from server...`);
    
    try {
        // Load sync state
        const syncState = loadSyncState();
        console.log(`   Already downloaded: ${syncState.downloadedFiles.length} files`);
        
        // Request list of new files
        const response = await fetch(`${SERVER_URL}/pull`, {
            method: 'POST',
            headers: {
                'X-Host-Name': HOST_CONFIG.hostname,
                'X-Auth-Key': HOST_CONFIG.authKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ clientFiles: syncState.downloadedFiles }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error(`   ❌ Error:`, error);
            return;
        }
        
        const result = await response.json();
        console.log(`   Server has ${result.totalFiles} total files`);
        console.log(`   New files to download: ${result.count}`);
        
        if (result.count === 0) {
            console.log(`   ✅ Already up to date!`);
            return;
        }
        
        // Download each new file
        for (const fileInfo of result.newFiles) {
            console.log(`\n   Downloading: ${fileInfo.originalName} (${fileInfo.size} bytes)`);
            
            const downloadResponse = await fetch(`${SERVER_URL}/download`, {
                method: 'POST',
                headers: {
                    'X-Host-Name': HOST_CONFIG.hostname,
                    'X-Auth-Key': HOST_CONFIG.authKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ storedName: fileInfo.storedName }),
            });
            
            if (!downloadResponse.ok) {
                console.error(`   ❌ Failed to download ${fileInfo.originalName}`);
                continue;
            }
            
            // Get encrypted data
            const encryptedData = Buffer.from(await downloadResponse.arrayBuffer());
            
            // Decrypt file
            const decryptedData = EncryptionUtils.decrypt(encryptedData, HOST_CONFIG.authKey);
            
            // Save to local storage
            if (!existsSync(LOCAL_STORAGE_DIR)) {
                mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
            }
            
            // Check if file is a zip archive
            const isZipFile = fileInfo.originalName.toLowerCase().endsWith('.zip');
            
            if (isZipFile) {
                // Unzip the archive
                console.log(`   📦 Detected ZIP archive, extracting...`);
                
                try {
                    const zip = new JSZip();
                    const zipData = await zip.loadAsync(decryptedData);
                    
                    let extractedCount = 0;
                    
                    // Extract all files from zip
                    for (const [relativePath, zipEntry] of Object.entries(zipData.files)) {
                        if (!zipEntry.dir) {
                            const fileData = await zipEntry.async('nodebuffer');
                            const extractPath = join(LOCAL_STORAGE_DIR, relativePath);
                            
                            // Ensure directory exists
                            const fileDir = dirname(extractPath);
                            if (!existsSync(fileDir)) {
                                mkdirSync(fileDir, { recursive: true });
                            }
                            
                            writeFileSync(extractPath, fileData);
                            extractedCount++;
                            console.log(`     - ${relativePath}`);
                        }
                    }
                    
                    console.log(`   ✅ Extracted ${extractedCount} files from ${fileInfo.originalName}`);
                } catch (error) {
                    console.error(`   ❌ Failed to extract ZIP:`, error);
                    // Fallback: save as regular file
                    const localPath = join(LOCAL_STORAGE_DIR, fileInfo.originalName);
                    writeFileSync(localPath, decryptedData);
                    console.log(`   ⚠️ Saved as regular file: ${localPath}`);
                }
            } else {
                // Save as regular file
                const localPath = join(LOCAL_STORAGE_DIR, fileInfo.originalName);
                writeFileSync(localPath, decryptedData);
                console.log(`   ✅ Saved: ${localPath}`);
            }
            
            // Update sync state
            syncState.downloadedFiles.push(fileInfo.storedName);
        }
        
        // Save updated sync state
        syncState.lastSync = new Date().toISOString();
        saveSyncState(syncState);
        
        console.log(`\n✅ Pull complete! Downloaded ${result.count} files`);
        
    } catch (error) {
        console.error(`   ❌ Failed:`, error);
    }
}

/**
 * Download a specific file by name (old method, kept for compatibility)
 */
async function pullFile(filename: string) {
    console.log(`\n📥 Pulling file: ${filename}`);
    
    try {
        // Send request
        const response = await fetch(`${SERVER_URL}/pull`, {
            method: 'POST',
            headers: {
                'X-Host-Name': HOST_CONFIG.hostname,
                'X-Auth-Key': HOST_CONFIG.authKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            console.error(`   ❌ Error:`, error);
            return;
        }
        
        // Get encrypted data
        const encryptedData = Buffer.from(await response.arrayBuffer());
        console.log(`   Encrypted size: ${encryptedData.length} bytes`);
        
        // Decrypt file
        const decryptedData = EncryptionUtils.decrypt(encryptedData, HOST_CONFIG.authKey);
        console.log(`   Decrypted size: ${decryptedData.length} bytes`);
        console.log(`   ✅ File received and decrypted successfully`);
        console.log(`   Content preview: ${decryptedData.toString('utf-8', 0, Math.min(100, decryptedData.length))}...`);
        
        return decryptedData;
    } catch (error) {
        console.error(`   ❌ Failed:`, error);
    }
}

/**
 * List files on server
 */
async function listFiles(direction: 'for' | 'from' = 'for') {
    console.log(`\n📋 Listing files (${direction} host):`);
    
    try {
        const response = await fetch(`${SERVER_URL}/files`, {
            method: 'POST',
            headers: {
                'X-Host-Name': HOST_CONFIG.hostname,
                'X-Auth-Key': HOST_CONFIG.authKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ direction }),
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`   Files (${result.count}):`);
            result.files.forEach((file: string) => console.log(`     - ${file}`));
        } else {
            console.error(`   ❌ Error:`, result);
        }
    } catch (error) {
        console.error(`   ❌ Failed:`, error);
    }
}

/**
 * Check server status
 */
async function checkStatus() {
    console.log(`\n🔍 Checking server status...`);
    
    try {
        const response = await fetch(`${SERVER_URL}/status`);
        const result = await response.json();
        console.log(`   Server status:`, result);
    } catch (error) {
        console.error(`   ❌ Server is not responding:`, error);
    }
}

/**
 * Reset sync state - clear tracking
 */
function resetSync() {
    console.log(`\n🔄 Resetting sync state...`);
    const state: SyncState = {
        downloadedFiles: [],
        lastSync: new Date().toISOString(),
    };
    saveSyncState(state);
    console.log(`   ✅ Sync state reset. Next pull will download all files.`);
}

/**
 * Show sync status
 */
function showSyncStatus() {
    console.log(`\n📊 Sync Status:`);
    const state = loadSyncState();
    console.log(`   Downloaded files: ${state.downloadedFiles.length}`);
    console.log(`   Last sync: ${new Date(state.lastSync).toLocaleString()}`);
    console.log(`\n   Files:`);
    state.downloadedFiles.forEach(f => console.log(`     - ${f}`));
}

/**
 * Main function
 */
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    console.log(`🔐 Soft Delivery Server - Test Client`);
    console.log(`   Host: ${HOST_CONFIG.hostname}`);
    
    if (!command) {
        console.log(`\nUsage:`);
        console.log(`  bun testClient.ts status              - Check server status`);
        console.log(`  bun testClient.ts push <path>         - Push file or directory (auto-zip)`);
        console.log(`  bun testClient.ts push <path> --share - Share with other hosts (for pull)`);
        console.log(`  bun testClient.ts pull                - Git-style: pull all new files`);
        console.log(`  bun testClient.ts list [for|from]     - List files on server`);
        console.log(`  bun testClient.ts sync-status         - Show local sync status`);
        console.log(`  bun testClient.ts sync-reset          - Reset sync (re-download all)`);
        console.log(`\nExamples:`);
        console.log(`  bun testClient.ts push ./myfile.txt`);
        console.log(`  bun testClient.ts push ./myfolder      - Will zip directory`);
        console.log(`  bun testClient.ts push ./file.txt --share  - Share with hosts`);
        console.log(`  bun testClient.ts pull                 - Download new files only`);
        return;
    }
    
    switch (command) {
        case 'status':
            await checkStatus();
            break;
            
        case 'push':
            if (args.length < 2) {
                console.error('❌ Usage: push <filepath> [--share]');
                console.log('   Can be a file or directory (will be zipped automatically)');
                console.log('   Use --share to make file available for other hosts to pull');
                return;
            }
            const share = args.includes('--share');
            const filename = args[2] && !args[2].startsWith('--') ? args[2] : basename(args[1]);
            await pushFile(args[1], filename, share);
            break;
            
        case 'pull':
            await pullFiles();
            break;
            
        case 'list':
            const direction = (args[1] as 'for' | 'from') || 'for';
            await listFiles(direction);
            break;
            
        case 'sync-status':
            showSyncStatus();
            break;
            
        case 'sync-reset':
            resetSync();
            break;
            
        default:
            console.error(`❌ Unknown command: ${command}`);
    }
}

main();
