import { spawnSync } from "node:child_process";
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { ClientConfig } from "./types.ts";
import { Logger } from "./Logger.ts";

type ArchiveResult = {
    data: Buffer;
    extension: ".zip" | ".tar.gz";
};

export class ZipArchive {
    private clientConfig: ClientConfig;
    private logger: Logger;
    private ignoresDefaults = ["node_modules", ".git", ".github", ".env"];

    constructor(config: ClientConfig, logger: Logger) {
        this.clientConfig = config;
        this.logger = logger;
    }

    public updateConfig(config: ClientConfig): void {
        this.clientConfig = config;
    }

    /**
     * Create archive from directory.
     * Uses PowerShell ZIP on Windows and tar.gz on Unix-like systems.
     */
    public createArchiveFromDirectory(dirPath: string): ArchiveResult {
        const stagingDir = this.stageDirectoryForArchiving(dirPath);

        try {
            if (process.platform === "win32") {
                return {
                    data: this.createZipWithPowerShell(stagingDir),
                    extension: ".zip",
                };
            }

            return {
                data: this.createTarGzWithTar(stagingDir),
                extension: ".tar.gz",
            };
        } finally {
            rmSync(stagingDir, { recursive: true, force: true });
        }
    }

    private getIgnorePatterns(): string[] {
        const defaults = this.ignoresDefaults;
        const configured = this.clientConfig.ignores?.push || [];
        const merged = Array.from(new Set([...configured, ...defaults]));

        return merged
            .map((pattern) => this.normalizePattern(pattern))
            .filter((pattern) => pattern.length > 0);
    }

    private normalizePattern(pattern: string): string {
        return pattern
            .replace(/\\/g, "/")
            .replace(/^\.\//, "")
            .replace(/\/+$/, "");
    }

    private normalizeRelativePath(relativePath: string): string {
        return relativePath
            .replace(/\\/g, "/")
            .replace(/^\.\//, "")
            .replace(/^\//, "");
    }

    private hasGlob(pattern: string): boolean {
        return /[*?]/.test(pattern);
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }

    private globToRegExp(pattern: string): RegExp {
        let regex = "^";

        for (let index = 0; index < pattern.length; index++) {
            const current = pattern[index] ?? "";
            const next = pattern[index + 1];

            if (current === "*" && next === "*") {
                regex += ".*";
                index += 1;
                continue;
            }

            if (current === "*") {
                regex += "[^/]*";
                continue;
            }

            if (current === "?") {
                regex += "[^/]";
                continue;
            }

            regex += this.escapeRegExp(current);
        }

        regex += "$";
        return new RegExp(regex);
    }

    private getBaseName(relativePath: string): string {
        const segments = relativePath.split("/").filter(Boolean);
        return segments[segments.length - 1] || "";
    }

    private matchesIgnorePattern(relativePath: string, isDirectory: boolean): boolean {
        const normalizedPath = this.normalizeRelativePath(relativePath);
        const baseName = this.getBaseName(normalizedPath);
        const segments = normalizedPath.split("/").filter(Boolean);

        for (const pattern of this.getIgnorePatterns()) {
            const pathBased = pattern.includes("/");
            const glob = this.hasGlob(pattern);

            if (pathBased) {
                if (glob) {
                    if (this.globToRegExp(pattern).test(normalizedPath)) {
                        return true;
                    }
                    continue;
                }

                if (
                    normalizedPath === pattern ||
                    normalizedPath.startsWith(pattern + "/")
                ) {
                    return true;
                }

                continue;
            }

            if (glob) {
                if (this.globToRegExp(pattern).test(baseName)) {
                    return true;
                }
                continue;
            }

            if (isDirectory && segments.includes(pattern)) {
                return true;
            }

            if (!isDirectory && (baseName === pattern || segments.includes(pattern))) {
                return true;
            }
        }

        return false;
    }

    private stageDirectoryForArchiving(sourceDir: string): string {
        const stagingDir = mkdtempSync(join(tmpdir(), "file-receiver-archive-"));
        let copiedEntries = 0;

        const walk = (currentSourceDir: string, currentRelativeDir: string): void => {
            const entries = readdirSync(currentSourceDir, { withFileTypes: true });

            for (const entry of entries) {
                const relativePath = currentRelativeDir
                    ? `${currentRelativeDir}/${entry.name}`
                    : entry.name;

                if (entry.isDirectory()) {
                    if (this.matchesIgnorePattern(relativePath, true)) {
                        this.logger.info(`Ignoring directory: ${relativePath}`);
                        continue;
                    }

                    const stagedDirPath = join(stagingDir, relativePath);
                    mkdirSync(stagedDirPath, { recursive: true });
                    copiedEntries += 1;
                    walk(join(currentSourceDir, entry.name), relativePath);
                    continue;
                }

                if (!entry.isFile()) {
                    this.logger.warn(`Skipping unsupported entry: ${relativePath}`);
                    continue;
                }

                if (this.matchesIgnorePattern(relativePath, false)) {
                    this.logger.info(`Ignoring file: ${relativePath}`);
                    continue;
                }

                const stagedFilePath = join(stagingDir, relativePath);
                mkdirSync(dirname(stagedFilePath), { recursive: true });
                copyFileSync(join(currentSourceDir, entry.name), stagedFilePath);
                copiedEntries += 1;
            }
        };

        walk(sourceDir, "");

        if (copiedEntries === 0) {
            throw new Error("No files available for archiving after applying ignore rules");
        }

        return stagingDir;
    }

    private createZipWithPowerShell(stagingDir: string): Buffer {
        const tempZipPath = join(dirname(stagingDir), `temp_${Date.now()}.zip`);
        const tempScriptPath = join(dirname(stagingDir), `temp_script_${Date.now()}.ps1`);

        try {
            const psScript = `
param([string]$zipPath)

$items = Get-ChildItem -LiteralPath . -Force | Select-Object -ExpandProperty FullName

if (-not $items) {
    Write-Error "No files available for archiving"
    exit 1
}

Compress-Archive -LiteralPath $items -DestinationPath $zipPath -Force -ErrorAction Stop
`;

            writeFileSync(tempScriptPath, psScript);

            const result = spawnSync(
                "powershell.exe",
                [
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    tempScriptPath,
                    tempZipPath,
                ],
                {
                    cwd: stagingDir,
                    encoding: "utf-8",
                    windowsHide: true,
                    timeout: 5 * 60 * 1000,
                },
            );

            if (result.error || result.status !== 0) {
                throw new Error(`PowerShell archive failed: ${result.stderr || result.error}`);
            }

            if (!existsSync(tempZipPath)) {
                throw new Error("PowerShell archive was not created");
            }

            const zipData = readFileSync(tempZipPath);
            this.logger.info(`Archive created successfully: ${zipData.length} bytes`);
            return zipData;
        } finally {
            rmSync(tempZipPath, { force: true });
            rmSync(tempScriptPath, { force: true });
        }
    }

    private createTarGzWithTar(stagingDir: string): Buffer {
        const tempTarPath = join(dirname(stagingDir), `temp_${Date.now()}.tar.gz`);

        try {
            const result = spawnSync("tar", ["-czf", tempTarPath, "-C", stagingDir, "."], {
                encoding: "utf-8",
                windowsHide: true,
                timeout: 5 * 60 * 1000,
            });

            if (result.error || result.status !== 0) {
                throw new Error(`tar archive failed: ${result.stderr || result.error}`);
            }

            if (!existsSync(tempTarPath)) {
                throw new Error("tar archive was not created");
            }

            const archiveData = readFileSync(tempTarPath);
            this.logger.info(`Archive created successfully: ${archiveData.length} bytes`);
            return archiveData;
        } finally {
            rmSync(tempTarPath, { force: true });
        }
    }

    /**
     * Extract archive using platform-specific tools.
     */
    public extractArchive(filename: string, data: Buffer, extractPath: string): void {
        try {
            if (!existsSync(extractPath)) {
                mkdirSync(extractPath, { recursive: true });
            }

            if (filename.toLowerCase().endsWith(".zip")) {
                this.extractZipArchive(data, extractPath);
            } else if (
                filename.toLowerCase().endsWith(".tar.gz") ||
                filename.toLowerCase().endsWith(".tgz") ||
                filename.toLowerCase().endsWith(".tar")
            ) {
                this.extractTarArchive(filename, data, extractPath);
            } else {
                throw new Error(`Unsupported archive type for ${filename}`);
            }

            this.logger.success(`Extracted files from ${filename} to ${extractPath}`);
        } catch (error) {
            this.logger.error(`Failed to extract ZIP: ${error}`);
            this.logger.warn(`Saved as regular file: ${extractPath}`);
            throw new Error(`Extraction failed: ${filename} to ${extractPath}`, {
                cause: error,
            });
        }
    }

    private extractZipArchive(data: Buffer, extractPath: string): void {
        const tempZipPath = join(extractPath, `temp_${Date.now()}.zip`);

        try {
            writeFileSync(tempZipPath, data);

            if (process.platform === "win32") {
                const psCommand = `Expand-Archive -Path "${tempZipPath}" -DestinationPath "${extractPath}" -Force`;
                const result = spawnSync("powershell.exe", ["-Command", psCommand], {
                    encoding: "utf-8",
                    windowsHide: true,
                    timeout: 120000,
                });

                if (result.error || result.status !== 0) {
                    throw new Error(`PowerShell extract failed: ${result.stderr || result.error}`);
                }
                return;
            }

            const unzipResult = spawnSync("unzip", ["-o", tempZipPath, "-d", extractPath], {
                encoding: "utf-8",
                windowsHide: true,
                timeout: 120000,
            });

            if (!unzipResult.error && unzipResult.status === 0) {
                return;
            }

            const tarResult = spawnSync("tar", ["-xf", tempZipPath, "-C", extractPath], {
                encoding: "utf-8",
                windowsHide: true,
                timeout: 120000,
            });

            if (tarResult.error || tarResult.status !== 0) {
                throw new Error(
                    `ZIP extract failed: ${unzipResult.stderr || unzipResult.error || tarResult.stderr || tarResult.error}`,
                );
            }
        } finally {
            rmSync(tempZipPath, { force: true });
        }
    }

    private extractTarArchive(filename: string, data: Buffer, extractPath: string): void {
        const suffix = filename.toLowerCase().endsWith(".tar") ? ".tar" : ".tar.gz";
        const tempArchivePath = join(extractPath, `temp_${Date.now()}${suffix}`);

        try {
            writeFileSync(tempArchivePath, data);

            const args =
                suffix === ".tar"
                    ? ["-xf", tempArchivePath, "-C", extractPath]
                    : ["-xzf", tempArchivePath, "-C", extractPath];

            const result = spawnSync("tar", args, {
                encoding: "utf-8",
                windowsHide: true,
                timeout: 120000,
            });

            if (result.error || result.status !== 0) {
                throw new Error(`tar extract failed: ${result.stderr || result.error}`);
            }
        } finally {
            rmSync(tempArchivePath, { force: true });
        }
    }

    public setDefaultIgnores(defaults: string[]): void {
        this.ignoresDefaults = defaults;
    }

    public addDefaultIgnores(defaults: string[]): void {
        this.ignoresDefaults = Array.from(new Set([...this.ignoresDefaults, ...defaults]));
    }

    public getDefaultIgnores(): string[] {
        return this.ignoresDefaults;
    }
}
